// CM26 Check-In PWA

const APP_NAME = 'checkin';
const API_ROOT = `${typeof CM26_API_BASE === 'string' ? CM26_API_BASE : '/api'}/${APP_NAME}`;

let offlineQueue = JSON.parse(localStorage.getItem('cm26_checkin_queue') || '[]');
let currentReg = null;
let html5QrCode = null;
let currentUser = null;
let bindingsInitialized = false;

const els = {
    searchFirst: document.getElementById('search-first'),
    searchLast: document.getElementById('search-last'),
    searchNameBtn: document.getElementById('search-name-btn'),
    searchRegId: document.getElementById('search-reg-id'),
    searchIdBtn: document.getElementById('search-id-btn'),
    tabNameBtn: document.getElementById('tab-name-btn'),
    tabIdBtn: document.getElementById('tab-id-btn'),
    tabNamePanel: document.getElementById('search-name-panel'),
    tabIdPanel: document.getElementById('search-id-panel'),
    arrivalsDate: document.getElementById('arrivals-date'),
    arrivalsBtn: document.getElementById('arrivals-btn'),
    scanBtn: document.getElementById('scan-btn'),
    reader: document.getElementById('reader'),
    resultsList: document.getElementById('search-results'),
    guestDetail: document.getElementById('guest-detail'),
    queueBar: document.getElementById('offline-queue-bar'),
    queueCount: document.getElementById('queue-count'),
    syncBtn: document.getElementById('sync-btn'),
    activityList: document.getElementById('activity-list'),
    connectionStatus: document.getElementById('connection-status'),
    userDisplay: document.getElementById('user-display'),
    syncStatus: document.getElementById('sync-status'),
    logoutBtn: document.getElementById('logout-btn'),
    stats: {
        checkedIn: document.getElementById('stat-checked-in'),
        expected: document.getElementById('stat-expected'),
        keysOut: document.getElementById('stat-keys-out')
    },
    modals: {
        checkin: document.getElementById('checkin-modal'),
        checkout: document.getElementById('checkout-modal'),
        overlay: document.getElementById('overlay')
    },
    auth: {
        screen: document.getElementById('auth-screen'),
        form: document.getElementById('login-form'),
        username: document.getElementById('login-username'),
        password: document.getElementById('login-password'),
        error: document.getElementById('login-error')
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    els.arrivalsDate.value = todayDateString();
    initializeBindings();
    updateQueueUI();
    updateOnlineStatus();
    await restoreSession();
});

function initializeBindings() {
    if (bindingsInitialized) return;
    bindingsInitialized = true;

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    els.searchNameBtn.addEventListener('click', doSearchByName);
    els.searchFirst.addEventListener('keydown', (event) => { if (event.key === 'Enter') doSearchByName(); });
    els.searchLast.addEventListener('keydown', (event) => { if (event.key === 'Enter') doSearchByName(); });

    els.searchIdBtn.addEventListener('click', doSearchById);
    els.searchRegId.addEventListener('keydown', (event) => { if (event.key === 'Enter') doSearchById(); });

    els.arrivalsBtn.addEventListener('click', loadArrivals);
    els.scanBtn.addEventListener('click', toggleScanner);
    els.syncBtn.addEventListener('click', processOfflineQueue);
    els.logoutBtn.addEventListener('click', logout);
    els.auth.form.addEventListener('submit', handleLogin);

    document.getElementById('checkin-form').addEventListener('submit', submitCheckInForm);
    document.getElementById('checkout-form').addEventListener('submit', submitCheckOutForm);
}

async function restoreSession() {
    try {
        const response = await fetch(`/api/auth/me?app=${APP_NAME}`, {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });

        if (!response.ok) {
            showAuthScreen();
            return;
        }

        const payload = await response.json();
        currentUser = payload.user;
        finishLogin();
    } catch (_error) {
        showAuthScreen('Unable to reach the server.');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    hideAuthError();

    const username = els.auth.username.value.trim();
    const password = els.auth.password.value;
    if (!username || !password) {
        showAuthError('Enter both username and password.');
        return;
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            cache: 'no-store',
            body: JSON.stringify({ username, password, app: APP_NAME })
        });

        const payload = await response.json();
        if (!response.ok || !payload.success) {
            showAuthError(payload.error || 'Login failed.');
            return;
        }

        currentUser = payload.user;
        finishLogin();
    } catch (_error) {
        showAuthError('Could not sign in.');
    }
}

