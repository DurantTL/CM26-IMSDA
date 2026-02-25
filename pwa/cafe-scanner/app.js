/**
 * Cafe Scanner PWA Logic
 */

// State
let html5QrCode;
let scanActive = false;
let offlineQueue = JSON.parse(localStorage.getItem('cm26_queue') || '[]');

// DOM Elements
const els = {
    reader:          document.getElementById('reader'),
    startBtn:        document.getElementById('start-scan-btn'),
    stopBtn:         document.getElementById('stop-scan-btn'),
    // ID lookup
    manualInput:     document.getElementById('manual-input'),
    manualBtn:       document.getElementById('manual-lookup-btn'),
    // Name lookup
    nameFirstInput:  document.getElementById('name-first-input'),
    nameLastInput:   document.getElementById('name-last-input'),
    nameLookupBtn:   document.getElementById('name-lookup-btn'),
    nameResults:     document.getElementById('name-search-results'),
    // Lookup tab buttons
    ltIdBtn:         document.getElementById('lt-id-btn'),
    ltNameBtn:       document.getElementById('lt-name-btn'),
    ltIdPanel:       document.getElementById('lookup-id-panel'),
    ltNamePanel:     document.getElementById('lookup-name-panel'),
    // Meal / date controls
    mealSelect:      document.getElementById('current-meal-select'),
    dateOverride:    document.getElementById('date-override'),
    activeMealBadge: document.getElementById('current-active-meal'),
    // Result card
    resultCard:      document.getElementById('result-card'),
    guestName:       document.getElementById('guest-name'),
    regIdDisplay:    document.getElementById('reg-id-display'),
    cardLoading:     document.getElementById('card-loading'),
    ticketsFound:    document.getElementById('tickets-found'),
    ticketsUsed:     document.getElementById('tickets-used'),
    dietaryWarning:  document.getElementById('dietary-warning'),
    dietaryText:     document.getElementById('dietary-text'),
    actionMealName:  document.getElementById('action-meal-name'),
    redeemButtons:   document.getElementById('redeem-buttons'),
    redeemMessage:   document.getElementById('redeem-message'),
    closeCardBtn:    document.getElementById('close-card-btn'),
    // Status / offline
    statusIndicator: document.getElementById('connection-status'),
    offlineBar:      document.getElementById('offline-queue-bar'),
    queueCount:      document.getElementById('queue-count'),
    syncBtn:         document.getElementById('sync-btn'),
    activityList:    document.getElementById('activity-list')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Default date override to today so it's ready to use
    els.dateOverride.value = todayDateString();

    updateOnlineStatus();
    updateQueueUI();
    determineCurrentMeal();

    window.addEventListener('online',  updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Camera
    els.startBtn.addEventListener('click', startScanning);
    els.stopBtn.addEventListener('click',  stopScanning);

    // ID/ticket lookup
    els.manualBtn.addEventListener('click', () => handleLookupById(els.manualInput.value.trim()));
    els.manualInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleLookupById(els.manualInput.value.trim());
    });

    // Name lookup
    els.nameLookupBtn.addEventListener('click', handleNameSearch);
    els.nameFirstInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleNameSearch(); });
    els.nameLastInput.addEventListener('keydown',  e => { if (e.key === 'Enter') handleNameSearch(); });

    // Close result card
    els.closeCardBtn.addEventListener('click', closeCard);

    // Offline sync
    els.syncBtn.addEventListener('click', processOfflineQueue);

    // Meal / date change → refresh badge
    els.mealSelect.addEventListener('change',   determineCurrentMeal);
    els.dateOverride.addEventListener('change', determineCurrentMeal);

    if (navigator.onLine && offlineQueue.length > 0) {
        processOfflineQueue();
    }
});

// --- Lookup Tab Switching ---

function switchLookupTab(tab) {
    if (tab === 'id') {
        els.ltIdBtn.classList.add('active');
        els.ltNameBtn.classList.remove('active');
        els.ltIdPanel.style.display   = 'block';
        els.ltNamePanel.style.display = 'none';
        els.manualInput.focus();
    } else {
        els.ltNameBtn.classList.add('active');
        els.ltIdBtn.classList.remove('active');
        els.ltNamePanel.style.display = 'block';
        els.ltIdPanel.style.display   = 'none';
        els.nameFirstInput.focus();
    }
}

// --- QR Scanning ---

function startScanning() {
    html5QrCode = new Html5Qrcode('reader');
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: 'environment' }, config, onScanSuccess)
        .then(() => {
            scanActive = true;
            els.startBtn.style.display = 'none';
            els.stopBtn.style.display  = 'inline-block';
            els.reader.style.display   = 'block';
        })
        .catch(err => {
            console.error('Camera error', err);
            alert('Error starting camera: ' + err);
        });
}

function stopScanning() {
    if (html5QrCode && scanActive) {
        html5QrCode.stop().then(() => {
            scanActive = false;
            els.startBtn.style.display = 'inline-block';
            els.stopBtn.style.display  = 'none';
            els.reader.style.display   = 'none';
        });
    }
}

function onScanSuccess(decodedText) {
    stopScanning();
    handleLookupById(decodedText);
}

