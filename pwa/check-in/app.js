// CM26 Check-In PWA

// State
let offlineQueue = JSON.parse(localStorage.getItem('cm26_checkin_queue') || '[]');
let currentReg = null;
let html5QrCode = null;

// DOM Elements
const els = {
    // Search - name tab
    searchFirst:    document.getElementById('search-first'),
    searchLast:     document.getElementById('search-last'),
    searchNameBtn:  document.getElementById('search-name-btn'),
    // Search - ID tab
    searchRegId:    document.getElementById('search-reg-id'),
    searchIdBtn:    document.getElementById('search-id-btn'),
    // Tab buttons
    tabNameBtn:     document.getElementById('tab-name-btn'),
    tabIdBtn:       document.getElementById('tab-id-btn'),
    tabNamePanel:   document.getElementById('search-name-panel'),
    tabIdPanel:     document.getElementById('search-id-panel'),
    // Arrivals
    arrivalsDate:   document.getElementById('arrivals-date'),
    arrivalsBtn:    document.getElementById('arrivals-btn'),
    // Scanner
    scanBtn:        document.getElementById('scan-btn'),
    reader:         document.getElementById('reader'),
    // Content
    resultsList:    document.getElementById('search-results'),
    guestDetail:    document.getElementById('guest-detail'),
    // Stats
    stats: {
        checkedIn: document.getElementById('stat-checked-in'),
        expected:  document.getElementById('stat-expected'),
        keysOut:   document.getElementById('stat-keys-out')
    },
    // Offline queue
    queueBar:   document.getElementById('offline-queue-bar'),
    queueCount: document.getElementById('queue-count'),
    syncBtn:    document.getElementById('sync-btn'),
    // Modals
    modals: {
        checkin:  document.getElementById('checkin-modal'),
        checkout: document.getElementById('checkout-modal'),
        overlay:  document.getElementById('overlay')
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Default arrivals date to today
    els.arrivalsDate.value = todayDateString();

    updateOnlineStatus();
    updateStats();

    window.addEventListener('online',  updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Search by name
    els.searchNameBtn.addEventListener('click', doSearchByName);
    els.searchFirst.addEventListener('keydown', e => { if (e.key === 'Enter') doSearchByName(); });
    els.searchLast.addEventListener('keydown',  e => { if (e.key === 'Enter') doSearchByName(); });

    // Search by ID
    els.searchIdBtn.addEventListener('click', doSearchById);
    els.searchRegId.addEventListener('keydown', e => { if (e.key === 'Enter') doSearchById(); });

    // Arrivals
    els.arrivalsBtn.addEventListener('click', loadArrivals);

    // Scanner & sync
    els.scanBtn.addEventListener('click', toggleScanner);
    els.syncBtn.addEventListener('click', processOfflineQueue);

    // Auto-sync offline queue on load
    if (navigator.onLine && offlineQueue.length > 0) processOfflineQueue();
});

// --- Tab Switching ---

function switchTab(tab) {
    if (tab === 'name') {
        els.tabNameBtn.classList.add('active');
        els.tabIdBtn.classList.remove('active');
        els.tabNamePanel.style.display = 'block';
        els.tabIdPanel.style.display   = 'none';
        els.searchFirst.focus();
    } else {
        els.tabIdBtn.classList.add('active');
        els.tabNameBtn.classList.remove('active');
        els.tabIdPanel.style.display   = 'block';
        els.tabNamePanel.style.display = 'none';
        els.searchRegId.focus();
    }
}

// --- API Interactions ---

async function callAPI(action, params = {}, method = 'GET') {
    if (!navigator.onLine && method === 'POST') {
        throw new Error('OFFLINE');
    }

    let url = `${GOOGLE_SCRIPT_URL}?action=${action}`;
    let options = { method };

    if (method === 'GET') {
        const query = new URLSearchParams(params).toString();
        if (query) url += `&${query}`;
        options.redirect = 'follow';
    } else {
        // Use text/plain to keep POST as a CORS simple request (no pre-flight).
        // GAS receives this as e.postData.contents and parses it normally.
        options.body    = JSON.stringify({ action, ...params });
        options.mode    = 'cors';
        options.redirect = 'follow';
        options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    }

    try {
        const res = await fetch(url, options);
        return await res.json();
    } catch (err) {
        console.error('API Error:', err);
        throw err;
    }
}

// --- Actions ---

async function updateStats() {
    if (!navigator.onLine) return;
    try {
        const res = await callAPI('getCheckInStats');
        if (res.success) {
            els.stats.checkedIn.textContent = res.stats.checkedIn;
            els.stats.expected.textContent  = res.stats.notArrived;
            els.stats.keysOut.textContent   = res.stats.keysOut;
        }
    } catch (e) { console.warn('Stats update failed'); }
}

// Search by first + last name
async function doSearchByName() {
    const firstName = (els.searchFirst.value || '').trim();
    const lastName  = (els.searchLast.value  || '').trim();
    if (!firstName && !lastName) return;

    showResultsLoading();
    try {
        const params = {};
        if (firstName) params.firstName = firstName;
        if (lastName)  params.lastName  = lastName;
        const res = await callAPI('searchRegistrations', params);
        renderResults(res.results);
    } catch (e) {
        showResultsError('Search failed. Offline?');
    }
}

// Search by Registration ID
async function doSearchById() {
    const regId = (els.searchRegId.value || '').trim().toUpperCase();
    if (!regId) return;

    // If a full CM26- ID is entered, go directly to guest detail
    if (regId.startsWith('CM26-') && regId.length >= 9) {
        loadGuest(regId);
        return;
    }

    showResultsLoading();
    try {
        const res = await callAPI('searchRegistrations', { regId: regId.toLowerCase() });
        renderResults(res.results);
    } catch (e) {
        showResultsError('Search failed. Offline?');
    }
}

function renderResults(results) {
    els.resultsList.innerHTML = '';
    if (!results || results.length === 0) {
        els.resultsList.innerHTML = '<div class="info-msg">No results found.</div>';
        return;
    }

    results.forEach(r => {
        const div = document.createElement('div');
        div.className = 'card result-item';
        div.innerHTML = `
            <div class="result-header">
                <strong>${r.name}</strong>
                <span class="badge">${r.regId}</span>
            </div>
            <div class="result-meta">
                ${r.housingOption}${r.roomAssignment ? ' &mdash; Room ' + r.roomAssignment : ''}
                &nbsp;&bull;&nbsp; Guests: ${r.totalGuests}
                &nbsp;&bull;&nbsp; Balance: $${r.balanceDue}
            </div>
            <div class="result-action">
                ${r.checkedIn === 'yes'
                    ? `<button class="btn btn-secondary btn-sm" onclick="loadGuest('${r.regId}')">Manage Check-Out</button>`
                    : `<button class="btn btn-primary btn-sm" onclick="loadGuest('${r.regId}')">Check In &rarr;</button>`
                }
            </div>
        `;
        els.resultsList.appendChild(div);
    });
}

async function loadArrivals() {
    const date = els.arrivalsDate.value || todayDateString();
    showResultsLoading(`Loading arrivals for ${date}…`);

    try {
        const res = await callAPI('getArrivals', { date });
        renderResults(res.arrivals);
    } catch (e) {
        showResultsError('Failed to load arrivals.');
    }
}

async function loadGuest(regId) {
    els.resultsList.style.display = 'none';
    els.guestDetail.innerHTML = `<div class="loading-state"><div class="spinner-ring"></div><p>Loading guest…</p></div>`;
    els.guestDetail.style.display = 'block';

    try {
        const res = await callAPI('getCheckInData', { id: regId });
        if (res.success) {
            currentReg = res.registration;
            renderGuestDetail(res.registration);
        } else {
            els.guestDetail.innerHTML = '<div class="error-msg">Guest not found</div>';
        }
    } catch (e) {
        els.guestDetail.innerHTML = '<div class="error-msg">Connection error</div>';
    }
}

function renderGuestDetail(reg) {
    const isCheckedIn  = reg.checkedIn  === 'yes';
    const isCheckedOut = reg.checkedOut === 'yes';

    let actionBtn = '';
    if (!isCheckedIn) {
        actionBtn = `<button class="btn btn-primary full-width" onclick="openCheckIn()">Start Check-In</button>`;
    } else if (!isCheckedOut) {
        actionBtn = `<button class="btn btn-danger full-width" onclick="openCheckOut()">Check Out</button>`;
    } else {
        actionBtn = `<div class="info-msg">Already Checked Out</div>`;
    }

    const statusBadge = isCheckedOut
        ? '<span class="status-badge checked-out">Checked Out</span>'
        : isCheckedIn
            ? '<span class="status-badge checked-in">Checked In</span>'
            : '<span class="status-badge not-arrived">Not Arrived</span>';

    els.guestDetail.innerHTML = `
        <div class="card-header">
            <div>
                <h2>${reg.name}</h2>
                <span class="badge-mono">${reg.regId}</span>
            </div>
            ${statusBadge}
        </div>
        <div class="detail-grid">
            <p><strong>Housing:</strong> ${reg.housingOption} (${reg.roomAssignment || 'Unassigned'})</p>
            <p><strong>Nights:</strong> ${reg.numNights}</p>
            <p><strong>Guests:</strong> ${reg.totalGuests} (${reg.adultsCount}A / ${reg.childrenCount}C)</p>
            <p><strong>Balance Due:</strong> $${reg.balanceDue}</p>
            <p><strong>Keys:</strong> ${reg.key1Number || '–'}, ${reg.key2Number || '–'}</p>
            <p><strong>Meal Tickets:</strong> ${reg.mealTicketCount}</p>
        </div>
        ${reg.specialNeeds ? `<div class="warning-box">⚠️ ${reg.specialNeeds}</div>` : ''}
        <div class="detail-actions">
            ${actionBtn}
            <button class="btn btn-outline full-width" onclick="closeGuest()">← Back to Search</button>
        </div>
    `;
}

// --- Check-In Logic ---

function openCheckIn() {
    if (!currentReg) return;

    document.getElementById('ci-balance').textContent        = currentReg.balanceDue;
    document.getElementById('ci-payment-amount').value       = currentReg.balanceDue > 0 ? currentReg.balanceDue : '';
    document.getElementById('ci-key1').value                 = currentReg.key1Number || '';
    document.getElementById('ci-key2').value                 = currentReg.key2Number || '';

    els.modals.overlay.style.display = 'block';
    els.modals.checkin.style.display = 'block';
}

document.getElementById('checkin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
        action:           'checkIn',
        regId:            currentReg.regId,
        volunteer:        'CheckInApp',
        amount:           document.getElementById('ci-payment-amount').value,
        keyDepositAmount: 10,
        key1:             document.getElementById('ci-key1').value,
        key2:             document.getElementById('ci-key2').value,
        welcomePacket:    document.getElementById('ci-packet-given').checked
    };

    submitAction(data, 'Check-In');
    closeModal('checkin-modal');
});

