// ==========================================
// FILE: Code.gs
// ==========================================

function doGet(e) {
  var action = e.parameter.action || 'ping';
  
  try {
    switch(action) {
      case 'getAvailability':
        return jsonResponse(getAvailability());
      
      case 'getGuestMeals':
        return jsonResponse(getGuestMeals(e.parameter.id));
        
      case 'ping':
        return jsonResponse({success: true, status: 'online'});
        
      default:
        return jsonResponse({error: 'Unknown action'}, 400);
    }
  } catch (error) {
    return jsonResponse({error: error.toString()}, 500);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    
    switch(action) {
      case 'submitRegistration':
        return jsonResponse(processRegistration(data));
        
      case 'addToWaitlist':
        return jsonResponse(addToWaitlist(data));
        
      case 'redeemMeal':
        return jsonResponse(redeemMealTicket(data));
        
      case 'checkIn':
        return jsonResponse(checkInRegistration(data));
        
      case 'checkOut':
        return jsonResponse(checkOutRegistration(data));
        
      case 'updatePayment':
        return jsonResponse(recordPayment(data));
        
      default:
        return jsonResponse({error: 'Unknown action: ' + action}, 400);
    }
  } catch (error) {
    return jsonResponse({error: 'System Error: ' + error.toString()}, 500);
  }
}
function testConnection() {
  try {
    var ss = getSS(); // This uses your ID from Utilities.gs
    Logger.log("Success! Connected to: " + ss.getName());
  } catch (e) {
    Logger.log("FAILED: " + e.toString());
  }
}
function testDoGet() {
  // Simulate a browser request asking for availability
  var e = {
    parameter: {
      action: 'getAvailability'
    }
  };
  
  // Call the real function with our fake data
  var result = doGet(e);
  
  // Log the result to the console
  Logger.log(result.getContent());
}