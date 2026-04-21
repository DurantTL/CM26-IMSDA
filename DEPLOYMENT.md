# CM26 Deployment Guide

This project has two separate deployments:

1. **Google Apps Script Backend** - runs on Google's infrastructure
2. **PWA Frontend Server** - runs on Render.com, any Node.js host, or Docker

---

## 1. Google Apps Script Backend

The backend code resides in the root of this repository (`.gs` and `.html` files). It provides the API used by the web apps and manages all data in Google Sheets.

### Prerequisites

- A Google account with access to the Camp Meeting Google Sheet
- [clasp](https://github.com/google/clasp) installed globally: `npm install -g @google/clasp`
- Authenticated with Google: `clasp login`

### Initial Setup

1. **Configure the Spreadsheet ID:**
   Open `Utilities.gs` and set `SPREADSHEET_ID` to your Google Sheet's ID (the long string in the sheet URL between `/d/` and `/edit`).

2. **Configure `.clasp.json`:**
   Replace `$SCRIPT_ID` with your Google Apps Script project ID.

### Deployment Steps

1. **Push Code** to Google Apps Script:
   ```bash
   clasp push -f
   ```
   The `-f` flag forces overwrite of remote files. The `.claspignore` file ensures only `.gs`, `.html`, and `appsscript.json` files are pushed.

2. **Deploy Web App:**
   - Go to [script.google.com](https://script.google.com) and open the project.
   - Click **Deploy** > **Manage deployments**.
   - If updating an existing deployment: click the pencil icon, select **New version**, add a description, click **Deploy**.
   - If creating a new deployment: click **New deployment**, select **Web app**, then:
     - **Execute as:** Me (your email)
     - **Who has access:** Anyone
     - Click **Deploy**

3. **Copy the Web App URL.** It looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

### Updating the Backend

After making code changes:
```bash
clasp push -f
```
Then go to **Deploy** > **Manage deployments** > edit the existing deployment > select **New version** > **Deploy**.

**Important:** Always update the existing deployment rather than creating a new one. A new deployment generates a new URL, which requires updating all PWA config files.

---

## 2. PWA Frontend Server

The `pwa/` directory contains two Progressive Web Apps served by the Express server in `server.js`.

### Option A: Deploy to Render.com

1. **Push your repo to GitHub** (if not already).

2. **Create a new Web Service** on [Render.com](https://render.com):
   - Connect your GitHub repository
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

3. **Set Environment Variables** in Render dashboard:

   | Key | Value |
   |-----|-------|
   | `GOOGLE_SCRIPT_URL` | Your Google Apps Script Web App URL |
   | `SESSION_SECRET` | A long random string for signing login sessions |
   | `CM26_AUTH_USERS` | JSON array of volunteer accounts and app access |

   The Google URL stays server-side. PWAs authenticate against the Node app and use local `/api/*` routes.

4. **Access Your Apps:**
   - Check-In: `https://your-app.onrender.com/checkin`
   - Cafe Scanner: `https://your-app.onrender.com/cafe`
   - Health Check: `https://your-app.onrender.com/health`

**Free tier note:** Render free-tier services spin down after inactivity. The first request after idle may take 30-60 seconds. For production use during the event, use a paid plan or keep the service warm with a health check ping.

### Option B: Self-Hosted (VPS, VM, etc.)

1. **Clone the repo** on your server:
   ```bash
   git clone https://github.com/your-org/CM26-IMSDA.git
   cd CM26-IMSDA
   npm install
   ```

2. **Set the required server environment variables:**

   ```bash
   export GOOGLE_SCRIPT_URL="https://script.google.com/macros/s/AKfycb.../exec"
   export SESSION_SECRET="replace-with-a-long-random-secret"
   export CM26_AUTH_USERS='[{"username":"frontdesk","password":"replace-me","apps":["checkin","cafe"]}]'
   npm start
   ```

3. **Run with a process manager** (recommended for production):
   ```bash
   # Using PM2
   npm install -g pm2
   GOOGLE_SCRIPT_URL="https://script.google.com/macros/s/..." \
   SESSION_SECRET="replace-with-a-long-random-secret" \
   CM26_AUTH_USERS='[{"username":"frontdesk","password":"replace-me","apps":["checkin","cafe"]}]' \
   pm2 start server.js --name cm26
   pm2 save
   pm2 startup
   ```

4. **Set up a reverse proxy** (nginx example):
   ```nginx
   server {
       listen 80;
       server_name checkin.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

### Option C: Docker

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t cm26-pwa .
docker run -d -p 3000:3000 \
  -e GOOGLE_SCRIPT_URL="https://script.google.com/macros/s/AKfycb.../exec" \
  --name cm26 \
  cm26-pwa
```

---

## 3. Configuration Reference

### Google Apps Script Config (Config Sheet)

Runtime config is stored in the `Config` sheet tab (key-value pairs in columns A-B):

| Key | Default | Description |
|-----|---------|-------------|
| `event_name` | Camp Meeting 2026 | Event display name |
| `event_start` | 2026-06-02 | First day |
| `event_end` | 2026-06-06 | Last day |
| `deposit_amount` | 65 | Required deposit amount |
| `cancellation_fee` | 10 | Processing fee for cancellations |
| `registration_deadline` | 2026-05-25 | Last day to register |
| `cancellation_deadline` | 2026-05-25 | Last day for refund |
| `dorm_price` | 25 | Per night |
| `rv_price` | 15 | Per night |
| `tent_price` | 5 | Per night |
| `adult_breakfast` | 7 | Meal price |
| `adult_lunch` | 8 | Meal price |
| `adult_supper` | 8 | Meal price |
| `child_breakfast` | 6 | Meal price |
| `child_lunch` | 7 | Meal price |
| `child_supper` | 7 | Meal price |
| `key_deposit_amount` | 10 | Cash deposit for room keys |
| `admin_email` | (set this) | Admin notification email |

### PWA Config Files

Each PWA has a `config.js` file containing the backend URL:
```javascript
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/.../exec';
```

If the `GOOGLE_SCRIPT_URL` environment variable is set, `server.js` overwrites these files at startup.

---

## 4. Troubleshooting

### PWA shows "Connection Error" or "Search failed"

This is almost always a CORS / deployment settings issue:

1. **Execute as** must be **Me** (not "User accessing the web app")
2. **Who has access** must be **Anyone** (not "Anyone with Google Account")

If you changed these settings, you must create a **new version** of the deployment (not just save).

### POST requests don't return response data

This is expected. Google Apps Script `doPost` requires `no-cors` mode in fetch calls. The PWAs send data and assume success if the network request completes. This is a known GAS limitation.

### Health check endpoint

The server exposes `GET /health` which returns:
```json
{"status": "ok", "timestamp": "2026-06-02T12:00:00.000Z"}
```

Use this for:
- Render.com health checks
- Docker health checks
- Load balancer monitoring
- Uptime monitoring services

### clasp push fails

- Make sure `.clasp.json` has a valid `scriptId`
- Run `clasp login` to re-authenticate
- Check that `.claspignore` is not blocking needed files

---

*Updated: February 24, 2026*
