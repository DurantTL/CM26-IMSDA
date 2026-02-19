// ==========================================
// FILE: MealTickets.gs (FIXED LOGIC)
// ==========================================

function createMealTickets(regId, data) {
  var lock = LockService.getScriptLock();
  try {
    // Wait for up to 30 seconds for other processes to finish.
    lock.waitLock(30000);
  } catch (e) {
    Logger.log('Could not obtain lock after 30 seconds.');
    return; // Or throw error
  }

  try {
    var ss = getSS();
    var ticketSheet = ss.getSheetByName('MealTickets');
    var config = getConfig();

    // Define Meal Schedules
    var mealDays = {
      breakfast: ['wed', 'thu', 'fri', 'sat'],
      lunch: ['wed', 'thu', 'fri'],
      supper: ['tue', 'wed', 'thu', 'fri', 'sat']
    };

    var mealDates = {
      tue: '2026-06-02',
      wed: '2026-06-03',
      thu: '2026-06-04',
      fri: '2026-06-05',
      sat: '2026-06-06'
    };

    var newTickets = [];
    var mealSelections = data.mealSelections || {};
    var guests = data.guests || [];
    var isStaff = data.regType === 'staff' || !!data.staffRole;

    // Separate guests
    var adults = guests.filter(function(g) { return !g.isChild; });
    var children = guests.filter(function(g) { return g.isChild; });

    // Fallback if no guests listed but primary registrant exists
    if (adults.length === 0 && guests.length === 0) {
      adults = [{ name: data.name || 'Guest', isChild: false }];
    }

    // 1. Calculate Starting ID Number - ATOMICALLY inside lock
    var lastRow = Math.max(ticketSheet.getLastRow(), 0);
    // If sheet is empty (only headers), lastRow might be 1.
    // We need to find the MAX ID from existing data if possible, or trust row count.
    // Row count is safe inside a lock.
    var idCounter = 1;

    // ------------------------------------------
    // PROCESS ADULT MEALS (DISTRIBUTED)
    // ------------------------------------------
    ['breakfast', 'lunch', 'supper'].forEach(function(mealType) {
      // Total tickets requested (e.g., 8)
      var count = parseInt(mealSelections[mealType] && mealSelections[mealType].adult) || 0;
      var availableDays = mealDays[mealType];
      var numGuests = adults.length || 1;
      var numDays = availableDays.length;

      // Loop exactly 'count' times (e.g., 8 times)
      for (var i = 0; i < count; i++) {

        // LOGIC: Distribute tickets across guests, then advance to next day
        // i=0 -> Guest 0, Day 0
        // i=1 -> Guest 1, Day 0
        // i=2 -> Guest 0, Day 1...

        var guestIndex = i % numGuests;
        var dayIndex = Math.floor(i / numGuests) % numDays;

        var guest = adults[guestIndex] || { name: 'Guest' };
        var day = availableDays[dayIndex];

        // Generate Unique ID
        var uniqueNum = lastRow + idCounter;
        var ticketId = 'MT-' + ('00000' + uniqueNum).slice(-5);
        idCounter++;

        var price = isStaff ? 0 : parseFloat(config['adult_' + mealType]) || 0;

        newTickets.push([
          ticketId,                      // A: ticket_id
          regId,                         // B: reg_id
          guest.name,                    // C: guest_name
          mealType,                      // D: meal_type
          day,                           // E: meal_day
          mealDates[day],                // F: meal_date
          'adult',                       // G: ticket_type
          price,                         // H: price
          'no',                          // I: redeemed
          '',                            // J: redeemed_at
          '',                            // K: redeemed_by
          data.dietaryNeeds || ''        // L: notes
        ]);
      }
    });

    // ------------------------------------------
    // PROCESS CHILD MEALS (DISTRIBUTED)
    // ------------------------------------------
    ['breakfast', 'lunch', 'supper'].forEach(function(mealType) {
      var count = parseInt(mealSelections[mealType] && mealSelections[mealType].child) || 0;
      var availableDays = mealDays[mealType];
      var numGuests = children.length || 1;
      var numDays = availableDays.length;

      // Only run if we actually have children tickets
      if(count > 0 && children.length === 0) {
          // Fallback if tickets bought but no child guest listed
          children = [{name: data.name + " (Child)"}];
          numGuests = 1;
      }

      for (var i = 0; i < count; i++) {
        var guestIndex = i % numGuests;
        var dayIndex = Math.floor(i / numGuests) % numDays;

        var guest = children[guestIndex];
        var day = availableDays[dayIndex];

        // Generate Unique ID
        var uniqueNum = lastRow + idCounter;
        var ticketId = 'MT-' + ('00000' + uniqueNum).slice(-5);
        idCounter++;

        var price = isStaff ? 0 : parseFloat(config['child_' + mealType]) || 0;

        newTickets.push([
          ticketId,                      // A
          regId,                         // B
          guest.name,                    // C
          mealType,                      // D
          day,                           // E
          mealDates[day],                // F
          'child',                       // G
          price,                         // H
          'no',                          // I
          '',                            // J
          '',                            // K
          data.dietaryNeeds || ''        // L
        ]);
      }
    });

    // ------------------------------------------
    // BATCH SAVE
    // ------------------------------------------
    if (newTickets.length > 0) {
      // Append rows
      ticketSheet.getRange(ticketSheet.getLastRow() + 1, 1, newTickets.length, newTickets[0].length)
                 .setValues(newTickets);
      
      // Flush to ensure data is written before lock is released (critical for race conditions)
      SpreadsheetApp.flush();
      
      logActivity('meals_created', regId, 'Created ' + newTickets.length + ' meal tickets', 'system');
    }
  } catch (e) {
    Logger.log('Error creating meal tickets: ' + e.toString());
    logActivity('error', regId, 'Failed to create meal tickets: ' + e.toString(), 'system');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Redeem a single meal ticket (called by scanner)
 */
function redeemMealTicket(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return { success: false, error: 'System busy, please try again' };
  }
  
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName('MealTickets');
    var tickets = sheet.getDataRange().getValues();
    var ticketId = data.ticketId;
    
    for (var i = 1; i < tickets.length; i++) {
      if (tickets[i][0] === ticketId) {
        // Check if already redeemed
        if (tickets[i][8] === 'yes') {
          var redeemedAt = tickets[i][9];
          var formattedDate = (redeemedAt instanceof Date) ? 
            Utilities.formatDate(redeemedAt, Session.getScriptTimeZone(), "MM/dd hh:mm a") : redeemedAt;

          return { 
            success: false, 
            error: 'ALREADY_REDEEMED', 
            redeemedAt: formattedDate,
            guestName: tickets[i][2],
            mealType: tickets[i][3]
          };
        }
        
        var row = i + 1;
        sheet.getRange(row, 9).setValue('yes');          // redeemed = yes
        sheet.getRange(row, 10).setValue(new Date());    // redeemed_at
        sheet.getRange(row, 11).setValue(data.volunteer || 'scanner'); // redeemed_by
        
        SpreadsheetApp.flush(); // Ensure write happens

        logActivity('meal_scan', tickets[i][1], 'Meal redeemed: ' + ticketId + ' for ' + tickets[i][2], 'scanner');
        
        return { 
          success: true, 
          message: 'Ticket Valid - Enjoy your meal!', 
          guestName: tickets[i][2],
          mealType: tickets[i][3],
          ticketType: tickets[i][6],
          dietary: tickets[i][11]
        };
      }
    }
    
    return { success: false, error: 'INVALID_TICKET' };
    
  } finally {
    lock.releaseLock();
  }
}

