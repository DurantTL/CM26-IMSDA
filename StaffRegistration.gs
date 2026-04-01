// ==========================================
// FILE: StaffRegistration.gs
// ==========================================
// PURPOSE: Handles staff/pastor/volunteer registrations from Google Form
// 
// SETUP INSTRUCTIONS:
// 1. Create a Google Form with these questions (see planning doc Section 5)
// 2. Link this script to that Form
// 3. Add trigger: Resources > Triggers > Add > onStaffFormSubmit > On form submit

/**
 * Main form submit handler
 * Triggered automatically when someone submits the staff registration form
 */
function onStaffFormSubmit(e) {
  try {
    var responses = e.namedValues;
    // Fallback: when triggered from a sheet-bound script, e.response
    // may be provided instead of e.namedValues
    if (!responses && e.response) {
      responses = {};
      var itemResponses = e.response.getItemResponses();
      for (var r = 0; r < itemResponses.length; r++) {
        var ir = itemResponses[r];
        responses[ir.getItem().getTitle()] = [ir.getResponse()];
      }
    }
    // Email is a form setting, not a question item — pull it separately
    if (e.response && (!responses['Email'] || !responses['Email'][0])) {
      responses['Email'] = [e.response.getRespondentEmail()];
    }
    // Safety net
    if (!responses) {
      Logger.log('No responses found in event object: ' + JSON.stringify(e));
      return { success: false, error: 'No form response data received.' };
    }

    // Parse guest list first (attendance-aware) so counts and meals are derived from it
    var guests = parseGuestDetails(responses['Family Members Attending'] ? responses['Family Members Attending'][0] : '');
    var spouseVolunteering = responses['Is your spouse interested in volunteering at Camp Meeting 2026?']
      ? String(responses['Is your spouse interested in volunteering at Camp Meeting 2026?'][0]).trim().toLowerCase() === 'yes'
      : false;
    var spouseName = responses['Spouse\'s Full Name'] ? responses['Spouse\'s Full Name'][0] : '';
    var spouseAutoAdded = ensureSpouseVolunteerGuest(guests, spouseVolunteering, spouseName);

    // Derive party counts from parsed guest list
    // Primary registrant is always counted as an adult (+1)
    var adultsCount = 1;
    var childrenCount = 0;
    for (var g = 0; g < guests.length; g++) {
      if (guests[g].isChild === false) {
        adultsCount++;
      } else {
        childrenCount++;
      }
    }

    // Build data object from form responses
    var data = {
      action: 'submitRegistration',
      regType: 'staff',

      // Basic info
      staffRole: responses['Your Role'] ? responses['Your Role'][0] : 'Staff',
      name: responses['Full Name'] ? responses['Full Name'][0] : '',
      email: responses['Email'] ? responses['Email'][0] : '',
      phone: responses['Phone'] ? responses['Phone'][0] : '',

      // Housing — all workers attend the full event (June 2–6)
      housingOption: mapHousingOption(responses['Housing Preference'] ? responses['Housing Preference'][0] : ''),
      nights: 'tue,wed,thu,fri,sat',
      numNights: 5,

      // Party composition (derived from parsed guest list)
      adultsCount: adultsCount,
      childrenCount: childrenCount,

      // Guest list
      guests: guests,

      // Notes
      dietaryNeeds: responses['Dietary Restrictions'] ? responses['Dietary Restrictions'][0] : '',
      specialNeeds: responses['Special Needs/Requests'] ? responses['Special Needs/Requests'][0] : '',
      specialRequests: responses['Special Requests (Requires Administration Approval)'] ? responses['Special Requests (Requires Administration Approval)'][0] : '',

      // Staff = free
      paymentMethod: 'free',
      paymentStatus: 'paid',
      totalCharged: 0,
      subtotal: 0,
      processingFee: 0,
      housingSubtotal: 0,
      mealSubtotal: 0,

      // Spouse volunteer interest
      spouseVolunteering: spouseVolunteering,
      spouseName: spouseName,
      spouseDepartments: responses['Preferred Volunteer Department(s)'] ? responses['Preferred Volunteer Department(s)'][0] : '',
      spouseDepartmentOther: responses['Other Department (if selected above)'] ? responses['Other Department (if selected above)'][0] : '',

      // Metadata
      submittedAt: new Date().toISOString()
    };

    // Calculate total guests
    data.totalGuests = data.adultsCount + data.childrenCount;

    // Add one aggregated parser warning note for admin review
    var warningNote = guests._adminWarning || '';
    if (spouseAutoAdded) {
      warningNote = warningNote
        ? warningNote + ' | Spouse auto-added for attendance/meals'
        : 'Spouse auto-added for attendance/meals';
    }
    if (warningNote) {
      data.specialNeeds = data.specialNeeds
        ? data.specialNeeds + ' | ' + warningNote
        : warningNote;
    }

    // Always insert the primary registrant at the front of the guest list
    data.guests.unshift({
      name: data.name,
      age: 30,
      isChild: false,
      attendanceType: 'full',
      attendanceRaw: 'Full Time',
      attendanceDays: ['tue', 'wed', 'thu', 'fri', 'sat']
    });

    // Build attendance-aware meal selections from the full parsed guest list
    // (primary registrant + all parsed family guests)
    data.mealSelections = buildStaffMealSelections(data.guests);

    // Child ministry class distribution (config-driven age brackets from Config sheet)
    // Admin can adjust class ranges in Config without code changes.
    data.childClassCounts = buildChildClassCounts(data.guests);
    
    // Deduplication Check
    if (data.email) {
      var ss = getSS();
      var regSheet = ss.getSheetByName("Registrations");
      var regData = regSheet.getDataRange().getValues();
      for (var i = 1; i < regData.length; i++) {
        if (regData[i][COLUMNS.EMAIL] === data.email && regData[i][COLUMNS.STATUS] !== "cancelled") {
           Logger.log("Duplicate staff registration blocked for " + data.email);
           sendStaffRegFailureNotification(data, "Duplicate email: " + data.email);
           return { success: false, error: "Email already registered." };
        }
      }
    }
    // Process the registration using the main registration function
    var result = processRegistration(data);
    
    if (result.success) {
      Logger.log('Staff registration successful: ' + result.registrationId);
      // Email is sent by processRegistration
      if (data.spouseVolunteering && data.spouseName) {
        writeVolunteerRecord(data, result.registrationId);
      }
    } else {
      Logger.log('Staff registration failed: ' + result.error);
      // Send notification to admin about failure
      sendStaffRegFailureNotification(data, result.error);
    }
    
    return result;
    
  } catch (error) {
    Logger.log('Staff form processing error: ' + error.toString());
    logActivity('error', 'staff_form', error.toString(), 'form');
    return { success: false, error: error.toString() };
  }
}

