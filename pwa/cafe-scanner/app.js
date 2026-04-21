// Cafe Scanner PWA Logic

const APP_NAME = 'cafe';
const API_ROOT = `${typeof CM26_API_BASE === 'string' ? CM26_API_BASE : '/api'}/${APP_NAME}`;

let html5QrCode;
let scanActive = false;
let offlineQueue = JSON.parse(localStorage.getItem('cm26_queue') || '[]');
let currentUser = null;
let bindingsInitialized = false;

const els = {
    reader: document.getElementById('reader'),
    startBtn: document.getElementById('start-scan-btn'),
    stopBtn: document.getElementById('stop-scan-btn'),
    manualInput: document.getElementById('manual-input'),
    manualBtn: document.getElementById('manual-lookup-btn'),
    nameFirstInput: document.getElementById('name-first-input'),
    nameLastInput: document.getElementById('name-last-input'),
    nameLookupBtn: document.getElementById('name-lookup-btn'),
    nameResults: document.getElementById('name-search-results'),
    ltIdBtn: document.getElementById('lt-id-btn'),
    ltNameBtn: document.getElementById('lt-name-btn'),
    ltIdPanel: document.getElementById('lookup-id-panel'),
    ltNamePanel: document.getElementById('lookup-name-panel'),
    mealSelect: document.getElementById('current-meal-select'),
    dateOverride: document.getElementById('date-override'),
    activeMealBadge: document.getElementById('current-active-meal'),
    resultCard: document.getElementById('result-card'),
    guestName: document.getElementById('guest-name'),
    regIdDisplay: document.getElementById('reg-id-display'),
    cardLoading: document.getElementById('card-loading'),
    ticketsFound: document.getElementById('tickets-found'),
    ticketsUsed: document.getElementById('tickets-used'),
    dietaryWarning: document.getElementById('dietary-warning'),
    dietaryText: document.getElementById('dietary-text'),
    actionMealName: document.getElementById('action-meal-name'),
    redeemButtons: document.getElementById('redeem-buttons'),
    redeemMessage: document.getElementById('redeem-message'),
    closeCardBtn: document.getElementById('close-card-btn'),
    statusIndicator: document.getElementById('connection-status'),
    offlineBar: document.getElementById('offline-queue-bar'),
    queueCount: document.getElementById('queue-count'),
    syncBtn: document.getElementById('sync-btn'),
    activityList: document.getElementById('activity-list'),
    userDisplay: document.getElementById('user-display'),
    syncStatus: document.getElementById('sync-status'),
    logoutBtn: document.getElementById('logout-btn'),
    auth: {
        screen: document.getElementById('auth-screen'),
        form: document.getElementById('login-form'),
        username: document.getElementById('login-username'),
        password: document.getElementById('login-password'),
        error: document.getElementById('login-error')
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    els.dateOverride.value = todayDateString();
    determineCurrentMeal();
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

    els.startBtn.addEventListener('click', startScanning);
    els.stopBtn.addEventListener('click', stopScanning);

    els.manualBtn.addEventListener('click', () => handleLookupById(els.manualInput.value.trim()));
    els.manualInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') handleLookupById(els.manualInput.value.trim());
    });

    els.nameLookupBtn.addEventListener('click', handleNameSearch);
    els.nameFirstInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') handleNameSearch(); });
    els.nameLastInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') handleNameSearch(); });

    els.closeCardBtn.addEventListener('click', closeCard);
    els.syncBtn.addEventListener('click', processOfflineQueue);
    els.mealSelect.addEventListener('change', determineCurrentMeal);
    els.dateOverride.addEventListener('change', determineCurrentMeal);
    els.logoutBtn.addEventListener('click', logout);
    els.auth.form.addEventListener('submit', handleLogin);
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
    fetchSyncStatus();
    if (navigator.onLine && offlineQueue.length > 0) {
        processOfflineQueue();
    }
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
    stopScanning();
    await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => {});
    showAuthScreen('Signed out.');
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

async function fetchSyncStatus() {
    try {
        const response = await fetch('/api/sync/status', {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });
        if (!response.ok) return;
        const payload = await response.json();
        setSyncStatus(payload.sync);
    } catch (_error) {}
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

function switchLookupTab(tab) {
    if (tab === 'id') {
        els.ltIdBtn.classList.add('active');
        els.ltNameBtn.classList.remove('active');
        els.ltIdPanel.style.display = 'block';
        els.ltNamePanel.style.display = 'none';
        els.manualInput.focus();
    } else {
        els.ltNameBtn.classList.add('active');
        els.ltIdBtn.classList.remove('active');
        els.ltNamePanel.style.display = 'block';
        els.ltIdPanel.style.display = 'none';
        els.nameFirstInput.focus();
    }
}

function startScanning() {
    html5QrCode = new Html5Qrcode('reader');
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: 'environment' }, config, onScanSuccess)
        .then(() => {
            scanActive = true;
            els.startBtn.style.display = 'none';
            els.stopBtn.style.display = 'inline-block';
            els.reader.style.display = 'block';
        })
        .catch((error) => {
            alert('Error starting camera: ' + error);
        });
}

