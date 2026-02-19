// CM26 Check-In PWA

// State
let offlineQueue = JSON.parse(localStorage.getItem('cm26_checkin_queue') || '[]');
let currentReg = null;
let html5QrCode = null;

// DOM Elements
const els = {
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    scanBtn: document.getElementById('scan-btn'),
    arrivalsBtn: document.getElementById('arrivals-btn'),
    resultsList: document.getElementById('search-results'),
    guestDetail: document.getElementById('guest-detail'),
    reader: document.getElementById('reader'),
    stats: {
        checkedIn: document.getElementById('stat-checked-in'),
        expected: document.getElementById('stat-expected'),
        keysOut: document.getElementById('stat-keys-out')
    },
    queueBar: document.getElementById('offline-queue-bar'),
    queueCount: document.getElementById('queue-count'),
    syncBtn: document.getElementById('sync-btn'),
    modals: {
        checkin: document.getElementById('checkin-modal'),
        checkout: document.getElementById('checkout-modal'),
        overlay: document.getElementById('overlay')
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    updateOnlineStatus();
    updateStats();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    els.searchBtn.addEventListener('click', () => doSearch(els.searchInput.value));
    els.scanBtn.addEventListener('click', toggleScanner);
    els.arrivalsBtn.addEventListener('click', loadArrivals);
    els.syncBtn.addEventListener('click', processOfflineQueue);

    // Auto-sync
    if (navigator.onLine && offlineQueue.length > 0) processOfflineQueue();
});

// --- API Interactions ---

async function callAPI(action, params = {}, method = 'GET') {
    if (!navigator.onLine && method === 'POST') {
        throw new Error('OFFLINE');
    }

    let url = `${GOOGLE_SCRIPT_URL}?action=${action}`;
    let options = { method };

    if (method === 'GET') {
        const query = new URLSearchParams(params).toString();
        url += `&${query}`;
    } else {
        options.body = JSON.stringify({ action, ...params });
        options.mode = 'no-cors'; // Google Script quirk for POST
        options.headers = { 'Content-Type': 'application/json' };
    }

    try {
        const res = await fetch(url, options);
        if (method === 'POST') return { success: true }; // Assume success for no-cors
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
            els.stats.expected.textContent = res.stats.notArrived;
            els.stats.keysOut.textContent = res.stats.keysOut;
        }
    } catch (e) { console.warn('Stats update failed'); }
}

async function doSearch(query) {
    if (!query) return;
    els.resultsList.innerHTML = '<div class="spinner">Searching...</div>';
    els.resultsList.style.display = 'block';
    els.guestDetail.style.display = 'none';

    try {
        const res = await callAPI('searchRegistrations', { query });
        renderResults(res.results);
    } catch (e) {
        els.resultsList.innerHTML = '<div class="error">Search failed. Offline?</div>';
    }
}