function normalizeGuestName_(value) {
  return (value || '').toString().trim().toLowerCase();
}

function guestNameMatches_(guest, normalizedName) {
  if (!guest || !normalizedName) return false;
  return normalizeGuestName_(guest.name) === normalizedName;
}

/**
 * Ensures spouse volunteer is represented in the parsed guest list.
 * Returns true when a spouse guest row was injected.
 */
function ensureSpouseVolunteerGuest(guests, spouseVolunteering, spouseName) {
  if (!spouseVolunteering || !Array.isArray(guests)) return false;

  var normalizedSpouseName = normalizeGuestName_(spouseName);
  var spouseAlreadyListed = false;
  if (normalizedSpouseName) {
    for (var i = 0; i < guests.length; i++) {
      if (guestNameMatches_(guests[i], normalizedSpouseName)) {
        spouseAlreadyListed = true;
        break;
      }
    }
  }
  if (spouseAlreadyListed) return false;

  guests.push({
    name: spouseName || 'Spouse',
    age: 30,
    isChild: false,
    attendanceType: 'full',
    attendanceRaw: 'Full Time (Auto-added spouse volunteer)',
    attendanceDays: getCampMeetingDays(),
    isAutoAddedSpouse: true,
    relationship: 'spouse'
  });
  return true;
}

