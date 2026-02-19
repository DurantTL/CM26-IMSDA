// ==========================================
// FILE: Code.gs
// ==========================================

function doGet(e) {
  var action = e.parameter.action || 'ping';
  
  try {
    switch(action) {
      case 'getAvailability':
        return jsonResponse(getAvailability());

      case 'getRegistration':
        return jsonResponse(getRegistration(e.parameter.id));
      
      case 'getGuestMeals':
        return jsonResponse(getGuestMeals(e.parameter.id));
        
      case 'getCheckInData':
        return jsonResponse(getCheckInData(e.parameter.id));

      case 'getArrivals':
        return jsonResponse(getArrivals(e.parameter.date));

      case 'getCheckInStats':
        return jsonResponse(getCheckInStats());

      case 'searchRegistrations':
        return jsonResponse(searchRegistrations(e.parameter.query));

      case 'ping':
        return jsonResponse({success: true, status: 'online'});
        
      default:
        return jsonResponse({error: 'Unknown action'}, 400);
    }
  } catch (error) {
    logActivity('error', 'system', 'doGet failed: ' + error.stack, 'api');
    return jsonResponse({error: 'Internal Server Error'}, 500);
  }
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return jsonResponse({error: 'No data provided'}, 400);
    }

    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    
    switch(action) {
      case 'submitRegistration':
        return jsonResponse(processRegistration(data));

      case 'cancelRegistration':
        return jsonResponse(cancelRegistration(data));
        
      case 'addToWaitlist':
        return jsonResponse(addToWaitlist(data));
        
      case 'redeemMeal':
        return jsonResponse(redeemMealTicket(data));
        
      case 'checkIn':
        return jsonResponse(processCheckIn(data));
        
      case 'checkOut':
        return jsonResponse(processCheckOut(data));
        
      case 'updatePayment':
        return jsonResponse(recordPayment(data));
        
      default:
        return jsonResponse({error: 'Unknown action: ' + action}, 400);
    }
  } catch (error) {
    logActivity('error', 'system', 'doPost failed: ' + error.stack, 'api');
    return jsonResponse({error: 'Internal Server Error'}, 500);
  }
}
