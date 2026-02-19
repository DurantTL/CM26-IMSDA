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