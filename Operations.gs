// ==========================================
// FILE: Operations.gs
// ==========================================

function checkInRegistration(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy, please try again' };
  }

  try {
    var ss = getSS();
    var sheet = ss.getSheetByName('Registrations');
    var rows = sheet.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
      if (rows[i][COLUMNS.REG_ID] === data.regId) {
        var row = i + 1;

        // Update checked_in status and time
        sheet.getRange(row, COLUMNS.CHECKED_IN + 1).setValue('yes');
        sheet.getRange(row, COLUMNS.CHECK_IN_TIME + 1).setValue(new Date());

        // Update room assignment if provided
        if (data.room) {
          sheet.getRange(row, COLUMNS.ROOM_ASSIGNMENT + 1).setValue(data.room);
        }

        // Update key assignment if provided
        if (data.key) {
          sheet.getRange(row, COLUMNS.KEY_1_NUMBER + 1).setValue(data.key);
        }

        logActivity('check_in', data.regId, 'Guest checked in', 'admin_panel');
        return { success: true };
      }
    }

    return { success: false, error: 'Registration not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function checkOutRegistration(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy, please try again' };
  }

  try {
    var ss = getSS();
    var sheet = ss.getSheetByName('Registrations');
    var rows = sheet.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
      if (rows[i][COLUMNS.REG_ID] === data.regId) {
        var row = i + 1;

        // Update checked_out status and time
        sheet.getRange(row, COLUMNS.CHECKED_OUT + 1).setValue('yes');
        sheet.getRange(row, COLUMNS.CHECK_OUT_TIME + 1).setValue(new Date());

        // Mark keys as returned
        sheet.getRange(row, COLUMNS.KEY_1_RETURNED + 1).setValue('yes');
        // Assuming key 2 is also returned if checked out, or logic handled elsewhere.
        // For simplicity matching previous intent:
        sheet.getRange(row, COLUMNS.KEY_2_RETURNED + 1).setValue('yes');

        logActivity('check_out', data.regId, 'Guest checked out', 'admin_panel');
        return { success: true };
      }
    }

    return { success: false, error: 'Registration not found' };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function addToWaitlist(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy, please try again' };
  }

  try {
    var ss = getSS();
    var sheet = ss.getSheetByName('Waitlist');

    // Waitlist columns:
    // A=0: ID
    // B=1: Date
    // C=2: Name
    // D=3: Email
    // E=4: Phone
    // F=5: Housing Option
    // G=6: Nights
    // H=7: Num Guests
    // I=8: Position
    // J=9: Status

    var existing = sheet.getDataRange().getValues();
    // Count existing waiting for this option
    var count = 0;
    for (var i = 1; i < existing.length; i++) {
      if (existing[i][5] === data.housingOption && existing[i][9] === 'waiting') {
        count++;
      }
    }
    var position = count + 1;

    var id = 'WL-' + Utilities.getUuid().slice(0,6);

    sheet.appendRow([
      id,
      new Date(),
      data.name,
      data.email,
      data.phone,
      data.housingOption,
      data.nights || 'all',
      data.numGuests,
      position,
      'waiting',
      '', // Offered At
      '', // Expires At
      data.notes || ''
    ]);

    logActivity('waitlist_add', id, 'Added to waitlist: ' + data.name, 'public_form');
    return { success: true, waitlistId: id, position: position };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
