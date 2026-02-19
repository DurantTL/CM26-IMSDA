/**
 * Cafe Scanner PWA Logic
 */

// State
let html5QrCode;
let currentCameraId = null;
let scanActive = false;
let offlineQueue = JSON.parse(localStorage.getItem('cm26_queue') || '[]');

// DOM Elements
const els = {
    reader: document.getElementById('reader'),
    startBtn: document.getElementById('start-scan-btn'),
    stopBtn: document.getElementById('stop-scan-btn'),
    manualInput: document.getElementById('manual-input'),
    manualBtn: document.getElementById('manual-lookup-btn'),
    resultCard: document.getElementById('result-card'),
    guestName: document.getElementById('guest-name'),
    regIdDisplay: document.getElementById('reg-id-display'),
    ticketsFound: document.getElementById('tickets-found'),
    ticketsUsed: document.getElementById('tickets-used'),
    dietaryWarning: document.getElementById('dietary-warning'),
    dietaryText: document.getElementById('dietary-text'),
    actionMealName: document.getElementById('action-meal-name'),
    redeemButtons: document.getElementById('redeem-buttons'),
    redeemMessage: document.getElementById('redeem-message'),
    closeCardBtn: document.getElementById('close-card-btn'),
    mealSelect: document.getElementById('current-meal-select'),
    activeMealBadge: document.getElementById('current-active-meal'),
    statusIndicator: document.getElementById('connection-status'),
    offlineBar: document.getElementById('offline-queue-bar'),
    queueCount: document.getElementById('queue-count'),
    syncBtn: document.getElementById('sync-btn'),
    activityList: document.getElementById('activity-list')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateOnlineStatus();
    updateQueueUI();
    determineCurrentMeal();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    els.startBtn.addEventListener('click', startScanning);
    els.stopBtn.addEventListener('click', stopScanning);
    els.manualBtn.addEventListener('click', () => handleLookup(els.manualInput.value.trim()));
    els.closeCardBtn.addEventListener('click', closeCard);
    els.syncBtn.addEventListener('click', processOfflineQueue);
    els.mealSelect.addEventListener('change', determineCurrentMeal);

    // Auto-process queue if online
    if (navigator.onLine && offlineQueue.length > 0) {
        processOfflineQueue();
    }
});

// --- QR Scanning ---

function startScanning() {
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
        .then(() => {
            scanActive = true;
            els.startBtn.style.display = 'none';
            els.stopBtn.style.display = 'inline-block';
            els.reader.style.display = 'block';
        })
        .catch(err => {
            console.error("Camera error", err);
            alert("Error starting camera: " + err);
        });
}

function stopScanning() {
    if (html5QrCode && scanActive) {
        html5QrCode.stop().then(() => {
            scanActive = false;
            els.startBtn.style.display = 'inline-block';
            els.stopBtn.style.display = 'none';
            els.reader.style.display = 'none';
        });
    }
}

function onScanSuccess(decodedText, decodedResult) {
    // Stop scanning temporarily while processing
    stopScanning();
    handleLookup(decodedText);
}

// --- Logic ---

function determineCurrentMeal() {
    const override = els.mealSelect.value;
    let meal = '';
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=Sun, 6=Sat

    // Day mapping to string
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayStr = days[day];

    if (override !== 'auto') {
        meal = override;
    } else {
        if (hour < 10) meal = 'breakfast';
        else if (hour < 15) meal = 'lunch';
        else meal = 'supper';
    }

    els.activeMealBadge.textContent = `${meal.toUpperCase()} (${todayStr.toUpperCase()})`;
    els.activeMealBadge.dataset.meal = meal;
    els.activeMealBadge.dataset.day = todayStr;

    return { meal, day: todayStr };
}

