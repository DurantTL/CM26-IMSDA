require('dotenv').config();

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const gasUrl = process.env.GOOGLE_SCRIPT_URL || '';
const gasToken = process.env.GAS_ACCESS_TOKEN || '';
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const sessionCookieName = 'cm26_session';
const sessionTtlSeconds = parseInt(process.env.SESSION_TTL_SECONDS || '43200', 10);
const syncIntervalMs = parseInt(process.env.PWA_SYNC_INTERVAL_MS || '60000', 10);

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET not set. Using an ephemeral secret for this process.');
}

if (!gasUrl) {
  console.warn('GOOGLE_SCRIPT_URL not set. Sync and proxy APIs will be unavailable.');
}

if (!gasToken) {
  console.warn('GAS_ACCESS_TOKEN not set. GAS requests will be rejected by the auth gate.');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self)');
  next();
});

function loadAuthUsers() {
  if (process.env.CM26_AUTH_USERS) {
    try {
      const parsed = JSON.parse(process.env.CM26_AUTH_USERS);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((user) => user && user.username && user.password)
          .map((user) => ({
            username: String(user.username),
            password: String(user.password),
            apps: Array.isArray(user.apps) && user.apps.length ? user.apps.map(String) : ['checkin', 'cafe']
          }));
      }
    } catch (error) {
      console.error('Failed to parse CM26_AUTH_USERS:', error.message);
    }
  }

  if (process.env.PWA_USERNAME && process.env.PWA_PASSWORD) {
    return [{
      username: process.env.PWA_USERNAME,
      password: process.env.PWA_PASSWORD,
      apps: (process.env.PWA_ALLOWED_APPS || 'checkin,cafe')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    }];
  }

  return [];
}

