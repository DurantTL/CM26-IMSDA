// ==========================================
// FILE: StaffRegistration.gs
// ==========================================
// PURPOSE: Handles staff/pastor/volunteer registrations from Google Form
// 
// SETUP INSTRUCTIONS:
// 1. Create a Google Form with these questions (see planning doc Section 5)
// 2. Link this script to that Form
// 3. Add trigger: Resources > Triggers > Add > onStaffFormSubmit > On form submit

/**
 * Main form submit handler
 * Triggered automatically when someone submits the staff registration form
 */
function onStaffFormSubmit(e) {
  try {
    var responses = e.namedValues;

    // Parse guest list first so counts can be derived from it
    var guests = parseGuestDetails(responses['Family Members (Name & Age)'] ? responses['Family Members (Name & Age)'][0] : '');

    // Derive party counts from parsed guest list
    // Primary registrant is always counted as an adult (+1)
    var adultsCount = 1;
    var childrenCount = 0;
    for (var g = 0; g < guests.length; g++) {
      if (guests[g].isChild === false) {
        adultsCount++;
      } else {
        childrenCount++;
      }
    }

    // Build data object from form responses
    var data = {
      action: 'submitRegistration',
      regType: 'staff',

      // Basic info
      staffRole: responses['Your Role'] ? responses['Your Role'][0] : 'Staff',
      name: responses['Full Name'] ? responses['Full Name'][0] : '',
      email: responses['Email'] ? responses['Email'][0] : '',
      phone: responses['Phone'] ? responses['Phone'][0] : '',

      // Housing — all workers attend the full event (June 2–6)
      housingOption: mapHousingOption(responses['Housing Preference'] ? responses['Housing Preference'][0] : ''),
      nights: 'tue,wed,thu,fri,sat',
      numNights: 5,

      // Party composition (derived from parsed guest list)
      adultsCount: adultsCount,
      childrenCount: childrenCount,

      // Guest list
      guests: guests,

      // Build meal selections (staff get all meals for their whole family)
      mealSelections: buildStaffMealSelections(adultsCount, childrenCount),

      // Notes
      dietaryNeeds: responses['Dietary Restrictions'] ? responses['Dietary Restrictions'][0] : '',
      specialNeeds: responses['Special Needs/Requests'] ? responses['Special Needs/Requests'][0] : '',
      specialRequests: responses['Special Requests (Requires Administration Approval)'] ? responses['Special Requests (Requires Administration Approval)'][0] : '',

      // Staff = free
      paymentMethod: 'free',
      paymentStatus: 'paid',
      totalCharged: 0,
      subtotal: 0,
      processingFee: 0,
      housingSubtotal: 0,
      mealSubtotal: 0,

      // Metadata
      submittedAt: new Date().toISOString()
    };

    // Calculate total guests
    data.totalGuests = data.adultsCount + data.childrenCount;

    // If no family members were provided, create a placeholder for the primary registrant only
    if (data.guests.length === 0) {
      data.guests.push({
        name: data.name,
        age: 30,
        isChild: false
      });
    }
    
    // Deduplication Check
    if (data.email) {
      var ss = getSS();
      var regSheet = ss.getSheetByName("Worker Registrations");
      var regData = regSheet.getDataRange().getValues();
      for (var i = 1; i < regData.length; i++) {
        if (regData[i][COLUMNS.EMAIL] === data.email && regData[i][COLUMNS.STATUS] !== "cancelled") {
           Logger.log("Duplicate staff registration blocked for " + data.email);
           sendStaffRegFailureNotification(data, "Duplicate email: " + data.email);
           return { success: false, error: "Email already registered." };
        }
      }
    }
    // Process the registration using the main registration function
    var result = processRegistration(data);
    
    if (result.success) {
      Logger.log('Staff registration successful: ' + result.registrationId);
      // Email is sent by processRegistration
    } else {
      Logger.log('Staff registration failed: ' + result.error);
      // Send notification to admin about failure
      sendStaffRegFailureNotification(data, result.error);
    }
    
    return result;
    
  } catch (error) {
    Logger.log('Staff form processing error: ' + error.toString());
    logActivity('error', 'staff_form', error.toString(), 'form');
    return { success: false, error: error.toString() };
  }
}

/**
 * Map friendly housing names to option IDs
 */
function mapHousingOption(selection) {
  var map = {
    'Dorm Room': 'dorm',
    'RV/Camper Hookup': 'rv',
    'Tent Campsite': 'tent',
    'No Housing Needed': 'none'
  };
  return map[selection] || 'none';
}

/**
 * Parse guest details from text area
 * Expected format: "Name, Age" on each line
 */
function parseGuestDetails(text) {
  if (!text) return [];
  
  var guests = [];
  var lines = text.split('\n');
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    
    // Try to parse "Name, Age" format
    var parts = line.split(',');
    var name = parts[0] ? parts[0].trim() : '';
    var age = 30; // Default age
    
    if (parts[1]) {
      var parsedAge = parseInt(parts[1].trim());
      if (!isNaN(parsedAge)) {
        age = parsedAge;
      }
    }
    
    if (name) {
      guests.push({
        name: name,
        age: age,
        isChild: age < 18
      });
    }
  }
  
  return guests;
}

/**
 * Build meal selections for staff
 * Staff get all meals for all family members (free)
 */
function buildStaffMealSelections(adultCount, childCount) {
  return {
    breakfast: { 
      adult: adultCount, 
      child: childCount 
    },
    lunch: { 
      adult: adultCount, 
      child: childCount 
    },
    supper: { 
      adult: adultCount, 
      child: childCount 
    }
  };
}

/**
 * Send notification when staff registration fails
 */
function sendStaffRegFailureNotification(data, errorMsg) {
  try {
    var config = getConfig();
    var adminEmail = config.admin_email;

    if (!adminEmail) {
      Logger.log('Admin email not configured in Config sheet. Cannot send notification.');
      return;
    }
    
    GmailApp.sendEmail(
      adminEmail,
      '⚠️ Staff Registration Failed - ' + data.name,
      'A staff registration submission failed to process.\n\n' +
      'Name: ' + data.name + '\n' +
      'Email: ' + data.email + '\n' +
      'Role: ' + data.staffRole + '\n\n' +
      'Error: ' + errorMsg + '\n\n' +
      'Submitted at: ' + data.submittedAt + '\n\n' +
      'Please process this registration manually.',
      { name: 'Camp Meeting Registration System' }
    );
  } catch (e) {
    Logger.log('Failed to send admin notification: ' + e.toString());
  }
}


/**
 * Setup instructions - run once to set up trigger
 */
function setupStaffFormTrigger() {
  // Get the active form
  var form = FormApp.getActiveForm();
  
  if (!form) {
    Logger.log('No form found. Make sure this script is bound to a Google Form.');
    return;
  }
  
  // Delete any existing triggers for this function
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onStaffFormSubmit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // Create new trigger
  ScriptApp.newTrigger('onStaffFormSubmit')
    .forForm(form)
    .onFormSubmit()
    .create();
  
  Logger.log('Trigger created successfully!');
}