function stopScanning() {
    if (html5QrCode && scanActive) {
        html5QrCode.stop().then(() => {
            scanActive = false;
            els.startBtn.style.display = 'inline-block';
            els.stopBtn.style.display = 'none';
            els.reader.style.display = 'none';
            html5QrCode = null;
        });
    }
}

function onScanSuccess(decodedText) {
    stopScanning();
    handleLookupById(decodedText);
}

function determineCurrentMeal() {
    const override = els.mealSelect.value;
    const dateOverrideValue = els.dateOverride.value;

    let meal = '';
    let now;

    if (dateOverrideValue) {
        const [year, month, day] = dateOverrideValue.split('-').map(Number);
        const realNow = new Date();
        now = new Date(year, month - 1, day, realNow.getHours(), realNow.getMinutes());
    } else {
        now = new Date();
    }

    const hour = now.getHours();
    const day = now.getDay();
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const today = days[day];

    if (override !== 'auto') {
        meal = override;
    } else if (hour < 10) {
        meal = 'breakfast';
    } else if (hour < 15) {
        meal = 'lunch';
    } else {
        meal = 'supper';
    }

    const dateLabel = dateOverrideValue ? ` ${dateOverrideValue}` : '';
    els.activeMealBadge.textContent = `${meal.toUpperCase()} (${today.toUpperCase()})${dateLabel}`;
    els.activeMealBadge.dataset.meal = meal;
    els.activeMealBadge.dataset.day = today;

    return { meal, day: today };
}

function handleLookupById(input) {
    if (!input) return;

    showCardLoading(input);

    if (!navigator.onLine) {
        els.redeemButtons.innerHTML = '<p class="error">Cannot look up guests while offline.</p>';
        return;
    }

    if (input.startsWith('MT-')) {
        redeemTicket(input, 'Direct Scan');
        closeCard();
        return;
    }

    fetchGuestMeals(input);
}

async function fetchGuestMeals(regId) {
    try {
        const payload = await apiRequest(`/guest-meals/${encodeURIComponent(regId)}`);
        renderGuestCard(payload);
    } catch (error) {
        if (error.message !== 'UNAUTHORIZED') {
            els.redeemButtons.innerHTML = '<p class="error">Guest not found or connection error.</p>';
            els.cardLoading.style.display = 'none';
        }
    }
}

function showCardLoading(label) {
    els.redeemMessage.textContent = 'Loading tickets…';
    els.resultCard.style.display = 'block';
    els.redeemButtons.innerHTML = '<div class="spinner-inline"></div>';
    els.dietaryWarning.style.display = 'none';
    els.guestName.textContent = label || '…';
    els.regIdDisplay.textContent = '';
    els.ticketsFound.textContent = '–';
    els.ticketsUsed.textContent = '–';
    els.cardLoading.style.display = 'block';
}

async function handleNameSearch() {
    const firstName = (els.nameFirstInput.value || '').trim();
    const lastName = (els.nameLastInput.value || '').trim();
    if (!firstName && !lastName) return;

    if (!navigator.onLine) {
        els.nameResults.innerHTML = '<p class="error">Cannot search while offline.</p>';
        els.nameResults.style.display = 'block';
        return;
    }

    els.nameResults.innerHTML = '<div class="spinner-inline"></div>';
    els.nameResults.style.display = 'block';

    try {
        const params = new URLSearchParams();
        if (firstName) params.append('firstName', firstName);
        if (lastName) params.append('lastName', lastName);
        const payload = await apiRequest(`/search?${params.toString()}`);
        renderNameResults(payload.results || []);
    } catch (error) {
        if (error.message !== 'UNAUTHORIZED') {
            els.nameResults.innerHTML = '<p class="error">Search failed. Try again.</p>';
        }
    }
}

function renderNameResults(results) {
    els.nameResults.innerHTML = '';

    if (!results.length) {
        els.nameResults.innerHTML = '<p class="info-text">No results found.</p>';
        return;
    }

    results.forEach((result) => {
        const button = document.createElement('button');
        button.className = 'btn btn-secondary name-result-btn';
        button.innerHTML = `<strong>${result.name}</strong> <span class="badge">${result.regId}</span>`;
        button.addEventListener('click', () => {
            switchLookupTab('id');
            els.manualInput.value = result.regId;
            handleLookupById(result.regId);
            els.nameResults.style.display = 'none';
        });
        els.nameResults.appendChild(button);
    });
}

