# CM26 Deployment Guide

## 1. Google Apps Script Backend

The backend code resides in the root of this repository (`.gs` files). It serves the API used by the web apps.

### Prerequisites

- [clasp](https://github.com/google/clasp) installed globally: `npm install -g @google/clasp`
- Authenticated with Google: `clasp login`

### Deployment Steps

1.  **Push Code**: Upload the local code to Google Apps Script.
    ```bash
    clasp push -f
    ```
    *Note: The `-f` flag forces overwrite of remote files. We use a strict `.claspignore` to ensure only necessary files are pushed.*

2.  **Deploy Web App**:
    - Go to [script.google.com](https://script.google.com) and open the project.
    - Click **Deploy** > **Manage deployments**.
    - If you already have a deployment, click the **pencil icon** to edit it.
        - **Version**: Select **New version**.
        - **Description**: Add a description (e.g., "Fix CORS issues").
        - Click **Deploy**.
    - If you don't have a deployment, click **New deployment**.
        - Select **Web app**.
        - **Execute as**: **Me** (your email). *Crucial for permission to access sheets.*
        - **Who has access**: **Anyone**. *Crucial for the PWA to work without requiring Google login for every guest.*
        - Click **Deploy**.

3.  **Copy URL**: After deploying, copy the **Web App URL**. It looks like:
    `https://script.google.com/macros/s/.../exec`

## 2. Progressive Web Apps (PWA)

The PWA code is in the `pwa/` directory. It is a separate frontend application.

### Configuration

If your Google Apps Script Web App URL changed (e.g., you created a *new* deployment instead of updating the existing one), you must update the config files:

1.  Open `pwa/check-in/config.js`
2.  Update `GOOGLE_SCRIPT_URL` with the new URL.
3.  Open `pwa/cafe-scanner/config.js`
4.  Update `GOOGLE_SCRIPT_URL` with the new URL.

### Hosting

The PWA is designed to be hosted on a static web server or a Node.js server.
This repository includes a simple `server.js` for hosting.

```bash
npm install
node server.js
```

Access the apps at:
- Check-In: `http://localhost:3000/checkin`
- Cafe Scanner: `http://localhost:3000/cafe`

## Troubleshooting "Security Stuff" (CORS)

If the web apps cannot fetch data (red error box "Search failed" or "Connection Error"), it is likely a CORS issue.

**Check these settings in Google Apps Script:**

1.  **Execute as**: Must be **Me**.
    - If set to "User accessing the web app", the browser will block the request because the PWA doesn't send Google auth cookies in the API call.
2.  **Who has access**: Must be **Anyone**.
    - If set to "Anyone with Google Account", the user *must* be logged in to Google in their browser, which creates friction and can fail if third-party cookies are blocked.
    - "Anyone" (anonymous) allows the script to run as YOU (the owner) and return data to anyone.

**Note on `doPost`**:
The Google Apps Script `doPost` function often requires `no-cors` mode in the fetch call (which we use in the PWA code). This means the PWA sends data but *cannot read the response content*. The PWA assumes success if the network request doesn't fail. This is normal behavior for GAS Web Apps.