// --- Meal / Date Logic ---

/**
 * Determine the current meal based on the meal dropdown and optional date override.
 * The date override changes which "day" string is used for ticket filtering.
 * Returns { meal, day } where day is e.g. 'tue', 'wed', etc.
 */
function determineCurrentMeal() {
    const override         = els.mealSelect.value;
    const dateOverrideVal  = els.dateOverride.value; // 'YYYY-MM-DD' or ''

    let meal = '';
    let now;

    if (dateOverrideVal) {
        // Build a Date for the chosen date using local time components
        const [yr, mo, dy] = dateOverrideVal.split('-').map(Number);
        const nowReal = new Date();
        now = new Date(yr, mo - 1, dy, nowReal.getHours(), nowReal.getMinutes());
    } else {
        now = new Date();
    }

    const hour = now.getHours();
    const day  = now.getDay(); // 0=Sun … 6=Sat

    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayStr = days[day];

    if (override !== 'auto') {
        meal = override;
    } else {
        if (hour < 10)       meal = 'breakfast';
        else if (hour < 15)  meal = 'lunch';
        else                 meal = 'supper';
    }

    const dateLabel = dateOverrideVal ? ` ${dateOverrideVal}` : '';
    els.activeMealBadge.textContent    = `${meal.toUpperCase()} (${todayStr.toUpperCase()})${dateLabel}`;
    els.activeMealBadge.dataset.meal   = meal;
    els.activeMealBadge.dataset.day    = todayStr;

    return { meal, day: todayStr };
}

// --- ID / Ticket Lookup ---

function handleLookupById(input) {
    if (!input) return;

    // Show card with loading state
    showCardLoading(input);

    if (!navigator.onLine) {
        els.redeemButtons.innerHTML = '<p class="error">Cannot look up guests while offline.</p>';
        return;
    }

    // Direct ticket ID (MT-xxxxx) → redeem immediately
    if (input.startsWith('MT-')) {
        redeemTicket(input, 'Direct Scan');
        closeCard();
        return;
    }

    // Registration ID → fetch meals
    fetchGuestMeals(input);
}

function fetchGuestMeals(regId) {
    fetch(`${GOOGLE_SCRIPT_URL}?action=getGuestMeals&id=${encodeURIComponent(regId)}`, { redirect: 'follow' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                renderGuestCard(data);
            } else {
                els.redeemButtons.innerHTML = `<p class="error">${data.error || 'Guest not found'}</p>`;
                els.cardLoading.style.display = 'none';
            }
        })
        .catch(() => {
            els.redeemButtons.innerHTML = '<p class="error">Connection error. Try again.</p>';
            els.cardLoading.style.display = 'none';
        });
}

function showCardLoading(label) {
    els.redeemMessage.textContent     = 'Loading tickets…';
    els.resultCard.style.display      = 'block';
    els.redeemButtons.innerHTML       = '<div class="spinner-inline"></div>';
    els.dietaryWarning.style.display  = 'none';
    els.guestName.textContent         = label || '…';
    els.regIdDisplay.textContent      = '';
    els.ticketsFound.textContent      = '–';
    els.ticketsUsed.textContent       = '–';
}

// --- Name Search ---

function handleNameSearch() {
    const firstName = (els.nameFirstInput.value || '').trim();
    const lastName  = (els.nameLastInput.value  || '').trim();
    if (!firstName && !lastName) return;

    if (!navigator.onLine) {
        els.nameResults.innerHTML     = '<p class="error">Cannot search while offline.</p>';
        els.nameResults.style.display = 'block';
        return;
    }

    els.nameResults.innerHTML     = '<div class="spinner-inline"></div>';
    els.nameResults.style.display = 'block';

    const params = new URLSearchParams({ action: 'searchRegistrations' });
    if (firstName) params.append('firstName', firstName);
    if (lastName)  params.append('lastName',  lastName);

    fetch(`${GOOGLE_SCRIPT_URL}?${params}`, { redirect: 'follow' })
        .then(r => r.json())
        .then(data => {
            renderNameResults(data.results || []);
        })
        .catch(() => {
            els.nameResults.innerHTML = '<p class="error">Search failed. Try again.</p>';
        });
}

function renderNameResults(results) {
    els.nameResults.innerHTML = '';

    if (!results.length) {
        els.nameResults.innerHTML = '<p class="info-text">No results found.</p>';
        return;
    }

    results.forEach(r => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary name-result-btn';
        btn.innerHTML = `<strong>${r.name}</strong> <span class="badge">${r.regId}</span>`;
        btn.addEventListener('click', () => {
            // Switch to ID tab and look up by regId
            switchLookupTab('id');
            els.manualInput.value = r.regId;
            handleLookupById(r.regId);
            // Clear name search results
            els.nameResults.style.display = 'none';
        });
        els.nameResults.appendChild(btn);
    });
}

// --- Guest Card Rendering ---

