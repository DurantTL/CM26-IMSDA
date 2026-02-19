// ==========================================
// FILE: Operations.gs
// ==========================================

function checkInRegistration(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy, please try again' };
  }

  try {
    var ss = getSS(); // Uses helper
    var sheet = ss.getSheetByName('Registrations');
    var rows = sheet.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.regId) {
        var row = i + 1;

        // AS: checked_in (Index 44) -> Column 45
        sheet.getRange(row, 45).setValue('yes');
        // AT: check_in_time (Index 45) -> Column 46
        sheet.getRange(row, 46).setValue(new Date());

        // AI: room_assignment (Index 34) -> Column 35
        if (data.room) sheet.getRange(row, 35).setValue(data.room);

        if (data.key) {
          // AK: key_1_number (Index 36) -> Column 37
          sheet.getRange(row, 37).setValue(data.key);
        }

        logActivity('check_in', data.regId, 'Guest checked in', 'admin_panel');
        lock.releaseLock();
        return { success: true };
  var ss = getSS(); // Uses helper
  var sheet = ss.getSheetByName('Registrations');
  var rows = sheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.regId) {
      var row = i + 1;
      // Batch update check-in status (columns 41-42)
      sheet.getRange(row, 41, 1, 2).setValues([['yes', new Date()]]);
      
      if (data.room || data.key) {
        // Batch update room and key info (columns 35-38)
        var roomKeyValues = [rows[i].slice(34, 38)];
        if (data.room) roomKeyValues[0][0] = data.room;
        if (data.key) {
          roomKeyValues[0][1] = data.key;
          roomKeyValues[0][2] = 'yes';
          roomKeyValues[0][3] = new Date();
        }
        sheet.getRange(row, 35, 1, 4).setValues(roomKeyValues);
      }
    }

    lock.releaseLock();
    return { success: false, error: 'Registration not found' };
  } catch (e) {
    lock.releaseLock();
    return { success: false, error: e.toString() };
  }
}

function checkOutRegistration(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy, please try again' };
  }

  try {
    var ss = getSS(); // Uses helper
    var sheet = ss.getSheetByName('Registrations');
    var rows = sheet.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.regId) {
        var row = i + 1;

        // AW: checked_out (Index 48) -> Column 49
        sheet.getRange(row, 49).setValue('yes');
        // AX: check_out_time (Index 49) -> Column 50
        sheet.getRange(row, 50).setValue(new Date());

        // AO: key_1_returned (Index 40) -> Column 41
        // Mark key 1 as returned if checking out
        sheet.getRange(row, 41).setValue('yes');

        logActivity('check_out', data.regId, 'Guest checked out', 'admin_panel');
        lock.releaseLock();
        return { success: true };
      }
  var ss = getSS(); // Uses helper
  var sheet = ss.getSheetByName('Registrations');
  var rows = sheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.regId) {
      var row = i + 1;
      // Batch update check-out status (columns 43-44)
      sheet.getRange(row, 43, 1, 2).setValues([['yes', new Date()]]);
      
      // Batch update key status (columns 39-40)
      sheet.getRange(row, 39, 1, 2).setValues([['yes', new Date()]]);
      
      logActivity('check_out', data.regId, 'Guest checked out', 'admin_panel');
      return { success: true };
    }

    lock.releaseLock();
    return { success: false, error: 'Registration not found' };
  } catch (e) {
    lock.releaseLock();
    return { success: false, error: e.toString() };
  }
}

function addToWaitlist(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy, please try again' };
  }

  try {
    var ss = getSS(); // Uses helper
    var sheet = ss.getSheetByName('Waitlist');

    var position = 1;
    var existing = sheet.getDataRange().getValues();
    var count = existing.filter(function(r) { return r[5] === data.housingOption && r[9] === 'waiting'; }).length;
    position = count + 1;

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
      '',
      '',
      data.notes || ''
    ]);

    lock.releaseLock();
    return { success: true, waitlistId: id, position: position };
  } catch (e) {
    lock.releaseLock();
    return { success: false, error: e.toString() };
  }
}
