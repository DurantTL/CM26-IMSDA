// ==========================================
// FILE: Payments.gs
// ==========================================

function recordPayment(data) {
  var ss = getSS(); // Uses helper
  var paySheet = ss.getSheetByName('Payments');
  var regSheet = ss.getSheetByName('Registrations');
  
  var payId = 'PAY-' + Utilities.getUuid().slice(0,8);
  
  paySheet.appendRow([
    payId,
    data.regId,
    new Date(),
    data.amount,
    data.method, 
    data.type,   
    data.transactionId,
    data.processedBy || 'system',
    data.notes || ''
  ]);
  
  var regData = regSheet.getDataRange().getValues();
  for (var i = 1; i < regData.length; i++) {
    if (regData[i][0] === data.regId) {
      var row = i + 1;
      var currentPaid = regData[i][27] || 0;
      var newPaid = currentPaid + parseFloat(data.amount);
      
      regSheet.getRange(row, 28).setValue(newPaid);
      
      var totalCharged = regData[i][26];
      var status = 'partial';
      if (newPaid >= totalCharged) status = 'paid';
      regSheet.getRange(row, 31).setValue(status); 
      break;
    }
  }
  
  return { success: true, paymentId: payId };
}