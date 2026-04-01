// ==========================================
// FILE: Admin.gs
// ==========================================

/**
 * Show admin sidebar, bridged to the web-based Admin Dashboard.
 * Injects the deployed web app URL so the sidebar can link directly
 * to the full AdminDashboard (?action=admin) in a new tab.
 *
 * The URL is read from the Config sheet key "web_app_url".  Set that key
 * to your production /exec URL after each deployment (e.g.
 * https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec).
 * ScriptApp.getService().getUrl() is intentionally NOT used here because
 * it returns the /dev test-deployment URL which requires owner auth and
 * does not resolve to the correct page for other users.
 */
function showAdminSidebar() {
  var template = HtmlService.createTemplateFromFile('AdminSidebar');
  var config = getConfig();
  var baseUrl = (config.web_app_url || '').toString().trim();
  template.webAppUrl = baseUrl ? baseUrl + '?action=admin' : '';
  var html = template.evaluate()
    .setTitle('CM26 Admin')
    .setWidth(350);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Add menu to spreadsheet
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🏕️ Camp Meeting')
    .addItem('Open Admin Panel', 'showAdminSidebar')
    .addSeparator()
    .addItem('Recalculate All Totals', 'recalculateAllTotals')
    .addItem('Generate Key Report', 'generateKeyReport')
    .addItem('Export Check-In List', 'exportCheckInList')
    .addSeparator()
    .addItem('Process No-Shows', 'processNoShows')
    .addToUi();
}

function getSheetValuesSafe(sheetName) {
  var ss = getSS();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { sheet: null, values: [], lastRow: 0, lastColumn: 0 };
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    return { sheet: sheet, values: [], lastRow: lastRow, lastColumn: lastColumn };
  }
  return {
    sheet: sheet,
    values: sheet.getRange(1, 1, lastRow, lastColumn).getValues(),
    lastRow: lastRow,
    lastColumn: lastColumn
  };
}

function findRegistrationRowById(regId, regValues) {
  var id = String(regId || '');
  for (var i = 1; i < regValues.length; i++) {
    if (String(regValues[i][COLUMNS.REG_ID] || '') === id) {
      return i;
    }
  }
  return -1;
}

/**
 * Get unassigned dorm registrations
 */
function getUnassignedRegistrations() {
  var regData = getSheetValuesSafe('Registrations');
  var data = regData.values;
  
  var unassigned = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var housingOption = row[COLUMNS.HOUSING_OPTION];
    var roomAssignment = row[COLUMNS.ROOM_ASSIGNMENT];
    var status = row[COLUMNS.STATUS];
    
    if (housingOption === 'dorm' && 
        !roomAssignment && 
        status !== 'cancelled') {
      unassigned.push({
        regId: row[COLUMNS.REG_ID],
        name: row[COLUMNS.PRIMARY_NAME],
        guests: row[COLUMNS.TOTAL_GUESTS],
        nights: row[COLUMNS.NIGHTS],
        specialNeeds: row[COLUMNS.SPECIAL_NEEDS]
      });
    }
  }
  
  return unassigned;
}

/**
 * Recalculate totals for all registrations
 */
function recalculateAllTotals() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('System busy. Please try again.');
    return;
  }

  try {
    var ss = getSS();
    var regSheet = ss.getSheetByName('Registrations');
    var config = getConfig();
    var data = regSheet.getDataRange().getValues();
    
    var updated = 0;
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];

      // Calculate housing subtotal
      var housingOption = row[COLUMNS.HOUSING_OPTION];
      var numNights = row[COLUMNS.NUM_NIGHTS] || 0;
      var housingPrice = 0;

      if (housingOption === 'dorm') housingPrice = config.dorm_price;
      else if (housingOption === 'rv') housingPrice = config.rv_price;
      else if (housingOption === 'tent') housingPrice = config.tent_price;

      var housingSubtotal = housingPrice * numNights;

      // Calculate meal subtotal from selections
      var mealSelections = {};
      try {
        mealSelections = JSON.parse(row[COLUMNS.MEAL_SELECTIONS] || '{}');
      } catch(e) {}

      var mealSubtotal = 0;
      if (mealSelections.breakfast) {
        mealSubtotal += (mealSelections.breakfast.adult || 0) * config.adult_breakfast;
        mealSubtotal += (mealSelections.breakfast.child || 0) * config.child_breakfast;
      }
      if (mealSelections.lunch) {
        mealSubtotal += (mealSelections.lunch.adult || 0) * config.adult_lunch;
        mealSubtotal += (mealSelections.lunch.child || 0) * config.child_lunch;
      }
      if (mealSelections.supper) {
        mealSubtotal += (mealSelections.supper.adult || 0) * config.adult_supper;
        mealSubtotal += (mealSelections.supper.child || 0) * config.child_supper;
      }

      var subtotal = housingSubtotal + mealSubtotal;
      var balanceDue = (row[COLUMNS.TOTAL_CHARGED] || 0) - (row[COLUMNS.AMOUNT_PAID] || 0);

      // Store values for batch update
      data[i][COLUMNS.HOUSING_SUBTOTAL] = housingSubtotal;
      data[i][COLUMNS.MEAL_SUBTOTAL] = mealSubtotal;
      data[i][COLUMNS.SUBTOTAL] = subtotal;
      data[i][COLUMNS.BALANCE_DUE] = balanceDue;

      updated++;
    }
    
    // Batch update all rows at once to improve performance
    if (updated > 0) {
      var numRows = data.length - 1;

      // Update Column P (16)
      var colPValues = data.slice(1).map(function(r) { return [r[COLUMNS.HOUSING_SUBTOTAL]]; });
      regSheet.getRange(2, COLUMNS.HOUSING_SUBTOTAL + 1, numRows, 1).setValues(colPValues);

      // Update Columns X-Y (24-25)
      var colXYValues = data.slice(1).map(function(r) { return [r[COLUMNS.MEAL_SUBTOTAL], r[COLUMNS.SUBTOTAL]]; });
      regSheet.getRange(2, COLUMNS.MEAL_SUBTOTAL + 1, numRows, 2).setValues(colXYValues);

      // Update Column AC (29)
      var colACValues = data.slice(1).map(function(r) { return [r[COLUMNS.BALANCE_DUE]]; });
      regSheet.getRange(2, COLUMNS.BALANCE_DUE + 1, numRows, 1).setValues(colACValues);

      SpreadsheetApp.flush();
    }

    SpreadsheetApp.getUi().alert('Recalculated ' + updated + ' registrations.');
    return updated;

  } finally {
    lock.releaseLock();
  }
}