function renderResults(results) {
    els.resultsList.innerHTML = '';
    if (!results || results.length === 0) {
        els.resultsList.innerHTML = '<div class="info">No results found.</div>';
        return;
    }

    results.forEach(r => {
        const div = document.createElement('div');
        div.className = 'card result-item';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <strong>${r.name}</strong>
                <span class="badge">${r.regId}</span>
            </div>
            <div class="small-text">
                ${r.housingOption} ${r.roomAssignment ? '- Room ' + r.roomAssignment : ''}
                <br>Guests: ${r.totalGuests} | Balance: $${r.balanceDue}
            </div>
            <div style="margin-top:10px;">
                ${r.checkedIn === 'yes'
                    ? `<button class="btn btn-secondary btn-sm" onclick="loadGuest('${r.regId}')">Manage Check-Out</button>`
                    : `<button class="btn btn-primary btn-sm" onclick="loadGuest('${r.regId}')">Check In</button>`
                }
            </div>
        `;
        els.resultsList.appendChild(div);
    });
}

async function loadArrivals() {
    const date = new Date().toISOString().split('T')[0]; // Today
    els.resultsList.innerHTML = '<div class="spinner">Loading arrivals...</div>';
    els.resultsList.style.display = 'block';
    els.guestDetail.style.display = 'none';

    try {
        const res = await callAPI('getArrivals', { date });
        renderResults(res.arrivals);
    } catch (e) {
        els.resultsList.innerHTML = '<div class="error">Failed to load arrivals.</div>';
    }
}

async function loadGuest(regId) {
    els.resultsList.style.display = 'none';
    els.guestDetail.innerHTML = '<div class="spinner">Loading guest details...</div>';
    els.guestDetail.style.display = 'block';

    try {
        const res = await callAPI('getCheckInData', { id: regId });
        if (res.success) {
            currentReg = res.registration;
            renderGuestDetail(res.registration);
        } else {
            els.guestDetail.innerHTML = '<div class="error">Guest not found</div>';
        }
    } catch (e) {
        els.guestDetail.innerHTML = '<div class="error">Connection error</div>';
    }
}

function renderGuestDetail(reg) {
    const isCheckedIn = reg.checkedIn === 'yes';
    const isCheckedOut = reg.checkedOut === 'yes';

    let actionBtn = '';
    if (!isCheckedIn) {
        actionBtn = `<button class="btn btn-primary full-width" onclick="openCheckIn()">Start Check-In</button>`;
    } else if (!isCheckedOut) {
        actionBtn = `<button class="btn btn-danger full-width" onclick="openCheckOut()">Check Out</button>`;
    } else {
        actionBtn = `<div class="info">Already Checked Out</div>`;
    }

    els.guestDetail.innerHTML = `
        <div class="card-header">
            <h2>${reg.name}</h2>
            <span>${reg.regId}</span>
        </div>
        <div class="detail-grid">
            <p><strong>Housing:</strong> ${reg.housingOption} (${reg.roomAssignment || 'Unassigned'})</p>
            <p><strong>Nights:</strong> ${reg.numNights}</p>
            <p><strong>Guests:</strong> ${reg.totalGuests} (${reg.adultsCount}A / ${reg.childrenCount}C)</p>
            <p><strong>Balance Due:</strong> $${reg.balanceDue}</p>
            <p><strong>Keys:</strong> ${reg.key1Number || '-'}, ${reg.key2Number || '-'}</p>
        </div>
        ${reg.specialNeeds ? `<div class="warning-box">⚠️ ${reg.specialNeeds}</div>` : ''}
        <div style="margin-top:20px;">
            ${actionBtn}
            <button class="btn btn-outline full-width" style="margin-top:10px;" onclick="closeGuest()">Back to Search</button>
        </div>
    `;
}

// --- Check-In Logic ---

function openCheckIn() {
    if (!currentReg) return;

    // Pre-fill
    document.getElementById('ci-balance').textContent = currentReg.balanceDue;
    document.getElementById('ci-payment-amount').value = currentReg.balanceDue > 0 ? currentReg.balanceDue : '';
    document.getElementById('ci-key1').value = currentReg.key1Number || '';
    document.getElementById('ci-key2').value = currentReg.key2Number || '';

    // Show modal
    els.modals.overlay.style.display = 'block';
    els.modals.checkin.style.display = 'block';
}

document.getElementById('checkin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
        action: 'checkIn',
        regId: currentReg.regId,
        volunteer: 'CheckInApp', // TODO: Add login?

        // Balance
        amount: document.getElementById('ci-payment-amount').value,

        // Keys
        keyDepositAmount: 10, // Hardcoded for now, could be config
        key1: document.getElementById('ci-key1').value,
        key2: document.getElementById('ci-key2').value,

        welcomePacket: document.getElementById('ci-packet-given').checked
    };

    submitAction(data, 'Check-In');
    closeModal('checkin-modal');
});

// --- Check-Out Logic ---

function openCheckOut() {
    if (!currentReg) return;

    document.getElementById('co-key1-val').textContent = currentReg.key1Number || 'None';
    document.getElementById('co-key2-val').textContent = currentReg.key2Number || 'None';
    document.getElementById('co-deposit-paid').textContent = currentReg.keyDepositAmount || '0';

    els.modals.overlay.style.display = 'block';
    els.modals.checkout.style.display = 'block';
}

document.getElementById('checkout-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
        action: 'checkOut',
        regId: currentReg.regId,
        volunteer: 'CheckInApp',

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
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(() => {
            logActivity(`${type} Success: ${currentReg.name}`, true);
            loadGuest(currentReg.regId); // Reload to see changes
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
        data: data,
        desc: `${type}: ${currentReg.name}`,
        timestamp: Date.now()
    });
    localStorage.setItem('cm26_checkin_queue', JSON.stringify(offlineQueue));
    updateQueueUI();
    logActivity(`Queued (Offline): ${type} for ${currentReg.name}`, false);

    // Optimistic UI update
    if (type === 'Check-In') {
        currentReg.checkedIn = 'yes';
        renderGuestDetail(currentReg);
    } else {
        currentReg.checkedOut = 'yes';
        renderGuestDetail(currentReg);
    }
}

function processOfflineQueue() {
    if (!navigator.onLine || offlineQueue.length === 0) return;

    els.syncBtn.textContent = 'Syncing...';
    const queue = [...offlineQueue];
    offlineQueue = [];
    localStorage.setItem('cm26_checkin_queue', JSON.stringify(offlineQueue));
    updateQueueUI();

    queue.forEach(item => {
        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.data)
        })
        .then(() => logActivity(`Synced: ${item.desc}`, true))
        .catch(() => {
            offlineQueue.push(item); // Re-queue
            localStorage.setItem('cm26_checkin_queue', JSON.stringify(offlineQueue));
            updateQueueUI();
        });
    });

    els.syncBtn.textContent = 'Sync Now';
}

// --- Helpers ---

function updateOnlineStatus() {
    const status = document.getElementById('connection-status');
    if (navigator.onLine) {
        status.textContent = 'Online';
        status.className = 'status-indicator online';
        if (offlineQueue.length > 0) processOfflineQueue();
    } else {
        status.textContent = 'Offline';
        status.className = 'status-indicator offline';
    }
}

function updateQueueUI() {
    els.queueCount.textContent = offlineQueue.length;
    els.queueBar.style.display = offlineQueue.length > 0 ? 'flex' : 'none';
}

function logActivity(msg, success) {
    const li = document.createElement('li');
    li.textContent = `${new Date().toLocaleTimeString()} - ${msg}`;
    if (success) li.style.color = 'green';
    const list = document.getElementById('activity-list');
    list.prepend(li);
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    els.modals.overlay.style.display = 'none';
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
            els.reader.style.display = 'none';
            els.scanBtn.textContent = '📷 Scan QR';
        });
    } else {
        els.reader.style.display = 'block';
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {
            toggleScanner(); // Stop
            if (text.startsWith('CM26')) {
                loadGuest(text);
            } else {
                doSearch(text);
            }
        });
        els.scanBtn.textContent = 'Stop Scan';
    }
}
