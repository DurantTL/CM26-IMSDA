// ==========================================
// FILE: Admin.gs
// ==========================================

/**
 * Show admin sidebar
 */
function showAdminSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('AdminSidebar')
    .setTitle('Camp Meeting Admin')
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

/**
 * Get unassigned dorm registrations
 */
function getUnassignedRegistrations() {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();
  
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
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();
  
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
  
  reportSheet.appendRow(['KEY STATUS REPORT', '', '', '', 'Generated:', new Date()]);
  reportSheet.appendRow([]);
  reportSheet.appendRow(['Total Keys Out:', keysOut.length * 2 - keysOut.filter(k => !k.key1Out).length - keysOut.filter(k => !k.key2Out).length]);
  reportSheet.appendRow(['Deposits Pending Refund:', '$' + depositsPending]);
  reportSheet.appendRow([]);
  reportSheet.appendRow(['Reg ID', 'Name', 'Room', 'Key 1', 'Key 1 Status', 'Key 2', 'Key 2 Status', 'Deposit']);
  
  keysOut.forEach(function(k) {
    reportSheet.appendRow([
      k.regId,
      k.name,
      k.room,
      k.key1,
      k.key1Out ? 'OUT' : 'Returned',
      k.key2,
      k.key2Out ? 'OUT' : 'Returned',
      '$' + k.deposit
    ]);
  });
  
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
    var ss = getSS();
    var regSheet = ss.getSheetByName('Registrations');
    var config = getConfig();
    var data = regSheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === regId) {
        var row = i + 1;
        var numNights = data[i][COLUMNS.NUM_NIGHTS] || 0;

        // Get new price
        var newPrice = 0;
        if (newHousingType === 'dorm') newPrice = config.dorm_price;
        else if (newHousingType === 'rv') newPrice = config.rv_price;
        else if (newHousingType === 'tent') newPrice = config.tent_price;

        var newHousingSubtotal = newPrice * numNights;

        // Update housing option
        regSheet.getRange(row, COLUMNS.HOUSING_OPTION + 1).setValue(newHousingType);
        regSheet.getRange(row, COLUMNS.HOUSING_SUBTOTAL + 1).setValue(newHousingSubtotal);

        // Clear room assignment if changing away from dorm
        if (newHousingType !== 'dorm') {
          regSheet.getRange(row, COLUMNS.ROOM_ASSIGNMENT + 1).setValue('');
          regSheet.getRange(row, COLUMNS.BUILDING + 1).setValue('');
        }

        // Recalculate subtotal
        var mealSubtotal = data[i][COLUMNS.MEAL_SUBTOTAL] || 0;
        var newSubtotal = newHousingSubtotal + mealSubtotal;
        regSheet.getRange(row, COLUMNS.SUBTOTAL + 1).setValue(newSubtotal);

        logActivity('housing_change', regId,
          'Changed from ' + data[i][COLUMNS.HOUSING_OPTION] + ' to ' + newHousingType,
          'admin');

        return { success: true, newHousingSubtotal: newHousingSubtotal };
      }
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
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();
  
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
    var ss = getSS();
    var regSheet = ss.getSheetByName('Registrations');
    var config = getConfig();
    var data = regSheet.getDataRange().getValues();
    var today = new Date();

    var dateMap = {
      'tue': '2026-06-02',
      'wed': '2026-06-03',
      'thu': '2026-06-04',
      'fri': '2026-06-05',
      'sat': '2026-06-06'
    };

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

            regSheet.getRange(rowNum, COLUMNS.STATUS + 1).setValue('no_show');
            regSheet.getRange(rowNum, COLUMNS.TOTAL_CHARGED + 1).setValue(amountRetained);

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
