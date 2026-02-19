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
    
    housing.push({
      optionId: row[0],
      optionName: row[1],
      pricePerNight: row[2],
      totalCapacity: row[3],
      available: row[4],
      isUnlimited: row[8] === 'TRUE' || row[8] === true,
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
  var reservedCount = countReservations(optionId);
  var available = totalCapacity - reservedCount;

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
 * Helper to count confirmed/pending reservations manually
 * Prevents race conditions from stale sheet formulas
 */
function countReservations(housingOptionId) {
  var ss = getSS();
  var regSheet = ss.getSheetByName('Registrations');
  var data = regSheet.getDataRange().getValues();
  var count = 0;

  // Iterate registrations
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    // Column M (Index 12) is Housing Option
    // Column D (Index 3) is Status

    var opt = row[COLUMNS.HOUSING_OPTION];
    var status = row[COLUMNS.STATUS];

    if (opt === housingOptionId &&
       (status === 'confirmed' || status === 'pending' || status === 'deposit')) {
      count++;
    }
  }
  return count;
}
