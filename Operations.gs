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
      sheet.getRange(row, 41).setValue('yes'); 
      sheet.getRange(row, 42).setValue(new Date()); 
      
      if (data.room) sheet.getRange(row, 35).setValue(data.room);
      if (data.key) {
        sheet.getRange(row, 36).setValue(data.key);
        sheet.getRange(row, 37).setValue('yes'); 
        sheet.getRange(row, 38).setValue(new Date());
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
      sheet.getRange(row, 43).setValue('yes'); 
      sheet.getRange(row, 44).setValue(new Date());
      
      sheet.getRange(row, 39).setValue('yes'); 
      sheet.getRange(row, 40).setValue(new Date());
      
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