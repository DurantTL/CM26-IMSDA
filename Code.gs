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

      case 'cancelRegistration':
        return jsonResponse(cancelRegistration(data));
        
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