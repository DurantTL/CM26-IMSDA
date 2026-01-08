// ==========================================
// FILE: Config.gs
// ==========================================

function getConfig() {
  var ss = getSS(); // Uses helper from Utilities.gs
  var configSheet = ss.getSheetByName('Config');
  
  var data = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 2).getValues();
  
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