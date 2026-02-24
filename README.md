# Camp Meeting 2026 Registration System

**Iowa-Missouri Conference of Seventh-day Adventists**

A registration, housing, meal ticketing, check-in/check-out, and admin system for a multi-day camp meeting event at Sunnydale Academy Campus (June 2-6, 2026).

---

## Architecture

```
Frontend (external)                  Backend (Google Apps Script)
┌──────────────────┐                ┌─────────────────────────────┐
│ Fluent Forms     │──webhook──────>│ Code.gs (HTTP router)       │
│ (WordPress)      │                │  ├─ doGet()  → GET actions  │
│                  │                │  └─ doPost() → POST actions │
├──────────────────┤                ├─────────────────────────────┤
│ Google Form      │──trigger──────>│ StaffRegistration.gs        │
│ (Staff reg)      │                │  └─ onStaffFormSubmit()     │
├──────────────────┤                ├─────────────────────────────┤
│ PWAs (this repo) │──HTTP─────────>│ CheckIn.gs, MealTickets.gs  │
│ /checkin, /cafe  │                │                             │
└──────────────────┘                └──────────┬──────────────────┘
                                               │
                                    ┌──────────▼──────────────────┐
                                    │ Google Sheets Database      │
                                    │ Tabs: Config, Housing,      │
                                    │ Rooms, Registrations,       │
                                    │ GuestDetails, MealTickets,  │
                                    │ Payments, Waitlist,         │
                                    │ ActivityLog, Dashboard      │
                                    └─────────────────────────────┘
```

The system has two separate deployments:

1. **Google Apps Script Backend** - Deployed as a Web App on Google's infrastructure, handles all business logic and data access
2. **PWA Frontend Server** - Node.js/Express server hosting two Progressive Web Apps, deployed on Render.com or any self-hosted platform

---

## Quick Start

### Prerequisites

