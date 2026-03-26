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
    // Fallback: when triggered from a sheet-bound script, e.response
    // may be provided instead of e.namedValues
    if (!responses && e.response) {
      responses = {};
      var itemResponses = e.response.getItemResponses();
      for (var r = 0; r < itemResponses.length; r++) {
        var ir = itemResponses[r];
        responses[ir.getItem().getTitle()] = [ir.getResponse()];
      }
    }
    // Email is a form setting, not a question item — pull it separately
    if (e.response && (!responses['Email'] || !responses['Email'][0])) {
      responses['Email'] = [e.response.getRespondentEmail()];
    }
    // Safety net
    if (!responses) {
      Logger.log('No responses found in event object: ' + JSON.stringify(e));
      return { success: false, error: 'No form response data received.' };
    }

    // Parse guest list first so counts can be derived from it
    var guests = parseGuestDetails(responses['Family Members Attending'] ? responses['Family Members Attending'][0] : '');

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

      // Spouse volunteer interest
      spouseVolunteering: responses['Is your spouse interested in volunteering at Camp Meeting 2026?']
        ? responses['Is your spouse interested in volunteering at Camp Meeting 2026?'][0] === 'Yes — skip to Section 1A'
        : false,
      spouseName: responses['Spouse\'s Full Name'] ? responses['Spouse\'s Full Name'][0] : '',
      spouseDepartments: responses['Preferred Volunteer Department(s)'] ? responses['Preferred Volunteer Department(s)'][0] : '',
      spouseDepartmentOther: responses['Other Department (if selected above)'] ? responses['Other Department (if selected above)'][0] : '',

      // Metadata
      submittedAt: new Date().toISOString()
    };

    // Calculate total guests
    data.totalGuests = data.adultsCount + data.childrenCount;

    // Always insert the primary registrant at the front of the guest list
    data.guests.unshift({
      name: data.name,
      age: 30,
      isChild: false
    });
    
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
      if (data.spouseVolunteering && data.spouseName) {
        writeVolunteerRecord(data, result.registrationId);
      }
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
    'No Housing Needed': 'none',
    'Special Requests (Requires Administration Approval)': 'none'
  };
  return map[selection] || 'none';
}

/**
 * Parse guest details from free-text input.
 * Handles formats:
 *   - "Name Age Name Age ..." (no newlines, no commas)
 *   - "Name, Name, Name" (comma-separated, no ages)
 *   - "Name, Age\nName, Age" (newline-separated with comma+age)
 *   - Mixed real-world inputs
 */
