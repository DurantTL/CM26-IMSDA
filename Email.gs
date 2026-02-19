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
 * Sends the HTML waitlist offer email
 */
function sendWaitlistOfferEmail(waitlistId, name, email, housingOption, expiresAt) {
  // Prepare the template
  var template = HtmlService.createTemplateFromFile('WaitlistOfferEmail');
  template.waitlistId = waitlistId;
  template.name = name;
  template.housingOption = housingOption;
  template.expiresAt = expiresAt;

  var emailBody = template.evaluate().getContent();

  // Send the email
  GmailApp.sendEmail(
    email,
    'Camp Meeting 2026 - Housing Spot Available',
    'A spot has opened up for your waitlist request. Please view this email in an HTML-compatible client.',
    {
      htmlBody: emailBody,
      name: 'Iowa-Missouri Conference',
      replyTo: 'campmeeting@imsda.org'
    }
  );

  logActivity('waitlist_email_sent', waitlistId, 'Offer email sent to ' + email, 'system');
  Logger.log("Waitlist offer email sent successfully to " + email);
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
