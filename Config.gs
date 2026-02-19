// ==========================================
// FILE: Config.gs
// ==========================================

var _configCache = null;

function getConfig() {
  // 1. Check Memory Cache (for same execution)
  if (_configCache) return _configCache;

  // 2. Check Script Cache (for repeated executions)
  var cache = CacheService.getScriptCache();
  var cachedJSON = cache.get('app_config');

  if (cachedJSON) {
    _configCache = JSON.parse(cachedJSON);
    return _configCache;
  }

  // 3. Fetch from Sheet
  var ss = getSS();
  var configSheet = ss.getSheetByName('Config');
  if (!configSheet) {
    console.error('Error: "Config" sheet not found.');
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

  // 4. Save to Cache (expires in 10 minutes)
  try {
    cache.put('app_config', JSON.stringify(config), 600);
  } catch(e) {
    console.warn('Config cache failed: ' + e.message);
  }

  _configCache = config;
  return config;
}

/**
 * Clear config cache (call this when updating config sheet)
 */
function clearConfigCache() {
  CacheService.getScriptCache().remove('app_config');
  _configCache = null;
}
