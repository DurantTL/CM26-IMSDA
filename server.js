const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serve Cafe Scanner PWA at /cafe
app.use('/cafe', express.static(path.join(__dirname, 'pwa/cafe-scanner')));

// Serve Check-In PWA at /checkin
app.use('/checkin', express.static(path.join(__dirname, 'pwa/check-in')));

// Root redirect (can be customized)
app.get('/', (req, res) => {
  res.send('<h1>CM26 PWA Host</h1><ul><li><a href="/cafe">Cafe Scanner</a></li><li><a href="/checkin">Check-In System</a></li></ul>');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