// --- Check-Out Logic ---

function openCheckOut() {
    if (!currentReg) return;

    document.getElementById('co-key1-val').textContent      = currentReg.key1Number || 'None';
    document.getElementById('co-key2-val').textContent      = currentReg.key2Number || 'None';
    document.getElementById('co-deposit-paid').textContent  = currentReg.keyDepositAmount || '0';

    els.modals.overlay.style.display  = 'block';
    els.modals.checkout.style.display = 'block';
}

document.getElementById('checkout-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
        action:       'checkOut',
        regId:        currentReg.regId,
        volunteer:    'CheckInApp',
        key1Returned: document.getElementById('co-key1-returned').checked,
        key2Returned: document.getElementById('co-key2-returned').checked,
        refundAmount: document.getElementById('co-refund-amount').value
    };

    submitAction(data, 'Check-Out');
    closeModal('checkout-modal');
});

// --- Submission & Offline ---

function submitAction(data, type) {
    if (navigator.onLine) {
        fetch(GOOGLE_SCRIPT_URL, {
            method:   'POST',
            mode:     'cors',
            redirect: 'follow',
            headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
            body:     JSON.stringify(data)
        })
        .then(res => res.json())
        .then(() => {
            logActivity(`${type} Success: ${currentReg.name}`, true);
            loadGuest(currentReg.regId);
            updateStats();
        })
        .catch(err => {
            console.error(err);
            queueOffline(data, type);
        });
    } else {
        queueOffline(data, type);
    }
}