function renderGuestCard(data) {
    const reg = data.registration;
    const tickets = data.tickets;
    const current = determineCurrentMeal();

    els.guestName.textContent = reg.name;
    els.regIdDisplay.textContent = reg.regId;
    els.cardLoading.style.display = 'none';

    if (reg.dietaryNeeds) {
        els.dietaryText.textContent = reg.dietaryNeeds;
        els.dietaryWarning.style.display = 'block';
    } else {
        els.dietaryWarning.style.display = 'none';
    }

    const relevantTickets = tickets.filter((ticket) =>
        ticket.mealType === current.meal &&
        ticket.day === current.day
    );

    const unusedTickets = relevantTickets.filter((ticket) => ticket.redeemed !== 'yes');

    els.ticketsFound.textContent = relevantTickets.length;
    els.ticketsUsed.textContent = relevantTickets.length - unusedTickets.length;
    els.actionMealName.textContent = `${current.meal} (${current.day})`;
    els.redeemButtons.innerHTML = '';

    if (unusedTickets.length === 0) {
        els.redeemMessage.textContent = 'No valid tickets for this meal.';
        return;
    }

    els.redeemMessage.textContent = 'Select tickets to redeem:';

    const redeemAll = document.createElement('button');
    redeemAll.className = 'btn btn-redeem full-width';
    redeemAll.textContent = `Redeem All (${unusedTickets.length})`;
    redeemAll.addEventListener('click', () => {
        unusedTickets.forEach((ticket) => redeemTicket(ticket.ticketId, ticket.guestName));
        redeemAll.disabled = true;
        redeemAll.textContent = 'Redeeming…';
    });
    els.redeemButtons.appendChild(redeemAll);

    unusedTickets.forEach((ticket) => {
        const button = document.createElement('button');
        button.className = 'btn btn-secondary';
        button.textContent = `${ticket.guestName} (${ticket.ticketType})`;
        button.addEventListener('click', () => {
            redeemTicket(ticket.ticketId, ticket.guestName);
            button.disabled = true;
            button.style.opacity = '0.5';
        });
        els.redeemButtons.appendChild(button);
    });
}

async function redeemTicket(ticketId, guestName) {
    const payload = {
        ticketId,
        volunteer: currentUser ? currentUser.username : 'ScannerApp'
    };

    if (navigator.onLine) {
        try {
            await apiRequest('/redeem', { method: 'POST', body: payload });
            logActivity(`Redeemed: ${guestName}`, true);
        } catch (error) {
            if (error.message === 'UNAUTHORIZED') return;
            queueOffline(payload, guestName);
        }
        return;
    }

    queueOffline(payload, guestName);
}

function queueOffline(payload, name) {
    offlineQueue.push({
        payload,
        timestamp: Date.now(),
        desc: name
    });
    localStorage.setItem('cm26_queue', JSON.stringify(offlineQueue));
    updateQueueUI();
    logActivity(`Queued (Offline): ${name}`, false);
}

async function processOfflineQueue() {
    if (offlineQueue.length === 0 || !navigator.onLine || !currentUser) return;

    els.syncBtn.textContent = 'Syncing…';
    const queued = [...offlineQueue];
    offlineQueue = [];
    localStorage.setItem('cm26_queue', JSON.stringify(offlineQueue));
    updateQueueUI();

    for (const item of queued) {
        try {
            await apiRequest('/redeem', { method: 'POST', body: item.payload });
            logActivity(`Synced: ${item.desc}`, true);
        } catch (error) {
            offlineQueue.push(item);
            localStorage.setItem('cm26_queue', JSON.stringify(offlineQueue));
            updateQueueUI();
            if (error.message === 'UNAUTHORIZED') break;
        }
    }

    els.syncBtn.textContent = 'Sync Now';
}

function todayDateString() {
    return new Date().toISOString().split('T')[0];
}

function updateOnlineStatus() {
    if (navigator.onLine) {
        els.statusIndicator.textContent = 'Online';
        els.statusIndicator.className = 'status-indicator online';
        if (currentUser && offlineQueue.length > 0) {
            processOfflineQueue();
        }
    } else {
        els.statusIndicator.textContent = 'Offline';
        els.statusIndicator.className = 'status-indicator offline';
    }
}

function updateQueueUI() {
    els.queueCount.textContent = offlineQueue.length;
    els.offlineBar.style.display = offlineQueue.length > 0 ? 'flex' : 'none';
}

function logActivity(message, success) {
    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
    if (success) item.className = 'success';
    els.activityList.prepend(item);
}

function closeCard() {
    els.resultCard.style.display = 'none';
    els.manualInput.value = '';
    els.nameResults.style.display = 'none';
}