/**
 * Map friendly housing names to option IDs
 */
function mapHousingOption(selection) {
  var map = {
    'Dorm Room': 'dorm',
    'RV/Camper Hookup': 'rv',
    'Tent Campsite': 'tent',
    'No Housing Needed': 'none',
    'Special Requests (Requires Administration Approval)': 'none'
  };
  return map[selection] || 'none';
}

/**
 * Canonical camp meeting days used for attendance and meal calculations.
 */
function getCampMeetingDays() {
  return ['tue', 'wed', 'thu', 'fri', 'sat'];
}

/**
 * Parse guest details from free-text input.
 * Supports:
 *   - One per line: "Name, Age, Attendance"
 *   - Backward compatible: "Name, Age" or "Name Age"
 *   - Legacy comma-only names: "Name One, Name Two"
 */
function parseGuestDetails(text) {
  if (!text) return [];

  var guests = [];
  guests._attendanceWarnings = [];
  guests._adminWarning = '';

  var raw = String(text).replace(/\r/g, '').trim();
  if (!raw) return guests;

  var lines = raw.split('\n');

  // Preprocess single-line comma-separated segments like:
  // "John Smith 8, Jane Smith 35, Baby Smith 1"
  // If every segment parses as a valid guest line, use that structured result.
  if (lines.length === 1 && raw.indexOf(',') !== -1) {
    var singleLineParts = raw.split(/,\s*/).map(function(part) { return part.trim(); }).filter(function(part) { return !!part; });
    if (singleLineParts.length > 1) {
      var singleLineGuests = [];
      var allValid = true;
      for (var sl = 0; sl < singleLineParts.length; sl++) {
        var parsedPart = parseGuestLine(singleLineParts[sl]);
        if (!parsedPart || !parsedPart.name) {
          allValid = false;
          break;
        }
        var parsedAttendance = parseAttendanceDetails(parsedPart.attendanceRaw);
        if (parsedAttendance.attendanceType === 'unknown') {
          guests._attendanceWarnings.push(parsedPart.name + ' ("' + (parsedPart.attendanceRaw || 'blank') + '")');
          parsedAttendance.attendanceDays = getCampMeetingDays();
        }
        if (parsedPart.warningMissingAge) {
          guests._missingAgeWarnings = guests._missingAgeWarnings || [];
          guests._missingAgeWarnings.push(parsedPart.name);
        }
        singleLineGuests.push({
          name: parsedPart.name,
          age: parsedPart.age,
          isChild: parsedPart.age < 18,
          attendanceType: parsedAttendance.attendanceType,
          attendanceRaw: parsedAttendance.attendanceRaw,
          attendanceDays: parsedAttendance.attendanceDays,
          parserConfidence: parsedPart.parserConfidence || 'high',
          parserWarnings: parsedPart.parserWarnings || []
        });
      }
      if (allValid && singleLineGuests.length === singleLineParts.length) {
        Array.prototype.push.apply(guests, singleLineGuests);
      }
    }
    if (guests.length > 0) {
      var preWarningParts = [];
      if (guests._missingAgeWarnings && guests._missingAgeWarnings.length > 0) {
        preWarningParts.push('Missing age for: ' + guests._missingAgeWarnings.join(', '));
      }
      if (guests._attendanceWarnings.length > 0) {
        preWarningParts.push('Unrecognized attendance for: ' + guests._attendanceWarnings.join(', '));
      }
      guests._adminWarning = preWarningParts.join(' | ');
      return guests;
    }
  }

  // Legacy fallback: comma-separated names with no line breaks (no attendance data)
  if (lines.length === 1 && raw.indexOf(',') !== -1) {
    var commaParts = raw.split(',');
    var hasLikelyAttendance = /\b(full|weekend|sabbath|tue|wed|thu|fri|sat|only|all week|full time)\b/i.test(raw);
    if (!hasLikelyAttendance && commaParts.length > 2) {
      for (var lp = 0; lp < commaParts.length; lp++) {
        var legacyName = commaParts[lp].trim();
        if (legacyName) {
          guests.push({
            name: legacyName,
            age: 30,
            isChild: false,
            attendanceType: 'full',
            attendanceRaw: 'Full Time',
            attendanceDays: getCampMeetingDays()
          });
        }
      }
      return guests;
    }
  }

  // Legacy fallback: "Name Age Name Age" in a single line
  // Only run this when the line does not look like attendance-aware input.
  if (lines.length === 1 && raw.indexOf(',') === -1) {
    var ageMatches = raw.match(/\b\d{1,3}\b/g);
    var hasMultipleAges = ageMatches && ageMatches.length > 1;
    var hasLikelyAttendanceText = /\b(full|weekend|sabbath|sat|fri|thu|wed|tue|only|all week|full time)\b/i.test(raw);
    if (hasMultipleAges && !hasLikelyAttendanceText) {
      var legacyGuests = parseLegacyAgeBlob(raw);
      if (legacyGuests.length > 0) {
        return legacyGuests;
      }
    }
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var parsed = parseGuestLine(line);
    if (!parsed || !parsed.name) continue;

    var attendance = parseAttendanceDetails(parsed.attendanceRaw);

    // Unknown attendance does not block registration.
    // Keep attendanceType='unknown' for audit, but default meal/day handling to full time.
    if (attendance.attendanceType === 'unknown') {
      guests._attendanceWarnings.push(parsed.name + ' ("' + (parsed.attendanceRaw || 'blank') + '")');
      attendance.attendanceDays = getCampMeetingDays();
    }

    if (parsed.warningMissingAge) {
      guests._missingAgeWarnings = guests._missingAgeWarnings || [];
      guests._missingAgeWarnings.push(parsed.name);
    }

    guests.push({
      name: parsed.name,
      age: parsed.age,
      isChild: parsed.age < 18,
      attendanceType: attendance.attendanceType,
      attendanceRaw: attendance.attendanceRaw,
      attendanceDays: attendance.attendanceDays,
      parserConfidence: parsed.parserConfidence || 'high',
      parserWarnings: parsed.parserWarnings || []
    });

    Logger.log(
      '[parseGuestDetails] line="' + line +
      '" | name="' + parsed.name +
      '" | age=' + parsed.age +
      ' | attendanceRaw="' + parsed.attendanceRaw +
      '" | attendanceType="' + attendance.attendanceType +
      '" | warning="' + (parsed.warningText || (attendance.attendanceType === 'unknown' ? 'unrecognized attendance' : '')) + '"'
    );
  }

  var warningParts = [];
  if (guests._missingAgeWarnings && guests._missingAgeWarnings.length > 0) {
    warningParts.push('Missing age for: ' + guests._missingAgeWarnings.join(', '));
  }
  if (guests._attendanceWarnings.length > 0) {
    warningParts.push('Unrecognized attendance for: ' + guests._attendanceWarnings.join(', '));
  }
  var lowConfidenceNames = [];
  for (var lw = 0; lw < guests.length; lw++) {
    if (guests[lw].parserConfidence === 'low') {
      lowConfidenceNames.push(guests[lw].name);
    }
  }
  if (lowConfidenceNames.length > 0) {
    warningParts.push('Parser review suggested for: ' + lowConfidenceNames.join(', '));
  }
  guests._adminWarning = warningParts.join(' | ');

  return guests;
}