/**
 * Generate key status report
 */
function generateKeyReport() {
  var ss = getSS();
  var data = getSheetValuesSafe('Registrations').values;
  
  var keysOut = [];
  var depositsPending = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    
    if (row[COLUMNS.KEY_DEPOSIT_PAID] === 'yes') {
      var key1Out = row[COLUMNS.KEY_1_RETURNED] !== 'yes';
      var key2Out = row[COLUMNS.KEY_2_RETURNED] !== 'yes';
      
      if (key1Out || key2Out) {
        keysOut.push({
          regId: row[COLUMNS.REG_ID],
          name: row[COLUMNS.PRIMARY_NAME],
          room: row[COLUMNS.ROOM_ASSIGNMENT],
          key1: row[COLUMNS.KEY_1_NUMBER],
          key2: row[COLUMNS.KEY_2_NUMBER],
          key1Out: key1Out,
          key2Out: key2Out,
          deposit: row[COLUMNS.KEY_DEPOSIT_AMOUNT]
        });
        
        if (row[COLUMNS.DEPOSIT_REFUNDED] !== 'yes') {
          depositsPending += row[COLUMNS.KEY_DEPOSIT_AMOUNT] || 0;
        }
      }
    }
  }
  
  // Create report sheet
  var reportSheet = ss.getSheetByName('Key Report') || ss.insertSheet('Key Report');
  reportSheet.clear();
  var outRows = [
    ['KEY STATUS REPORT', '', '', '', 'Generated:', new Date(), '', ''],
    ['', '', '', '', '', '', '', ''],
    ['Total Keys Out:', keysOut.length * 2 - keysOut.filter(function(k){ return !k.key1Out; }).length - keysOut.filter(function(k){ return !k.key2Out; }).length, '', '', '', '', '', ''],
    ['Deposits Pending Refund:', '$' + depositsPending, '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['Reg ID', 'Name', 'Room', 'Key 1', 'Key 1 Status', 'Key 2', 'Key 2 Status', 'Deposit']
  ];
  for (var ki = 0; ki < keysOut.length; ki++) {
    var k = keysOut[ki];
    outRows.push([k.regId, k.name, k.room, k.key1, k.key1Out ? 'OUT' : 'Returned', k.key2, k.key2Out ? 'OUT' : 'Returned', '$' + k.deposit]);
  }
  reportSheet.getRange(1, 1, outRows.length, 8).setValues(outRows);
  
  SpreadsheetApp.getUi().alert('Key report generated. See "Key Report" tab.');
}

/**
 * Resend confirmation email
 */
function resendConfirmationEmail(regId) {
  sendConfirmationEmail(regId);
  return { success: true, message: 'Email sent for ' + regId };
}

/**
 * Move registration to different housing
 */