- Node.js 18+ (for PWA server)
- A Google account with access to the Camp Meeting Google Sheet
- [clasp](https://github.com/google/clasp) (optional, for pushing GAS code)

### Local Development

```bash
# Install dependencies
npm install

# Start the PWA server
npm start

# Access the apps:
#   Check-In:     http://localhost:3000/checkin
#   Cafe Scanner: http://localhost:3000/cafe
#   Health Check:  http://localhost:3000/health
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `GOOGLE_SCRIPT_URL` | No | Google Apps Script Web App URL. If set, automatically updates PWA config files at startup. |

If `GOOGLE_SCRIPT_URL` is not set as an environment variable, the PWAs use the URL hardcoded in `pwa/*/config.js`.

---

## Repository Structure

```
├── server.js                  # Express server for hosting PWAs
├── package.json               # Node.js dependencies
├── .clasp.json                # Google clasp configuration
├── .claspignore               # Files excluded from clasp push
├── appsscript.json            # Apps Script project manifest
│
├── Code.gs                    # HTTP router (doGet/doPost)
├── Config.gs                  # Loads config from Google Sheet
├── Utilities.gs               # Shared helpers, column constants
├── Registration.gs            # Registration + cancellation logic
├── StaffRegistration.gs       # Staff/pastor form handler
├── Inventory.gs               # Housing availability checks
├── MealTickets.gs             # Meal ticket creation & redemption
├── Payments.gs                # Payment recording
├── Operations.gs              # Waitlist, simple check-in/out
├── CheckIn.gs                 # Full check-in system (PWA backend)
├── Admin.gs                   # Admin sidebar utilities
├── Email.gs                   # Email sending functions
│
├── EmailTemplate.html         # Confirmation email template
├── ReminderEmailTemplate.html # Pre-event reminder template
├── WaitlistOfferEmail.html    # Waitlist offer email template
├── AdminSidebar.html          # Google Sheets sidebar UI
│
├── pwa/
│   ├── cafe-scanner/          # Cafe Scanner PWA
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── config.js          # Backend URL config
│   │   ├── styles.css
│   │   ├── manifest.json
│   │   └── sw.js              # Service worker
│   └── check-in/             # Check-In PWA
│       ├── index.html
│       ├── app.js
│       ├── config.js          # Backend URL config
│       ├── styles.css
│       ├── manifest.json
│       └── sw.js              # Service worker
│
├── tests/                     # Test stubs
├── verification/              # Screenshots for verification
├── Tests.gs                   # Manual test functions (GAS)
├── TestFixes.gs               # Fix verification tests (GAS)
├── TestNewFeatures.gs         # Feature tests (GAS)
├── TestWaitlist.gs            # Waitlist tests (GAS)
│
├── CLAUDE.md                  # AI assistant development guide
├── DEPLOYMENT.md              # Detailed deployment instructions
├── SUGGESTIONS.md             # Future improvement ideas
└── PERFORMANCE_BASELINE.md    # Performance optimization notes
```

---

## API Endpoints

All API calls go through `Code.gs` on the Google Apps Script Web App URL.

### GET Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `ping` | none | Health check |
| `getAvailability` | none | Housing options with availability |
| `getRegistration` | `id` | Full registration details |
| `getGuestMeals` | `id` | Meal tickets for a registration |
| `getCheckInData` | `id` | Registration data for check-in screen |
| `getArrivals` | `date` (YYYY-MM-DD) | Expected arrivals for a date |
| `getCheckInStats` | none | Dashboard statistics |
| `searchRegistrations` | `query` | Search by name or reg ID |

### POST Actions

| Action | Key Fields | Description |
|--------|------------|-------------|
| `submitRegistration` | `name`, `email`, `housingOption`, ... | Process new registration |
| `cancelRegistration` | `regId` | Cancel and process refund |
| `addToWaitlist` | `name`, `email`, `housingOption` | Add to housing waitlist |
| `redeemMeal` | `ticketId` | Redeem a meal ticket |
| `checkIn` | `regId`, `room`, `key1`, `key2` | Check in a guest |
| `checkOut` | `regId`, `key1Returned`, `key2Returned` | Check out a guest |
| `updatePayment` | `regId`, `amount`, `method` | Record a payment |

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment instructions covering:

- Google Apps Script backend setup
- Render.com deployment
- Self-hosted / Docker deployment
- Environment variable configuration
- Troubleshooting

---

## Event Details

| Item | Value |
|------|-------|
| Event | Camp Meeting 2026 |
| Dates | June 2-6, 2026 (Tuesday-Saturday) |
| Location | Sunnydale Academy Campus |
| Registration Deadline | May 25, 2026 |
| Cancellation Deadline | May 25, 2026 |

### Pricing

| Housing | Per Night | Meals | Adult | Child |
|---------|-----------|-------|-------|-------|
| Dorm | $25 | Breakfast | $7 | $6 |
| RV Hookup | $15 | Lunch | $8 | $7 |
| Tent | $5 | Supper | $8 | $7 |

### Cancellation Policy

- Before May 25: Full refund minus $10 processing fee
- After May 25 or no-show first night: Deposit ($65) forfeited

---

## PWA Features

### Check-In System (`/checkin`)
- Search guests by name or QR code scan
- Check-in flow: balance payment, key issue, welcome packet
- Check-out flow: key return, deposit refund
- Real-time stats dashboard
- Offline support with queue sync

### Cafe Scanner (`/cafe`)
- QR code scanning for meal tickets
- Manual ticket ID lookup
- Auto-detect current meal service by time of day
- Bulk redemption per registration
- Offline queue with auto-sync

---

## Key ID Formats

| Type | Format | Example |
|------|--------|---------|
| Registration | `CM26-NNNN` | `CM26-0001` |
| Guest | `G-xxxxxxxx` | `G-a1b2c3d4` |
| Meal Ticket | `MT-NNNNN` | `MT-00001` |
| Payment | `PAY-xxxxxxxx` | `PAY-e5f6g7h8` |
| Waitlist | `WL-xxxxxx` | `WL-i9j0k1` |

---

*Version 2.2 - Updated February 24, 2026*
*Iowa-Missouri Conference of Seventh-day Adventists*