/**
 * Legacy parser for compact guest blobs like:
 * "Caleb Durant 29 Cashmere Durant 29 Mark Durant 5"
 */
function parseLegacyAgeBlob(text) {
  var guests = [];
  var tokens = String(text).split(/\s+/);
  var nameTokens = [];

  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];
    if (!token) continue;

    if (/^\d+$/.test(token)) {
      if (nameTokens.length > 0) {
        var legacyName = nameTokens.join(' ').trim();
        var legacyAge = parseInt(token, 10);
        if (legacyName) {
          guests.push({
            name: legacyName,
            age: legacyAge,
            isChild: legacyAge < 18,
            attendanceType: 'full',
            attendanceRaw: 'Full Time',
            attendanceDays: getCampMeetingDays()
          });
        }
        nameTokens = [];
      }
    } else {
      nameTokens.push(token);
    }
  }

  // Remaining tokens without age -> treat as one adult
  if (nameTokens.length > 0) {
    guests.push({
      name: nameTokens.join(' '),
      age: 30,
      isChild: false,
      attendanceType: 'full',
      attendanceRaw: 'Full Time',
      attendanceDays: getCampMeetingDays()
    });
  }

  // Only use this parser when at least one explicit age was found.
  var hasExplicitAge = false;
  for (var g = 0; g < guests.length; g++) {
    if (guests[g].age !== 30) {
      hasExplicitAge = true;
      break;
    }
  }

  return hasExplicitAge ? guests : [];
}

