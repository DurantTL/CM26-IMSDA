// ==========================================
// FILE: Email.gs
// ==========================================

/**
 * Sends the HTML confirmation email to a registrant
 */
function sendConfirmationEmail(regId) {
  var config = getConfig();
  var regResult = getRegistration(regId);
  
  if (!regResult.success) {
    Logger.log("Error: Registration not found for email " + regId);
    return;
  }
  
  var reg = regResult.registration;

  // Prepare the template
  var template = HtmlService.createTemplateFromFile('EmailTemplate');
  template.reg = reg;
  
  var emailBody = template.evaluate().getContent();
  
  // Send the email
  try {
    GmailApp.sendEmail(
      reg.email,
      'Camp Meeting 2026 Confirmation - ' + regId,
      'Your email client does not support HTML. Please view online.', // Fallback text
      {
        htmlBody: emailBody,
        name: 'Iowa-Missouri Conference',
        replyTo: config.admin_email || 'campmeeting@imsda.org'
      }
    );

    logActivity('email_sent', regId, 'Confirmation email sent to ' + reg.email, 'system');
    Logger.log("Email sent successfully to " + reg.email);
  } catch (e) {
    Logger.log("Failed to send confirmation email: " + e.toString());
    logActivity('error', regId, 'Confirmation email failed: ' + e.toString(), 'system');
  }
}

/**
 * Sends the HTML waitlist offer email
 */
function sendWaitlistOfferEmail(waitlistId, name, email, housingOption, expiresAt) {
  var config = getConfig();

  // Prepare the template
  var template = HtmlService.createTemplateFromFile('WaitlistOfferEmail');
  template.waitlistId = waitlistId;
  template.name = name;
  template.housingOption = housingOption;
  template.expiresAt = expiresAt;

  var emailBody = template.evaluate().getContent();

  // Send the email
  try {
    GmailApp.sendEmail(
      email,
      'Camp Meeting 2026 - Housing Spot Available',
      'A spot has opened up for your waitlist request. Please view this email in an HTML-compatible client.',
      {
        htmlBody: emailBody,
        name: 'Iowa-Missouri Conference',
        // Fix: Use config instead of hardcoded
        replyTo: config.admin_email || 'campmeeting@imsda.org'
      }
    );

    logActivity('waitlist_email_sent', waitlistId, 'Offer email sent to ' + email, 'system');
    Logger.log("Waitlist offer email sent successfully to " + email);
  } catch (e) {
    Logger.log("Failed to send waitlist offer email: " + e.toString());
    logActivity('error', waitlistId, 'Waitlist offer email failed: ' + e.toString(), 'system');
  }
}

/**
 * Sends the HTML reminder email to a registrant
 */
function sendReminderEmail(regId) {
  var config = getConfig();
  var regResult = getRegistration(regId);

  if (!regResult.success) {
    Logger.log("Error: Registration not found for email " + regId);
    return;
  }

  var reg = regResult.registration;

  // Prepare the template
  var template = HtmlService.createTemplateFromFile('ReminderEmailTemplate');
  template.reg = reg;

  var emailBody = template.evaluate().getContent();

  // Send the email
  try {
    GmailApp.sendEmail(
      reg.email,
      'Camp Meeting 2026 - See You Soon!',
      'Camp Meeting is almost here! Please view this email online for your check-in code.',
      {
        htmlBody: emailBody,
        name: 'Iowa-Missouri Conference',
        replyTo: config.admin_email || 'campmeeting@imsda.org'
      }
    );

    logActivity('email_sent', regId, 'Reminder email sent to ' + reg.email, 'system');
    Logger.log("Reminder email sent successfully to " + reg.email);
  } catch (e) {
    Logger.log("Failed to send reminder email: " + e.toString());
    logActivity('error', regId, 'Reminder email failed: ' + e.toString(), 'system');
  }
}