function changeHousingType(regId, newHousingType) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy' };
  }

  try {
    var regData = getSheetValuesSafe('Registrations');
    var regSheet = regData.sheet;
    var config = getConfig();
    var data = regData.values;
    var index = findRegistrationRowById(regId, data);
    if (index !== -1) {
        var row = index + 1;
        var numNights = data[index][COLUMNS.NUM_NIGHTS] || 0;

        // Get new price
        var newPrice = 0;
        if (newHousingType === 'dorm') newPrice = config.dorm_price;
        else if (newHousingType === 'rv') newPrice = config.rv_price;
        else if (newHousingType === 'tent') newPrice = config.tent_price;

        var newHousingSubtotal = newPrice * numNights;

        // Update housing option
        var updates = {};
        updates[COLUMNS.HOUSING_OPTION + 1] = newHousingType;
        updates[COLUMNS.HOUSING_SUBTOTAL + 1] = newHousingSubtotal;

        // Clear room assignment if changing away from dorm
        if (newHousingType !== 'dorm') {
          updates[COLUMNS.ROOM_ASSIGNMENT + 1] = '';
          updates[COLUMNS.BUILDING + 1] = '';
        }

        // Recalculate subtotal
        var mealSubtotal = data[index][COLUMNS.MEAL_SUBTOTAL] || 0;
        var newSubtotal = newHousingSubtotal + mealSubtotal;
        updates[COLUMNS.SUBTOTAL + 1] = newSubtotal;
        Object.keys(updates).forEach(function(colStr) {
          regSheet.getRange(row, Number(colStr)).setValue(updates[colStr]);
        });

        logActivity('housing_change', regId,
          'Changed from ' + data[index][COLUMNS.HOUSING_OPTION] + ' to ' + newHousingType,
          'admin');

        return { success: true, newHousingSubtotal: newHousingSubtotal };
    }

    return { success: false, error: 'Registration not found' };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Promote waitlist entry to confirmed
 */
function promoteFromWaitlist(waitlistId) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy' };
  }

  try {
    var ss = getSS();
    var waitSheet = ss.getSheetByName('Waitlist');
    var waitData = waitSheet.getDataRange().getValues();

    for (var i = 1; i < waitData.length; i++) {
      if (waitData[i][0] === waitlistId && waitData[i][9] === 'waiting') {
        var row = i + 1;

        // Mark as offered
        waitSheet.getRange(row, 10).setValue('offered'); // status
        waitSheet.getRange(row, 11).setValue(new Date()); // offered_at

        // Set expiration (48 hours)
        var expires = new Date();
        expires.setHours(expires.getHours() + 48);
        waitSheet.getRange(row, 12).setValue(expires); // expires_at

        // Send notification email to waitlist person
        sendWaitlistOfferEmail(
          waitlistId,
          waitData[i][2], // name
          waitData[i][3], // email
          waitData[i][5], // housingOption
          expires
        );

        logActivity('waitlist_offer', waitlistId,
          'Spot offered to ' + waitData[i][2],
          'admin');

        return {
          success: true,
          name: waitData[i][2],
          email: waitData[i][3],
          expiresAt: expires
        };
      }
    }

    return { success: false, error: 'Waitlist entry not found' };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Export check-in list as CSV
 */
function exportCheckInList() {
  var ss = getSS();
  var data = getSheetValuesSafe('Registrations').values;
  
  var exportData = [['Reg ID', 'Name', 'Housing', 'Room', 'Guests', 'Balance', 'Status', 'Checked In']];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status = row[COLUMNS.STATUS];
    
    if (status === 'cancelled') continue;
    
    exportData.push([
      row[COLUMNS.REG_ID],
      row[COLUMNS.PRIMARY_NAME],
      row[COLUMNS.HOUSING_OPTION],
      row[COLUMNS.ROOM_ASSIGNMENT],
      row[COLUMNS.TOTAL_GUESTS],
      row[COLUMNS.BALANCE_DUE],
      status,
      row[COLUMNS.CHECKED_IN]
    ]);
  }
  
  // Create export sheet
  var exportSheet = ss.getSheetByName('Check-In Export') || ss.insertSheet('Check-In Export');
  exportSheet.clear();
  exportSheet.getRange(1, 1, exportData.length, exportData[0].length).setValues(exportData);
  
  SpreadsheetApp.getUi().alert('Export created. See "Check-In Export" tab.\n\nTo download: File → Download → CSV');
}

/**
 * Get recent activity entries for the Admin Dashboard.
 * Reads the ActivityLog sheet, reverses the rows so the newest entry is first,
 * and returns the top 50 as an array of plain objects.
 *
 * @returns {{success: boolean, entries: Array<{timestamp, action, regId, user, source, details}>}}
 */
