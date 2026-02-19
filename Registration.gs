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
    // Use getSS() helper from Utilities.gs to ensure correct ID access
    var ss = getSS(); 
    var regSheet = ss.getSheetByName('Registrations');
    var guestSheet = ss.getSheetByName('GuestDetails');
    
    // Check registration deadline
    var config = getConfig();
    var deadlineDate = new Date(config.registration_deadline || '2026-05-25');
    deadlineDate.setHours(23, 59, 59, 999);
    var today = new Date();

    if (today > deadlineDate) {
      lock.releaseLock();
      return { success: false, error: 'Registration deadline has passed.' };
    }

    // 1. Validate Housing Availability
    // Defaults to 1 unit if not specified
    var availCheck = checkAvailability(data.housingOption, 1);
    
    if (!availCheck.available) {
      // Return specific flag so frontend knows to offer waitlist
      return { 
        success: false, 
        error: availCheck.message, 
        waitlistAvailable: true 
      };
    }
    
    // 2. Generate IDs
    var regId = generateRegId();
    var createdDate = new Date();
    
    // 3. Prepare Data for 'Registrations' Sheet
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
    // 7.5 Send Email (New Line)
    sendConfirmationEmail(regId);
    
    // 8. Log Activity
    logActivity('registration', regId, 'New registration created', 'api');
    
    // Release the lock
    lock.releaseLock();
    
    return {
      success: true,
      registrationId: regId,
      message: 'Registration processed successfully'
    };
    
  } catch (error) {
    lock.releaseLock();
    logActivity('error', 'unknown', error.toString(), 'system');
    return { success: false, error: error.toString() };
  }
}
/**
 * Retrieve full registration details by ID
 */
function getRegistration(regId) {
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

      // Parse meal selections
      var mealSelections = {};
      try {
        mealSelections = JSON.parse(row[20] || '{}');
      } catch(e) {
        mealSelections = {};
      }

      return {
        success: true,
        registration: {
          regId: row[0],
          createdAt: row[1],
          regType: row[2],
          status: row[3],
          name: row[4],
          email: row[5],
          phone: row[6],
          addressStreet: row[7],
          addressCity: row[8],
          addressState: row[9],
          addressZip: row[10],
          church: row[11],
          housingOption: row[12],
          nights: row[13],
          numNights: row[14],
          housingSubtotal: row[15],
          adultsCount: row[16],
          childrenCount: row[17],
          totalGuests: row[18],
          guests: guests,
          mealSelections: mealSelections,
          dietaryNeeds: row[21],
          specialNeeds: row[22],
          mealSubtotal: row[23],
          subtotal: row[24],
          processingFee: row[25],
          totalCharged: row[26],
          amountPaid: row[27],
          balanceDue: row[28],
          paymentMethod: row[29],
          paymentStatus: row[30],
          transactionId: row[31],
          staffRole: row[32],
          moveable: row[33],
          roomAssignment: row[34],
          building: row[35],
          key1Number: row[36],
          key2Number: row[37],
          keyDepositAmount: row[38],
          keyDepositPaid: row[39],
          checkedIn: row[44],
          checkInTime: row[45],
          checkedOut: row[49],
          checkOutTime: row[50],
          qrData: row[53]
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
      if (regData[i][0] === regId) {
        rowIndex = i + 1;
        regRow = regData[i];
        break;
      }
    }

    if (rowIndex === -1) {
      lock.releaseLock();
      return { success: false, error: 'Registration not found' };
    }

    var currentStatus = regRow[3]; // D: status
    if (currentStatus === 'cancelled') {
      lock.releaseLock();
      return { success: false, error: 'Registration already cancelled' };
    }

    var amountPaid = regRow[27] || 0; // AB: amount_paid
    var totalCharged = regRow[26] || 0; // AA: total_charged
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
    regSheet.getRange(rowIndex, 4).setValue('cancelled'); // D: status

    // Update Total Charged to reflect what we kept
    regSheet.getRange(rowIndex, 27).setValue(amountRetained); // AA: total_charged

    // Record Refund Payment if needed
    if (refundAmount > 0) {
      // This will update amount_paid (AB)
      recordPayment({
        regId: regId,
        amount: -refundAmount,
        method: 'check', // Default method for now
        type: 'refund',
        notes: 'Cancellation refund (Fee: $' + cancellationFee + ')'
      });

      // recordPayment might change status to 'paid', so force 'cancelled' back
      regSheet.getRange(rowIndex, 4).setValue('cancelled');
    }

    // Release Room Assignment
    var roomAssignment = regRow[34]; // AI: room_assignment
    if (roomAssignment) {
      try {
        updateRoomStatus(roomAssignment, 'available', '', '');
        regSheet.getRange(rowIndex, 35).setValue(''); // Clear AI
        regSheet.getRange(rowIndex, 36).setValue(''); // Clear AJ
      } catch(e) {
        logActivity('error', regId, 'Failed to release room: ' + e.toString(), 'cancellation');
      }
    }

    logActivity('cancellation', regId, 'Cancelled. Refund: $' + refundAmount + ', Retained: $' + amountRetained, 'api');

    lock.releaseLock();
    return {
      success: true,
      message: 'Registration cancelled',
      refundAmount: refundAmount,
      amountRetained: amountRetained
    };

  } catch (error) {
    lock.releaseLock();
    logActivity('error', 'unknown', error.toString(), 'system');
    return { success: false, error: error.toString() };
  }
}