function finishLogin() {
    els.auth.password.value = '';
    els.auth.screen.classList.remove('visible');
    els.logoutBtn.style.display = 'inline-block';
    els.userDisplay.textContent = `Signed in as ${currentUser.username}`;
    updateOnlineStatus();
    bootstrapApp();
}

function showAuthScreen(message) {
    currentUser = null;
    els.auth.screen.classList.add('visible');
    els.logoutBtn.style.display = 'none';
    els.userDisplay.textContent = 'Volunteer sign-in required';
    if (message) {
        showAuthError(message);
    } else {
        hideAuthError();
    }
}

function showAuthError(message) {
    els.auth.error.textContent = message;
    els.auth.error.style.display = 'block';
}

function hideAuthError() {
    els.auth.error.style.display = 'none';
    els.auth.error.textContent = '';
}

async function logout() {
    if (html5QrCode) {
        await html5QrCode.stop().catch(() => {});
        html5QrCode = null;
        els.reader.style.display = 'none';
        els.scanBtn.textContent = '📷 Scan QR';
    }

    await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => {});
    showAuthScreen('Signed out.');
}

async function bootstrapApp() {
    try {
        const payload = await apiRequest('/bootstrap');
        if (payload.stats) {
            renderStats(payload.stats);
        }
        setSyncStatus(payload.sync);
        if (navigator.onLine && offlineQueue.length > 0) {
            processOfflineQueue();
        }
    } catch (error) {
        if (error.message !== 'UNAUTHORIZED') {
            showResultsError('Could not load cached event data.');
        }
    }
}

async function apiRequest(path, options = {}) {
    const requestOptions = {
        method: options.method || 'GET',
        headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        },
        cache: 'no-store'
    };

    if (options.body) {
        requestOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    const response = await fetch(`${API_ROOT}${path}`, requestOptions);
    const payload = await response.json().catch(() => ({ success: false, error: 'Invalid server response' }));

    if (response.status === 401 || response.status === 403) {
        showAuthScreen('Session expired. Sign in again.');
        throw new Error('UNAUTHORIZED');
    }

    if (!response.ok || payload.success === false) {
        throw new Error(payload.error || 'Request failed');
    }

    if (payload.sync) {
        setSyncStatus(payload.sync);
    }

    return payload;
}

function setSyncStatus(sync) {
    if (!sync || !sync.lastSyncAt) {
        els.syncStatus.textContent = 'Cache not loaded';
        return;
    }

    const timestamp = new Date(sync.lastSyncAt);
    const label = Number.isNaN(timestamp.getTime())
        ? sync.lastSyncAt
        : timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    els.syncStatus.textContent = `Cached ${label}`;
}

function renderStats(stats) {
    els.stats.checkedIn.textContent = stats.checkedIn;
    els.stats.expected.textContent = stats.notArrived;
    els.stats.keysOut.textContent = stats.keysOut;
}

function switchTab(tab) {
    if (tab === 'name') {
        els.tabNameBtn.classList.add('active');
        els.tabIdBtn.classList.remove('active');
        els.tabNamePanel.style.display = 'block';
        els.tabIdPanel.style.display = 'none';
        els.searchFirst.focus();
    } else {
        els.tabIdBtn.classList.add('active');
        els.tabNameBtn.classList.remove('active');
        els.tabIdPanel.style.display = 'block';
        els.tabNamePanel.style.display = 'none';
        els.searchRegId.focus();
    }
}

async function doSearchByName() {
    const firstName = (els.searchFirst.value || '').trim();
    const lastName = (els.searchLast.value || '').trim();
    if (!firstName && !lastName) return;

    showResultsLoading();

    try {
        const params = new URLSearchParams();
        if (firstName) params.set('firstName', firstName);
        if (lastName) params.set('lastName', lastName);
        const payload = await apiRequest(`/search?${params.toString()}`);
        renderResults(payload.results);
    } catch (error) {
        if (error.message !== 'UNAUTHORIZED') {
            showResultsError('Search failed.');
        }
    }
}

