// ==========================================
// FILE: Email.gs
// ==========================================

/**
 * Sends the HTML confirmation email to a registrant
 */
function sendConfirmationEmail(regId) {
  try {
    var normalizedRegId = (regId || '').toString().trim();
    if (!normalizedRegId) {
      Logger.log('sendConfirmationEmail failed: missing registration ID');
      return { success: false, error: 'Missing registration ID', regId: regId };
    }

    var config = getConfig();
    var regResult = getRegistration(normalizedRegId);
    if (!regResult || !regResult.success || !regResult.registration) {
      var notFoundError = 'Registration not found';
      Logger.log('sendConfirmationEmail failed for ' + normalizedRegId + ': ' + notFoundError);
      logActivity('error', normalizedRegId, 'Confirmation email failed: ' + notFoundError, 'system');
      return { success: false, error: notFoundError, regId: normalizedRegId };
    }

    var reg = regResult.registration;
    var toEmail = (reg.email || '').toString().trim();
    if (!toEmail) {
      var missingEmailError = 'Missing email address on registration';
      Logger.log('sendConfirmationEmail failed for ' + normalizedRegId + ': ' + missingEmailError);
      logActivity('error', normalizedRegId, 'Confirmation email failed: ' + missingEmailError, 'system');
      return { success: false, error: missingEmailError, regId: normalizedRegId };
    }

    // Preserve existing EmailTemplate rendering path.
    var template = HtmlService.createTemplateFromFile('EmailTemplate');
    template.reg = reg;
    var emailBody = template.evaluate().getContent();

    GmailApp.sendEmail(
      toEmail,
      'Camp Meeting 2026 Confirmation - ' + normalizedRegId,
      'Your email client does not support HTML. Please view online.', // Fallback text
      {
        htmlBody: emailBody,
        name: 'Iowa-Missouri Conference',
        replyTo: config.admin_email || 'communication@imsda.org'
      }
    );

    logActivity('email_sent', normalizedRegId, 'Confirmation email sent to ' + toEmail, 'system');
    Logger.log('Email sent successfully to ' + toEmail + ' for ' + normalizedRegId);
    return { success: true, email: toEmail, regId: normalizedRegId };
  } catch (e) {
    var sendError = e && e.toString ? e.toString() : 'Unknown email error';
    Logger.log('Failed to send confirmation email for ' + regId + ': ' + sendError);
    logActivity('error', regId, 'Confirmation email failed: ' + sendError, 'system');
    return { success: false, error: sendError, regId: regId };
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
        replyTo: config.admin_email || 'communication@imsda.org'
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
 * Sends the dorm reminder email to a registrant
 */
function sendReminderEmail(regId) {
  var config = getConfig();
  var regResult = getRegistration(regId);

  if (!regResult.success) {
    Logger.log('Error: Registration not found for reminder email ' + regId);
    return { success: false, error: 'Registration not found' };
  }

  var reg = regResult.registration;

  var template = HtmlService.createTemplateFromFile('ReminderEmailTemplate');
  template.reg = reg;
  var emailBody = template.evaluate().getContent();

  try {
    GmailApp.sendEmail(
      reg.email,
      'Camp Meeting 2026 - See You Soon!',
      'Camp Meeting is almost here! Please view this email online for your check-in code.',
      {
        htmlBody: emailBody,
        name: 'Iowa-Missouri Conference',
        replyTo: config.admin_email || 'communication@imsda.org'
      }
    );

    logActivity('email_sent', regId, 'Reminder email sent to ' + reg.email, 'system');
    Logger.log('Reminder email sent successfully to ' + reg.email);
    return { success: true, email: reg.email };
  } catch (e) {
    Logger.log('Failed to send reminder email: ' + e.toString());
    logActivity('error', regId, 'Reminder email failed: ' + e.toString(), 'system');
    return { success: false, error: e.toString() };
  }
}

/**
 * Sends the RV reminder email to a registrant, including their RV slot number
 * from column J (array index 9) of the GuestDetails sheet.
 */
function sendRVReminderEmail(regId) {
  var config = getConfig();
  var regResult = getRegistration(regId);

  if (!regResult.success) {
    Logger.log('Error: Registration not found for RV reminder email ' + regId);
    return { success: false, error: 'Registration not found' };
  }

  var reg = regResult.registration;

  // Look up RV slot from GuestDetails column J (0-based index 9)
  var rvSlot = '';
  try {
    var ss = getSS();
    var guestSheet = ss.getSheetByName('GuestDetails');
    if (guestSheet) {
      var guestData = guestSheet.getDataRange().getValues();
      for (var i = 1; i < guestData.length; i++) {
        if (String(guestData[i][1]) === String(regId)) {
          rvSlot = String(guestData[i][9] || '');
          break;
        }
      }
    }
  } catch (e) {
    Logger.log('Error looking up RV slot for ' + regId + ': ' + e.toString());
  }

  var template = HtmlService.createTemplateFromFile('RVReminderEmailTemplate');
  template.reg = reg;
  template.rvSlot = rvSlot;
  var emailBody = template.evaluate().getContent();

  try {
    GmailApp.sendEmail(
      reg.email,
      'Camp Meeting 2026 - See You Soon!',
      'Camp Meeting is almost here! Your RV spot assignment is included. Please view this email online.',
      {
        htmlBody: emailBody,
        name: 'Iowa-Missouri Conference',
        replyTo: config.admin_email || 'communication@imsda.org'
      }
    );

    logActivity('email_sent', regId, 'RV reminder sent to ' + reg.email + ' (slot: ' + (rvSlot || 'none') + ')', 'system');
    Logger.log('RV reminder email sent successfully to ' + reg.email);
    return { success: true, email: reg.email, rvSlot: rvSlot };
  } catch (e) {
    Logger.log('Failed to send RV reminder email: ' + e.toString());
    logActivity('error', regId, 'RV reminder email failed: ' + e.toString(), 'system');
    return { success: false, error: e.toString() };
  }
}
