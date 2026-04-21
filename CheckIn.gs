// ==========================================
// FILE: CheckIn.gs
// ==========================================

/**
 * Get registration data formatted for check-in screen
 */
function getCheckInData(regId) {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][COLUMNS.REG_ID] === regId) {
      var row = data[i];
      if (isCancelledRegistration(row)) {
        return { success: false, error: 'Registration is cancelled' };
      }

      // Parse guest details
      var guests = [];
      try {
        guests = JSON.parse(row[COLUMNS.GUEST_DETAILS] || '[]');
      } catch(e) {
        guests = [];
      }

      return {
        success: true,
        registration: {
          regId: row[COLUMNS.REG_ID],
          regType: row[COLUMNS.REG_TYPE],
          status: row[COLUMNS.STATUS],
          name: row[COLUMNS.PRIMARY_NAME],
          email: row[COLUMNS.EMAIL],
          phone: row[COLUMNS.PHONE],
          church: row[COLUMNS.CHURCH],
          housingOption: row[COLUMNS.HOUSING_OPTION],
          nights: row[COLUMNS.NIGHTS],
          numNights: row[COLUMNS.NUM_NIGHTS],
          adultsCount: row[COLUMNS.ADULTS_COUNT],
          childrenCount: row[COLUMNS.CHILDREN_COUNT],
          totalGuests: row[COLUMNS.TOTAL_GUESTS],
          guests: guests,
          dietaryNeeds: row[COLUMNS.DIETARY_NEEDS],
          specialNeeds: row[COLUMNS.SPECIAL_NEEDS],
          totalCharged: row[COLUMNS.TOTAL_CHARGED],
          amountPaid: row[COLUMNS.AMOUNT_PAID],
          balanceDue: row[COLUMNS.BALANCE_DUE],
          paymentStatus: row[COLUMNS.PAYMENT_STATUS],
          roomAssignment: row[COLUMNS.ROOM_ASSIGNMENT],
          building: row[COLUMNS.BUILDING],
          key1Number: row[COLUMNS.KEY_1_NUMBER],
          key2Number: row[COLUMNS.KEY_2_NUMBER],
          keyDepositAmount: row[COLUMNS.KEY_DEPOSIT_AMOUNT],
          keyDepositPaid: row[COLUMNS.KEY_DEPOSIT_PAID],
          checkedIn: row[COLUMNS.CHECKED_IN],
          checkInTime: row[COLUMNS.CHECK_IN_TIME],
          checkedOut: row[COLUMNS.CHECKED_OUT],
          mealTicketCount: getMealTicketCount(regId)
        }
      };
    }
  }

  return { success: false, error: 'Registration not found' };
}

/**
 * Get count of meal tickets for a registration
 */
function getMealTicketCount(regId) {
  var ss = getSS();
  var sheet = ss.getSheetByName('MealTickets');
  var data = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === regId) count++;
  }

  return count;
}

/**
 * Get expected arrivals for a given date
 */
function getArrivals(dateStr) {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();

  // Map date to night abbreviation
  var dateMap = {
    '2026-06-02': 'tue',
    '2026-06-03': 'wed',
    '2026-06-04': 'thu',
    '2026-06-05': 'fri',
    '2026-06-06': 'sat'
  };

  var targetNight = dateMap[dateStr] || 'tue';
  var arrivals = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status = normalizeRegistrationStatus(row[COLUMNS.STATUS]);
    var nights = (row[COLUMNS.NIGHTS] || '').toLowerCase();
    var checkedIn = row[COLUMNS.CHECKED_IN];

    if (isCancelledRegistration(row)) continue;

    // Include if: confirmed/pending, includes this night, not yet checked in
    if ((status === 'confirmed' || status === 'pending' || status === 'deposit') &&
        nights.indexOf(targetNight) !== -1 &&
        checkedIn !== 'yes') {

      arrivals.push({
        regId: row[COLUMNS.REG_ID],
        name: row[COLUMNS.PRIMARY_NAME],
        housingOption: row[COLUMNS.HOUSING_OPTION],
        roomAssignment: row[COLUMNS.ROOM_ASSIGNMENT],
        totalGuests: row[COLUMNS.TOTAL_GUESTS],
        balanceDue: row[COLUMNS.BALANCE_DUE],
        specialNeeds: row[COLUMNS.SPECIAL_NEEDS]
      });
    }
  }

  return {
    success: true,
    date: dateStr,
    arrivals: arrivals,
    count: arrivals.length
  };
}

/**
 * Process check-in for a registration
 */