/**
 * Parse one guest row into name/age/raw attendance text.
 */
function parseGuestLine(line) {
  var result = {
    name: '',
    age: 30,
    attendanceRaw: 'Full Time',
    warningMissingAge: false,
    warningText: '',
    parserConfidence: 'high',
    parserWarnings: []
  };

  var normalizedLine = normalizeGuestInputLine(line);
  if (!normalizedLine) return result;

  // Primary rule for tolerant parsing:
  // find the LAST standalone 1-3 digit age token; name is before, attendance is after.
  var ageMatch = findLastAgeTokenInLine(normalizedLine);
  if (ageMatch && ageMatch.value !== null) {
    result.name = normalizedLine.slice(0, ageMatch.index).replace(/,\s*$/, '').trim();
    result.age = ageMatch.value;
    result.attendanceRaw = normalizedLine.slice(ageMatch.index + ageMatch.length).replace(/^,\s*/, '').trim() || 'Full Time';
    if (!result.name) {
      result.name = normalizedLine.trim();
      result.warningMissingAge = true;
      result.warningText = 'unable to split name from age';
      result.parserWarnings.push('unable to split name from age');
      result.parserConfidence = 'low';
    }
    return result;
  }

  // Comma fallback if age was not detected:
  // - Name, Attendance (legacy no-age form)
  if (normalizedLine.indexOf(',') !== -1) {
    var parts = normalizedLine.split(',');
    if (parts.length >= 2) {
      result.name = parts[0].trim();

      var ageCandidate = parseInt(parts[1], 10);
      if (!isNaN(ageCandidate)) {
        result.age = ageCandidate;
      }

      if (parts.length >= 3) {
        result.attendanceRaw = parts.slice(2).join(',').trim();
      } else {
        result.attendanceRaw = 'Full Time';
      }

      // Backward compatibility: "Name, Attendance" (no age)
      if (isNaN(ageCandidate) && parts.length === 2) {
        result.warningMissingAge = true;
        result.warningText = 'missing age';
        result.parserWarnings.push('missing age');
        result.parserConfidence = 'low';
        result.attendanceRaw = parts[1].trim() || 'Full Time';

        // If attendance not in comma part, try stripping attendance keywords from full line tail.
        if (!result.attendanceRaw || result.attendanceRaw === 'Full Time') {
          var commaRecovery = stripAttendanceTailWhenAgeMissing(normalizedLine);
          if (commaRecovery && commaRecovery.name) {
            result.name = commaRecovery.name;
            if (commaRecovery.attendanceRaw) {
              result.attendanceRaw = commaRecovery.attendanceRaw;
            }
          }
        }
      }

      return result;
    }
  }

  // Missing age fallback: strip recognized attendance phrase from tail if present.
  var missingAgeRecovery = stripAttendanceTailWhenAgeMissing(normalizedLine);
  if (missingAgeRecovery && missingAgeRecovery.name) {
    result.name = missingAgeRecovery.name;
    result.attendanceRaw = missingAgeRecovery.attendanceRaw || 'Full Time';
    result.warningMissingAge = true;
    result.warningText = 'missing age';
    result.parserWarnings.push('missing age');
    result.parserConfidence = 'low';
    return result;
  }

  // Fallback: name only, age + attendance defaults
  result.name = normalizedLine.trim();
  result.attendanceRaw = 'Full Time';
  result.warningMissingAge = true;
  result.warningText = 'missing age and attendance';
  result.parserWarnings.push('missing age');
  result.parserConfidence = 'low';
  return result;
}