async function doSearchById() {
    const regId = (els.searchRegId.value || '').trim().toUpperCase();
    if (!regId) return;

    if (regId.startsWith('CM26-') && regId.length >= 9) {
        loadGuest(regId);
        return;
    }

    showResultsLoading();

    try {
        const payload = await apiRequest(`/search?regId=${encodeURIComponent(regId.toLowerCase())}`);
        renderResults(payload.results);
    } catch (error) {
        if (error.message !== 'UNAUTHORIZED') {
            showResultsError('Search failed.');
        }
    }
}

function renderResults(results) {
    els.resultsList.innerHTML = '';
    els.resultsList.style.display = 'block';
    els.guestDetail.style.display = 'none';

    if (!results || results.length === 0) {
        els.resultsList.innerHTML = '<div class="info-msg">No results found.</div>';
        return;
    }

    results.forEach((result) => {
        const div = document.createElement('div');
        div.className = 'card result-item';
        div.innerHTML = `
            <div class="result-header">
                <strong>${result.name}</strong>
                <span class="badge">${result.regId}</span>
            </div>
            <div class="result-meta">
                ${result.housingOption}${result.roomAssignment ? ' &mdash; Room ' + result.roomAssignment : ''}
                &nbsp;&bull;&nbsp; Guests: ${result.totalGuests}
                &nbsp;&bull;&nbsp; Balance: $${result.balanceDue}
            </div>
            <div class="result-action">
                ${result.checkedIn === 'yes'
                    ? `<button class="btn btn-secondary btn-sm" onclick="loadGuest('${result.regId}')">Manage Check-Out</button>`
                    : `<button class="btn btn-primary btn-sm" onclick="loadGuest('${result.regId}')">Check In &rarr;</button>`
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
        const payload = await apiRequest(`/arrivals?date=${encodeURIComponent(date)}`);
        renderResults(payload.arrivals);
    } catch (error) {
        if (error.message !== 'UNAUTHORIZED') {
            showResultsError('Failed to load arrivals.');
        }
    }
}

async function loadGuest(regId) {
    els.resultsList.style.display = 'none';
    els.guestDetail.innerHTML = '<div class="loading-state"><div class="spinner-ring"></div><p>Loading guest…</p></div>';
    els.guestDetail.style.display = 'block';

    try {
        const payload = await apiRequest(`/registration/${encodeURIComponent(regId)}`);
        currentReg = payload.registration;
        renderGuestDetail(payload.registration);
    } catch (error) {
        if (error.message === 'UNAUTHORIZED') return;
        els.guestDetail.innerHTML = '<div class="error-msg">Guest not found</div>';
    }
}

function renderGuestDetail(reg) {
    const isCheckedIn = reg.checkedIn === 'yes';
    const isCheckedOut = reg.checkedOut === 'yes';

    let actionBtn = '';
    if (!isCheckedIn) {
        actionBtn = '<button class="btn btn-primary full-width" onclick="openCheckIn()">Start Check-In</button>';
    } else if (!isCheckedOut) {
        actionBtn = '<button class="btn btn-danger full-width" onclick="openCheckOut()">Check Out</button>';
    } else {
        actionBtn = '<div class="info-msg">Already Checked Out</div>';
    }

    const statusBadge = isCheckedOut
        ? '<span class="status-badge checked-out">Checked Out</span>'
        : isCheckedIn
            ? '<span class="status-badge checked-in">Checked In</span>'
            : '<span class="status-badge not-arrived">Not Arrived</span>';

    const guests = Array.isArray(reg.guests) ? reg.guests : [];
    const guestListHtml = guests.length
        ? `<ul class="guest-name-list">${guests.map((g) =>
            `<li>${g.name}${g.isChild ? ' <span class="badge-child">Child</span>' : ''}</li>`
          ).join('')}</ul>`
        : '<p class="info-text-sm">No guest details on file.</p>';

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
        <div class="guest-list-section">
            <div class="guest-list-header">
                <strong>Party Members</strong>
                <button class="btn btn-sm btn-outline" onclick="openEditGuests()">Edit Guests</button>
            </div>
            ${guestListHtml}
        </div>
        <div class="detail-actions">
            ${actionBtn}
            <button class="btn btn-outline full-width" onclick="closeGuest()">← Back to Search</button>
        </div>
    `;
}

function openEditGuests() {
    if (!currentReg) return;

    const guests = Array.isArray(currentReg.guests) ? currentReg.guests : [];
    const editor = document.getElementById('guest-list-editor');
    editor.innerHTML = '';

    guests.forEach((g, idx) => {
        editor.appendChild(buildGuestRow(g.name, g.age || '', g.isChild || false, idx));
    });

    if (!guests.length) {
        editor.appendChild(buildGuestRow('', '', false, 0));
    }

    document.getElementById('edit-guests-modal').style.display = 'block';
    els.modals.overlay.style.display = 'block';
}

function buildGuestRow(name, age, isChild, idx) {
    const row = document.createElement('div');
    row.className = 'guest-edit-row';
    row.dataset.idx = idx;
    row.innerHTML = `
        <input type="text" class="guest-name-input" placeholder="Guest name" value="${name}" style="flex:1">
        <input type="number" class="guest-age-input" placeholder="Age" value="${age}" style="width:60px;min-width:60px" min="0" max="120">
        <button type="button" class="btn btn-sm btn-danger-outline" onclick="this.closest('.guest-edit-row').remove()">✕</button>
    `;
    return row;
}

function addGuestRow() {
    const editor = document.getElementById('guest-list-editor');
    editor.appendChild(buildGuestRow('', '', false, Date.now()));
}

async function saveGuestList() {
    if (!currentReg) return;

    const rows = document.querySelectorAll('#guest-list-editor .guest-edit-row');
    const guests = Array.from(rows).map((row) => {
        const name = row.querySelector('.guest-name-input').value.trim();
        const age = parseInt(row.querySelector('.guest-age-input').value, 10) || 0;
        return { name, age, isChild: age > 0 && age < 18 };
    }).filter((g) => g.name.length > 0);

    const saveBtn = document.getElementById('save-guests-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
        await apiRequest('/update-guests', {
            method: 'POST',
            body: {
                regId: currentReg.regId,
                guests,
                volunteer: currentUser ? currentUser.username : 'CheckInApp'
            }
        });
        logActivity(`Guests updated: ${currentReg.name}`, true);
        closeModal('edit-guests-modal');
        await loadGuest(currentReg.regId);
    } catch (error) {
        if (error.message !== 'UNAUTHORIZED') {
            document.getElementById('edit-guests-error').textContent = 'Save failed. Try again.';
            document.getElementById('edit-guests-error').style.display = 'block';
        }
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
}

function openCheckIn() {
    if (!currentReg) return;

    document.getElementById('ci-balance').textContent = currentReg.balanceDue;
    document.getElementById('ci-payment-amount').value = currentReg.balanceDue > 0 ? currentReg.balanceDue : '';
    document.getElementById('ci-key1').value = currentReg.key1Number || '';
    document.getElementById('ci-key2').value = currentReg.key2Number || '';

    els.modals.overlay.style.display = 'block';
    els.modals.checkin.style.display = 'block';
}

function submitCheckInForm(event) {
    event.preventDefault();
    const data = {
        regId: currentReg.regId,
        volunteer: currentUser ? currentUser.username : 'CheckInApp',
        amount: document.getElementById('ci-payment-amount').value,
        keyDepositAmount: 10,
        key1: document.getElementById('ci-key1').value,
        key2: document.getElementById('ci-key2').value,
        welcomePacket: document.getElementById('ci-packet-given').checked
    };

    submitAction('/check-in', data, 'Check-In');
    closeModal('checkin-modal');
}

function openCheckOut() {
    if (!currentReg) return;

    document.getElementById('co-key1-val').textContent = currentReg.key1Number || 'None';
    document.getElementById('co-key2-val').textContent = currentReg.key2Number || 'None';
    document.getElementById('co-deposit-paid').textContent = currentReg.keyDepositAmount || '0';

    els.modals.overlay.style.display = 'block';
    els.modals.checkout.style.display = 'block';
}

function submitCheckOutForm(event) {
    event.preventDefault();
    const data = {
        regId: currentReg.regId,
        volunteer: currentUser ? currentUser.username : 'CheckInApp',
        key1Returned: document.getElementById('co-key1-returned').checked,
        key2Returned: document.getElementById('co-key2-returned').checked,
        refundAmount: document.getElementById('co-refund-amount').value
    };

    submitAction('/check-out', data, 'Check-Out');
    closeModal('checkout-modal');
}

async function submitAction(path, data, type) {
    if (navigator.onLine) {
        try {
            await apiRequest(path, { method: 'POST', body: data });
            logActivity(`${type} Success: ${currentReg.name}`, true);
            await loadGuest(currentReg.regId);
            await refreshStats();
            return;
        } catch (error) {
            if (error.message === 'UNAUTHORIZED') return;
            queueOffline(data, type);
            return;
        }
    }

    queueOffline(data, type);
}

function queueOffline(data, type) {
    offlineQueue.push({
        path: type === 'Check-In' ? '/check-in' : '/check-out',
        data,
        desc: `${type}: ${currentReg.name}`,
        timestamp: Date.now()
    });
    localStorage.setItem('cm26_checkin_queue', JSON.stringify(offlineQueue));
    updateQueueUI();
    logActivity(`Queued (Offline): ${type} for ${currentReg.name}`, false);

    if (type === 'Check-In') {
        currentReg.checkedIn = 'yes';
    } else {
        currentReg.checkedOut = 'yes';
    }
    renderGuestDetail(currentReg);
}

async function processOfflineQueue() {
    if (!navigator.onLine || offlineQueue.length === 0 || !currentUser) return;

    els.syncBtn.textContent = 'Syncing…';
    const queue = [...offlineQueue];
    offlineQueue = [];
    localStorage.setItem('cm26_checkin_queue', JSON.stringify(offlineQueue));
    updateQueueUI();

    for (const item of queue) {
        try {
            await apiRequest(item.path, { method: 'POST', body: item.data });
            logActivity(`Synced: ${item.desc}`, true);
        } catch (error) {
            offlineQueue.push(item);
            localStorage.setItem('cm26_checkin_queue', JSON.stringify(offlineQueue));
            updateQueueUI();
            if (error.message === 'UNAUTHORIZED') break;
        }
    }

    els.syncBtn.textContent = 'Sync Now';
    refreshStats().catch(() => {});
}

async function refreshStats() {
    if (!navigator.onLine || !currentUser) return;

    try {
        const payload = await apiRequest('/stats');
        renderStats(payload.stats);
    } catch (_error) {}
}

function todayDateString() {
    return new Date().toISOString().split('T')[0];
}

function showResultsLoading(message) {
    els.resultsList.innerHTML = `<div class="loading-state"><div class="spinner-ring"></div><p>${message || 'Loading…'}</p></div>`;
    els.resultsList.style.display = 'block';
    els.guestDetail.style.display = 'none';
}

function showResultsError(message) {
    els.resultsList.innerHTML = `<div class="error-msg">${message}</div>`;
    els.resultsList.style.display = 'block';
    els.guestDetail.style.display = 'none';
}

function updateOnlineStatus() {
    if (navigator.onLine) {
        els.connectionStatus.textContent = 'Online';
        els.connectionStatus.className = 'status-indicator online';
        if (currentUser && offlineQueue.length > 0) {
            processOfflineQueue();
        }
    } else {
        els.connectionStatus.textContent = 'Offline';
        els.connectionStatus.className = 'status-indicator offline';
    }
}

function updateQueueUI() {
    els.queueCount.textContent = offlineQueue.length;
    els.queueBar.style.display = offlineQueue.length > 0 ? 'flex' : 'none';
}

function logActivity(message, success) {
    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
    if (success) item.style.color = '#2f855a';
    els.activityList.prepend(item);
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    els.modals.overlay.style.display = 'none';
}

function closeGuest() {
    els.guestDetail.style.display = 'none';
    els.resultsList.style.display = 'block';
}

function toggleScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode = null;
            els.reader.style.display = 'none';
            els.scanBtn.textContent = '📷 Scan QR';
        });
        return;
    }

    els.reader.style.display = 'block';
    html5QrCode = new Html5Qrcode('reader');
    html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (text) => {
            toggleScanner();
            if (text.startsWith('CM26')) {
                loadGuest(text);
            } else {
                els.searchRegId.value = text;
                switchTab('id');
                doSearchById();
            }
        }
    );
    els.scanBtn.textContent = 'Stop Scan';
}