function processCheckIn(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy, please try again' };
  }

  try {
    var ss = getSS();
    var regSheet = ss.getSheetByName('Registrations');
    var regData = regSheet.getDataRange().getValues();

    for (var i = 1; i < regData.length; i++) {
      if (regData[i][COLUMNS.REG_ID] === data.regId) {
        if (isCancelledRegistration(regData[i])) {
          return { success: false, error: 'Registration is cancelled' };
        }
        var row = i + 1;

        // Batch update room and key info (columns AI-AN, 1-based 35-40)
        var roomKeyValues = [regData[i].slice(COLUMNS.ROOM_ASSIGNMENT, COLUMNS.KEY_DEPOSIT_PAID + 1)];
        if (data.room) roomKeyValues[0][0] = data.room;
        if (data.building) roomKeyValues[0][1] = data.building;
        if (data.key1) roomKeyValues[0][2] = data.key1;
        if (data.key2) roomKeyValues[0][3] = data.key2;
        var depositAmount = data.keyDepositAmount || 10;
        roomKeyValues[0][4] = depositAmount;
        roomKeyValues[0][5] = 'yes';
        regSheet.getRange(row, COLUMNS.ROOM_ASSIGNMENT + 1, 1, 6).setValues(roomKeyValues);

        // Batch update check-in status (columns AS-AV, 1-based 45-48)
        var checkInValues = [[
          'yes',
          new Date(),
          data.volunteer || 'Unknown',
          data.welcomePacket ? 'yes' : 'no'
        ]];
        regSheet.getRange(row, COLUMNS.CHECKED_IN + 1, 1, 4).setValues(checkInValues);

        // Update room status in Rooms tab
        if (data.room) {
          updateRoomStatus(data.room, 'occupied', data.regId, regData[i][COLUMNS.PRIMARY_NAME]);
        }

        // Record key deposit as payment (skip if deposit is zero)
        if (depositAmount > 0) {
          var depositResult = recordPayment({
            regId: data.regId,
            amount: depositAmount,
            method: 'cash',
            type: 'key_deposit',
            processedBy: data.volunteer || 'Check-in',
            notes: 'Keys: ' + (data.key1 || '') + ', ' + (data.key2 || '')
          });
          if (depositResult && !depositResult.success) {
            logActivity('warning', data.regId,
              'recordPayment failed during check-in: ' + (depositResult.error || 'unknown error'),
              'checkin_pwa');
          }
        }

        // Log activity
        logActivity('check_in', data.regId,
          'Checked in. Room: ' + (data.room || 'N/A') + ', Keys: ' + (data.key1 || '') + '/' + (data.key2 || ''),
          'checkin_pwa');

        return {
          success: true,
          message: 'Check-in complete',
          room: data.room,
          keys: [data.key1, data.key2]
        };
      }
    }

    return { success: false, error: 'Registration not found' };

  } catch (error) {
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Process check-out for a registration
 */
function processCheckOut(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy, please try again' };
  }

  try {
    var ss = getSS();
    var regSheet = ss.getSheetByName('Registrations');
    var regData = regSheet.getDataRange().getValues();

    for (var i = 1; i < regData.length; i++) {
      if (regData[i][COLUMNS.REG_ID] === data.regId) {
        if (isCancelledRegistration(regData[i])) {
          return { success: false, error: 'Registration is cancelled' };
        }
        var row = i + 1;

        // Batch update key returns and refund (columns AO-AR, 1-based 41-44)
        var returnValues = [regData[i].slice(COLUMNS.KEY_1_RETURNED, COLUMNS.DEPOSIT_REFUND_AMOUNT + 1)];
        if (data.key1Returned) returnValues[0][0] = 'yes';
        if (data.key2Returned) returnValues[0][1] = 'yes';
        var refundAmount = data.refundAmount || 0;
        if (refundAmount > 0) {
          returnValues[0][2] = 'yes';
          returnValues[0][3] = refundAmount;

          // Record refund
          recordPayment({
            regId: data.regId,
            amount: -refundAmount,
            method: 'cash',
            type: 'key_refund',
            processedBy: data.volunteer || 'Check-out',
            notes: data.refundNotes || 'Key deposit refund'
          });
        } else if (data.key1Returned && data.key2Returned) {
          returnValues[0][2] = 'no';
        } else {
          returnValues[0][2] = 'partial';
        }
        regSheet.getRange(row, COLUMNS.KEY_1_RETURNED + 1, 1, 4).setValues(returnValues);

        // Batch update check-out status (columns AW-AY, 1-based 49-51)
        var checkOutValues = [['yes', new Date(), data.volunteer || 'Unknown']];
        regSheet.getRange(row, COLUMNS.CHECKED_OUT + 1, 1, 3).setValues(checkOutValues);

        // Update room status
        var roomAssignment = regData[i][COLUMNS.ROOM_ASSIGNMENT];
        if (roomAssignment) {
          updateRoomStatus(roomAssignment, 'available', '', '');
        }

        // Log activity
        var keysReturned = (data.key1Returned ? 1 : 0) + (data.key2Returned ? 1 : 0);
        logActivity('check_out', data.regId,
          'Checked out. Keys returned: ' + keysReturned + '/2. Refund: $' + refundAmount,
          'checkin_pwa');

        return {
          success: true,
          message: 'Check-out complete',
          refundAmount: refundAmount
        };
      }
    }

    return { success: false, error: 'Registration not found' };

  } catch (error) {
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update room status in Rooms tab
 */
function updateRoomStatus(roomId, status, regId, guestName) {
  var ss = getSS();
  var roomSheet = ss.getSheetByName('Rooms');
  var data = roomSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === roomId) {
      var row = i + 1;
      roomSheet.getRange(row, 7).setValue(status);       // G: status
      roomSheet.getRange(row, 8).setValue(regId || '');   // H: assigned_to_reg_id
      roomSheet.getRange(row, 9).setValue(guestName || ''); // I: assigned_to_name
      return true;
    }
  }
  return false;
}

