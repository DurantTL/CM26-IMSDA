// ==========================================
// FILE: Setup.gs
// ==========================================

/**
 * Initializes the spreadsheet database by ensuring all required sheets
 * exist with the correct headers, frozen rows, and bold formatting.
 *
 * Run this function once from the Apps Script editor before using the system,
 * or any time a sheet is accidentally deleted or corrupted.
 *
 * @returns {Object} JSON summary of what was created or already existed.
 */
function initializeDatabase() {
  var ss = getSS();
  var created = [];
  var existing = [];

  // -----------------------------------------------------------------------
  // Sheet definitions: name → header row array
  // Headers MUST match the column indices in the COLUMNS object (Utilities.gs)
  // and the regRow array in Registration.gs (columns A through BB).
  // -----------------------------------------------------------------------
  var sheetDefs = [
    {
      name: 'Registrations',
      headers: [
        'reg_id',             // A  (0)  COLUMNS.REG_ID
        'created_at',         // B  (1)  COLUMNS.CREATED_AT
        'reg_type',           // C  (2)  COLUMNS.REG_TYPE
        'status',             // D  (3)  COLUMNS.STATUS
        'primary_name',       // E  (4)  COLUMNS.PRIMARY_NAME
        'email',              // F  (5)  COLUMNS.EMAIL
        'phone',              // G  (6)  COLUMNS.PHONE
        'address_street',     // H  (7)
        'address_city',       // I  (8)
        'address_state',      // J  (9)
        'address_zip',        // K  (10)
        'church',             // L  (11) COLUMNS.CHURCH
        'housing_option',     // M  (12) COLUMNS.HOUSING_OPTION
        'nights',             // N  (13) COLUMNS.NIGHTS
        'num_nights',         // O  (14) COLUMNS.NUM_NIGHTS
        'housing_subtotal',   // P  (15) COLUMNS.HOUSING_SUBTOTAL
        'adults_count',       // Q  (16) COLUMNS.ADULTS_COUNT
        'children_count',     // R  (17) COLUMNS.CHILDREN_COUNT
        'total_guests',       // S  (18) COLUMNS.TOTAL_GUESTS
        'guest_details',      // T  (19) COLUMNS.GUEST_DETAILS  (JSON)
        'meal_selections',    // U  (20) COLUMNS.MEAL_SELECTIONS (JSON)
        'dietary_needs',      // V  (21) COLUMNS.DIETARY_NEEDS
        'special_needs',      // W  (22) COLUMNS.SPECIAL_NEEDS
        'meal_subtotal',      // X  (23) COLUMNS.MEAL_SUBTOTAL
        'subtotal',           // Y  (24) COLUMNS.SUBTOTAL
        'processing_fee',     // Z  (25)
        'total_charged',      // AA (26) COLUMNS.TOTAL_CHARGED
        'amount_paid',        // AB (27) COLUMNS.AMOUNT_PAID
        'balance_due',        // AC (28) COLUMNS.BALANCE_DUE
        'payment_method',     // AD (29) COLUMNS.PAYMENT_METHOD
        'payment_status',     // AE (30) COLUMNS.PAYMENT_STATUS
        'transaction_id',     // AF (31)
        'staff_role',         // AG (32)
        'moveable',           // AH (33)
        'room_assignment',    // AI (34) COLUMNS.ROOM_ASSIGNMENT
        'building',           // AJ (35) COLUMNS.BUILDING
        'key_1_number',       // AK (36) COLUMNS.KEY_1_NUMBER
        'key_2_number',       // AL (37) COLUMNS.KEY_2_NUMBER
        'key_deposit_amount', // AM (38) COLUMNS.KEY_DEPOSIT_AMOUNT
        'key_deposit_paid',   // AN (39) COLUMNS.KEY_DEPOSIT_PAID
        'key_1_returned',     // AO (40) COLUMNS.KEY_1_RETURNED
        'key_2_returned',     // AP (41) COLUMNS.KEY_2_RETURNED
        'deposit_refunded',   // AQ (42) COLUMNS.DEPOSIT_REFUNDED
        'deposit_refund_amount', // AR (43) COLUMNS.DEPOSIT_REFUND_AMOUNT
        'checked_in',         // AS (44) COLUMNS.CHECKED_IN
        'check_in_time',      // AT (45) COLUMNS.CHECK_IN_TIME
        'checked_in_by',      // AU (46) COLUMNS.CHECKED_IN_BY
        'welcome_packet_given', // AV (47) COLUMNS.WELCOME_PACKET_GIVEN
        'checked_out',        // AW (48) COLUMNS.CHECKED_OUT
        'check_out_time',     // AX (49) COLUMNS.CHECK_OUT_TIME
        'checked_out_by',     // AY (50) COLUMNS.CHECKED_OUT_BY
        'notes',              // AZ (51)
        'fluent_entry_id',    // BA (52)
        'qr_data'             // BB (53)
      ]
    },
    {
      name: 'Waitlist',
      headers: [
        'id',             // A (0)
        'created_at',     // B (1)
        'name',           // C (2)
        'email',          // D (3)
        'phone',          // E (4)
        'housing_option', // F (5)
        'nights',         // G (6)
        'num_guests',     // H (7)
        'position',       // I (8)
        'status',         // J (9)
        'offered_at',     // K (10)
        'expires_at',     // L (11)
        'notes'           // M (12)
      ]
    },
    {
      name: 'Rooms',
      headers: [
        'room_id',             // A (0)
        'housing_type',        // B (1)
        'building',            // C (2)
        'floor',               // D (3)
        'capacity',            // E (4)
        'features',            // F (5)
        'status',              // G (6)
        'assigned_to_reg_id',  // H (7)
        'assigned_to_name',    // I (8)
        'notes'                // J (9)
      ]
    },
    {
      name: 'MealTickets',
      headers: [
        'ticket_id',   // A (0)
        'reg_id',      // B (1)
        'guest_name',  // C (2)
        'meal_type',   // D (3)
        'meal_day',    // E (4)
        'meal_date',   // F (5)
        'ticket_type', // G (6)
        'price',       // H (7)
        'redeemed',    // I (8)
        'redeemed_at', // J (9)
        'redeemed_by', // K (10)
        'notes'        // L (11)
      ]
    },
    {
      name: 'ActivityLog',
      headers: [
        'timestamp', // A (0)
        'action',    // B (1)
        'reg_id',    // C (2)
        'user',      // D (3)
        'source',    // E (4)
        'details'    // F (5)
      ]
    },
    {
      name: 'Payments',
      headers: [
        'payment_id',    // A (0)
        'reg_id',        // B (1)
        'created_at',    // C (2)
        'amount',        // D (3)
        'method',        // E (4)
        'type',          // F (5)
        'transaction_id',// G (6)
        'processed_by',  // H (7)
        'notes'          // I (8)
      ]
    },
    {
      name: 'GuestDetails',
      headers: [
        'guest_id',          // A
        'reg_id',            // B
        'guest_name',        // C
        'age',               // D
        'is_child',          // E
        'is_primary',        // F
        'class_assignment',  // G
        'sabbath_school',    // H
        'children_meeting'   // I
      ]
    },
    {
      name: 'Config',
      headers: [
        'key',   // A
        'value'  // B
      ]
    }
  ];

  // -----------------------------------------------------------------------
  // Process each sheet definition
  // -----------------------------------------------------------------------
  for (var i = 0; i < sheetDefs.length; i++) {
    var def = sheetDefs[i];
    var sheet = ss.getSheetByName(def.name);
    var wasCreated = false;

    // Create the sheet if it does not exist
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      wasCreated = true;
    }

    // Write headers to row 1 (always overwrite to keep in sync)
    var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
    headerRange.setValues([def.headers]);

    // Make headers bold
    headerRange.setFontWeight('bold');

    // Freeze the header row
    sheet.setFrozenRows(1);

    if (wasCreated) {
      created.push(def.name);
    } else {
      existing.push(def.name);
    }
  }

  // -----------------------------------------------------------------------
  // Seed default Config values if Config sheet was just created
  // -----------------------------------------------------------------------
  if (created.indexOf('Config') !== -1) {
    _seedDefaultConfig(ss.getSheetByName('Config'));
  }

  // -----------------------------------------------------------------------
  // Log the initialization
  // -----------------------------------------------------------------------
  logActivity(
    'db_init',
    'system',
    'Database initialized. Created: [' + created.join(', ') + ']. Already existed: [' + existing.join(', ') + '].',
    'setup'
  );

  return {
    success: true,
    message: 'Database initialization complete.',
    sheetsCreated: created,
    sheetsUpdated: existing
  };
}