function getRecentActivity() {
  try {
    var logData = getSheetValuesSafe('ActivityLog');
    var logSheet = logData.sheet;

    if (!logSheet) {
      return { success: false, error: 'ActivityLog sheet not found. Run initializeDatabase() first.' };
    }

    var data = logData.values;

    // Row 0 is the header; slice it off, then reverse so newest is first
    var entries = [];
    for (var i = data.length - 1; i >= 1 && entries.length < 50; i--) {
      var row = data[i];
      entries.push({
        timestamp: row[0] ? row[0].toString() : '',
        action:    row[1] || '',
        regId:     row[2] || '',
        user:      row[3] || '',
        source:    row[4] || '',
        details:   row[5] || ''
      });
    }

    return { success: true, entries: entries };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Get dietary needs report for admin dashboard.
 */
function getDietaryReport() {
  try {
    var regData = getSheetValuesSafe('Registrations');
    var regSheet = regData.sheet;
    if (!regSheet) {
      return { success: false, error: 'Registrations sheet not found' };
    }

    var data = regData.values;
    var totalRegistrations = 0;
    var entries = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var status = (row[COLUMNS.STATUS] || '').toString().toLowerCase();
      if (status === 'cancelled') continue;

      totalRegistrations++;

      var dietaryNeeds = (row[COLUMNS.DIETARY_NEEDS] || '').toString().trim();
      if (!dietaryNeeds) continue;

      entries.push({
        regId: row[COLUMNS.REG_ID],
        name: row[COLUMNS.PRIMARY_NAME],
        regType: row[COLUMNS.REG_TYPE],
        dietaryNeeds: dietaryNeeds,
        specialNeeds: row[COLUMNS.SPECIAL_NEEDS] || '',
        status: row[COLUMNS.STATUS]
      });
    }

    return {
      success: true,
      entries: entries,
      total: totalRegistrations,
      totalWithDietary: entries.length
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Process No-Shows
 * Marks confirmed registrations as cancelled/no-show if they missed their first night check-in
 */
function processNoShows() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    'Process No-Shows?',
    'This will CANCEL confirmed registrations that missed their first night check-in. This cannot be undone automatically. Proceed?',
    ui.ButtonSet.YES_NO);

  if (result !== ui.Button.YES) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    ui.alert('System busy. Please try again.');
    return;
  }

  try {
    var regData = getSheetValuesSafe('Registrations');
    var regSheet = regData.sheet;
    var config = getConfig();
    var data = regData.values;
    var today = new Date();

    var dateMap = EVENT_DATES;

    var processedCount = 0;

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var status = row[COLUMNS.STATUS];
      var nights = (row[COLUMNS.NIGHTS] || '').toLowerCase(); // e.g. "tue,wed,thu"
      var checkedIn = row[COLUMNS.CHECKED_IN];

      if (status === 'confirmed' && checkedIn !== 'yes' && nights) {
        // Find first night
        var nightList = nights.split(',').map(function(n) { return n.trim(); });
        var firstNight = null;
        var daysOrder = ['tue', 'wed', 'thu', 'fri', 'sat'];
        for (var d = 0; d < daysOrder.length; d++) {
          if (nightList.indexOf(daysOrder[d]) !== -1) {
            firstNight = dateMap[daysOrder[d]];
            break;
          }
        }

        if (firstNight) {
          var firstNightDate = new Date(firstNight);
          // Set to end of first night
          firstNightDate.setHours(23, 59, 59, 999);

          if (today > firstNightDate) {
            // Process No-Show
            var rowNum = i + 1;
            var amountPaid = row[COLUMNS.AMOUNT_PAID] || 0;
            var depositAmount = Number(config.deposit_amount) || 65;
            var amountRetained = 0;

            // Logic: Forfeit deposit.
            if (amountPaid > depositAmount) {
              amountRetained = depositAmount;
            } else {
              amountRetained = amountPaid;
            }

            regSheet.getRange(rowNum, COLUMNS.STATUS + 1, 1, 1).setValue('no_show');
            regSheet.getRange(rowNum, COLUMNS.TOTAL_CHARGED + 1, 1, 1).setValue(amountRetained);

            // Release Room
            var roomAssignment = row[COLUMNS.ROOM_ASSIGNMENT];
            if (roomAssignment) {
              try {
                updateRoomStatus(roomAssignment, 'available', '', '');
                regSheet.getRange(rowNum, COLUMNS.ROOM_ASSIGNMENT + 1).setValue('');
                regSheet.getRange(rowNum, COLUMNS.BUILDING + 1).setValue('');
              } catch(e) {}
            }

            logActivity('no_show', row[COLUMNS.REG_ID], 'Marked as no-show. First night was ' + firstNight, 'admin');
            processedCount++;
          }
        }
      }
    }

    SpreadsheetApp.flush();
    ui.alert('Processed ' + processedCount + ' registrations as No-Show.');

  } finally {
    lock.releaseLock();
  }
}

/**
 * Search registrations for admin repair workflows.
 */
