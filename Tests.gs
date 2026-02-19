// ==========================================
// FILE: Tests.gs
// PURPOSE: Manual test functions for system verification
// ==========================================

/**
 * TEST: Email System
 * Run this to send a test email to yourself
 */
function testEmailSystem() {
  // 1. Create a fake registration in memory
  var fakeReg = {
    regId: 'TEST-0001',
    primaryName: 'Test User',
    email: Session.getEffectiveUser().getEmail(), // Sends to YOU
    phone: '555-0199',
    housingOption: 'Dorm Room',
    numNights: 4,
    housingSubtotal: 100.00,
    adultsCount: 2,
    childrenCount: 1,
    totalGuests: 3,
    mealSubtotal: 50.00,
    subtotal: 150.00,
    totalCharged: 150.00,
    amountPaid: 150.00,
    balanceDue: 0
  };

  // 2. Render Template
  var template = HtmlService.createTemplateFromFile('EmailTemplate');
  template.reg = fakeReg;
  var body = template.evaluate().getContent();

  // 3. Send
  GmailApp.sendEmail(
    fakeReg.email,
    'TEST: Camp Meeting Confirmation',
    'HTML not supported',
    {
      htmlBody: body,
      name: 'IMC Test System'
    }
  );

  Logger.log("Test email sent to " + fakeReg.email);
}

/**
 * TEST: Staff Form Submission
 * Run this to test without actually submitting the form
 */
function testStaffFormSubmit() {
  // Simulate form submission data
  var fakeEvent = {
    namedValues: {
      'Your Role': ['Pastor'],
      'Full Name': ['Test Pastor'],
      'Email': [Session.getEffectiveUser().getEmail()],
      'Phone': ['515-555-0100'],
      'Home Church': ['Des Moines Church'],
      'Housing Preference': ['Dorm Room'],
      'Nights Attending': ['Tuesday 6/2', 'Wednesday 6/3', 'Thursday 6/4', 'Friday 6/5', 'Saturday 6/6'],
      'Number of Adults in Party': ['2'],
      'Number of Children in Party': ['2'],
      'Family Members (Name & Age)': ['Test Pastor, 45\nSpouse Name, 43\nChild One, 14\nChild Two, 10'],
      'Dietary Restrictions': ['Vegetarian'],
      'Special Needs/Requests': ['Ground floor room preferred']
    }
  };

  var result = onStaffFormSubmit(fakeEvent);
  Logger.log('Test result: ' + JSON.stringify(result));
}

/**
 * TEST: Spreadsheet Connection
 */
function testConnection() {
  try {
    var ss = getSS();
    Logger.log("Success! Connected to: " + ss.getName());
  } catch (e) {
    Logger.log("FAILED: " + e.toString());
  }
}

/**
 * TEST: doGet Simulation
 */
function testDoGet() {
  // Simulate a browser request asking for availability
  var e = {
    parameter: {
      action: 'getAvailability'
    }
  };

  // Call the real function with our fake data
  var result = doGet(e);

  // Log the result to the console
  Logger.log(result.getContent());
}