/**
 * Normalize messy worker input while keeping user intent:
 * - trim/collapse whitespace
 * - normalize dash chars
 * - normalize "age 8" into "8"
 */
function normalizeGuestInputLine(line) {
  if (!line) return '';
  var normalized = String(line);
  normalized = normalized.replace(/[–—]/g, '-');
  normalized = normalized.replace(/\bage\s*[:\-]?\s*(\d{1,3})\b/gi, '$1');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

/**
 * Find the last standalone 1-3 digit token in the line as age candidate.
 * Returns { index, length, value } or null.
 */
function findLastAgeTokenInLine(line) {
  if (!line) return null;

  var matches = [];
  var ageRegex = /\b(\d{1,3})\b/g;
  var match;
  while ((match = ageRegex.exec(line)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      value: parseInt(match[1], 10)
    });
  }

  if (matches.length === 0) return null;

  // Prefer plausible human ages but tolerate out-of-range by still selecting last numeric token.
  for (var i = matches.length - 1; i >= 0; i--) {
    if (matches[i].value >= 0 && matches[i].value <= 120) {
      return matches[i];
    }
  }

  return matches[matches.length - 1];
}

/**
 * When age is missing, remove recognized attendance phrase from the end of a line.
 * Returns { name, attendanceRaw } or null.
 */
function stripAttendanceTailWhenAgeMissing(line) {
  if (!line) return null;

  var raw = String(line).replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  var patterns = [
    /(.*?)(?:,?\s+)(weekend only|just weekend|weekend|fri\s*[-–—]\s*sat|friday\s*[-–—]\s*sabbath)\s*$/i,
    /(.*?)(?:,?\s+)(sabbath only|just sabbath|sat only|saturday only|sabbath)\s*$/i,
    /(.*?)(?:,?\s+)(full time|full week|all week|entire time|whole time|full)\s*$/i,
    /(.*?)(?:,?\s+)((?:tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sabbath)(?:\s*[-–—]\s*(?:tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sabbath))?)\s*$/i
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = raw.match(patterns[i]);
    if (match) {
      var possibleName = (match[1] || '').replace(/,\s*$/, '').trim();
      var attendanceTail = (match[2] || '').trim();
      if (possibleName) {
        return { name: possibleName, attendanceRaw: attendanceTail };
      }
    }
  }

  return null;
}

/**
 * Normalize free-text attendance into a parseable token string.
 */