/**
 * Seeds sensible default configuration values into the Config sheet.
 * Only called when the Config sheet is newly created.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} configSheet
 */
function _seedDefaultConfig(configSheet) {
  var defaults = [
    ['event_name',             'Camp Meeting 2026'],
    ['event_start',            '2026-06-02'],
    ['event_end',              '2026-06-06'],
    ['registration_deadline',  '2026-05-25'],
    ['cancellation_deadline',  '2026-05-25'],
    ['deposit_amount',         '65'],
    ['cancellation_fee',       '10'],
    ['dorm_price',             '25'],
    ['rv_price',               '15'],
    ['tent_price',             '5'],
    ['adult_breakfast',        '6'],
    ['adult_lunch',            '8'],
    ['adult_supper',           '8'],
    ['child_breakfast',        '3'],
    ['child_lunch',            '4'],
    ['child_supper',           '4'],
    ['key_deposit_amount',     '10'],
    ['square_fee_percent',     '2.9'],
    ['square_fee_fixed',       '0.30'],
    ['dorm_capacity',          '100'],
    ['rv_capacity',            '50'],
    ['tent_capacity',          '200'],
    ['web_app_url',            '']    // Set to your /exec URL after deployment
  ];

  configSheet.getRange(2, 1, defaults.length, 2).setValues(defaults);
}