function handleLookup(input) {
    if (!input) return;

    // Reset UI
    els.redeemMessage.textContent = "Loading tickets...";
    els.resultCard.style.display = 'block';
    els.redeemButtons.innerHTML = '<div class="spinner"></div>';
    els.dietaryWarning.style.display = 'none';

    // Check if offline
    if (!navigator.onLine) {
        // If offline, we can't look up guest details unless we cached them (advanced)
        // For simple version: show offline error for lookup
        els.redeemButtons.innerHTML = '<p class="error">Cannot lookup guests while offline.</p>';
        return;
    }

    // Is this a direct ticket ID? (MT-xxxxx)
    if (input.startsWith('MT-')) {
        redeemTicket(input, 'Direct Scan');
        return;
    }

    // Assume Registration ID (CM26-xxxxx)
    fetch(`${GOOGLE_SCRIPT_URL}?action=getGuestMeals&id=${encodeURIComponent(input)}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                renderGuestCard(data);
            } else {
                els.redeemButtons.innerHTML = `<p class="error">${data.error || 'Guest not found'}</p>`;
            }
        })
        .catch(err => {
            els.redeemButtons.innerHTML = `<p class="error">Connection Error</p>`;
        });
}

function renderGuestCard(data) {
    const reg = data.registration;
    const tickets = data.tickets;
    const current = determineCurrentMeal();

    els.guestName.textContent = reg.name;
    els.regIdDisplay.textContent = reg.regId;

    // Dietary warning
    if (reg.dietaryNeeds) {
        els.dietaryText.textContent = reg.dietaryNeeds;
        els.dietaryWarning.style.display = 'block';
    }

    // Filter relevant tickets for NOW
    const relevantTickets = tickets.filter(t =>
        t.mealType === current.meal &&
        t.day === current.day
    );

    const unusedTickets = relevantTickets.filter(t => t.redeemed !== 'yes');

    els.ticketsFound.textContent = relevantTickets.length;
    els.ticketsUsed.textContent = relevantTickets.length - unusedTickets.length;
    els.actionMealName.textContent = `${current.meal} (${current.day})`;

    // Generate Buttons
    els.redeemButtons.innerHTML = '';

    if (unusedTickets.length === 0) {
        els.redeemMessage.textContent = "No valid tickets for this meal.";
        return;
    }

    // "Redeem All" Button
    const btnAll = document.createElement('button');
    btnAll.className = 'btn btn-redeem full-width';
    btnAll.textContent = `Redeem All (${unusedTickets.length})`;
    btnAll.onclick = () => {
        unusedTickets.forEach(t => redeemTicket(t.ticketId, t.guestName));
        btnAll.disabled = true;
        btnAll.textContent = "Redeeming...";
    };
    els.redeemButtons.appendChild(btnAll);

    // Individual Buttons
    unusedTickets.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.textContent = `${t.guestName} (${t.ticketType})`;
        btn.onclick = () => {
            redeemTicket(t.ticketId, t.guestName);
            btn.disabled = true;
            btn.style.opacity = 0.5;
        };
        els.redeemButtons.appendChild(btn);
    });

    els.redeemMessage.textContent = "Select tickets to redeem.";
}

function redeemTicket(ticketId, guestName) {
    const payload = {
        action: 'redeemMeal',
        ticketId: ticketId,
        volunteer: 'ScannerApp'
    };

    if (navigator.onLine) {
        // Online: Send immediately
        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Google Script quirk
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(() => {
            // Because of no-cors, we assume success if no network error
            logActivity(`Redeemed: ${guestName}`, true);
        })
        .catch(err => {
            console.error(err);
            queueOffline(payload, guestName);
        });
    } else {
        // Offline: Queue it
        queueOffline(payload, guestName);
    }
}

function queueOffline(payload, name) {
    offlineQueue.push({
        payload: payload,
        timestamp: new Date().getTime(),
        desc: name
    });
    localStorage.setItem('cm26_queue', JSON.stringify(offlineQueue));
    updateQueueUI();
    logActivity(`Queued (Offline): ${name}`, false);
}

function processOfflineQueue() {
    if (offlineQueue.length === 0) return;
    if (!navigator.onLine) {
        alert("Still offline. Cannot sync.");
        return;
    }

    els.syncBtn.textContent = "Syncing...";

    // Process one by one
    const queueCopy = [...offlineQueue];
    // Clear queue strictly to avoid duplicates if re-run, will re-add failures
    offlineQueue = [];
    localStorage.setItem('cm26_queue', JSON.stringify(offlineQueue));
    updateQueueUI();

    let completed = 0;

    queueCopy.forEach(item => {
        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload)
        })
        .then(() => {
            completed++;
            if (completed === queueCopy.length) {
                els.syncBtn.textContent = "Sync Now";
                logActivity("Batch sync complete", true);
            }
        })
        .catch(() => {
            // Add back to queue if failed
            offlineQueue.push(item);
            localStorage.setItem('cm26_queue', JSON.stringify(offlineQueue));
            updateQueueUI();
        });
    });
}

function updateOnlineStatus() {
    if (navigator.onLine) {
        els.statusIndicator.textContent = "Online";
        els.statusIndicator.className = "status-indicator online";
        els.syncBtn.style.display = "inline-block";
        if (offlineQueue.length > 0) processOfflineQueue();
    } else {
        els.statusIndicator.textContent = "Offline";
        els.statusIndicator.className = "status-indicator offline";
        els.syncBtn.style.display = "none";
    }
}

function updateQueueUI() {
    els.queueCount.textContent = offlineQueue.length;
    els.offlineBar.style.display = offlineQueue.length > 0 ? 'flex' : 'none';
}

function logActivity(msg, success) {
    const li = document.createElement('li');
    li.textContent = `${new Date().toLocaleTimeString()} - ${msg}`;
    if (success) li.className = 'success';
    els.activityList.prepend(li);
}

function closeCard() {
    els.resultCard.style.display = 'none';
    els.manualInput.value = '';
    startScanning(); // Restart camera automatically
}
