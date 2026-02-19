// ==========================================
// FILE: TestNewFeatures.gs
// ==========================================

function testNewFeatures() {
  Logger.log('--- STARTING NEW FEATURE TESTS ---');

  // A. Create a test registration
  var testData = {
    name: 'Test Auto User',
    email: 'test-auto@example.com',
    housingOption: 'tent',
    paymentStatus: 'paid',
    totalCharged: 25,
    paymentMethod: 'square',
    nights: 'tue,wed',
    numNights: 2
  };

  Logger.log('1. Creating test registration...');
  var createRes = processRegistration(testData);

  if (!createRes.success) {
    Logger.log('ERROR: Failed to create registration: ' + createRes.error);
    return;
  }

  var regId = createRes.registrationId;
  Logger.log('SUCCESS: Created ' + regId);

  // B. Test getRegistration
  Logger.log('2. Testing getRegistration...');
  var getRes = getRegistration(regId);
  if (getRes.success && getRes.registration.name === testData.name) {
    Logger.log('SUCCESS: getRegistration returned correct data.');
  } else {
    Logger.log('ERROR: getRegistration failed or data mismatch.');
  }

  // C. Test cancelRegistration
  Logger.log('3. Testing cancelRegistration...');
  var cancelRes = cancelRegistration({regId: regId});

  if (cancelRes.success) {
    Logger.log('SUCCESS: Cancelled registration.');
    Logger.log('Refund: ' + cancelRes.refundAmount + ', Retained: ' + cancelRes.amountRetained);

    // Verify status
    var verifyRes = getRegistration(regId);
    if (verifyRes.registration.status === 'cancelled') {
      Logger.log('SUCCESS: Status verified as cancelled.');
    } else {
      Logger.log('ERROR: Status is ' + verifyRes.registration.status);
    }
  } else {
    Logger.log('ERROR: Cancel failed: ' + cancelRes.error);
  }

  Logger.log('--- TESTS COMPLETE ---');
}
