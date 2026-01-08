// ==========================================
// FILE: Inventory.gs
// ==========================================

function getAvailability() {
  var ss = getSS(); // Uses helper
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

function checkAvailability(optionId, numUnits) {
  if (optionId === 'none') return { available: true };

  var ss = getSS(); // Uses helper
  var housingSheet = ss.getSheetByName('Housing');
  var data = housingSheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === optionId) {
      var isUnlimited = data[i][8] === 'TRUE' || data[i][8] === true;
      var available = data[i][4];
      
      if (isUnlimited) {
        return { available: true };
      }
      
      if (available >= numUnits) {
        return { available: true };
      } else {
        return {
          available: false,
          message: 'Only ' + available + ' ' + data[i][1] + '(s) available.',
          currentAvailable: available
        };
      }
    }
  }
  
  return { available: false, message: 'Housing option not found.' };
}