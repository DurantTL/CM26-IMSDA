const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// --- Inject Google Apps Script URL at runtime ---
// If GOOGLE_SCRIPT_URL is set as an environment variable, generate config.js
// files dynamically so the PWAs use the correct backend URL without rebuilding.
const gasUrl = process.env.GOOGLE_SCRIPT_URL;
if (gasUrl) {
  const configContent = `const GOOGLE_SCRIPT_URL = '${gasUrl}';\n`;
  fs.writeFileSync(path.join(__dirname, 'pwa/cafe-scanner/config.js'), configContent);
  fs.writeFileSync(path.join(__dirname, 'pwa/check-in/config.js'), configContent);
  console.log('Config files updated with GOOGLE_SCRIPT_URL from environment');
}

// --- Security headers ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// --- Static PWA routes ---
app.use('/cafe', express.static(path.join(__dirname, 'pwa/cafe-scanner')));
app.use('/checkin', express.static(path.join(__dirname, 'pwa/check-in')));

// --- Health check endpoint (for Render.com, Docker, load balancers) ---
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Root landing page ---
app.get('/', (req, res) => {
  res.send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>CM26 Apps</title><style>body{font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 20px}' +
    'a{display:block;padding:16px;margin:10px 0;background:#2f855a;color:#fff;text-decoration:none;border-radius:8px;text-align:center;font-size:18px}' +
    'a:hover{opacity:0.9}a.cafe{background:#1a365d}</style></head><body>' +
    '<h1>Camp Meeting 2026</h1><p>Select an application:</p>' +
    '<a href="/checkin">Check-In System</a>' +
    '<a href="/cafe" class="cafe">Cafe Scanner</a>' +
    '</body></html>'
  );
});

// --- Start server ---
app.listen(port, () => {
  console.log(`CM26 PWA server running on port ${port}`);
  console.log(`  Check-In:     http://localhost:${port}/checkin`);
  console.log(`  Cafe Scanner: http://localhost:${port}/cafe`);
  console.log(`  Health Check: http://localhost:${port}/health`);
});
