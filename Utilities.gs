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
  // Add HTTP status simulation if needed, but currently Google Apps Script doesn't support setting HTTP status codes directly.
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Generates a formatted Registration ID (e.g., CM26-0001)
 * Uses PropertiesService to ensure uniqueness and atomic increment
 */
function generateRegId() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var props = PropertiesService.getScriptProperties();
    var lastId = parseInt(props.getProperty('LAST_REG_ID') || '0');
    var nextId = lastId + 1;
    props.setProperty('LAST_REG_ID', nextId.toString());
    return 'CM26-' + ('0000' + nextId).slice(-4);
  } catch (e) {
    throw new Error('Could not generate Registration ID: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Generates a unique ID for guest rows
 * Uses full UUID for better entropy
 */
function generateGuestId() {
  return 'G-' + Utilities.getUuid();
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

// Column Indices (0-based) for consistency
var COLUMNS = {
  REG_ID: 0,        // A
  CREATED_AT: 1,    // B
  REG_TYPE: 2,      // C
  STATUS: 3,        // D
  PRIMARY_NAME: 4,  // E
  EMAIL: 5,         // F
  PHONE: 6,         // G
  CHURCH: 11,       // L
  HOUSING_OPTION: 12, // M
  NIGHTS: 13,       // N
  NUM_NIGHTS: 14,   // O
  HOUSING_SUBTOTAL: 15, // P
  ADULTS_COUNT: 16, // Q
  CHILDREN_COUNT: 17, // R
  TOTAL_GUESTS: 18, // S
  GUEST_DETAILS: 19, // T
  MEAL_SELECTIONS: 20, // U
  DIETARY_NEEDS: 21, // V
  SPECIAL_NEEDS: 22, // W
  MEAL_SUBTOTAL: 23, // X
  SUBTOTAL: 24,     // Y
  TOTAL_CHARGED: 26, // AA
  AMOUNT_PAID: 27,  // AB
  BALANCE_DUE: 28,  // AC
  PAYMENT_METHOD: 29, // AD
  PAYMENT_STATUS: 30, // AE
  ROOM_ASSIGNMENT: 34, // AI
  BUILDING: 35,     // AJ
  KEY_1_NUMBER: 36, // AK
  KEY_2_NUMBER: 37, // AL
  KEY_DEPOSIT_AMOUNT: 38, // AM
  KEY_DEPOSIT_PAID: 39, // AN
  KEY_1_RETURNED: 40, // AO
  KEY_2_RETURNED: 41, // AP
  DEPOSIT_REFUNDED: 42, // AQ
  DEPOSIT_REFUND_AMOUNT: 43, // AR
  CHECKED_IN: 44,   // AS
  CHECK_IN_TIME: 45, // AT
  CHECKED_IN_BY: 46, // AU
  WELCOME_PACKET_GIVEN: 47, // AV
  CHECKED_OUT: 48,  // AW
  CHECK_OUT_TIME: 49, // AX
  CHECKED_OUT_BY: 50 // AY
};