function parseGuestDetails(text) {
  if (!text) return [];

  var guests = [];

  // Returns true for segments that should be skipped (empty or all-caps notes like "AIRBNB")
  function isSkippable(s) {
    s = s.trim();
    if (!s) return true;
    // All uppercase letters/digits/spaces/slashes = likely a note, not a name
    if (/^[A-Z0-9\s\/\-]+$/.test(s)) return true;
    return false;
  }

  // Parse a single segment into a guest object.
  // Handles "Name, Age" (comma) or "First Last Age" (trailing number).
  function parseSegment(seg) {
    seg = seg.trim();
    if (!seg) return null;

    var name, age;

    if (seg.indexOf(',') !== -1) {
      // Use last comma as name/age boundary
      var commaIdx = seg.lastIndexOf(',');
      var namePart = seg.substring(0, commaIdx).trim();
      var agePart  = seg.substring(commaIdx + 1).trim();
      name = namePart;
      var parsedAge = parseInt(agePart);
      age = !isNaN(parsedAge) ? parsedAge : 30;
    } else {
      // Try trailing number: "Caleb Durant 29" → name="Caleb Durant", age=29
      var m = seg.match(/^(.+?)\s+(\d+)\s*$/);
      if (m) {
        name = m[1].trim();
        age  = parseInt(m[2]);
      } else {
        name = seg;
        age  = 30;
      }
    }

    if (!name || isSkippable(name)) return null;
    return { name: name, age: age, isChild: age < 18 };
  }

  var hasNewlines = text.indexOf('\n') !== -1;
  var hasCommas   = text.indexOf(',')  !== -1;

  if (hasNewlines) {
    // One person per line; each line may use "Name, Age" or "Name Age" format
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var g = parseSegment(line);
      if (g) guests.push(g);
    }

  } else if (hasCommas) {
    // Comma-separated people, e.g. "McKailah Ramsey, Caleb Durant, Cashmere Durant"
    // Each comma-delimited token is one person (name only, or name + trailing number)
    var parts = text.split(',');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) continue;
      var g = parseSegment(part);
      if (g) guests.push(g);
    }

  } else {
    // No newlines and no commas — detect "Name Age Name Age" by treating
    // isolated numeric tokens as age boundaries between people.
    // e.g. "Caleb Durant 29 Cashmere Durant 29 Mark Durant 5 Maddy Durant 8"
    var tokens = text.split(/\s+/);
    var nameTokens = [];
    for (var t = 0; t < tokens.length; t++) {
      var token = tokens[t].trim();
      if (!token) continue;
      if (/^\d+$/.test(token)) {
        // Numeric token ends the current person's name and supplies their age
        if (nameTokens.length > 0) {
          var personName = nameTokens.join(' ');
          var personAge  = parseInt(token);
          if (!isSkippable(personName)) {
            guests.push({ name: personName, age: personAge, isChild: personAge < 18 });
          }
          nameTokens = [];
        }
      } else {
        nameTokens.push(token);
      }
    }
    // Remaining tokens = last person with no age provided
    if (nameTokens.length > 0) {
      var personName = nameTokens.join(' ');
      if (!isSkippable(personName)) {
        guests.push({ name: personName, age: 30, isChild: false });
      }
    }
  }

  return guests;
}

/**
 * Build meal selections for staff
 * Staff get all meals for all family members (free)
 */
function buildStaffMealSelections(adultCount, childCount) {
  // Multiply by number of days each meal is served:
  // Breakfast: Wed, Thu, Fri, Sat = 4 days
  // Lunch: Wed, Thu, Fri = 3 days
  // Supper: Tue, Wed, Thu, Fri, Sat = 5 days
  return {
    breakfast: {
      adult: adultCount * 4,
      child: childCount * 4
    },
    lunch: {
      adult: adultCount * 3,
      child: childCount * 3
    },
    supper: {
      adult: adultCount * 5,
      child: childCount * 5
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
 * Write a spouse volunteer interest record to the Volunteer Tracking sheet
 */
function writeVolunteerRecord(data, registrationId) {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName('Volunteer Tracking');
    if (!sheet) {
      Logger.log('Volunteer Tracking sheet not found.');
      return;
    }
    sheet.appendRow([
      new Date(),                    // Timestamp
      registrationId,                // Registration ID of the worker
      data.name,                     // Worker name
      data.email,                    // Worker email
      data.staffRole,                // Worker role
      data.spouseName,               // Spouse name
      data.spouseDepartments,        // Preferred departments (comma-separated)
      data.spouseDepartmentOther,    // Other department if specified
      'pending'                      // Status — for admin to update
    ]);
    Logger.log('Volunteer record written for ' + data.spouseName);
  } catch (e) {
    Logger.log('Failed to write volunteer record: ' + e.toString());
  }
}

/**
 * Create the Volunteer Tracking sheet with headers if it doesn't exist.
 * Run once from the Apps Script editor.
 */
function setupVolunteerTrackingSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName('Volunteer Tracking');
  if (sheet) {
    Logger.log('Volunteer Tracking sheet already exists.');
    return;
  }
  sheet = ss.insertSheet('Volunteer Tracking');
  sheet.appendRow([
    'Timestamp',
    'Registration ID',
    'Worker Name',
    'Worker Email',
    'Worker Role',
    'Spouse Name',
    'Preferred Departments',
    'Other Department',
    'Status'
  ]);
  // Bold the header row
  sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  Logger.log('Volunteer Tracking sheet created.');
}

/**
 * Setup instructions - run once to set up trigger
 */
function setupStaffFormTrigger() {
  // Get the active form
  var form = FormApp.openById('1VnmK-JEntbhvY-Az0mcfPp1g3VYCMLKgCu0_HRST6cI');
  
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
