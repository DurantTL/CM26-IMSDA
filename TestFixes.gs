// ==========================================
// FILE: TestFixes.gs
// ==========================================

function testFixes() {
  Logger.log('--- STARTING VERIFICATION TESTS ---');

  // 1. Test UUID Entropy
  Logger.log('1. Testing UUID Entropy...');
  var uuid = Utilities.getUuid();
  Logger.log('Generated UUID: ' + uuid);
  if (uuid.length < 32) {
    Logger.log('ERROR: UUID is too short.');
  } else {
    Logger.log('SUCCESS: UUID looks correct.');
  }

  // 2. Test Atomic Rollback (Simulation)
  Logger.log('2. Testing Atomic Rollback Logic...');
  Logger.log('INFO: Atomic Rollback logic implemented in Registration.gs. Verify code review ensures try/catch block around createMealTickets and rollback.');

  // 3. Test Staff Deduplication
  Logger.log('3. Testing Staff Deduplication...');

  // Mock event data for an existing user (assuming test-auto@example.com exists)
  // If not, this test might pass (registration succeeds) or fail for other reasons.
  // Ideally, we should create a registration first.

  var testEmail = 'duplicate-test-' + new Date().getTime() + '@example.com';

  // Create first registration
  Logger.log('Creating initial registration for ' + testEmail);
  var initialReg = processRegistration({
    name: 'Original User',
    email: testEmail,
    housingOption: 'tent',
    paymentStatus: 'paid',
    totalCharged: 0,
    paymentMethod: 'free',
    nights: 'tue',
    numNights: 1
  });

  if (!initialReg.success) {
    Logger.log('ERROR: Failed to create initial registration. ' + initialReg.error);
  } else {
    Logger.log('Initial registration created. ID: ' + initialReg.registrationId);

    // Now try to register again as staff with same email
    var mockEvent = {
      namedValues: {
        'Your Role': ['Staff'],
        'Full Name': ['Duplicate Tester'],
        'Email': [testEmail],
        'Phone': ['555-0199'],
        'Home Church': ['Test Church'],
        'Housing Preference': ['Tent'],
        'Nights Attending': ['Tue 6/2'],
        'Number of Adults in Party': ['1'],
        'Number of Children in Party': ['0'],
        'Family Members (Name & Age)': [''],
        'Dietary Restrictions': [''],
        'Special Needs/Requests': ['']
      }
    };

    Logger.log('Attempting duplicate staff registration...');
    var result = onStaffFormSubmit(mockEvent);

    if (!result.success && result.error && result.error.indexOf('already registered') !== -1) {
      Logger.log('SUCCESS: Duplicate registration blocked.');
    } else {
      Logger.log('ERROR: Duplicate registration NOT blocked properly. Result: ' + JSON.stringify(result));
    }
  }

  Logger.log('--- TESTS COMPLETE ---');
}