function adminSearchRegistrations(query) {
  try {
    var term = (query || '').toString().trim().toLowerCase();
    var rows = getSheetValuesSafe('Registrations').values;
    var matches = [];

    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var regId = String(row[COLUMNS.REG_ID] || '');
      var name = String(row[COLUMNS.PRIMARY_NAME] || '');
      var status = String(row[COLUMNS.STATUS] || '');
      if (status === 'cancelled') continue;

      if (!term || regId.toLowerCase().indexOf(term) !== -1 || name.toLowerCase().indexOf(term) !== -1) {
        matches.push({
          regId: regId,
          name: name,
          status: status,
          regType: row[COLUMNS.REG_TYPE] || '',
          adultsCount: row[COLUMNS.ADULTS_COUNT] || 0,
          childrenCount: row[COLUMNS.CHILDREN_COUNT] || 0
        });
      }
    }

    return { success: true, registrations: matches.slice(0, 50) };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Load one registration payload for manual guest repair in admin UI.
 */
function adminGetRegistrationForRepair(input) {
  var regId = '';

  if (typeof input === 'string') {
    regId = input.trim();
  } else if (input && typeof input === 'object' && input.regId) {
    regId = String(input.regId).trim();
  }

  Logger.log('[adminGetRegistrationForRepair] normalized regId: "%s"', regId);
  Logger.log('[adminGetRegistrationForRepair] typeof regId: %s', typeof regId);

  if (!regId) {
    return { success: false, error: 'Missing registration ID' };
  }

  var reg = getRegistration(regId);
  if (!reg.success) return reg;
  return { success: true, registration: reg.registration };
}

/**
 * Admin tool: replace guest rows, then recalculate all derived fields.
 *
 * Delegates to adminRepairRegistration() — the universal repair pipeline that
 * handles all registration types correctly (staff, paid, etc.).
 *
 * Legacy note: this function previously hardcoded a primary-registrant anchor
 * and always used buildStaffMealSelections() regardless of regType. Both issues
 * are now fixed by routing through adminRepairRegistration().
 *
 * @param {Object} payload  {regId, guests: [{name, age, attendanceRaw}, ...]}
 *   The guests array must be the COMPLETE list including the primary registrant
 *   as the first element (exactly as returned by adminGetRegistrationForRepair).
 */
function adminRepairGuestRows(payload) {
  return adminRepairRegistration(payload);
}

function adminSyncGuestDetailsSheet(regId, guests) {
  var guestData = getSheetValuesSafe('GuestDetails');
  var guestSheet = guestData.sheet;
  if (!guestSheet) return;
  var values = guestData.values;
  var header = values[0] || [];
  var filteredRows = [];
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][1] || '') !== String(regId)) filteredRows.push(values[r]);
  }
  var supportsAttendanceColumns = guestSheet.getLastColumn() >= 12;
  var targetWidth = Math.max(header.length, supportsAttendanceColumns ? 12 : 9);
  var rebuilt = [padRow_(header, targetWidth)];
  for (var i = 0; i < guests.length; i++) {
    var guest = guests[i];
    var row = [
      generateGuestId(),
      regId,
      guest.name || '',
      guest.age,
      guest.isChild ? 'yes' : 'no',
      'no',
      guest.classAssignment || '',
      guest.sabbathSchool || '',
      guest.childrenMeeting || ''
    ];
    if (supportsAttendanceColumns) {
      row.push(
        guest.attendanceType || 'full',
        guest.attendanceRaw || 'Full Time',
        (guest.attendanceDays && guest.attendanceDays.join) ? guest.attendanceDays.join(',') : 'tue,wed,thu,fri,sat'
      );
    }
    rebuilt.push(padRow_(row, targetWidth));
  }
  for (var f = 0; f < filteredRows.length; f++) rebuilt.push(padRow_(filteredRows[f], targetWidth));
  guestSheet.clearContents();
  guestSheet.getRange(1, 1, rebuilt.length, targetWidth).setValues(rebuilt);
}