function queueOffline(data, type) {
    offlineQueue.push({
        data:      data,
        desc:      `${type}: ${currentReg.name}`,
        timestamp: Date.now()
    });
    localStorage.setItem('cm26_checkin_queue', JSON.stringify(offlineQueue));
    updateQueueUI();
    logActivity(`Queued (Offline): ${type} for ${currentReg.name}`, false);

    // Optimistic UI update
    if (type === 'Check-In') {
        currentReg.checkedIn = 'yes';
    } else {
        currentReg.checkedOut = 'yes';
    }
    renderGuestDetail(currentReg);
}

function processOfflineQueue() {
    if (!navigator.onLine || offlineQueue.length === 0) return;

    els.syncBtn.textContent = 'Syncing…';
    const queue = [...offlineQueue];
    offlineQueue = [];
    localStorage.setItem('cm26_checkin_queue', JSON.stringify(offlineQueue));
    updateQueueUI();

    queue.forEach(item => {
        fetch(GOOGLE_SCRIPT_URL, {
            method:   'POST',
            mode:     'cors',
            redirect: 'follow',
            headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
            body:     JSON.stringify(item.data)
        })
        .then(res => res.json())
        .then(() => logActivity(`Synced: ${item.desc}`, true))
        .catch(() => {
            offlineQueue.push(item);
            localStorage.setItem('cm26_checkin_queue', JSON.stringify(offlineQueue));
            updateQueueUI();
        });
    });

    els.syncBtn.textContent = 'Sync Now';
}