const authUsers = loadAuthUsers();

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((cookies, part) => {
    const trimmed = part.trim();
    if (!trimmed) return cookies;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return cookies;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const missing = padded.length % 4;
  const withPadding = missing ? padded + '='.repeat(4 - missing) : padded;
  return Buffer.from(withPadding, 'base64').toString('utf8');
}

function signSession(payload) {
  const json = JSON.stringify(payload);
  const encoded = toBase64Url(json);
  const signature = crypto
    .createHmac('sha256', sessionSecret)
    .update(encoded)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${encoded}.${signature}`;
}

function verifySession(token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = crypto
    .createHmac('sha256', sessionSecret)
    .update(encoded)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encoded));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

function createSession(user) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return signSession({
    sub: user.username,
    apps: user.apps,
    iat: issuedAt,
    exp: issuedAt + sessionTtlSeconds
  });
}

function setSessionCookie(res, token) {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${sessionTtlSeconds}`
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  const parts = [
    `${sessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0'
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verifySession(cookies[sessionCookieName]);
}

function attachSession(req, _res, next) {
  req.session = getSession(req);
  next();
}

function requireAuthenticated(req, res, next) {
  req.session = getSession(req);
  if (!req.session) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  next();
}

function requireAppAccess(appName) {
  return (req, res, next) => {
    req.session = getSession(req);
    if (!req.session) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!Array.isArray(req.session.apps) || !req.session.apps.includes(appName)) {
      return res.status(403).json({ success: false, error: `Access denied for ${appName}` });
    }
    next();
  };
}

function noStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Try again in 15 minutes.' }
});

function jsonOrEmpty(text) {
  if (!text) return {};
  return JSON.parse(text);
}

async function fetchGasJson(action, params = {}, method = 'GET') {
  if (!gasUrl) {
    throw new Error('GOOGLE_SCRIPT_URL is not configured');
  }

  if (method === 'GET') {
    const url = new URL(gasUrl);
    url.searchParams.set('action', action);
    if (gasToken) url.searchParams.set('token', gasToken);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      redirect: 'follow'
    });

    const text = await response.text();
    return jsonOrEmpty(text);
  }

  const postUrl = new URL(gasUrl);
  if (gasToken) postUrl.searchParams.set('token', gasToken);

  const response = await fetch(postUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({ action, ...params }),
    redirect: 'follow'
  });

  const text = await response.text();
  return jsonOrEmpty(text);
}

function defaultStats() {
  return {
    totalRegistrations: 0,
    checkedIn: 0,
    notArrived: 0,
    checkedOut: 0,
    keysOut: 0,
    depositsHeld: 0,
    balancesDue: 0
  };
}

const syncState = {
  registrations: [],
  registrationsById: new Map(),
  ticketsByRegId: new Map(),
  ticketById: new Map(),
  stats: defaultStats(),
  lastSyncAt: null,
  lastSyncError: null,
  syncPromise: null
};

const MIN_SYNC_THRESHOLD = parseInt(process.env.SYNC_MIN_REGISTRATIONS || '5', 10);

function buildSyncIndexes(payload) {
  const registrations = Array.isArray(payload.registrations) ? payload.registrations : [];
  const tickets = Array.isArray(payload.tickets) ? payload.tickets : [];

  if (syncState.registrations.length >= MIN_SYNC_THRESHOLD && registrations.length < MIN_SYNC_THRESHOLD) {
    console.warn(
      `[sync] Skipping cache update: GAS returned ${registrations.length} registration(s) ` +
      `(threshold ${MIN_SYNC_THRESHOLD}). Keeping ${syncState.registrations.length} cached records.`
    );
    return;
  }

  syncState.registrations = registrations;
  syncState.registrationsById = new Map();
  syncState.ticketsByRegId = new Map();
  syncState.ticketById = new Map();

  registrations.forEach((registration) => {
    syncState.registrationsById.set(registration.regId, registration);
  });

  tickets.forEach((ticket) => {
    syncState.ticketById.set(ticket.ticketId, ticket);
    const regTickets = syncState.ticketsByRegId.get(ticket.regId) || [];
    regTickets.push(ticket);
    syncState.ticketsByRegId.set(ticket.regId, regTickets);
  });

  syncState.registrations.forEach((registration) => {
    registration.mealTicketCount = (syncState.ticketsByRegId.get(registration.regId) || []).length;
  });

  syncState.stats = payload.stats || defaultStats();
  syncState.lastSyncAt = payload.syncedAt || new Date().toISOString();
}

function getSyncMeta() {
  return {
    lastSyncAt: syncState.lastSyncAt,
    lastSyncError: syncState.lastSyncError,
    registrationsCached: syncState.registrations.length,
    ticketsCached: syncState.ticketById.size
  };
}

async function refreshSyncCache(force) {
  if (syncState.syncPromise && !force) {
    return syncState.syncPromise;
  }

  syncState.syncPromise = (async () => {
    const payload = await fetchGasJson('getPwaSyncData');
    if (!payload.success) {
      throw new Error(payload.error || 'Sync failed');
    }

    buildSyncIndexes(payload);
    syncState.lastSyncError = null;
    return getSyncMeta();
  })()
    .catch((error) => {
      syncState.lastSyncError = error.message;
      throw error;
    })
    .finally(() => {
      syncState.syncPromise = null;
    });

  return syncState.syncPromise;
}

async function ensureCacheReady() {
  if (syncState.registrations.length > 0) {
    return;
  }
  await refreshSyncCache(false);
}

function summarizeRegistration(registration) {
  return {
    regId: registration.regId,
    name: registration.name,
    housingOption: registration.housingOption,
    roomAssignment: registration.roomAssignment,
    totalGuests: registration.totalGuests,
    balanceDue: registration.balanceDue,
    checkedIn: registration.checkedIn,
    checkedOut: registration.checkedOut
  };
}

function searchRegistrationsLocal(params = {}) {
  const firstName = String(params.firstName || '').trim().toLowerCase();
  const lastName = String(params.lastName || '').trim().toLowerCase();
  const regId = String(params.regId || '').trim().toLowerCase();
  const query = String(params.query || '').trim().toLowerCase();

  const results = syncState.registrations
    .filter((registration) => registration.status !== 'cancelled')
    .filter((registration) => {
      const fullName = String(registration.name || '').toLowerCase();
      const registrationId = String(registration.regId || '').toLowerCase();

      if (regId) {
        return registrationId === regId || registrationId.startsWith(regId);
      }

      if (firstName || lastName) {
        const primaryMatch =
          (!firstName || fullName.includes(firstName)) &&
          (!lastName || fullName.includes(lastName));
        if (primaryMatch) return true;

        const guests = Array.isArray(registration.guests) ? registration.guests : [];
        return guests.some((g) => {
          const gn = String(g.name || '').toLowerCase();
          return (!firstName || gn.includes(firstName)) && (!lastName || gn.includes(lastName));
        });
      }

      if (query) {
        return fullName.includes(query) || registrationId.includes(query);
      }

      return false;
    })
    .map((registration) => {
      const summary = summarizeRegistration(registration);

      if (firstName || lastName) {
        const fullName = String(registration.name || '').toLowerCase();
        const primaryMatch =
          (!firstName || fullName.includes(firstName)) &&
          (!lastName || fullName.includes(lastName));

        if (!primaryMatch) {
          const guests = Array.isArray(registration.guests) ? registration.guests : [];
          const matched = guests
            .filter((g) => {
              const gn = String(g.name || '').toLowerCase();
              return (!firstName || gn.includes(firstName)) && (!lastName || gn.includes(lastName));
            })
            .map((g) => g.name);
          if (matched.length) summary.matchedGuests = matched;
        }
      }

      return summary;
    })
    .slice(0, 50);

  return { success: true, results, count: results.length, sync: getSyncMeta() };
}

function getArrivalsLocal(dateStr) {
  const targetDate = String(dateStr || '');
  const dateMap = {
    '2026-06-02': 'tue',
    '2026-06-03': 'wed',
    '2026-06-04': 'thu',
    '2026-06-05': 'fri',
    '2026-06-06': 'sat'
  };
  const targetNight = dateMap[targetDate] || 'tue';

  const arrivals = syncState.registrations
    .filter((registration) => {
      const status = registration.status;
      const nights = String(registration.nights || '').toLowerCase();
      return (
        registration.checkedIn !== 'yes' &&
        ['confirmed', 'pending', 'deposit'].includes(status) &&
        nights.includes(targetNight)
      );
    })
    .map((registration) => ({
      regId: registration.regId,
      name: registration.name,
      housingOption: registration.housingOption,
      roomAssignment: registration.roomAssignment,
      totalGuests: registration.totalGuests,
      balanceDue: registration.balanceDue,
      specialNeeds: registration.specialNeeds
    }));

  return {
    success: true,
    date: targetDate,
    arrivals,
    count: arrivals.length,
    sync: getSyncMeta()
  };
}

function getCheckInRegistrationLocal(regId) {
  const registration = syncState.registrationsById.get(regId);
  if (!registration) {
    return { success: false, error: 'Registration not found' };
  }

  return {
    success: true,
    registration: {
      ...registration,
      mealTicketCount: (syncState.ticketsByRegId.get(regId) || []).length
    },
    sync: getSyncMeta()
  };
}

function getGuestMealsLocal(regId) {
  const registration = syncState.registrationsById.get(regId);
  if (!registration) {
    return { success: false, error: 'Registration not found' };
  }

  const tickets = syncState.ticketsByRegId.get(regId) || [];
  return {
    success: true,
    registration: {
      regId: registration.regId,
      name: registration.name,
      email: registration.email,
      housing: registration.housingOption,
      totalGuests: registration.totalGuests,
      guests: Array.isArray(registration.guests) ? registration.guests : [],
      dietaryNeeds: registration.dietaryNeeds
    },
    tickets,
    ticketCount: tickets.length,
    redeemedCount: tickets.filter((ticket) => ticket.redeemed === 'yes').length,
    sync: getSyncMeta()
  };
}

app.post('/api/auth/login', noStore, loginRateLimiter, async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const appName = String(req.body.app || '').trim();

  if (!authUsers.length) {
    return res.status(503).json({ success: false, error: 'No PWA users are configured on the server' });
  }

  const user = authUsers.find((candidate) => candidate.username === username);
  const passwordMatch = user ? await bcrypt.compare(password, user.password) : false;
  if (!user || !passwordMatch) {
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }

  if (appName && !user.apps.includes(appName)) {
    return res.status(403).json({ success: false, error: `This account cannot access ${appName}` });
  }

  const token = createSession(user);
  setSessionCookie(res, token);

  return res.json({
    success: true,
    user: {
      username: user.username,
      apps: user.apps
    }
  });
});

app.get('/api/auth/me', noStore, attachSession, (req, res) => {
  if (!req.session) {
    return res.status(401).json({ success: false, error: 'Not signed in' });
  }

  const appName = String(req.query.app || '').trim();
  if (appName && (!Array.isArray(req.session.apps) || !req.session.apps.includes(appName))) {
    return res.status(403).json({ success: false, error: `No access to ${appName}` });
  }

  return res.json({
    success: true,
    user: {
      username: req.session.sub,
      apps: req.session.apps
    }
  });
});

app.post('/api/auth/logout', noStore, (_req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/sync/status', noStore, requireAuthenticated, async (_req, res) => {
  try {
    await ensureCacheReady();
    res.json({ success: true, sync: getSyncMeta() });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.post('/api/sync/refresh', noStore, requireAuthenticated, async (_req, res) => {
  try {
    const sync = await refreshSyncCache(true);
    res.json({ success: true, sync });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.get('/api/checkin/bootstrap', noStore, requireAppAccess('checkin'), async (_req, res) => {
  try {
    await ensureCacheReady();
    res.json({ success: true, stats: syncState.stats, sync: getSyncMeta() });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.get('/api/checkin/search', noStore, requireAppAccess('checkin'), async (req, res) => {
  try {
    await ensureCacheReady();
    res.json(searchRegistrationsLocal(req.query));
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.get('/api/checkin/registration/:regId', noStore, requireAppAccess('checkin'), async (req, res) => {
  try {
    await ensureCacheReady();
    const payload = getCheckInRegistrationLocal(req.params.regId);
    const statusCode = payload.success ? 200 : 404;
    res.status(statusCode).json(payload);
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.get('/api/checkin/arrivals', noStore, requireAppAccess('checkin'), async (req, res) => {
  try {
    await ensureCacheReady();
    res.json(getArrivalsLocal(req.query.date));
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.get('/api/checkin/stats', noStore, requireAppAccess('checkin'), async (_req, res) => {
  try {
    await ensureCacheReady();
    res.json({ success: true, stats: syncState.stats, sync: getSyncMeta() });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.post('/api/checkin/check-in', noStore, requireAppAccess('checkin'), async (req, res) => {
  try {
    const payload = await fetchGasJson('checkIn', req.body, 'POST');
    if (payload.success) {
      await refreshSyncCache(true);
    }
    res.status(payload.success ? 200 : 400).json({ ...payload, sync: getSyncMeta() });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.post('/api/checkin/check-out', noStore, requireAppAccess('checkin'), async (req, res) => {
  try {
    const payload = await fetchGasJson('checkOut', req.body, 'POST');
    if (payload.success) {
      await refreshSyncCache(true);
    }
    res.status(payload.success ? 200 : 400).json({ ...payload, sync: getSyncMeta() });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.post('/api/checkin/update-guests', noStore, requireAppAccess('checkin'), async (req, res) => {
  try {
    const payload = await fetchGasJson('updateGuestDetails', req.body, 'POST');
    if (payload.success) {
      await refreshSyncCache(true);
    }
    res.status(payload.success ? 200 : 400).json({ ...payload, sync: getSyncMeta() });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.get('/api/cafe/search', noStore, requireAppAccess('cafe'), async (req, res) => {
  try {
    await ensureCacheReady();
    res.json(searchRegistrationsLocal(req.query));
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.get('/api/cafe/guest-meals/:regId', noStore, requireAppAccess('cafe'), async (req, res) => {
  try {
    await ensureCacheReady();
    const payload = getGuestMealsLocal(req.params.regId);
    res.status(payload.success ? 200 : 404).json(payload);
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

app.post('/api/cafe/redeem', noStore, requireAppAccess('cafe'), async (req, res) => {
  try {
    const payload = await fetchGasJson('redeemMeal', req.body, 'POST');
    if (payload.success) {
      await refreshSyncCache(true);
    }
    res.status(payload.success ? 200 : 400).json({ ...payload, sync: getSyncMeta() });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message, sync: getSyncMeta() });
  }
});

function htmlHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
}

app.use('/cafe', express.static(path.join(__dirname, 'pwa/cafe-scanner'), { setHeaders: htmlHeaders }));
app.use('/checkin', express.static(path.join(__dirname, 'pwa/check-in'), { setHeaders: htmlHeaders }));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), sync: getSyncMeta() });
});

app.get('/', noStore, (_req, res) => {
  res.send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>CM26 Apps</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;background:#f7fafc;color:#1a202c}' +
    'a{display:block;padding:16px;margin:10px 0;background:#2f855a;color:#fff;text-decoration:none;border-radius:8px;text-align:center;font-size:18px}' +
    'a:hover{opacity:0.9}a.cafe{background:#1a365d}.meta{margin-top:20px;padding:14px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}</style></head><body>' +
    '<h1>Camp Meeting 2026</h1><p>Open a volunteer app and sign in with a server-configured account.</p>' +
    '<a href="/checkin">Check-In System</a>' +
    '<a href="/cafe" class="cafe">Cafe Scanner</a>' +
    `<div class="meta"><strong>Sync:</strong> ${syncState.lastSyncAt || 'Not synced yet'}<br><strong>Cached registrations:</strong> ${syncState.registrations.length}<br><strong>Cached tickets:</strong> ${syncState.ticketById.size}</div>` +
    '</body></html>'
  );
});

app.listen(port, async () => {
  console.log(`CM26 PWA server running on port ${port}`);
  console.log(`  Check-In:     http://localhost:${port}/checkin`);
  console.log(`  Cafe Scanner: http://localhost:${port}/cafe`);
  console.log(`  Health Check: http://localhost:${port}/health`);

  if (gasUrl) {
    try {
      await refreshSyncCache(true);
      console.log(`Initial sync complete at ${syncState.lastSyncAt}`);
    } catch (error) {
      console.error('Initial sync failed:', error.message);
    }

    setInterval(() => {
      refreshSyncCache(false).catch((error) => {
        console.error('Background sync failed:', error.message);
      });
    }, syncIntervalMs);
  }
});
