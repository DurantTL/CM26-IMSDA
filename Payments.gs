// ==========================================
// FILE: Payments.gs
// ==========================================

function recordPayment(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy, please try again' };
  }

  try {
    var ss = getSS();
    var regSheet = ss.getSheetByName('Registrations');
    var paySheet = ss.getSheetByName('Payments');

    // 1. Find the registration first to ensure it exists
    var regData = regSheet.getDataRange().getValues();
    var regRowIndex = -1;
    var currentPaid = 0;
    var totalCharged = 0;

    for (var i = 1; i < regData.length; i++) {
      if (regData[i][COLUMNS.REG_ID] === data.regId) {
        regRowIndex = i;
        currentPaid = parseFloat(regData[i][COLUMNS.AMOUNT_PAID] || 0);
        totalCharged = parseFloat(regData[i][COLUMNS.TOTAL_CHARGED] || 0);
        break;
      }
    }

    if (regRowIndex === -1) {
      return { success: false, error: 'Registration not found: ' + data.regId };
    }

    // 2. Record the payment
    var payId = 'PAY-' + Utilities.getUuid();
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

    // 3. Update the registration balance atomically
    var newPaid = currentPaid + parseFloat(data.amount);
    var row = regRowIndex + 1;

    // Update Amount Paid
    regSheet.getRange(row, COLUMNS.AMOUNT_PAID + 1).setValue(newPaid);

    // Update Balance Due (Calculated field, but good to have explicit if stored)
    var balance = totalCharged - newPaid;
    regSheet.getRange(row, COLUMNS.BALANCE_DUE + 1).setValue(balance);

    // Update Payment Status
    var status = 'partial';
    if (newPaid >= totalCharged - 0.01) { // Tolerance for float math
      status = 'paid';
    }
    regSheet.getRange(row, COLUMNS.PAYMENT_STATUS + 1).setValue(status);

    logActivity('payment_recorded', data.regId, 'Payment: $' + data.amount, 'system');

    return { success: true, paymentId: payId };

  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
