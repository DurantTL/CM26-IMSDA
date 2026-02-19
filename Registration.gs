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
    // This array MUST match the column order (A - AU) in your sheet exactly
    // Using COLUMNS constant implicitly by order, but comment references helper
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
      data.numNights || 0,              // O: num_nights
      data.housingSubtotal || 0,        // P: housing_subtotal
      data.adultsCount || 1,            // Q: adults_count
      data.childrenCount || 0,          // R: children_count
      (data.adultsCount || 1) + (data.childrenCount || 0), // S: total_guests
      JSON.stringify(data.guests || []),// T: guest_details (JSON)
      JSON.stringify(data.mealSelections || {}), // U: meal_selections (JSON)
      data.dietaryNeeds || '',          // V: dietary_needs
      data.specialNeeds || '',          // W: special_needs
      data.mealSubtotal || 0,           // X: meal_subtotal
      data.subtotal || 0,               // Y: subtotal
      data.processingFee || 0,          // Z: processing_fee
      data.totalCharged || 0,           // AA: total_charged
      data.paymentStatus === 'paid' ? data.totalCharged : 0, // AB: amount_paid
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
      '',                               // AZ: notes
      data.entryId || '',               // BA: fluent_entry_id
      regId                             // BB: qr_data
    ];
    
    // 4. Save to Registration Sheet
    regSheet.appendRow(regRow);
    
    // Flush to ensure row exists before Guests/Meals processing
    SpreadsheetApp.flush();

    // 5. Save Individual Guest Details
    if (data.guests && data.guests.length > 0) {
      var guestRows = [];
      data.guests.forEach(function(guest) {
        guestRows.push([
          generateGuestId(),            // guest_id
          regId,                        // reg_id
          guest.name,                   // guest_name
          guest.age,                    // age
          guest.isChild ? 'yes' : 'no', // is_child
          'no',                         // is_primary
          '',                           // class_assignment
          '',                           // sabbath_school
          ''                            // children_meeting
        ]);
      });
      
      if (guestRows.length > 0) {
        guestSheet.getRange(guestSheet.getLastRow() + 1, 1, guestRows.length, guestRows[0].length)
                  .setValues(guestRows);
      }
    }
    
    // 6. Create Meal Tickets
    // This calls the function in MealTickets.gs
    createMealTickets(regId, data);
    
    // 7. Record Payment
    // If they paid immediately via Square, log it in Payments tab
    if (data.totalCharged > 0 && data.paymentStatus === 'paid') {
      recordPayment({
        regId: regId,
        amount: data.totalCharged,
        method: data.paymentMethod || 'square',
        type: 'full',
        transactionId: data.transactionId,
        notes: 'Initial registration'
      });
    }

    // 7.5 Send Email
    sendConfirmationEmail(regId);
    
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
 * Retrieve full registration details by ID
 * Unified function used by Email.gs and API
 */
function getRegistration(regId) {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][COLUMNS.REG_ID] === regId) {
      var row = data[i];

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
          qrData: row[53] // BB
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

    var currentStatus = regRow[COLUMNS.STATUS];
    if (currentStatus === 'cancelled') {
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
