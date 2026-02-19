// ==========================================
// FILE: Operations.gs
// ==========================================

function checkInRegistration(data) {
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
      
      logActivity('check_in', data.regId, 'Guest checked in', 'admin_panel');
      return { success: true };
    }
  }
  return { success: false, error: 'Registration not found' };
}

function checkOutRegistration(data) {
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
  }
  return { success: false, error: 'Registration not found' };
}

function addToWaitlist(data) {
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
  
  return { success: true, waitlistId: id, position: position };
}