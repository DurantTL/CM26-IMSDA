// ==========================================
// FILE: Config.gs
// ==========================================

function getConfig() {
  var ss = getSS(); // Uses helper from Utilities.gs
  var configSheet = ss.getSheetByName('Config');
  if (!configSheet) {
    Logger.log('Error: "Config" sheet not found.');
    return {};
  }

  var lastRow = configSheet.getLastRow();
  if (lastRow <= 1) return {};
  
  var data = configSheet.getRange(2, 1, lastRow - 1, 2).getValues();
  
  var config = {};
  for (var i = 0; i < data.length; i++) {
    var key = data[i][0];
    var value = data[i][1];
    if (key) {
      config[key] = value;
    }
  }
  return config;
}