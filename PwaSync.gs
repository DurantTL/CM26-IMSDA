// ==========================================
// FILE: PwaSync.gs
// ==========================================

/**
 * Returns a full PWA sync snapshot so the Node server can cache lookups locally.
 * This keeps Google Apps Script off the hot path for every scan/search while still
 * allowing the server to refresh from the live spreadsheet on a short interval.
 */
function getPwaSyncData() {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var mealSheet = ss.getSheetByName('MealTickets');
  var regData = regSheet.getDataRange().getValues();
  var mealData = mealSheet.getDataRange().getValues();

  var ticketCountByRegId = {};
  var tickets = [];

  for (var i = 1; i < mealData.length; i++) {
    var mealRow = mealData[i];
    var ticketRegId = mealRow[1];
    if (!ticketRegId) continue;

    ticketCountByRegId[ticketRegId] = (ticketCountByRegId[ticketRegId] || 0) + 1;

    tickets.push({
      ticketId: mealRow[0],
      regId: ticketRegId,
      guestName: mealRow[2],
      mealType: mealRow[3],
      day: mealRow[4],
      date: mealRow[5],
      ticketType: mealRow[6],
      price: mealRow[7],
      redeemed: mealRow[8],
      redeemedAt: mealRow[9],
      redeemedBy: mealRow[10],
      dietary: mealRow[11]
    });
  }

  var registrations = [];
  var stats = {
    totalRegistrations: 0,
    checkedIn: 0,
    notArrived: 0,
    checkedOut: 0,
    keysOut: 0,
    depositsHeld: 0,
    balancesDue: 0
  };

  for (var j = 1; j < regData.length; j++) {
    var row = regData[j];
    var regId = row[COLUMNS.REG_ID];
    if (!regId) continue;

    var status = row[COLUMNS.STATUS];
    if (status === 'cancelled') continue;

    var guests = [];
    try {
      guests = JSON.parse(row[COLUMNS.GUEST_DETAILS] || '[]');
    } catch (guestError) {
      guests = [];
    }

    var registration = {
      regId: regId,
      createdAt: row[COLUMNS.CREATED_AT],
      regType: row[COLUMNS.REG_TYPE],
      status: status,
      name: row[COLUMNS.PRIMARY_NAME],
      email: row[COLUMNS.EMAIL],
      phone: row[COLUMNS.PHONE],
      church: row[COLUMNS.CHURCH],
      housingOption: row[COLUMNS.HOUSING_OPTION],
      nights: row[COLUMNS.NIGHTS],
      numNights: row[COLUMNS.NUM_NIGHTS],
      adultsCount: row[COLUMNS.ADULTS_COUNT],
      childrenCount: row[COLUMNS.CHILDREN_COUNT],
      totalGuests: row[COLUMNS.TOTAL_GUESTS],
      guests: guests,
      dietaryNeeds: row[COLUMNS.DIETARY_NEEDS],
      specialNeeds: row[COLUMNS.SPECIAL_NEEDS],
      totalCharged: row[COLUMNS.TOTAL_CHARGED],
      amountPaid: row[COLUMNS.AMOUNT_PAID],
      balanceDue: row[COLUMNS.BALANCE_DUE],
      paymentStatus: row[COLUMNS.PAYMENT_STATUS],
      roomAssignment: row[COLUMNS.ROOM_ASSIGNMENT],
      building: row[COLUMNS.BUILDING],
      key1Number: row[COLUMNS.KEY_1_NUMBER],
      key2Number: row[COLUMNS.KEY_2_NUMBER],
      keyDepositAmount: row[COLUMNS.KEY_DEPOSIT_AMOUNT],
      keyDepositPaid: row[COLUMNS.KEY_DEPOSIT_PAID],
      checkedIn: row[COLUMNS.CHECKED_IN],
      checkInTime: row[COLUMNS.CHECK_IN_TIME],
      checkedOut: row[COLUMNS.CHECKED_OUT],
      checkOutTime: row[COLUMNS.CHECK_OUT_TIME],
      mealTicketCount: ticketCountByRegId[regId] || 0
    };

    registrations.push(registration);

    stats.totalRegistrations++;

    if (registration.checkedIn === 'yes') {
      stats.checkedIn++;

      if (registration.checkedOut === 'yes') {
        stats.checkedOut++;
      } else {
        var key1Out = row[COLUMNS.KEY_DEPOSIT_PAID] === 'yes' && row[COLUMNS.KEY_1_RETURNED] !== 'yes';
        var key2Out = row[COLUMNS.KEY_DEPOSIT_PAID] === 'yes' && row[COLUMNS.KEY_2_RETURNED] !== 'yes';
        stats.keysOut += (key1Out ? 1 : 0) + (key2Out ? 1 : 0);

        if (row[COLUMNS.KEY_DEPOSIT_PAID] === 'yes' && row[COLUMNS.DEPOSIT_REFUNDED] !== 'yes') {
          stats.depositsHeld += row[COLUMNS.KEY_DEPOSIT_AMOUNT] || 0;
        }
      }
    } else {
      stats.notArrived++;
    }

    stats.balancesDue += row[COLUMNS.BALANCE_DUE] || 0;
  }

  return {
    success: true,
    syncedAt: new Date().toISOString(),
    registrations: registrations,
    tickets: tickets,
    stats: stats
  };
}