/**
 * Get list of available rooms for assignment
 */
function getAvailableRooms(housingType) {
  var ss = getSS();
  var roomSheet = ss.getSheetByName('Rooms');
  var data = roomSheet.getDataRange().getValues();

  var available = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var type = row[1];
    var status = row[6];

    if (status === 'available' && (!housingType || type === housingType)) {
      available.push({
        roomId: row[0],
        housingType: row[1],
        building: row[2],
        floor: row[3],
        capacity: row[4],
        features: row[5],
        notes: row[9]
      });
    }
  }

  return {
    success: true,
    rooms: available,
    count: available.length
  };
}

/**
 * Pre-assign a room to a registration
 */
function assignRoom(data) {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var regData = regSheet.getDataRange().getValues();

  for (var i = 1; i < regData.length; i++) {
    if (regData[i][COLUMNS.REG_ID] === data.regId) {
      if (isCancelledRegistration(regData[i])) {
        return { success: false, error: 'Registration is cancelled' };
      }
      var row = i + 1;

      // Set room assignment
      regSheet.getRange(row, COLUMNS.ROOM_ASSIGNMENT + 1).setValue(data.roomId);
      regSheet.getRange(row, COLUMNS.BUILDING + 1).setValue(data.building || '');

      // Update room status to reserved
      updateRoomStatus(data.roomId, 'reserved', data.regId, regData[i][COLUMNS.PRIMARY_NAME]);

      logActivity('room_assign', data.regId,
        'Room pre-assigned: ' + data.roomId,
        'admin');

      return { success: true, roomId: data.roomId };
    }
  }

  return { success: false, error: 'Registration not found' };
}

/**
 * Record balance payment at check-in
 */
function recordBalancePayment(data) {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var regData = regSheet.getDataRange().getValues();

  for (var i = 1; i < regData.length; i++) {
    if (regData[i][COLUMNS.REG_ID] === data.regId) {
      if (isCancelledRegistration(regData[i])) {
        return { success: false, error: 'Registration is cancelled' };
      }
      var row = i + 1;

      var currentPaid = regData[i][COLUMNS.AMOUNT_PAID] || 0;
      var newPaid = currentPaid + parseFloat(data.amount);
      var totalCharged = regData[i][COLUMNS.TOTAL_CHARGED];

      regSheet.getRange(row, COLUMNS.AMOUNT_PAID + 1).setValue(newPaid);

      // Update payment status
      if (newPaid >= totalCharged) {
        regSheet.getRange(row, COLUMNS.PAYMENT_STATUS + 1).setValue('paid');
      } else {
        regSheet.getRange(row, COLUMNS.PAYMENT_STATUS + 1).setValue('partial');
      }

      // Record in Payments tab
      recordPayment({
        regId: data.regId,
        amount: data.amount,
        method: data.method || 'cash',
        type: 'balance',
        processedBy: data.volunteer || 'Check-in',
        notes: 'Balance payment at check-in'
      });

      return {
        success: true,
        newBalance: totalCharged - newPaid,
        paymentStatus: newPaid >= totalCharged ? 'paid' : 'partial'
      };
    }
  }

  return { success: false, error: 'Registration not found' };
}

/**
 * Search registrations by name or ID (for check-in lookup).
 * Accepts either a plain string (legacy) or a params object with:
 *   firstName, lastName, regId, query (general fallback)
 */
