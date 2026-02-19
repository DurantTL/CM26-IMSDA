# Camp Meeting 2026 Registration System
## Complete Planning & Build Guide (v2.1)
### Iowa-Missouri Conference of Seventh-day Adventists

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Model (Google Sheets)](#2-data-model-google-sheets)
3. [Google Apps Script Backend](#3-google-apps-script-backend)
4. [Public Registration Form (Fluent Forms)](#4-public-registration-form)
5. [Staff Registration Form (Google Form)](#5-staff-registration-form)
6. [WordPress Integration](#6-wordpress-integration)
7. [Confirmation Emails](#7-confirmation-emails)
8. [Cafe Scanner PWA](#8-cafe-scanner-pwa)
9. [Check-In System PWA](#9-check-in-system-pwa)
10. [Admin Sidebar Utilities](#10-admin-sidebar-utilities)
11. [Build Order & Sessions](#11-build-order--sessions)
12. [Deployment Instructions](#12-deployment-instructions)

---

## 1. System Overview

### Event Details

| Item | Value |
|------|-------|
| **Event** | Camp Meeting 2026 |
| **Dates** | June 2-6, 2026 (Tuesday-Saturday) |
| **Location** | Sunnydale Academy Campus |
| **Registration Deadline** | May 25, 2026 |
| **Cancellation Deadline** | May 25, 2026 |

### Schedule

#### Nights Available
| Night | Date | Day |
|-------|------|-----|
| 1 | June 2, 2026 | Tuesday |
| 2 | June 3, 2026 | Wednesday |
| 3 | June 4, 2026 | Thursday |
| 4 | June 5, 2026 | Friday |
| 5 | June 6, 2026 | Saturday |

#### Meals Available
| Meal | Days | Count |
|------|------|-------|
| Breakfast | Wed, Thu, Fri, Sat | 4 meals |
| Lunch | Wed, Thu, Fri | 3 meals (Sat = donation only) |
| Supper | Tue, Wed, Thu, Fri, Sat | 5 meals |

### Pricing

#### Housing
| Option | Price/Night | Total Capacity | Notes |
|--------|-------------|----------------|-------|
| Dorm Room | $25 | 80 rooms | 2 twin beds, 4+ nights required |
| RV/Camper Hookup | $15 | 16 spots | Full hookup, numbered spots |
| Tent Campsite | $5 | Unlimited | Various locations on campus |

#### Meals
| Meal | Adult | Child (under 18) |
|------|-------|------------------|
| Breakfast | $7 | $6 |
| Lunch | $8 | $7 |
| Supper | $8 | $7 |

**Note:** Saturday lunch is donation only - no ticket required.

#### Key Deposit
| Item | Amount | Notes |
|------|--------|-------|
| Key Deposit | $5-10 (cash) | Refunded at checkout when both keys returned |
| Keys per Room | 2 | Numbered, tracked individually |

#### Payment Processing
- Square fee: 2.9% + $0.30
- Fee passed to customer
- Formula: `((subtotal) * (1/0.971 - 1)) + (0.30/0.971)`

### Payment Options

| Method | Deposit | Notes |
|--------|---------|-------|
| Square (full payment) | None | Immediate confirmation |
| Square (deposit only) | $65 | Balance due at check-in |
| Check by mail | $65 | Held until received |

### Registration Types

| Type | Form | Payment | Priority | Moveable | Key Tracking |
|------|------|---------|----------|----------|--------------|
| Paid Guest | Fluent Forms (website) | Yes | High | No | Yes |
| Staff/Pastor | Google Form (internal) | Free | Low | Yes (to hotel) | Yes |

### Cancellation Policy
- Before May 25: Full refund minus $10 processing fee
- After May 25 or no-show first night: Deposit forfeited, reservation cancelled

---

## 2. Data Model (Google Sheets)

### Sheet Name: `Camp Meeting 2026 Registration System`

*(See original documentation for full table schema)*

---

## 3. Google Apps Script Backend

### Project Setup

1. Create new Google Apps Script project
2. Link to the Google Sheet
3. Deploy as Web App (Execute as: Me, Access: Anyone)

### File Structure

```
Code.gs           - Main entry points (doGet, doPost)
Config.gs         - Configuration and constants
Utilities.gs      - Helper functions, logging, QR generation
Registration.gs   - Registration processing functions
Inventory.gs      - Housing/availability functions
MealTickets.gs    - Meal ticket generation and redemption
Payments.gs       - Payment recording
Operations.gs     - Waitlist, check-in/out operations
Email.gs          - Confirmation email functions
StaffRegistration.gs - Staff form handler
CheckIn.gs        - Check-in system endpoints
Admin.gs          - Admin sidebar utilities
```

### API Endpoints

*(See original documentation for full API list)*

---

## 8. Cafe Scanner PWA

*(Content moved from original repo branch)*

Progressive Web App for cafeteria meal ticket scanning.

- **Location:** `pwa/cafe-scanner/`
- **Features:** QR scanning, manual ID lookup, meal redemption, offline support.
- **Config:** Update `pwa/cafe-scanner/config.js` with your Google Apps Script Web App URL.

---

## 9. Check-In System PWA

### Overview

Dedicated Progressive Web App for check-in volunteers at the registration desk.

- **Location:** `pwa/check-in/`
- **Config:** Update `pwa/check-in/config.js` with your Google Apps Script Web App URL.

### Features

- **Search & Scan:** Find guests by name or QR code
- **Check-in Flow:** Balance payment → Key issue → Welcome packet
- **Check-out Flow:** Key return → Deposit refund
- **Real-time Stats:** Arrivals, checked-in count, keys out
- **Offline Support:** Queue actions when WiFi drops

### Check-In Workflow

```
1. Guest arrives
   ↓
2. Volunteer searches name or scans QR
   ↓
3. System shows:
   - Pre-assigned room
   - Balance due (if any)
   - Party size & special needs
   ↓
4. If balance due:
   - Guest pays via separate Square terminal
   - Volunteer marks "Balance Paid" + enters amount
   ↓
5. Key deposit:
   - Guest pays $5-10 cash
   - Volunteer marks "Deposit Collected"
   ↓
6. Key issue:
   - Volunteer hands 2 keys
   - Types key numbers from tags (e.g., "K-214", "K-215")
   ↓
7. Welcome packet:
   - Volunteer hands physical packet
   - Checks "Packet Given"
   ↓
8. Complete Check-In button
   ↓
9. "You're in Room 214. Enjoy Camp Meeting!"
```

### Check-Out Workflow

```
1. Guest arrives to check out
   ↓
2. Volunteer searches name
   ↓
3. System shows:
   - Room number
   - Keys issued (K-214, K-215)
   - Deposit amount ($10)
   ↓
4. Key return:
   - Volunteer checks off each key returned
   - ☑ Key 1 (K-214) returned
   - ☑ Key 2 (K-215) returned
   ↓
5. Deposit refund:
   - If both keys: Full refund
   - If missing key: Partial/no refund
   - Volunteer gives cash back
   - Marks "Refund Processed"
   ↓
6. Complete Check-Out button
```

---

## 12. Deployment Instructions

### A. Google Apps Script Backend

1. Open your Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Copy/paste the contents of the `.gs` files from this repository into the script editor.
4. Update `Utilities.gs` with your spreadsheet ID.
5. Deploy as Web App:
   - Click `Deploy > New deployment`.
   - Select `Web app`.
   - Description: "v1".
   - Execute as: `Me`.
   - Who has access: `Anyone`.
   - Click `Deploy`.
6. Copy the **Web App URL**.

### B. Progressive Web Apps (PWAs) on Render.com

This repository is set up to deploy both PWAs (Cafe Scanner & Check-In) as a single Node.js service on Render.com.

1. **Update Config:**
   - Open `pwa/cafe-scanner/config.js` and paste your Web App URL.
   - Open `pwa/check-in/config.js` and paste your Web App URL.
   - Commit and push these changes to your GitHub repository.

2. **Deploy to Render:**
   - Create a new **Web Service** on Render.com.
   - Connect your GitHub repository.
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variables:** None needed (unless you want to customize PORT).
   - Click **Create Web Service**.

3. **Access Your Apps:**
   - Once deployed, your apps will be available at:
     - Cafe Scanner: `https://your-app-name.onrender.com/cafe/`
     - Check-In System: `https://your-app-name.onrender.com/checkin/`

---

*Document updated: February 19, 2026*
*Version: 2.1*
*For: Iowa-Missouri Conference of Seventh-day Adventists*
