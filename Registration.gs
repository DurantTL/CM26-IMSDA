// ==========================================
// FILE: Registration.gs
// ==========================================

function processRegistration(data) {
  var lock = LockService.getScriptLock();
  
  // Wait up to 30 seconds to avoid collision on simultaneous submits
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { success: false, error: 'System busy, please try again.' };
  }
  
  try {
    // Input Validation (Issue 16)
    if (!data.name || !data.email || !data.housingOption) {
      return { success: false, error: 'Missing required fields (Name, Email, or Housing).' };
    }

    var ss = getSS(); 
    var regSheet = ss.getSheetByName('Registrations');
    var guestSheet = ss.getSheetByName('GuestDetails');
    
    // Check registration deadline
    var config = getConfig();
    var deadlineDate = new Date(config.registration_deadline || '2026-05-25');
    deadlineDate.setHours(23, 59, 59, 999);
    var today = new Date();

    if (today > deadlineDate) {
      return { success: false, error: 'Registration deadline has passed.' };
    }

    // 1. Validate Housing Availability
    // Defaults to 1 unit if not specified
    // Pass numNights for minNights check (Issue 14)
    var availCheck = checkAvailability(data.housingOption, 1, data.numNights || 0);
    
    if (!availCheck.available) {
      // Return specific flag so frontend knows to offer waitlist
      return { 
        success: false, 
        error: availCheck.message, 
        waitlistAvailable: true 
      };
    }
    
    // 2. Generate IDs
    var regId = generateRegId(); // Atomic (Issue 6)
    var createdDate = new Date();
    
    // 3. Prepare Data for 'Registrations' Sheet
    // Compute fee and total: prefer frontend-supplied values (guarantees an
    // exact match with what Square actually charged the customer) and fall
    // back to server-side calculation via calculateSquareFee() if absent.
    // Housing price map — must match JS/PHP pricing constants
    var HOUSING_PRICES = { dorm: 25, rv: 15, tent: 5, none: 0 };

    // Recalculate housing subtotal server-side if frontend sent 0
    var housingPrice = HOUSING_PRICES[data.housingOption] || 0;
    var numNights = data.numNights || 0;

    // Count nights from array if numNights is 0
    if (numNights === 0 && data.nights && typeof data.nights === 'string' && data.nights.length > 0) {
      numNights = data.nights.split(',').filter(function(n) { return n.trim().length > 0; }).length;
    }

    var serverHousingSubtotal = housingPrice * numNights;

    // Use server-calculated value if frontend sent 0
    var housingSubtotal = (data.housingSubtotal && parseFloat(data.housingSubtotal) > 0)
      ? parseFloat(data.housingSubtotal)
      : serverHousingSubtotal;

    var calculatedSubtotal = housingSubtotal + (data.mealSubtotal || 0);
    var processingFee = data.processingFee !== undefined
      ? parseFloat(data.processingFee)
      : calculateSquareFee(calculatedSubtotal);
    var totalCharged = data.totalCharged !== undefined
      ? parseFloat(data.totalCharged)
      : (calculatedSubtotal + processingFee);

    // Build guest payload once so class assignments are computed during
    // registration processing and then re-used for both sheet rows and
    // stored registration JSON/email rendering.
    var guestsWithProgramAssignments = (data.guests || []).map(function(guest) {
      var resolvedAge = (guest.age === null || guest.age === undefined || guest.age === 0 || guest.age === '') ? 30 : guest.age;
      var programGroup = getChildProgramGroup(resolvedAge);
      return {
        name: guest.name || '',
        age: resolvedAge,
        isChild: resolvedAge < 18,
        attendanceType: guest.attendanceType || 'full',
        attendanceRaw: guest.attendanceRaw || 'Full Time',
        attendanceDays: (guest.attendanceDays && guest.attendanceDays.join) ? guest.attendanceDays : ['tue', 'wed', 'thu', 'fri', 'sat'],
        classCategory: programGroup.category || '',
        classAssignment: programGroup.classAssignment || '',
        sabbathSchool: programGroup.sabbathSchool || '',
        childrenMeeting: programGroup.childrenMeeting || ''
      };
    });

    // This array MUST match the column order (A - AU) in your sheet exactly
    var regRow = [
      regId,                            // A: reg_id
      createdDate,                      // B: created_at
      data.regType || 'paid',           // C: reg_type
      data.paymentStatus === 'paid' ? 'confirmed' : 'pending', // D: status
      data.name,                        // E: primary_name
      data.email,                       // F: email
      data.phone,                       // G: phone
      data.addressStreet || '',         // H: address_street
      data.addressCity || '',           // I: address_city
      data.addressState || '',          // J: address_state
      data.addressZip || '',            // K: address_zip
      data.church || '',                // L: church
      data.housingOption || 'none',     // M: housing_option
      data.nights || '',                // N: nights
      numNights,                        // O: num_nights
      housingSubtotal,                  // P: housing_subtotal
      data.adultsCount || 1,            // Q: adults_count
      data.childrenCount || 0,          // R: children_count
      (data.adultsCount || 1) + (data.childrenCount || 0), // S: total_guests
      JSON.stringify(guestsWithProgramAssignments),// T: guest_details (JSON)
      JSON.stringify(data.mealSelections || {}), // U: meal_selections (JSON)
      data.dietaryNeeds || '',          // V: dietary_needs
      (data.firstFloorNeeded === 'Yes' ? 'First floor needed. ' : '') + (data.specialNeeds || ''), // W: special_needs
      data.mealSubtotal || 0,           // X: meal_subtotal
      data.subtotal || 0,               // Y: subtotal
      processingFee,                    // Z: processing_fee
      totalCharged,                     // AA: total_charged
      data.paymentStatus === 'paid' ? totalCharged : 0, // AB: amount_paid
      0,                                // AC: balance_due (Calculated by Sheet Formula)
      data.paymentMethod || 'square',   // AD: payment_method
      data.paymentStatus || 'pending',  // AE: payment_status
      data.transactionId || '',         // AF: transaction_id
      data.staffRole || '',             // AG: staff_role
      'no',                             // AH: moveable
      '',                               // AI: room_assignment
      '',                               // AJ: building
      '',                               // AK: key_1_number
      '',                               // AL: key_2_number
      0,                                // AM: key_deposit_amount
      'no',                             // AN: key_deposit_paid
      'no',                             // AO: key_1_returned
      'no',                             // AP: key_2_returned
      'no',                             // AQ: deposit_refunded
      0,                                // AR: deposit_refund_amount
      'no',                             // AS: checked_in
      '',                               // AT: check_in_time
      '',                               // AU: checked_in_by
      'no',                             // AV: welcome_packet_given
      'no',                             // AW: checked_out
      '',                               // AX: check_out_time
      '',                               // AY: checked_out_by
      data.rvDetails || '',             // AZ: notes
      data.entryId || '',               // BA: fluent_entry_id
      regId,                            // BB: qr_data
      data.specialRequests || ''        // BC: special_requests
    ];
    
    // 4. Save to Registration Sheet
    Logger.log('CM26 Registration: housingSubtotal=%s, mealSubtotal=%s, numNights=%s', housingSubtotal, data.mealSubtotal, numNights);
    regSheet.appendRow(regRow);
    
    // Flush to ensure row exists before Guests/Meals processing
    SpreadsheetApp.flush();
    var insertedRow = regSheet.getLastRow();

    // *** TRANSACTION BLOCK ***
    try {
      // 5. Save Individual Guest Details
      if (guestsWithProgramAssignments.length > 0) {
        var guestRows = [];
        var guestSheetColumnCount = guestSheet.getLastColumn();
        var supportsAttendanceColumns = guestSheetColumnCount >= 12;
        guestsWithProgramAssignments.forEach(function(guest) {
          var row = [
            generateGuestId(),            // guest_id
            regId,                        // reg_id
            guest.name,                   // guest_name
            guest.age,                    // age
            guest.isChild ? 'yes' : 'no', // is_child
            'no',                         // is_primary
            guest.classAssignment,        // class_assignment
            guest.sabbathSchool,          // sabbath_school
            guest.childrenMeeting         // children_meeting
          ];

          // Optional attendance columns (attendance_type, attendance_raw, attendance_days)
          // If GuestDetails has not been expanded yet, keep current 9-column write behavior.
          if (supportsAttendanceColumns) {
            row.push(
              guest.attendanceType || 'full',
              guest.attendanceRaw || 'Full Time',
              (guest.attendanceDays && guest.attendanceDays.join) ? guest.attendanceDays.join(',') : 'tue,wed,thu,fri,sat'
            );
          } else {
            // TODO: Add attendance columns to GuestDetails sheet to persist per-guest attendance there too.
          }

          guestRows.push(row);
        });

        if (guestRows.length > 0) {
          guestSheet.getRange(guestSheet.getLastRow() + 1, 1, guestRows.length, guestRows[0].length)
                    .setValues(guestRows);
        }
      }

      // 6. Create Meal Tickets
      // Pass skipLock=true to maintain the current lock
      createMealTickets(regId, data, true);

    } catch (innerError) {
      // ROLLBACK
      console.error('Registration failed mid-process. Rolling back row ' + insertedRow + '. Error: ' + innerError.toString());
      regSheet.deleteRow(insertedRow);
      // Re-throw to inform caller
      throw innerError;
    }
    
    // 7. Record Payment
    // If they paid immediately via Square, log it in Payments tab
    if (totalCharged > 0 && data.paymentStatus === 'paid') {
      recordPayment({
        regId: regId,
        amount: totalCharged,
        method: data.paymentMethod || 'square',
        type: 'full',
        transactionId: data.transactionId,
        notes: 'Initial registration'
      });
    }

    // 7.5 Queue Email (async — returns immediately so WordPress isn't kept waiting)
    queueConfirmationEmail(regId);
    
    // 8. Log Activity
    logActivity('registration', regId, 'New registration created', 'api');
    
    return {
      success: true,
      registrationId: regId,
      message: 'Registration processed successfully'
    };
    
  } catch (error) {
    logActivity('error', 'unknown', error.toString(), 'system');
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Returns child class configuration from the Config sheet, with safe defaults.
 *
 * Admin note:
 * - Age ranges are driven by Config sheet key/value entries (not hardcoded).
 * - To update class brackets later, edit Config values only.
 * - Required keys are documented in registration setup notes.
 */
function getChildClassConfig() {
  var config = getConfig();
  var defaults = [
    { key: 'nursery',      label: 'Cradle Roll',  minAge: 0,  maxAge: 3  },
    { key: 'kindergarten', label: 'Kindergarten', minAge: 4,  maxAge: 6  },
    { key: 'primary',      label: 'Primary',      minAge: 7,  maxAge: 8  },
    { key: 'juniors',      label: 'Juniors',      minAge: 9,  maxAge: 10 },
    { key: 'preteens',     label: 'PreTeens',     minAge: 11, maxAge: 13 },
    { key: 'youth',        label: 'Youth',        minAge: 14, maxAge: 18 }
  ];

  var classes = [];
  for (var i = 0; i < defaults.length; i++) {
    var item = defaults[i];
    var label = _readConfigString(config['class_' + item.key + '_label'], item.label);
    var minAge = _readConfigInt(config['class_' + item.key + '_min_age'], item.minAge);
    var maxAge = _readConfigInt(config['class_' + item.key + '_max_age'], item.maxAge);

    // Guard against accidental swapped values in Config.
    if (minAge > maxAge) {
      var swap = minAge;
      minAge = maxAge;
      maxAge = swap;
    }

    classes.push({
      key: item.key,
      label: label,
      minAge: minAge,
      maxAge: maxAge
    });
  }

  return { classes: classes };
}

/**
 * Maps a guest age to a configured children program class.
 * Returns blank class fields for adults older than the configured youth max age
 * and for invalid/unknown ages.
 */
function getChildProgramGroup(age) {
  var numericAge = _parseAge(age);
  if (numericAge === null) {
    return {
      category: 'unknown',
      classAssignment: '',
      sabbathSchool: '',
      childrenMeeting: ''
    };
  }

  var classConfig = getChildClassConfig();
  var maxConfiguredAge = -1;
  for (var c = 0; c < classConfig.classes.length; c++) {
    if (classConfig.classes[c].maxAge > maxConfiguredAge) {
      maxConfiguredAge = classConfig.classes[c].maxAge;
    }
  }

  if (numericAge > maxConfiguredAge) {
    return {
      category: 'adult',
      classAssignment: '',
      sabbathSchool: '',
      childrenMeeting: ''
    };
  }

  for (var i = 0; i < classConfig.classes.length; i++) {
    var classDef = classConfig.classes[i];
    if (numericAge >= classDef.minAge && numericAge <= classDef.maxAge) {
      return {
        category: classDef.key,
        classAssignment: classDef.label,
        sabbathSchool: classDef.label,
        childrenMeeting: classDef.label
      };
    }
  }

  return {
    category: 'unknown',
    classAssignment: '',
    sabbathSchool: '',
    childrenMeeting: ''
  };
}

/**
 * Build stable child-class totals for reporting.
 * Stable keys: nursery, kindergarten, primary, juniors, preteens, youth, unknown.
 */
function buildChildClassCounts(guests) {
  var classConfig = getChildClassConfig();
  var labels = {
    nursery: 'Cradle Roll',
    kindergarten: 'Kindergarten',
    primary: 'Primary',
    juniors: 'Juniors',
    preteens: 'PreTeens',
    youth: 'Youth',
    unknown: 'Unknown'
  };

  for (var i = 0; i < classConfig.classes.length; i++) {
    labels[classConfig.classes[i].key] = classConfig.classes[i].label;
  }

  var counts = {
    nursery: 0,
    kindergarten: 0,
    primary: 0,
    juniors: 0,
    preteens: 0,
    youth: 0,
    unknown: 0
  };

  var list = guests || [];
  for (var g = 0; g < list.length; g++) {
    var group = getChildProgramGroup(list[g].age);
    if (group.category === 'adult') continue;
    if (counts[group.category] === undefined) {
      counts.unknown++;
    } else {
      counts[group.category]++;
    }
  }

  return {
    counts: counts,
    labels: labels
  };
}

/**
 * Returns child class totals grouped by class_assignment from GuestDetails.
 * Includes attendance-type breakdown when attendance columns exist.
 */
function getChildrenClassSummary() {
  var ss = getSS();
  var guestSheet = ss.getSheetByName('GuestDetails');
  if (!guestSheet) {
    return { success: false, error: 'GuestDetails sheet not found.' };
  }

  var lastRow = guestSheet.getLastRow();
  var lastCol = guestSheet.getLastColumn();
  if (lastRow <= 1) {
    return {
      success: true,
      totalsByClassAssignment: {},
      attendanceByClassAssignment: {},
      totalsByConfiguredGroup: buildChildClassCounts([]).counts
    };
  }

  var headers = guestSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var rows = guestSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var idxAge = headers.indexOf('age');
  var idxClassAssignment = headers.indexOf('class_assignment');
  var idxAttendanceType = headers.indexOf('attendance_type');

  var totalsByClassAssignment = {};
  var attendanceByClassAssignment = {};
  var pseudoGuests = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var age = idxAge >= 0 ? row[idxAge] : '';
    var group = getChildProgramGroup(age);
    if (group.category === 'adult') continue;

    var classAssignment = idxClassAssignment >= 0 ? String(row[idxClassAssignment] || '').trim() : '';
    var classKey = classAssignment || (group.category === 'unknown' ? 'Unknown' : group.classAssignment);
    totalsByClassAssignment[classKey] = (totalsByClassAssignment[classKey] || 0) + 1;

    if (!attendanceByClassAssignment[classKey]) attendanceByClassAssignment[classKey] = {};
    if (idxAttendanceType >= 0) {
      var attendanceType = String(row[idxAttendanceType] || '').trim() || 'unknown';
      attendanceByClassAssignment[classKey][attendanceType] = (attendanceByClassAssignment[classKey][attendanceType] || 0) + 1;
    }

    pseudoGuests.push({ age: age });
  }

  return {
    success: true,
    totalsByClassAssignment: totalsByClassAssignment,
    attendanceByClassAssignment: attendanceByClassAssignment,
    totalsByConfiguredGroup: buildChildClassCounts(pseudoGuests).counts,
    labelsByConfiguredGroup: buildChildClassCounts([]).labels
  };
}

