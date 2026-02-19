/**
 * Test function for waitlist promotion and email
 * Run this in the Google Apps Script editor
 */
function testWaitlistPromotion() {
  var testName = "Test User " + new Date().getTime();
  var testEmail = Session.getEffectiveUser().getEmail();
  var testHousing = "dorm";

  // 1. Add to waitlist
  var waitlistResult = addToWaitlist({
    name: testName,
    email: testEmail,
    housingOption: testHousing,
    numGuests: 2,
    notes: "Test entry"
  });

  if (!waitlistResult.success) {
    Logger.log("Failed to add to waitlist: " + waitlistResult.error);
    return;
  }

  var waitlistId = waitlistResult.waitlistId;
  Logger.log("Added to waitlist with ID: " + waitlistId);

  // 2. Promote from waitlist
  var promoteResult = promoteFromWaitlist(waitlistId);

  if (promoteResult.success) {
    Logger.log("Successfully promoted from waitlist.");
    Logger.log("Name: " + promoteResult.name);
    Logger.log("Email: " + promoteResult.email);
    Logger.log("Expires At: " + promoteResult.expiresAt);
    Logger.log("Check your email and ActivityLog for confirmation.");
  } else {
    Logger.log("Failed to promote from waitlist: " + promoteResult.error);
  }
}