/**
 * Get all meal tickets for a registration
 */
function getGuestMeals(regId) {
  var ss = getSS();
  var sheet = ss.getSheetByName('MealTickets');
  var data = sheet.getDataRange().getValues();
  
  var tickets = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === regId) {
      tickets.push({
        ticketId: data[i][0],
        guestName: data[i][2],
        mealType: data[i][3],
        day: data[i][4],
        date: data[i][5],
        ticketType: data[i][6],
        price: data[i][7],
        redeemed: data[i][8],
        redeemedAt: data[i][9],
        redeemedBy: data[i][10],
        dietary: data[i][11]
      });
    }
  }
  
  var regSheet = ss.getSheetByName('Registrations');
  var regData = regSheet.getDataRange().getValues();
  var regInfo = null;
  
  for (var j = 1; j < regData.length; j++) {
    if (regData[j][0] === regId) {
      regInfo = {
        regId: regData[j][0],
        name: regData[j][4],
        email: regData[j][5],
        housing: regData[j][12],
        totalGuests: regData[j][18],
        dietaryNeeds: regData[j][21]
      };
      break;
    }
  }
  
  if (!regInfo) {
    return { success: false, error: 'Registration not found' };
  }
  
  return {
    success: true,
    registration: regInfo,
    tickets: tickets,
    ticketCount: tickets.length,
    redeemedCount: tickets.filter(function(t) { return t.redeemed === 'yes'; }).length
  };
}

/**
 * Get tickets for current meal service only
 */
function getCurrentMealTickets(regId, mealType, day) {
  var ss = getSS();
  var sheet = ss.getSheetByName('MealTickets');
  var data = sheet.getDataRange().getValues();
  
  var tickets = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === regId && data[i][3] === mealType && data[i][4] === day) {
      tickets.push({
        ticketId: data[i][0],
        guestName: data[i][2],
        ticketType: data[i][6],
        redeemed: data[i][8],
        dietary: data[i][11]
      });
    }
  }
  
  return {
    success: true,
    mealType: mealType,
    day: day,
    tickets: tickets
  };
}

/**
 * Bulk redeem all tickets for a registration/meal
 */
function bulkRedeemMeals(regId, mealType, day, volunteer) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'System busy' };
  }
  
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName('MealTickets');
    var data = sheet.getDataRange().getValues();
    var redeemed = 0;
    var alreadyRedeemed = 0;
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === regId && data[i][3] === mealType && data[i][4] === day) {
        if (data[i][8] === 'yes') {
          alreadyRedeemed++;
        } else {
          var row = i + 1;
          sheet.getRange(row, 9).setValue('yes');
          sheet.getRange(row, 10).setValue(new Date());
          sheet.getRange(row, 11).setValue(volunteer || 'bulk_scan');
          redeemed++;
        }
      }
    }
    
    if (redeemed > 0) {
      SpreadsheetApp.flush();
      logActivity('bulk_meal_scan', regId, 'Bulk redeemed ' + redeemed + ' tickets for ' + mealType + ' ' + day, 'scanner');
    }
    
    return {
      success: true,
      redeemed: redeemed,
      alreadyRedeemed: alreadyRedeemed,
      message: 'Redeemed ' + redeemed + ' tickets' + (alreadyRedeemed > 0 ? ' (' + alreadyRedeemed + ' already used)' : '')
    };
    
  } finally {
    lock.releaseLock();
  }
}