function _parseAge(age) {
  if (age === null || age === undefined || age === '') return null;
  var parsed = parseInt(age, 10);
  if (isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

function _readConfigInt(value, fallback) {
  var parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function _readConfigString(value, fallback) {
  var text = value === null || value === undefined ? '' : String(value).trim();
  return text || fallback;
}

/**
 * Retrieve full registration details by ID
 * Unified function used by Email.gs and API
 */
function getRegistration(regId) {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();
  var targetRaw = String(regId || '');
  var targetTrim = targetRaw.trim();
  var targetLower = targetTrim.toLowerCase();
  var target = targetLower.replace(/[–—]/g, '-');

  Logger.log('[getRegistration] target regId raw: "%s"', targetRaw);
  Logger.log('[getRegistration] target regId normalized: "%s"', target);

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var storedRaw = String(row[COLUMNS.REG_ID] || '');
    var storedTrim = storedRaw.trim();
    var storedLower = storedTrim.toLowerCase();
    var stored = storedLower.replace(/[–—]/g, '-');

    var exactMatch = storedRaw === targetRaw;
    var trimOnlyMatch = storedTrim === targetTrim;
    var lowercaseMatch = storedLower === targetLower;
    var dashNormalizedMatch = stored === target;
    var shouldLogRow = exactMatch ||
      trimOnlyMatch ||
      lowercaseMatch ||
      dashNormalizedMatch ||
      i <= 5 ||
      stored.indexOf(target) !== -1 ||
      target.indexOf(stored) !== -1;

    if (shouldLogRow) {
      Logger.log(
        '[getRegistration] row %s stored reg_id raw="%s", normalized="%s", exact=%s, trim=%s, lowercase=%s, dashNormalized=%s',
        i + 1,
        storedRaw,
        stored,
        exactMatch,
        trimOnlyMatch,
        lowercaseMatch,
        dashNormalizedMatch
      );
    }

    if (dashNormalizedMatch) {

      // Parse guest details
      var guests = [];
      try {
        guests = JSON.parse(row[COLUMNS.GUEST_DETAILS] || '[]');
      } catch(e) {
        guests = [];
      }

      // Parse meal selections
      var mealSelections = {};
      try {
        mealSelections = JSON.parse(row[COLUMNS.MEAL_SELECTIONS] || '{}');
      } catch(e) {
        mealSelections = {};
      }

      return {
        success: true,
        registration: {
          regId: row[COLUMNS.REG_ID],
          createdAt: row[COLUMNS.CREATED_AT],
          regType: row[COLUMNS.REG_TYPE],
          status: row[COLUMNS.STATUS],
          name: row[COLUMNS.PRIMARY_NAME],
          email: row[COLUMNS.EMAIL],
          phone: row[COLUMNS.PHONE],
          addressStreet: row[7], // Not in COLUMNS yet, using index
          addressCity: row[8],
          addressState: row[9],
          addressZip: row[10],
          church: row[COLUMNS.CHURCH],
          housingOption: row[COLUMNS.HOUSING_OPTION],
          nights: row[COLUMNS.NIGHTS],
          numNights: row[COLUMNS.NUM_NIGHTS],
          housingSubtotal: row[COLUMNS.HOUSING_SUBTOTAL],
          adultsCount: row[COLUMNS.ADULTS_COUNT],
          childrenCount: row[COLUMNS.CHILDREN_COUNT],
          totalGuests: row[COLUMNS.TOTAL_GUESTS],
          guests: guests,
          mealSelections: mealSelections,
          dietaryNeeds: row[COLUMNS.DIETARY_NEEDS],
          specialNeeds: row[COLUMNS.SPECIAL_NEEDS],
          firstFloorNeeded: row[22],
          mealSubtotal: row[COLUMNS.MEAL_SUBTOTAL],
          subtotal: row[COLUMNS.SUBTOTAL],
          processingFee: row[25], // Z
          totalCharged: row[COLUMNS.TOTAL_CHARGED],
          amountPaid: row[COLUMNS.AMOUNT_PAID],
          balanceDue: row[COLUMNS.BALANCE_DUE],
          paymentMethod: row[COLUMNS.PAYMENT_METHOD],
          paymentStatus: row[COLUMNS.PAYMENT_STATUS],
          transactionId: row[31], // AF
          staffRole: row[32], // AG
          moveable: row[33], // AH
          roomAssignment: row[COLUMNS.ROOM_ASSIGNMENT],
          building: row[COLUMNS.BUILDING],
          key1Number: row[COLUMNS.KEY_1_NUMBER],
          key2Number: row[COLUMNS.KEY_2_NUMBER],
          keyDepositAmount: row[COLUMNS.KEY_DEPOSIT_AMOUNT],
          keyDepositPaid: row[COLUMNS.KEY_DEPOSIT_PAID],
          checkedIn: row[COLUMNS.CHECKED_IN],
          checkInTime: row[COLUMNS.CHECK_IN_TIME],
          checkedOut: row[COLUMNS.CHECKED_OUT],
          checkOutTime: row[COLUMNS.CHECK_OUT_TIME],
          qrData: row[53], // BB
          specialRequests: row[54] // BC
        }
      };
    }
  }

  return { success: false, error: 'Registration not found' };
}

/**
 * Cancel a registration and process refund if applicable
 */
function cancelRegistration(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy, please try again' };
  }

  try {
    var ss = getSS();
    var regSheet = ss.getSheetByName('Registrations');
    var config = getConfig();
    var regData = regSheet.getDataRange().getValues();
    var regId = data.regId;

    // Find registration
    var rowIndex = -1;
    var regRow = null;

    for (var i = 1; i < regData.length; i++) {
      if (regData[i][COLUMNS.REG_ID] === regId) {
        rowIndex = i + 1;
        regRow = regData[i];
        break;
      }
    }

    if (rowIndex === -1) {
      return { success: false, error: 'Registration not found' };
    }

    if (isCancelledRegistration(regRow)) {
      return { success: false, error: 'Registration already cancelled' };
    }

    var amountPaid = regRow[COLUMNS.AMOUNT_PAID] || 0;
    var totalCharged = regRow[COLUMNS.TOTAL_CHARGED] || 0;
    var refundAmount = 0;
    var cancellationFee = 0;
    var amountRetained = 0;

    // Check deadline
    var deadlineDate = new Date(config.cancellation_deadline || '2026-05-25');
    var today = new Date();

    if (today <= deadlineDate) {
      // Before deadline: Full refund minus fee
      cancellationFee = Number(config.cancellation_fee) || 10;
    } else {
      // After deadline: Forfeit deposit
      cancellationFee = Number(config.deposit_amount) || 65;
    }

    if (amountPaid > cancellationFee) {
      amountRetained = cancellationFee;
      refundAmount = amountPaid - cancellationFee;
    } else {
      amountRetained = amountPaid;
      refundAmount = 0;
    }

    // Update Registration
    // We update status to 'cancelled'
    regSheet.getRange(rowIndex, COLUMNS.STATUS + 1).setValue('cancelled');

    // Update Total Charged to reflect what we kept
    regSheet.getRange(rowIndex, COLUMNS.TOTAL_CHARGED + 1).setValue(amountRetained);

    // Record Refund Payment if needed
    if (refundAmount > 0) {
      // This will update amount_paid
      recordPayment({
        regId: regId,
        amount: -refundAmount,
        method: 'check', // Default method for now
        type: 'refund',
        notes: 'Cancellation refund (Fee: $' + cancellationFee + ')'
      });

      // recordPayment might change status to 'paid', so force 'cancelled' back
      regSheet.getRange(rowIndex, COLUMNS.STATUS + 1).setValue('cancelled');
    }

    // Release Room Assignment
    var roomAssignment = regRow[COLUMNS.ROOM_ASSIGNMENT];
    if (roomAssignment) {
      try {
        updateRoomStatus(roomAssignment, 'available', '', '');
        regSheet.getRange(rowIndex, COLUMNS.ROOM_ASSIGNMENT + 1).setValue('');
        regSheet.getRange(rowIndex, COLUMNS.BUILDING + 1).setValue('');
      } catch(e) {
        logActivity('error', regId, 'Failed to release room: ' + e.toString(), 'cancellation');
      }
    }

    logActivity('cancellation', regId, 'Cancelled. Refund: $' + refundAmount + ', Retained: $' + amountRetained, 'api');

    return {
      success: true,
      message: 'Registration cancelled',
      refundAmount: refundAmount,
      amountRetained: amountRetained
    };

  } catch (error) {
    logActivity('error', 'unknown', error.toString(), 'system');
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Admin-safe soft delete for a registration.
 * Uses the existing status model by marking rows as "cancelled"
 * instead of physically removing sheet rows.
 *
 * @param {string|Object} input registration ID string or { regId: 'CM26-0001' }
 * @returns {{success:boolean, regId:string, message?:string, error?:string}}
 */
function deleteRegistration(input) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, regId: '', error: 'System busy, please try again.' };
  }

  var normalizedRegId = '';
  try {
    normalizedRegId = (typeof input === 'string' ? input : (input && input.regId)).toString().trim();
    if (!normalizedRegId) {
      logActivity('registration_delete_failed', 'unknown', 'Missing registration ID', 'admin');
      return { success: false, regId: '', error: 'Missing registration ID' };
    }

    logActivity('registration_delete_requested', normalizedRegId, 'Delete requested by admin', 'admin');

    var ss = getSS();
    var regSheet = ss.getSheetByName('Registrations');
    var regData = regSheet.getDataRange().getValues();
    var rowIndex = -1;
    var regRow = null;
    for (var i = 1; i < regData.length; i++) {
      if (String(regData[i][COLUMNS.REG_ID] || '') === normalizedRegId) {
        rowIndex = i + 1;
        regRow = regData[i];
        break;
      }
    }

    if (rowIndex === -1 || !regRow) {
      logActivity('registration_delete_failed', normalizedRegId, 'Registration not found', 'admin');
      return { success: false, regId: normalizedRegId, error: 'Registration not found.' };
    }

    var existingStatus = normalizeRegistrationStatus(regRow[COLUMNS.STATUS]);
    var regName = String(regRow[COLUMNS.PRIMARY_NAME] || '');
    var regEmail = String(regRow[COLUMNS.EMAIL] || '');
    if (isCancelledRegistration(regRow)) {
      var alreadyMessage = 'Registration already deleted.';
      logActivity('registration_delete_success', normalizedRegId, alreadyMessage + ' name=' + regName + ', email=' + regEmail, 'admin');
      return { success: true, regId: normalizedRegId, message: alreadyMessage };
    }

    // Soft delete: mark cancelled to preserve audit history and related records.
    regSheet.getRange(rowIndex, COLUMNS.STATUS + 1).setValue('cancelled');

    // Release any reserved room assignment for consistency with active inventory.
    var roomAssignment = regRow[COLUMNS.ROOM_ASSIGNMENT];
    if (roomAssignment) {
      try {
        updateRoomStatus(roomAssignment, 'available', '', '');
      } catch (roomError) {
        logActivity('error', normalizedRegId, 'Delete: room release failed: ' + roomError.toString(), 'admin');
      }
      regSheet.getRange(rowIndex, COLUMNS.ROOM_ASSIGNMENT + 1).setValue('');
      regSheet.getRange(rowIndex, COLUMNS.BUILDING + 1).setValue('');
    }

    logActivity(
      'registration_delete_success',
      normalizedRegId,
      'Registration deleted (soft). name=' + regName + ', email=' + regEmail + ', previous_status=' + existingStatus,
      'admin'
    );
    return { success: true, regId: normalizedRegId, message: 'Registration deleted.' };
  } catch (error) {
    var errorText = error && error.toString ? error.toString() : 'Unknown error';
    logActivity('registration_delete_failed', normalizedRegId || 'unknown', errorText, 'admin');
    return { success: false, regId: normalizedRegId || '', error: errorText };
  } finally {
    lock.releaseLock();
  }
}
