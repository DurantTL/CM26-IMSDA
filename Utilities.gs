// ==========================================
// FILE: Utilities.gs
// ==========================================

// *** ACTION REQUIRED ***
// Paste your Spreadsheet ID inside the quotes below
var SPREADSHEET_ID = '1Zx-XPcbg3oI5DK5OCH8Ryg7LC4rYKRjcRDOIxTQsyy8'; 

/**
 * HELPER: Always opens the correct spreadsheet by ID
 * fixes "Unable to open file" errors.
 */
function getSS() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Standard JSON response helper
 */
function jsonResponse(data, status) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Generates a formatted Registration ID (e.g., CM26-0001)
 */
function generateRegId() {
  var ss = getSS();
  var sheet = ss.getSheetByName('Registrations');
  var lastRow = Math.max(sheet.getLastRow(), 1); 
  var nextNum = lastRow; 
  return 'CM26-' + ('0000' + nextNum).slice(-4);
}

/**
 * Generates a unique ID for guest rows
 */
function generateGuestId() {
  return 'G-' + Utilities.getUuid().slice(0, 8);
}

/**
 * Logs actions to the ActivityLog sheet
 */
function logActivity(action, regId, details, source) {
  try {
    var ss = getSS();
    var logSheet = ss.getSheetByName('ActivityLog');
    
    logSheet.appendRow([
      new Date(),
      action,
      regId,
      Session.getEffectiveUser().getEmail(), 
      source,
      details
    ]);
  } catch (e) {
    console.error('Logging failed: ' + e.toString());
  }
}