function normalizeAttendanceText(text) {
  if (!text) return '';

  var normalized = String(text).toLowerCase();
  normalized = normalized.replace(/[–—]/g, '-');
  normalized = normalized.replace(/\./g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Treat "sabbath" as Saturday in day parsing.
  normalized = normalized.replace(/sabbath/g, 'sat');
  normalized = normalized.replace(/saturday/g, 'sat');
  normalized = normalized.replace(/\bsat\b/g, 'sat');
  normalized = normalized.replace(/tuesday/g, 'tue');
  normalized = normalized.replace(/wednesday/g, 'wed');
  normalized = normalized.replace(/thursday/g, 'thu');
  normalized = normalized.replace(/friday/g, 'fri');

  return normalized;
}

/**
 * Parse attendance metadata from free text.
 */
function parseAttendanceDetails(attendanceRaw) {
  var fullDays = getCampMeetingDays();
  var raw = attendanceRaw ? String(attendanceRaw).trim() : '';
  if (!raw) {
    return { attendanceType: 'full', attendanceRaw: 'Full Time', attendanceDays: fullDays };
  }

  var normalized = normalizeAttendanceText(raw);

  // Canonical full attendance labels
  if (/\b(full time|full week|all week|entire time|whole time|full)\b/.test(normalized)) {
    return { attendanceType: 'full', attendanceRaw: raw, attendanceDays: fullDays };
  }

  // Canonical weekend labels
  if (/\b(weekend only|weekend|fri\s*-\s*sat|friday\s*-\s*sat|fri-sat)\b/.test(normalized)) {
    return { attendanceType: 'weekend', attendanceRaw: raw, attendanceDays: ['fri', 'sat'] };
  }

  // Canonical sabbath-only labels
  if (/\b(sabbath only|saturday only|sat only|sat)\b/.test(normalized) && !/\b(tue|wed|thu|fri)\b/.test(normalized)) {
    return { attendanceType: 'sabbath', attendanceRaw: raw, attendanceDays: ['sat'] };
  }

  var parsedDays = parseAttendanceDays(normalized);
  if (parsedDays.length > 0) {
    return { attendanceType: 'partial', attendanceRaw: raw, attendanceDays: parsedDays };
  }

  return { attendanceType: 'unknown', attendanceRaw: raw, attendanceDays: [] };
}

/**
 * Convert day/day-range expressions into canonical day arrays.
 */
function parseAttendanceDays(normalizedText) {
  var dayOrder = getCampMeetingDays();
  var map = { tue: 0, wed: 1, thu: 2, fri: 3, sat: 4 };
  var daysFound = [];

  if (!normalizedText) return daysFound;

  var text = normalizedText.replace(/\bonly\b/g, ' ');

  // Expand ranges like "wed-fri" or "thu-sat"
  var rangeRegex = /\b(tue|wed|thu|fri|sat)\s*-\s*(tue|wed|thu|fri|sat)\b/g;
  var rangeMatch;
  while ((rangeMatch = rangeRegex.exec(text)) !== null) {
    var startDay = rangeMatch[1];
    var endDay = rangeMatch[2];
    var startIdx = map[startDay];
    var endIdx = map[endDay];
    if (startIdx <= endIdx) {
      for (var i = startIdx; i <= endIdx; i++) {
        pushUnique(daysFound, dayOrder[i]);
      }
    }
  }

  // Parse individual days, including comma-separated lists like "tue, thu, sat"
  var singleRegex = /\b(tue|wed|thu|fri|sat)\b/g;
  var singleMatch;
  while ((singleMatch = singleRegex.exec(text)) !== null) {
    pushUnique(daysFound, singleMatch[1]);
  }

  // Preserve camp meeting order
  var ordered = [];
  for (var d = 0; d < dayOrder.length; d++) {
    if (arrayContains(daysFound, dayOrder[d])) {
      ordered.push(dayOrder[d]);
    }
  }

  return ordered;
}

function pushUnique(arr, value) {
  if (!arrayContains(arr, value)) {
    arr.push(value);
  }
}

function arrayContains(arr, value) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === value) return true;
  }
  return false;
}

/**
 * Build attendance-aware meal selections for staff registrations.
 */