function padRow_(row, width) {
  var out = (row || []).slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

// ==========================================
// UNIVERSAL REGISTRATION REPAIR PIPELINE
// ==========================================

/**
 * Normalize admin-supplied guest list into full guest objects with
 * class assignments computed from Config-driven age brackets.
 *
 * @param {Array} incomingGuests  Array of {name, age, attendanceRaw} from admin UI.
 * @returns {Array} Normalized guest objects ready for sheet storage.
 */
function rebuildGuestListFromAdminInput(incomingGuests) {
  var normalized = [];
  for (var g = 0; g < incomingGuests.length; g++) {
    var source = incomingGuests[g] || {};
    var name = (source.name || '').toString().trim();
    if (!name) continue;

    var age = parseInt(source.age, 10);
    if (isNaN(age) || age < 0) age = 30;

    var attendanceRaw = (source.attendanceRaw || '').toString().trim() || 'Full Time';
    var attendance = parseAttendanceDetails(attendanceRaw);
    if (attendance.attendanceType === 'unknown') {
      attendance.attendanceType = 'full';
      attendance.attendanceDays = getCampMeetingDays();
    }

    var program = getChildProgramGroup(age);
    normalized.push({
      name: name,
      age: age,
      isChild: age < 18,
      attendanceType: attendance.attendanceType,
      attendanceRaw: attendanceRaw,
      attendanceDays: attendance.attendanceDays,
      classAssignment: program.classAssignment,
      sabbathSchool: program.sabbathSchool,
      childrenMeeting: program.childrenMeeting,
      parserConfidence: 'admin_repaired',
      parserWarnings: []
    });
  }
  return normalized;
}

/**
 * Calculate all derived fields for a registration given a resolved guest list.
 * Detects regType from existingRow and applies correct pricing / meal logic:
 *   - 'staff' registrations → meal selections are attendance-based, all financials stay $0.
 *   - All other types      → meal selections are attendance-based, financials are priced
 *                            from Config; totalCharged is preserved (not recalculated).
 *
 * @param {Array}  existingRow  Raw sheet row array for the registration.
 * @param {Array}  guestList    Normalized guest objects from rebuildGuestListFromAdminInput.
 * @param {Object} config       Config key/value map from getConfig().
 * @returns {Object} Fields to write back: adultsCount, childrenCount, totalGuests,
 *                   mealSelections, housingSubtotal, mealSubtotal, subtotal, balanceDue.
 */
function recalculateRegistrationDerivedFields(existingRow, guestList, config) {
  var regType = String(existingRow[COLUMNS.REG_TYPE] || 'paid').toLowerCase();
  var isStaffReg = (regType === 'staff');

  // Guest counts
  var adultsCount = 0;
  var childrenCount = 0;
  for (var i = 0; i < guestList.length; i++) {
    if (guestList[i].isChild) childrenCount++;
    else adultsCount++;
  }
  var totalGuests = adultsCount + childrenCount;

  // Meal selections — same attendance-based algorithm for all reg types.
  // buildStaffMealSelections works for any guest list regardless of regType.
  var mealSelections = buildStaffMealSelections(guestList);

  // Housing subtotal (recalculated using existing housing data + config prices)
  var housingOption = String(existingRow[COLUMNS.HOUSING_OPTION] || '').toLowerCase();
  var numNights = Number(existingRow[COLUMNS.NUM_NIGHTS] || 0);
  var housingPrice = 0;
  if (housingOption === 'dorm')      housingPrice = Number(config.dorm_price) || 0;
  else if (housingOption === 'rv')   housingPrice = Number(config.rv_price)  || 0;
  else if (housingOption === 'tent') housingPrice = Number(config.tent_price) || 0;
  var housingSubtotal = isStaffReg ? 0 : housingPrice * numNights;

  // Meal subtotal (staff always $0; paid types use config prices)
  var mealSubtotal = 0;
  if (!isStaffReg) {
    if (mealSelections.breakfast) {
      mealSubtotal += (mealSelections.breakfast.adult || 0) * (Number(config.adult_breakfast) || 0);
      mealSubtotal += (mealSelections.breakfast.child || 0) * (Number(config.child_breakfast) || 0);
    }
    if (mealSelections.lunch) {
      mealSubtotal += (mealSelections.lunch.adult || 0) * (Number(config.adult_lunch) || 0);
      mealSubtotal += (mealSelections.lunch.child || 0) * (Number(config.child_lunch) || 0);
    }
    if (mealSelections.supper) {
      mealSubtotal += (mealSelections.supper.adult || 0) * (Number(config.adult_supper) || 0);
      mealSubtotal += (mealSelections.supper.child || 0) * (Number(config.child_supper) || 0);
    }
  }

  var subtotal = housingSubtotal + mealSubtotal;

  // totalCharged is NOT recalculated — it reflects the original payment contract.
  // balanceDue is always totalCharged − amountPaid.
  var totalCharged = Number(existingRow[COLUMNS.TOTAL_CHARGED] || 0);
  var amountPaid   = Number(existingRow[COLUMNS.AMOUNT_PAID]   || 0);
  var balanceDue   = totalCharged - amountPaid;

  return {
    adultsCount:     adultsCount,
    childrenCount:   childrenCount,
    totalGuests:     totalGuests,
    mealSelections:  mealSelections,
    housingSubtotal: housingSubtotal,
    mealSubtotal:    mealSubtotal,
    subtotal:        subtotal,
    balanceDue:      balanceDue
  };
}

/**
 * Replace unredeemed meal tickets for a registration with a freshly computed set.
 * Already-redeemed tickets are preserved (a served meal cannot be un-served).
 *
 * ID collision safety: after deleting rows, we scan remaining ticket IDs to find
 * the actual maximum, then start new IDs from max+1. This avoids the row-count
 * mismatch that would occur if we relied on getLastRow() after deletions.
 *
 * @param {string}  regId     Registration ID.
 * @param {Object}  data      Same shape as processRegistration data: {name, regType,
 *                            staffRole, guests, mealSelections, dietaryNeeds}.
 * @param {boolean} skipLock  Pass true when caller already holds a script lock.
 * @returns {{deletedCount: number, redeemedPreserved: number}}
 */
function syncMealTicketsForRegistration(regId, data, skipLock) {
  var lock = LockService.getScriptLock();
  if (!skipLock) {
    if (!lock.tryLock(15000)) {
      throw new Error('Could not acquire lock for meal ticket sync');
    }
  }

  try {
    var ss = getSS();
    var ticketSheet = ss.getSheetByName('MealTickets');
    var ticketData = ticketSheet.getDataRange().getValues();

    // Collect unredeemed row numbers for this regId (highest index first for safe deletion)
    var rowsToDelete = [];
    var deletedCount = 0;
    var redeemedPreserved = 0;

    for (var i = ticketData.length - 1; i >= 1; i--) {
      if (String(ticketData[i][1]) === String(regId)) {
        if (ticketData[i][8] === 'yes') {
          redeemedPreserved++;
        } else {
          rowsToDelete.push(i + 1); // 1-based sheet row, already in reverse order
          deletedCount++;
        }
      }
    }

    // Delete from bottom up so earlier row indices stay valid
    for (var d = 0; d < rowsToDelete.length; d++) {
      ticketSheet.deleteRow(rowsToDelete[d]);
    }
    if (rowsToDelete.length > 0) SpreadsheetApp.flush();

    // Find actual max ticket number in the (now-smaller) sheet to avoid ID collisions
    var maxTicketNum = 0;
    var remaining = ticketSheet.getDataRange().getValues();
    for (var r = 1; r < remaining.length; r++) {
      var tid = String(remaining[r][0] || '');
      var m = tid.match(/^MT-(\d+)$/);
      if (m) {
        var num = parseInt(m[1], 10);
        if (num > maxTicketNum) maxTicketNum = num;
      }
    }

    // Build and append new tickets starting from maxTicketNum+1
    createMealTicketsWithStartId_(ticketSheet, regId, data, maxTicketNum);

    return { deletedCount: deletedCount, redeemedPreserved: redeemedPreserved };

  } finally {
    if (!skipLock) lock.releaseLock();
  }
}

/**
 * @private
 * Inline ticket builder that uses an explicit starting ID counter instead of
 * getLastRow(), preventing collisions after row deletions in syncMealTicketsForRegistration.
 * Logic mirrors createMealTickets() exactly; keep both in sync if meal schedule changes.
 */
function createMealTicketsWithStartId_(ticketSheet, regId, data, startFrom) {
  var config = getConfig();

  var mealDays = {
    breakfast: ['wed', 'thu', 'fri', 'sat'],
    lunch:     ['wed', 'thu', 'fri'],
    supper:    ['tue', 'wed', 'thu', 'fri', 'sat']
  };
  var mealDates = {
    tue: '2026-06-02', wed: '2026-06-03', thu: '2026-06-04',
    fri: '2026-06-05', sat: '2026-06-06'
  };

  var mealSelections = data.mealSelections || {};
  var guests = data.guests || [];
  var isStaff = data.regType === 'staff' || !!data.staffRole;

  var adults   = guests.filter(function(g) { return !g.isChild; });
  var children = guests.filter(function(g) { return  g.isChild; });

  if (adults.length === 0 && guests.length === 0) {
    adults = [{ name: data.name || 'Guest', isChild: false }];
  }

  var newTickets = [];
  var idCounter = startFrom; // incremented before each use

  ['breakfast', 'lunch', 'supper'].forEach(function(mealType) {
    var count     = parseInt((mealSelections[mealType] || {}).adult) || 0;
    var days      = mealDays[mealType];
    var numGuests = adults.length || 1;

    for (var i = 0; i < count; i++) {
      idCounter++;
      var guest = adults[i % numGuests] || { name: 'Guest' };
      var day   = days[Math.floor(i / numGuests) % days.length];
      var price = isStaff ? 0 : (parseFloat(config['adult_' + mealType]) || 0);
      newTickets.push([
        'MT-' + ('00000' + idCounter).slice(-5),
        regId, guest.name, mealType, day, mealDates[day],
        'adult', price, 'no', '', '', '', data.dietaryNeeds || ''
      ]);
    }
  });

  ['breakfast', 'lunch', 'supper'].forEach(function(mealType) {
    var count     = parseInt((mealSelections[mealType] || {}).child) || 0;
    var days      = mealDays[mealType];
    var localKids = children;
    var numGuests = localKids.length || 1;

    if (count > 0 && children.length === 0) {
      localKids = [{ name: data.name + ' (Child)' }];
      numGuests = 1;
    }

    for (var i = 0; i < count; i++) {
      idCounter++;
      var guest = localKids[i % numGuests];
      var day   = days[Math.floor(i / numGuests) % days.length];
      var price = isStaff ? 0 : (parseFloat(config['child_' + mealType]) || 0);
      newTickets.push([
        'MT-' + ('00000' + idCounter).slice(-5),
        regId, guest.name, mealType, day, mealDates[day],
        'child', price, 'no', '', '', '', data.dietaryNeeds || ''
      ]);
    }
  });

  if (newTickets.length > 0) {
    ticketSheet.getRange(ticketSheet.getLastRow() + 1, 1, newTickets.length, 13)
               .setValues(newTickets);
    SpreadsheetApp.flush();
    logActivity('meals_created', regId,
      'Created ' + newTickets.length + ' meal tickets (admin repair)', 'admin');
  }
}

/**
 * @private Compact representation of meal selections for activity log diffs.
 */
function summarizeMealSelections_(mealSelectionsJson) {
  try {
    var ms = typeof mealSelectionsJson === 'string'
      ? JSON.parse(mealSelectionsJson || '{}')
      : (mealSelectionsJson || {});
    var parts = [];
    ['breakfast', 'lunch', 'supper'].forEach(function(m) {
      if (ms[m]) parts.push(m + ':' + (ms[m].adult || 0) + 'a/' + (ms[m].child || 0) + 'c');
    });
    return parts.join(' ') || 'none';
  } catch (e) { return 'parse_error'; }
}

/**
 * Universal admin repair entry point.
 *
 * Works for ANY registration type (staff, paid, or future types).
 * Replaces the old adminRepairGuestRows which incorrectly used staff-only
 * meal logic and did not recalculate financials or sync MealTickets.
 *
 * @param {Object} payload
 *   regId   {string}  Required. Registration ID to repair.
 *   guests  {Array}   Required. Complete guest list including primary registrant
 *                     as first element. Each entry: {name, age, attendanceRaw}.
 *
 * @returns {Object} {success, regId, regType, adultsCount, childrenCount, totalGuests,
 *                    mealSelections, mealSubtotal, subtotal, balanceDue,
 *                    childClassCounts, ticketsDeleted, ticketsPreserved}
 */
function adminRepairRegistration(payload) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { success: false, error: 'System busy. Please try again.' };
  }

  try {
    var regId = payload && payload.regId ? String(payload.regId).trim() : '';
    if (!regId) return { success: false, error: 'Missing regId' };

    var incomingGuests = Array.isArray(payload.guests) ? payload.guests : [];
    if (incomingGuests.length === 0) {
      return { success: false, error: 'Guest list cannot be empty' };
    }

    var regDataObj = getSheetValuesSafe('Registrations');
    var regSheet   = regDataObj.sheet;
    var regData    = regDataObj.values;
    var config     = getConfig();

    var idx = findRegistrationRowById(regId, regData);
    if (idx === -1) return { success: false, error: 'Registration not found' };

    var rowNum      = idx + 1;
    var existingRow = regData[idx];
    var regType     = String(existingRow[COLUMNS.REG_TYPE] || 'paid').toLowerCase();

    // ── Before snapshot (for activity log) ──────────────────────────────
    var before = {
      regType:       regType,
      adultsCount:   existingRow[COLUMNS.ADULTS_COUNT]   || 0,
      childrenCount: existingRow[COLUMNS.CHILDREN_COUNT] || 0,
      totalGuests:   existingRow[COLUMNS.TOTAL_GUESTS]   || 0,
      mealSubtotal:  existingRow[COLUMNS.MEAL_SUBTOTAL]  || 0,
      subtotal:      existingRow[COLUMNS.SUBTOTAL]       || 0,
      balanceDue:    existingRow[COLUMNS.BALANCE_DUE]    || 0,
      meals:         summarizeMealSelections_(existingRow[COLUMNS.MEAL_SELECTIONS])
    };

    // ── Rebuild and recalculate ──────────────────────────────────────────
    var guestList        = rebuildGuestListFromAdminInput(incomingGuests);
    if (guestList.length === 0) {
      return { success: false, error: 'No valid guests after normalization' };
    }

    var derived          = recalculateRegistrationDerivedFields(existingRow, guestList, config);
    var childClassCounts = buildChildClassCounts(guestList);

    // ── Batch write to Registrations sheet ──────────────────────────────
    // Counts: Q(17), R(18), S(19)
    regSheet.getRange(rowNum, COLUMNS.ADULTS_COUNT + 1, 1, 3)
            .setValues([[derived.adultsCount, derived.childrenCount, derived.totalGuests]]);

    // Guest details JSON (T=20) and meal selections JSON (U=21)
    regSheet.getRange(rowNum, COLUMNS.GUEST_DETAILS   + 1).setValue(JSON.stringify(guestList));
    regSheet.getRange(rowNum, COLUMNS.MEAL_SELECTIONS + 1).setValue(JSON.stringify(derived.mealSelections));

    // Financial derived fields: P(16), X(24), Y(25), AC(29)
    regSheet.getRange(rowNum, COLUMNS.HOUSING_SUBTOTAL + 1).setValue(derived.housingSubtotal);
    regSheet.getRange(rowNum, COLUMNS.MEAL_SUBTOTAL    + 1).setValue(derived.mealSubtotal);
    regSheet.getRange(rowNum, COLUMNS.SUBTOTAL         + 1).setValue(derived.subtotal);
    regSheet.getRange(rowNum, COLUMNS.BALANCE_DUE      + 1).setValue(derived.balanceDue);

    SpreadsheetApp.flush();

    // ── Sync GuestDetails sheet ─────────────────────────────────────────
    adminSyncGuestDetailsSheet(regId, guestList);

    // ── Sync MealTickets sheet ──────────────────────────────────────────
    var mealData = {
      name:         String(existingRow[COLUMNS.PRIMARY_NAME] || ''),
      regType:      regType,
      staffRole:    String(existingRow[32] || ''), // AG: staff_role
      guests:       guestList,
      mealSelections: derived.mealSelections,
      dietaryNeeds: String(existingRow[COLUMNS.DIETARY_NEEDS] || '')
    };
    var ticketSync = syncMealTicketsForRegistration(regId, mealData, true /* skipLock */);

    // ── Activity log with before/after diff ─────────────────────────────
    var after = {
      adultsCount:   derived.adultsCount,
      childrenCount: derived.childrenCount,
      totalGuests:   derived.totalGuests,
      mealSubtotal:  derived.mealSubtotal,
      subtotal:      derived.subtotal,
      balanceDue:    derived.balanceDue,
      meals:         summarizeMealSelections_(derived.mealSelections)
    };

    var logMsg =
      'regType=' + regType +
      ' | guests: '        + before.totalGuests   + '→' + after.totalGuests   +
      ' (adults: '         + before.adultsCount    + '→' + after.adultsCount   +
      ', children: '       + before.childrenCount  + '→' + after.childrenCount + ')' +
      ' | mealSubtotal: $' + before.mealSubtotal   + '→$' + after.mealSubtotal +
      ' | meals: ['        + before.meals          + '] → [' + after.meals     + ']' +
      ' | tickets: deleted=' + ticketSync.deletedCount +
      ' preserved_redeemed=' + ticketSync.redeemedPreserved;

    logActivity('admin_repair', regId, logMsg, 'admin');

    return {
      success:          true,
      regId:            regId,
      regType:          regType,
      adultsCount:      derived.adultsCount,
      childrenCount:    derived.childrenCount,
      totalGuests:      derived.totalGuests,
      mealSelections:   derived.mealSelections,
      housingSubtotal:  derived.housingSubtotal,
      mealSubtotal:     derived.mealSubtotal,
      subtotal:         derived.subtotal,
      balanceDue:       derived.balanceDue,
      childClassCounts: childClassCounts,
      ticketsDeleted:   ticketSync.deletedCount,
      ticketsPreserved: ticketSync.redeemedPreserved
    };

  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
