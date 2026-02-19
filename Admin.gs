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
    var housingOption = row[12];
    var roomAssignment = row[34];
    var status = row[3];
    
    if (housingOption === 'dorm' && 
        !roomAssignment && 
        status !== 'cancelled') {
      unassigned.push({
        regId: row[0],
        name: row[4],
        guests: row[18],
        nights: row[13],
        specialNeeds: row[22]
      });
    }
  }
  
  return unassigned;
}

/**
 * Recalculate totals for all registrations
 */
function recalculateAllTotals() {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var config = getConfig();
  var data = regSheet.getDataRange().getValues();
  
  var updated = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowNum = i + 1;
    
    // Calculate housing subtotal
    var housingOption = row[12];
    var numNights = row[14] || 0;
    var housingPrice = 0;
    
    if (housingOption === 'dorm') housingPrice = config.dorm_price;
    else if (housingOption === 'rv') housingPrice = config.rv_price;
    else if (housingOption === 'tent') housingPrice = config.tent_price;
    
    var housingSubtotal = housingPrice * numNights;
    
    // Calculate meal subtotal from selections
    var mealSelections = {};
    try {
      mealSelections = JSON.parse(row[20] || '{}');
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
    var balanceDue = (row[26] || 0) - (row[27] || 0);
    
    // Store values for batch update
    data[i][15] = housingSubtotal; // Column 16 (P)
    data[i][23] = mealSubtotal;    // Column 24 (X)
    data[i][24] = subtotal;        // Column 25 (Y)
    data[i][28] = balanceDue;      // Column 29 (AC)
    
    updated++;
  }
  
  // Batch update all rows at once to improve performance
  if (updated > 0) {
    var numRows = data.length - 1;

    // Update Column P (16)
    var colPValues = data.slice(1).map(function(r) { return [r[15]]; });
    regSheet.getRange(2, 16, numRows, 1).setValues(colPValues);

    // Update Columns X-Y (24-25)
    var colXYValues = data.slice(1).map(function(r) { return [r[23], r[24]]; });
    regSheet.getRange(2, 24, numRows, 2).setValues(colXYValues);

    // Update Column AC (29)
    var colACValues = data.slice(1).map(function(r) { return [r[28]]; });
    regSheet.getRange(2, 29, numRows, 1).setValues(colACValues);
  }

  SpreadsheetApp.getUi().alert('Recalculated ' + updated + ' registrations.');
  return updated;
}

/**
 * Generate key status report
 */
function generateKeyReport() {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();
  
  var keysOut = [];
  var keysReturned = [];
  var depositsPending = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    
    if (row[39] === 'yes') { // key_deposit_paid
      var key1Out = row[41] !== 'yes';
      var key2Out = row[42] !== 'yes';
      
      if (key1Out || key2Out) {
        keysOut.push({
          regId: row[0],
          name: row[4],
          room: row[34],
          key1: row[36],
          key2: row[37],
          key1Out: key1Out,
          key2Out: key2Out,
          deposit: row[38]
        });
        
        if (row[43] !== 'yes') {
          depositsPending += row[38] || 0;
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
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var config = getConfig();
  var data = regSheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === regId) {
      var row = i + 1;
      var numNights = data[i][14] || 0;
      
      // Get new price
      var newPrice = 0;
      if (newHousingType === 'dorm') newPrice = config.dorm_price;
      else if (newHousingType === 'rv') newPrice = config.rv_price;
      else if (newHousingType === 'tent') newPrice = config.tent_price;
      
      var newHousingSubtotal = newPrice * numNights;
      
      // Update housing option
      regSheet.getRange(row, 13).setValue(newHousingType); // M
      regSheet.getRange(row, 16).setValue(newHousingSubtotal); // P
      
      // Clear room assignment if changing away from dorm
      if (newHousingType !== 'dorm') {
        regSheet.getRange(row, 35).setValue(''); // AI
        regSheet.getRange(row, 36).setValue(''); // AJ
      }
      
      // Recalculate subtotal
      var mealSubtotal = data[i][23] || 0;
      var newSubtotal = newHousingSubtotal + mealSubtotal;
      regSheet.getRange(row, 25).setValue(newSubtotal); // Y
      
      logActivity('housing_change', regId, 
        'Changed from ' + data[i][12] + ' to ' + newHousingType,
        'admin');
      
      return { success: true, newHousingSubtotal: newHousingSubtotal };
    }
  }
  
  return { success: false, error: 'Registration not found' };
}

/**
 * Promote waitlist entry to confirmed
 */
function promoteFromWaitlist(waitlistId) {
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
    var status = row[3];
    
    if (status === 'cancelled') continue;
    
    exportData.push([
      row[0],  // reg_id
      row[4],  // name
      row[12], // housing_option
      row[34], // room_assignment
      row[18], // total_guests
      row[28], // balance_due
      row[3],  // status
      row[44]  // checked_in
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
    var status = row[3];
    var nights = (row[13] || '').toLowerCase(); // e.g. "tue,wed,thu"
    var checkedIn = row[44];

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
          var amountPaid = row[27] || 0;
          var depositAmount = Number(config.deposit_amount) || 65;
          var amountRetained = 0;

          // Logic: Forfeit deposit.
          if (amountPaid > depositAmount) {
             amountRetained = depositAmount;
          } else {
             amountRetained = amountPaid;
          }

          regSheet.getRange(rowNum, 4).setValue('no_show'); // Status
          regSheet.getRange(rowNum, 27).setValue(amountRetained); // Total Charged -> Retained

          // Release Room
          var roomAssignment = row[34];
          if (roomAssignment) {
             try {
               updateRoomStatus(roomAssignment, 'available', '', '');
               regSheet.getRange(rowNum, 35).setValue('');
               regSheet.getRange(rowNum, 36).setValue('');
             } catch(e) {}
          }

          logActivity('no_show', row[0], 'Marked as no-show. First night was ' + firstNight, 'admin');
          processedCount++;
        }
      }
    }
  }

  ui.alert('Processed ' + processedCount + ' registrations as No-Show.');
}
