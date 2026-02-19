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
    if (data[i][0] === regId) {
      var row = data[i];
      
      // Parse guest details
      var guests = [];
      try {
        guests = JSON.parse(row[19] || '[]');
      } catch(e) {
        guests = [];
      }
      
      return {
        success: true,
        registration: {
          regId: row[0],
          regType: row[2],
          status: row[3],
          name: row[4],
          email: row[5],
          phone: row[6],
          church: row[11],
          housingOption: row[12],
          nights: row[13],
          numNights: row[14],
          adultsCount: row[16],
          childrenCount: row[17],
          totalGuests: row[18],
          guests: guests,
          dietaryNeeds: row[21],
          specialNeeds: row[22],
          totalCharged: row[26],
          amountPaid: row[27],
          balanceDue: row[28],
          paymentStatus: row[30],
          roomAssignment: row[34],
          building: row[35],
          key1Number: row[36],
          key2Number: row[37],
          keyDepositAmount: row[38],
          keyDepositPaid: row[39],
          checkedIn: row[44],
          checkInTime: row[45],
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
    var status = row[3];
    var nights = (row[13] || '').toLowerCase();
    var checkedIn = row[44];
    
    // Include if: confirmed/pending, includes this night, not yet checked in
    if ((status === 'confirmed' || status === 'pending' || status === 'deposit') &&
        nights.indexOf(targetNight) !== -1 &&
        checkedIn !== 'yes') {
      
      arrivals.push({
        regId: row[0],
        name: row[4],
        housingOption: row[12],
        roomAssignment: row[34],
        totalGuests: row[18],
        balanceDue: row[28],
        specialNeeds: row[22]
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
      if (regData[i][0] === data.regId) {
        var row = i + 1;
        
        // Batch update room and key info (columns 35-40)
        var roomKeyValues = [regData[i].slice(34, 40)];
        if (data.room) roomKeyValues[0][0] = data.room;
        if (data.building) roomKeyValues[0][1] = data.building;
        if (data.key1) roomKeyValues[0][2] = data.key1;
        if (data.key2) roomKeyValues[0][3] = data.key2;
        var depositAmount = data.keyDepositAmount || 10;
        roomKeyValues[0][4] = depositAmount;
        roomKeyValues[0][5] = 'yes';
        regSheet.getRange(row, 35, 1, 6).setValues(roomKeyValues);

        // Batch update check-in status (columns 45-48)
        var checkInValues = [[
          'yes',
          new Date(),
          data.volunteer || 'Unknown',
          data.welcomePacket ? 'yes' : 'no'
        ]];
        regSheet.getRange(row, 45, 1, 4).setValues(checkInValues);
        
        // Update room status in Rooms tab
        if (data.room) {
          updateRoomStatus(data.room, 'occupied', data.regId, regData[i][4]);
        }
        
        // Record key deposit as payment
        recordPayment({
          regId: data.regId,
          amount: depositAmount,
          method: 'cash',
          type: 'key_deposit',
          processedBy: data.volunteer || 'Check-in',
          notes: 'Keys: ' + (data.key1 || '') + ', ' + (data.key2 || '')
        });
        
        // Log activity
        logActivity('check_in', data.regId, 
          'Checked in. Room: ' + (data.room || 'N/A') + ', Keys: ' + (data.key1 || '') + '/' + (data.key2 || ''),
          'checkin_pwa');
        
        lock.releaseLock();
        return { 
          success: true, 
          message: 'Check-in complete',
          room: data.room,
          keys: [data.key1, data.key2]
        };
      }
    }
    
    lock.releaseLock();
    return { success: false, error: 'Registration not found' };
    
  } catch (error) {
    lock.releaseLock();
    return { success: false, error: error.toString() };
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
      if (regData[i][0] === data.regId) {
        var row = i + 1;
        
        // Batch update key returns and refund (columns 41-44)
        var returnValues = [regData[i].slice(40, 44)];
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
        regSheet.getRange(row, 41, 1, 4).setValues(returnValues);

        // Batch update check-out status (columns 49-51)
        var checkOutValues = [['yes', new Date(), data.volunteer || 'Unknown']];
        regSheet.getRange(row, 49, 1, 3).setValues(checkOutValues);
        
        // Update room status
        var roomAssignment = regData[i][34];
        if (roomAssignment) {
          updateRoomStatus(roomAssignment, 'available', '', '');
        }
        
        // Log activity
        var keysReturned = (data.key1Returned ? 1 : 0) + (data.key2Returned ? 1 : 0);
        logActivity('check_out', data.regId, 
          'Checked out. Keys returned: ' + keysReturned + '/2. Refund: $' + refundAmount,
          'checkin_pwa');
        
        lock.releaseLock();
        return { 
          success: true, 
          message: 'Check-out complete',
          refundAmount: refundAmount
        };
      }
    }
    
    lock.releaseLock();
    return { success: false, error: 'Registration not found' };
    
  } catch (error) {
    lock.releaseLock();
    return { success: false, error: error.toString() };
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
      roomSheet.getRange(row, 7).setValue(status); // G: status
      roomSheet.getRange(row, 8).setValue(regId || ''); // H: assigned_to_reg_id
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
    if (regData[i][0] === data.regId) {
      var row = i + 1;
      
      // Set room assignment
      regSheet.getRange(row, 35).setValue(data.roomId); // AI: room_assignment
      regSheet.getRange(row, 36).setValue(data.building || ''); // AJ: building
      
      // Update room status to reserved
      updateRoomStatus(data.roomId, 'reserved', data.regId, regData[i][4]);
      
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
    if (regData[i][0] === data.regId) {
      var row = i + 1;
      
      var currentPaid = regData[i][27] || 0;
      var newPaid = currentPaid + parseFloat(data.amount);
      var totalCharged = regData[i][26];
      
      regSheet.getRange(row, 28).setValue(newPaid); // AB: amount_paid
      
      // Update payment status
      if (newPaid >= totalCharged) {
        regSheet.getRange(row, 31).setValue('paid'); // AE: payment_status
      } else {
        regSheet.getRange(row, 31).setValue('partial');
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
 * Search registrations by name (for check-in lookup)
 */
function searchRegistrations(query) {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();
  
  var results = [];
  var queryLower = query.toLowerCase();
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var name = (row[4] || '').toLowerCase();
    var regId = (row[0] || '').toLowerCase();
    var status = row[3];
    
    // Skip cancelled
    if (status === 'cancelled') continue;
    
    if (name.indexOf(queryLower) !== -1 || regId.indexOf(queryLower) !== -1) {
      results.push({
        regId: row[0],
        name: row[4],
        housingOption: row[12],
        roomAssignment: row[34],
        totalGuests: row[18],
        balanceDue: row[28],
        checkedIn: row[44],
        checkedOut: row[48]
      });
    }
  }
  
  return {
    success: true,
    results: results,
    count: results.length
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
    var status = row[3];
    
    if (status === 'cancelled') continue;
    
    stats.totalRegistrations++;
    
    if (row[44] === 'yes') { // checked_in
      stats.checkedIn++;
      
      if (row[48] !== 'yes') { // not checked_out
        // Count keys still out
        var key1Out = row[39] === 'yes' && row[40] !== 'yes';
        var key2Out = row[39] === 'yes' && row[41] !== 'yes';
        stats.keysOut += (key1Out ? 1 : 0) + (key2Out ? 1 : 0);
        
        // Deposits held
        if (row[39] === 'yes' && row[42] !== 'yes') {
          stats.depositsHeld += row[38] || 0;
        }
      }
    } else {
      stats.notArrived++;
    }
    
    if (row[48] === 'yes') {
      stats.checkedOut++;
    }
    
    stats.balancesDue += row[28] || 0;
  }
  
  return {
    success: true,
    stats: stats
  };
}