// --- Helpers ---

function todayDateString() {
    return new Date().toISOString().split('T')[0];
}

function showResultsLoading(msg) {
    els.resultsList.innerHTML = `<div class="loading-state"><div class="spinner-ring"></div><p>${msg || 'Loading…'}</p></div>`;
    els.resultsList.style.display = 'block';
    els.guestDetail.style.display = 'none';
}

function showResultsError(msg) {
    els.resultsList.innerHTML = `<div class="error-msg">${msg}</div>`;
}

function updateOnlineStatus() {
    const status = document.getElementById('connection-status');
    if (navigator.onLine) {
        status.textContent = 'Online';
        status.className   = 'status-indicator online';
        if (offlineQueue.length > 0) processOfflineQueue();
    } else {
        status.textContent = 'Offline';
        status.className   = 'status-indicator offline';
    }
}

function updateQueueUI() {
    els.queueCount.textContent  = offlineQueue.length;
    els.queueBar.style.display  = offlineQueue.length > 0 ? 'flex' : 'none';
}

function logActivity(msg, success) {
    const li = document.createElement('li');
    li.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
    if (success) li.style.color = '#2f855a';
    document.getElementById('activity-list').prepend(li);
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    els.modals.overlay.style.display          = 'none';
}

function closeGuest() {
    els.guestDetail.style.display = 'none';
    els.resultsList.style.display = 'block';
}

// --- Scanner ---

function toggleScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode = null;
            els.reader.style.display  = 'none';
            els.scanBtn.textContent   = '📷 Scan QR';
        });
    } else {
        els.reader.style.display = 'block';
        html5QrCode = new Html5Qrcode('reader');
        html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: 250 },
            (text) => {
                toggleScanner(); // Stop after successful scan
                if (text.startsWith('CM26')) {
                    loadGuest(text);
                } else {
                    // Treat as a generic ID fragment and search
                    els.searchRegId.value = text;
                    switchTab('id');
                    doSearchById();
                }
            }
        );
        els.scanBtn.textContent = 'Stop Scan';
    }
}
