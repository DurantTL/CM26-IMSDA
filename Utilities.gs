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
 * Standard JSON response helper.
 * All API responses must go through this function to ensure consistent
 * JSON formatting and MIME type. Google Apps Script automatically adds
 * the 'Access-Control-Allow-Origin: *' response header for web apps
 * deployed with "Anyone, even anonymous" access — custom headers cannot
 * be set via ContentService. PWA clients must send POST bodies as
 * 'text/plain;charset=utf-8' (a CORS simple request) to avoid triggering
 * pre-flight checks that GAS cannot respond to with custom headers.
 */
function jsonResponse(data, status) {
  // Note: HTTP status codes cannot be set directly in Google Apps Script.
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

/**
 * Calculates the Square processing fee using the pass-on (reverse) formula
 * so the organization receives exactly the subtotal amount.
 *
 * Standard formula charges the customer:
 *   Total = (Subtotal + Fixed) / (1 - Percent)
 *   Fee   = Total - Subtotal
 *
 * Config keys used:
 *   square_fee_percent  — e.g. 0.029 (2.9%)
 *   square_fee_fixed    — e.g. 0.30  ($0.30)
 *
 * @param {number} subtotal  The net amount the organization should receive.
 * @returns {number} The fee to add to the subtotal, rounded to 2 decimal places.
 *                   Returns 0 if subtotal is falsy or non-positive.
 */
function calculateSquareFee(subtotal) {
  if (!subtotal || subtotal <= 0) return 0;
  var config = getConfig();
  var fixed = parseFloat(config.square_fee_fixed || 0.30);
  var percent = parseFloat(config.square_fee_percent || 0.029);

  // Pass-on formula: Total = (Subtotal + Fixed) / (1 - Percent)
  var totalCharge = (subtotal + fixed) / (1 - percent);
  var fee = totalCharge - subtotal;

  // Return rounded to 2 decimal places
  return Math.round(fee * 100) / 100;
}

/**
 * Normalize registration status values from sheet/user input.
 */
function normalizeRegistrationStatus(status) {
  return String(status || '').trim().toLowerCase();
}

/**
 * Returns true when a registration row is soft-cancelled.
 */
function isCancelledRegistration(row) {
  return normalizeRegistrationStatus(row[COLUMNS.STATUS]) === 'cancelled';
}

/**
 * Returns true when a registration row is operationally active.
 */
function isActiveRegistration(row) {
  return !isCancelledRegistration(row);
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
  CHECKED_OUT_BY: 50, // AY
  SPECIAL_REQUESTS: 54, // BC
  ROOM_COUNT: 55        // BD
};

var EVENT_DATES = {
  tue: '2026-06-02',
  wed: '2026-06-03',
  thu: '2026-06-04',
  fri: '2026-06-05',
  sat: '2026-06-06'
};