function renderGuestCard(data) {
    const reg     = data.registration;
    const tickets = data.tickets;
    const current = determineCurrentMeal();

    els.guestName.textContent    = reg.name;
    els.regIdDisplay.textContent = reg.regId;
    els.cardLoading.style.display = 'none';

    // Dietary warning
    if (reg.dietaryNeeds) {
        els.dietaryText.textContent       = reg.dietaryNeeds;
        els.dietaryWarning.style.display  = 'block';
    } else {
        els.dietaryWarning.style.display  = 'none';
    }

    // Filter relevant tickets for the current meal + day
    const relevantTickets = tickets.filter(t =>
        t.mealType === current.meal &&
        t.day      === current.day
    );

    const unusedTickets = relevantTickets.filter(t => t.redeemed !== 'yes');

    els.ticketsFound.textContent  = relevantTickets.length;
    els.ticketsUsed.textContent   = relevantTickets.length - unusedTickets.length;
    els.actionMealName.textContent = `${current.meal} (${current.day})`;

    els.redeemButtons.innerHTML = '';

    if (unusedTickets.length === 0) {
        els.redeemMessage.textContent = 'No valid tickets for this meal.';
        return;
    }

    els.redeemMessage.textContent = 'Select tickets to redeem:';

    // "Redeem All" button
    const btnAll = document.createElement('button');
    btnAll.className = 'btn btn-redeem full-width';
    btnAll.textContent = `Redeem All (${unusedTickets.length})`;
    btnAll.addEventListener('click', () => {
        unusedTickets.forEach(t => redeemTicket(t.ticketId, t.guestName));
        btnAll.disabled    = true;
        btnAll.textContent = 'Redeeming…';
    });
    els.redeemButtons.appendChild(btnAll);

    // Individual buttons per ticket
    unusedTickets.forEach(t => {
        const btn = document.createElement('button');
        btn.className   = 'btn btn-secondary';
        btn.textContent = `${t.guestName} (${t.ticketType})`;
        btn.addEventListener('click', () => {
            redeemTicket(t.ticketId, t.guestName);
            btn.disabled      = true;
            btn.style.opacity = '0.5';
        });
        els.redeemButtons.appendChild(btn);
    });
}

// --- Ticket Redemption ---

function redeemTicket(ticketId, guestName) {
    const payload = {
        action:    'redeemMeal',
        ticketId:  ticketId,
        volunteer: 'ScannerApp'
    };

    if (navigator.onLine) {
        // Use text/plain to keep POST as a CORS simple request (no pre-flight).
        fetch(GOOGLE_SCRIPT_URL, {
            method:   'POST',
            mode:     'cors',
            redirect: 'follow',
            headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
            body:     JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(() => logActivity(`Redeemed: ${guestName}`, true))
        .catch(err => {
            console.error(err);
            queueOffline(payload, guestName);
        });
    } else {
        queueOffline(payload, guestName);
    }
}

// --- Offline Queue ---

function queueOffline(payload, name) {
    offlineQueue.push({
        payload:   payload,
        timestamp: Date.now(),
        desc:      name
    });
    localStorage.setItem('cm26_queue', JSON.stringify(offlineQueue));
    updateQueueUI();
    logActivity(`Queued (Offline): ${name}`, false);
}

function processOfflineQueue() {
    if (offlineQueue.length === 0) return;
    if (!navigator.onLine) {
        alert('Still offline. Cannot sync.');
        return;
    }

    els.syncBtn.textContent = 'Syncing…';

    const queueCopy = [...offlineQueue];
    offlineQueue = [];
    localStorage.setItem('cm26_queue', JSON.stringify(offlineQueue));
    updateQueueUI();

    let completed = 0;

    queueCopy.forEach(item => {
        fetch(GOOGLE_SCRIPT_URL, {
            method:   'POST',
            mode:     'cors',
            redirect: 'follow',
            headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
            body:     JSON.stringify(item.payload)
        })
        .then(res => res.json())
        .then(() => {
            completed++;
            if (completed === queueCopy.length) {
                els.syncBtn.textContent = 'Sync Now';
                logActivity('Batch sync complete', true);
            }
        })
        .catch(() => {
            offlineQueue.push(item);
            localStorage.setItem('cm26_queue', JSON.stringify(offlineQueue));
            updateQueueUI();
        });
    });
}

// --- Helpers ---

function todayDateString() {
    return new Date().toISOString().split('T')[0];
}

function updateOnlineStatus() {
    if (navigator.onLine) {
        els.statusIndicator.textContent = 'Online';
        els.statusIndicator.className   = 'status-indicator online';
        if (offlineQueue.length > 0) processOfflineQueue();
    } else {
        els.statusIndicator.textContent = 'Offline';
        els.statusIndicator.className   = 'status-indicator offline';
    }
}

function updateQueueUI() {
    els.queueCount.textContent   = offlineQueue.length;
    els.offlineBar.style.display = offlineQueue.length > 0 ? 'flex' : 'none';
}

function logActivity(msg, success) {
    const li = document.createElement('li');
    li.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
    if (success) li.className = 'success';
    els.activityList.prepend(li);
}

function closeCard() {
    els.resultCard.style.display    = 'none';
    els.manualInput.value           = '';
    els.nameResults.style.display   = 'none';
    // Restart camera automatically if it was running before
    if (!scanActive) startScanning();
}