function buildStaffMealSelections(guestList) {
  var mealsByDay = {
    breakfast: ['wed', 'thu', 'fri', 'sat'],
    lunch: ['wed', 'thu', 'fri'],
    supper: ['tue', 'wed', 'thu', 'fri', 'sat']
  };

  var totals = {
    breakfast: { adult: 0, child: 0 },
    lunch: { adult: 0, child: 0 },
    supper: { adult: 0, child: 0 }
  };

  var guests = guestList || [];
  for (var i = 0; i < guests.length; i++) {
    var guest = guests[i] || {};
    var personDays = guest.attendanceDays && guest.attendanceDays.length
      ? guest.attendanceDays
      : getCampMeetingDays();
    var bucket = guest.isChild ? 'child' : 'adult';

    incrementMealsForGuest(personDays, mealsByDay.breakfast, totals.breakfast, bucket);
    incrementMealsForGuest(personDays, mealsByDay.lunch, totals.lunch, bucket);
    incrementMealsForGuest(personDays, mealsByDay.supper, totals.supper, bucket);
  }

  return totals;
}

function incrementMealsForGuest(attendanceDays, mealDays, mealTotals, bucket) {
  for (var i = 0; i < mealDays.length; i++) {
    if (arrayContains(attendanceDays, mealDays[i])) {
      mealTotals[bucket] += 1;
    }
  }
}

/**
 * Send notification when staff registration fails
 */
function sendStaffRegFailureNotification(data, errorMsg) {
  try {
    var config = getConfig();
    var adminEmail = config.admin_email;

    if (!adminEmail) {
      Logger.log('Admin email not configured in Config sheet. Cannot send notification.');
      return;
    }
    
    GmailApp.sendEmail(
      adminEmail,
      '⚠️ Staff Registration Failed - ' + data.name,
      'A staff registration submission failed to process.\n\n' +
      'Name: ' + data.name + '\n' +
      'Email: ' + data.email + '\n' +
      'Role: ' + data.staffRole + '\n\n' +
      'Error: ' + errorMsg + '\n\n' +
      'Submitted at: ' + data.submittedAt + '\n\n' +
      'Please process this registration manually.',
      { name: 'Camp Meeting Registration System' }
    );
  } catch (e) {
    Logger.log('Failed to send admin notification: ' + e.toString());
  }
}


/**
 * Write a spouse volunteer interest record to the Volunteer Tracking sheet
 */
function writeVolunteerRecord(data, registrationId) {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName('Volunteer Tracking');
    if (!sheet) {
      Logger.log('Volunteer Tracking sheet not found.');
      return;
    }
    sheet.appendRow([
      new Date(),                    // Timestamp
      registrationId,                // Registration ID of the worker
      data.name,                     // Worker name
      data.email,                    // Worker email
      data.staffRole,                // Worker role
      data.spouseName,               // Spouse name
      data.spouseDepartments,        // Preferred departments (comma-separated)
      data.spouseDepartmentOther,    // Other department if specified
      'pending'                      // Status — for admin to update
    ]);
    Logger.log('Volunteer record written for ' + data.spouseName);
  } catch (e) {
    Logger.log('Failed to write volunteer record: ' + e.toString());
  }
}

/**
 * Create the Volunteer Tracking sheet with headers if it doesn't exist.
 * Run once from the Apps Script editor.
 */
function setupVolunteerTrackingSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName('Volunteer Tracking');
  if (sheet) {
    Logger.log('Volunteer Tracking sheet already exists.');
    return;
  }
  sheet = ss.insertSheet('Volunteer Tracking');
  sheet.appendRow([
    'Timestamp',
    'Registration ID',
    'Worker Name',
    'Worker Email',
    'Worker Role',
    'Spouse Name',
    'Preferred Departments',
    'Other Department',
    'Status'
  ]);
  // Bold the header row
  sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  Logger.log('Volunteer Tracking sheet created.');
}

/**
 * Setup instructions - run once to set up trigger
 */
function setupStaffFormTrigger() {
  // Get the active form
  var form = FormApp.openById('1VnmK-JEntbhvY-Az0mcfPp1g3VYCMLKgCu0_HRST6cI');
  
  // Delete any existing triggers for this function
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onStaffFormSubmit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // Create new trigger
  ScriptApp.newTrigger('onStaffFormSubmit')
    .forForm(form)
    .onFormSubmit()
    .create();
  
  Logger.log('Trigger created successfully!');
}
