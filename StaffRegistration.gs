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
    
    // Build data object from form responses
    var data = {
      action: 'submitRegistration',
      regType: 'staff',
      
      // Basic info
      staffRole: responses['Your Role'] ? responses['Your Role'][0] : 'Staff',
      name: responses['Full Name'] ? responses['Full Name'][0] : '',
      email: responses['Email'] ? responses['Email'][0] : '',
      phone: responses['Phone'] ? responses['Phone'][0] : '',
      church: responses['Home Church'] ? responses['Home Church'][0] : '',
      
      // Housing
      housingOption: mapHousingOption(responses['Housing Preference'] ? responses['Housing Preference'][0] : ''),
      nights: mapNights(responses['Nights Attending']),
      numNights: responses['Nights Attending'] ? responses['Nights Attending'].length : 0,
      
      // Party composition
      adultsCount: parseInt(responses['Number of Adults in Party'] ? responses['Number of Adults in Party'][0] : '1') || 1,
      childrenCount: parseInt(responses['Number of Children in Party'] ? responses['Number of Children in Party'][0] : '0') || 0,
      
      // Parse guest details from text field
      guests: parseGuestDetails(responses['Family Members (Name & Age)'] ? responses['Family Members (Name & Age)'][0] : ''),
      
      // Build meal selections (staff get all meals for their whole family)
      mealSelections: buildStaffMealSelections(
        parseInt(responses['Number of Adults in Party'] ? responses['Number of Adults in Party'][0] : '1') || 1,
        parseInt(responses['Number of Children in Party'] ? responses['Number of Children in Party'][0] : '0') || 0
      ),
      
      // Notes
      dietaryNeeds: responses['Dietary Restrictions'] ? responses['Dietary Restrictions'][0] : '',
      specialNeeds: responses['Special Needs/Requests'] ? responses['Special Needs/Requests'][0] : '',
      
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
    
    // If no guests were provided in text field, create placeholder based on counts
    if (data.guests.length === 0) {
      // Add primary registrant
      data.guests.push({
        name: data.name,
        age: 30, // Assume adult
        isChild: false
      });
      
      // Add additional adults
      for (var a = 1; a < data.adultsCount; a++) {
        data.guests.push({
          name: data.name + ' Family Adult ' + (a + 1),
          age: 30,
          isChild: false
        });
      }
      
      // Add children
      for (var c = 0; c < data.childrenCount; c++) {
        data.guests.push({
          name: data.name + ' Family Child ' + (c + 1),
          age: 10,
          isChild: true
        });
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
    'RV/Camper': 'rv',
    'RV/Camper Hookup': 'rv',
    'Tent': 'tent',
    'Tent Campsite': 'tent',
    'No Housing Needed': 'none',
    'No Housing': 'none'
  };
  return map[selection] || 'none';
}

/**
 * Convert day selections to comma-separated abbreviations
 */
function mapNights(selections) {
  if (!selections || !Array.isArray(selections)) return '';
  
  var map = {
    'Tuesday 6/2': 'tue',
    'Tuesday, June 2': 'tue',
    'Tue 6/2': 'tue',
    'Wednesday 6/3': 'wed',
    'Wednesday, June 3': 'wed',
    'Wed 6/3': 'wed',
    'Thursday 6/4': 'thu',
    'Thursday, June 4': 'thu',
    'Thu 6/4': 'thu',
    'Friday 6/5': 'fri',
    'Friday, June 5': 'fri',
    'Fri 6/5': 'fri',
    'Saturday 6/6': 'sat',
    'Saturday, June 6': 'sat',
    'Sat 6/6': 'sat'
  };
  
  var result = [];
  for (var i = 0; i < selections.length; i++) {
    var mapped = map[selections[i]];
    if (mapped) {
      result.push(mapped);
    }
  }
  
  return result.join(',');
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