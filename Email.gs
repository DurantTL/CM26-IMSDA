// ==========================================
// FILE: Email.gs
// ==========================================

/**
 * Sends the HTML confirmation email to a registrant
 */
function sendConfirmationEmail(regId) {
  var reg = getRegistrationByRegId(regId);
  
  if (!reg) {
    Logger.log("Error: Registration not found for email " + regId);
    return;
  }
  
  // Prepare the template
  var template = HtmlService.createTemplateFromFile('EmailTemplate');
  template.reg = reg;
  
  var emailBody = template.evaluate().getContent();
  
  var config = getConfig();

  // Send the email
  GmailApp.sendEmail(
    reg.email,
    'Camp Meeting 2026 Confirmation - ' + regId,
    'Your email client does not support HTML. Please view online.', // Fallback text
    {
      htmlBody: emailBody,
      name: 'Iowa-Missouri Conference',
      replyTo: config.admin_email || ''
    }
  );
  
  logActivity('email_sent', regId, 'Confirmation email sent to ' + reg.email, 'system');
  Logger.log("Email sent successfully to " + reg.email);
}

/**
 * Helper: Fetches a single registration object from the sheet
 * Maps columns A-AC to a friendly object
 */
function getRegistrationByRegId(id) {
  var ss = getSS();
  var sheet = ss.getSheetByName('Registrations');
  var data = sheet.getDataRange().getValues();
  
  // Columns map (Index = Column - 1)
  // A=0, E=4(Name), F=5(Email), M=12(Housing), etc.
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      var row = data[i];
      return {
        regId: row[0],
        primaryName: row[4],
        email: row[5],
        phone: row[6],
        housingOption: row[12],
        numNights: row[14],
        housingSubtotal: row[15],
        adultsCount: row[16],
        childrenCount: row[17],
        totalGuests: row[18],
        mealSubtotal: row[23],
        subtotal: row[24],
        totalCharged: row[26],
        amountPaid: row[27],
        balanceDue: row[28] // Column AC
      };
    }
  }
  return null;
}

/**
 * TEST FUNCTION
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