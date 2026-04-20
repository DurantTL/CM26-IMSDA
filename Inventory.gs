// ==========================================
// FILE: Inventory.gs
// ==========================================

function getAvailability() {
  var ss = getSS();
  var housingSheet = ss.getSheetByName('Housing');
  var housingData = housingSheet.getDataRange().getValues();
  
  var housing = [];
  
  for (var i = 1; i < housingData.length; i++) {
    var row = housingData[i];
    if (!row[0]) continue;
    
    var isUnlimited = row[8] === 'TRUE' || row[8] === true;
    var totalCapacity = row[3];
    var reservedByRegistrations = isUnlimited ? 0 : countReservations(row[0]);
    var reservedStaff = isUnlimited ? 0 : (Number(row[6]) || 0);
    var available = isUnlimited ? null : totalCapacity - reservedByRegistrations - reservedStaff;

    housing.push({
      optionId: row[0],
      optionName: row[1],
      pricePerNight: row[2],
      totalCapacity: totalCapacity,
      available: available,
      isUnlimited: isUnlimited,
      minNights: row[9],
      description: row[10],
      status: row[11]
    });
  }
  
  return {
    success: true,
    housing: housing,
    timestamp: new Date().toISOString()
  };
}

/**
 * Checks if inventory is available for the given option.
 * NOW INCLUDES:
 * 1. Min Nights check (Issue 14)
 * 2. Real-time counting to avoid formula lag race conditions (Issue 8)
 */
function checkAvailability(optionId, numUnits, numNights) {
  if (optionId === 'none') return { available: true };
  if (!numUnits) numUnits = 1;

  var ss = getSS();
  var housingSheet = ss.getSheetByName('Housing');
  var data = housingSheet.getDataRange().getValues();
  var housingRow = null;
  
  // 1. Find the Housing Option
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === optionId) {
      housingRow = data[i];
      break;
    }
  }
  
  if (!housingRow) {
    return { available: false, message: 'Housing option not found.' };
  }

  var optionName = housingRow[1];
  var totalCapacity = housingRow[3];
  var isUnlimited = housingRow[8] === 'TRUE' || housingRow[8] === true;
  var minNights = housingRow[9] || 0;
  var status = housingRow[11];

  // 2. Check Status
  if (status !== 'active') {
    return { available: false, message: 'This housing option is currently unavailable.' };
  }

  // 3. Check Minimum Nights (Issue 14)
  if (numNights && numNights < minNights) {
    return {
      available: false,
      message: optionName + ' requires a minimum of ' + minNights + ' nights.'
    };
  }

  // 4. Check Capacity
  if (isUnlimited) {
    return { available: true };
  }

  // Fix for Issue 8: Don't rely on cached formula column. Count manually.
  var reservedStaff = Number(housingRow[6]) || 0;
  var reservedCount = countReservations(optionId);
  var available = totalCapacity - reservedCount - reservedStaff;

  if (available >= numUnits) {
    return { available: true };
  } else {
    return {
      available: false,
      message: 'Only ' + Math.max(0, available) + ' ' + optionName + '(s) available.',
      currentAvailable: available
    };
  }
}

/**
 * Helper to count confirmed/pending reservations manually.
 * Prevents race conditions from stale sheet formulas.
 *
 * Reads only the two required columns (STATUS and HOUSING_OPTION) rather
 * than getDataRange() so that performance stays bounded as registrations grow.
 * Concurrency safety is provided by the script lock held in Registration.gs.
 */
function countReservations(housingOptionId) {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var lastRow = regSheet.getLastRow();

  if (lastRow < 2) return 0; // Header only — no registrations yet

  var numRows = lastRow - 1; // Exclude header row

  // getRange uses 1-based column indices; COLUMNS values are 0-based
  var housingValues = regSheet
    .getRange(2, COLUMNS.HOUSING_OPTION + 1, numRows, 1)
    .getValues();
  var statusValues = regSheet
    .getRange(2, COLUMNS.STATUS + 1, numRows, 1)
    .getValues();

  var count = 0;
  for (var i = 0; i < numRows; i++) {
    var opt    = housingValues[i][0];
    var status = normalizeRegistrationStatus(statusValues[i][0]);
    if (opt === housingOptionId &&
        (status === 'confirmed' || status === 'pending' || status === 'deposit')) {
      count++;
    }
  }
  return count;
}