function searchRegistrations(params) {
  // Backward-compat: if called with a plain string, treat as general query
  if (typeof params === 'string') {
    params = { query: params };
  }

  var firstName    = ((params.firstName || '').toLowerCase()).trim();
  var lastName     = ((params.lastName  || '').toLowerCase()).trim();
  var regIdFilter  = ((params.regId     || '').toLowerCase()).trim();
  var generalQuery = ((params.query     || '').toLowerCase()).trim();

  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();

  var results = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var fullName  = (row[COLUMNS.PRIMARY_NAME] || '').toLowerCase();
    var rowRegId  = (row[COLUMNS.REG_ID]       || '').toLowerCase();
    if (isCancelledRegistration(row)) continue;

    var matches = false;

    if (regIdFilter) {
      // Exact or prefix match on Registration ID for speed
      matches = rowRegId === regIdFilter || rowRegId.startsWith(regIdFilter);
    } else if (firstName || lastName) {
      // Partial substring match against first and/or last name
      var firstOk = !firstName || fullName.indexOf(firstName) !== -1;
      var lastOk  = !lastName  || fullName.indexOf(lastName)  !== -1;
      matches = firstOk && lastOk;
    } else if (generalQuery) {
      // Legacy single-query fallback: match name OR reg ID
      matches = fullName.indexOf(generalQuery) !== -1 || rowRegId.indexOf(generalQuery) !== -1;
    }

    if (matches) {
      results.push({
        regId:         row[COLUMNS.REG_ID],
        name:          row[COLUMNS.PRIMARY_NAME],
        housingOption: row[COLUMNS.HOUSING_OPTION],
        roomAssignment:row[COLUMNS.ROOM_ASSIGNMENT],
        totalGuests:   row[COLUMNS.TOTAL_GUESTS],
        balanceDue:    row[COLUMNS.BALANCE_DUE],
        checkedIn:     row[COLUMNS.CHECKED_IN],
        checkedOut:    row[COLUMNS.CHECKED_OUT]
      });
    }
  }

  return {
    success: true,
    results: results,
    count:   results.length
  };
}

/**
 * Get check-in statistics for dashboard
 */
function getCheckInStats() {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();

  var stats = {
    totalRegistrations: 0,
    checkedIn: 0,
    notArrived: 0,
    checkedOut: 0,
    keysOut: 0,
    depositsHeld: 0,
    balancesDue: 0
  };

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (isCancelledRegistration(row)) continue;

    stats.totalRegistrations++;

    if (row[COLUMNS.CHECKED_IN] === 'yes') {
      stats.checkedIn++;

      if (row[COLUMNS.CHECKED_OUT] !== 'yes') {
        // Count keys still out
        var key1Out = row[COLUMNS.KEY_DEPOSIT_PAID] === 'yes' && row[COLUMNS.KEY_1_RETURNED] !== 'yes';
        var key2Out = row[COLUMNS.KEY_DEPOSIT_PAID] === 'yes' && row[COLUMNS.KEY_2_RETURNED] !== 'yes';
        stats.keysOut += (key1Out ? 1 : 0) + (key2Out ? 1 : 0);

        // Deposits held
        if (row[COLUMNS.KEY_DEPOSIT_PAID] === 'yes' && row[COLUMNS.DEPOSIT_REFUNDED] !== 'yes') {
          stats.depositsHeld += row[COLUMNS.KEY_DEPOSIT_AMOUNT] || 0;
        }
      }
    } else {
      stats.notArrived++;
    }

    if (row[COLUMNS.CHECKED_OUT] === 'yes') {
      stats.checkedOut++;
    }

    stats.balancesDue += row[COLUMNS.BALANCE_DUE] || 0;
  }

  return {
    success: true,
    stats: stats
  };
}

/**
 * Update the guest_details JSON for a registration.
 * Used by the check-in PWA to correct names or add walk-up guests.
 * Does NOT create new meal tickets — those require an admin operation.
 */
function updateGuestDetails(data) {
  var regId = String(data.regId || '').trim();
  var guests = data.guests;
  var volunteer = String(data.volunteer || 'CheckInPWA');

  if (!regId) return { success: false, error: 'regId is required' };
  if (!Array.isArray(guests)) return { success: false, error: 'guests must be an array' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var ss = getSS();
    var sheet = ss.getSheetByName('Registrations');
    var data_ = sheet.getDataRange().getValues();

    for (var i = 1; i < data_.length; i++) {
      if (String(data_[i][COLUMNS.REG_ID]) !== regId) continue;

      var sanitized = guests.map(function(g) {
        return {
          name: String(g.name || '').trim(),
          age: Number(g.age) || 0,
          isChild: Boolean(g.isChild)
        };
      }).filter(function(g) { return g.name.length > 0; });

      sheet.getRange(i + 1, COLUMNS.GUEST_DETAILS + 1).setValue(JSON.stringify(sanitized));
      logActivity('updateGuestDetails', regId, 'Guest list updated by ' + volunteer, 'CheckInPWA');
      return { success: true };
    }

    return { success: false, error: 'Registration not found' };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}
