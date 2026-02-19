# CLAUDE.md - AI Assistant Guide for CM26-IMSDA

## Project Overview

**Camp Meeting 2026 Registration System** for the Iowa-Missouri Conference of Seventh-day Adventists (IMSDA). This is a Google Apps Script backend that manages registration, housing, meal ticketing, payments, check-in/check-out, and admin operations for a multi-day event at Sunnydale Academy Campus (June 2-6, 2026).

**Technology stack:** Google Apps Script (JavaScript, V8 runtime) with Google Sheets as the database.

## Architecture

```
Frontend (external)                  Backend (this repo)
┌──────────────────┐                ┌─────────────────────────────┐
│ Fluent Forms     │──webhook──────>│ Code.gs (HTTP router)       │
│ (WordPress)      │                │  ├─ doGet()  → GET actions  │
│                  │                │  └─ doPost() → POST actions │
├──────────────────┤                ├─────────────────────────────┤
│ Google Form      │──trigger──────>│ StaffRegistration.gs        │
│ (Staff reg)      │                │  └─ onStaffFormSubmit()     │
├──────────────────┤                ├─────────────────────────────┤
│ PWAs             │──HTTP─────────>│ CheckIn.gs, MealTickets.gs  │
│ (Scanner/Checkin)│                │                             │
└──────────────────┘                └──────────┬──────────────────┘
                                               │
                                    ┌──────────▼──────────────────┐
                                    │ Google Sheet (single)       │
                                    │ Tabs: Config, Housing,      │
                                    │ Rooms, Registrations,       │
                                    │ GuestDetails, MealTickets,  │
                                    │ Payments, Waitlist,         │
                                    │ ActivityLog, Dashboard      │
                                    └─────────────────────────────┘
```

## File Structure

All source files are in the root directory (flat structure, no subdirectories):

| File | Purpose |
|---|---|
| `Code.gs` | Main entry point. HTTP router (`doGet`/`doPost`) dispatching to action handlers |
| `Utilities.gs` | Shared helpers: `getSS()`, `jsonResponse()`, `generateRegId()`, `generateGuestId()`, `logActivity()` |
| `Config.gs` | Loads key-value config from the Config sheet tab |
| `Registration.gs` | Processes paid registrations from Fluent Forms webhook |
| `StaffRegistration.gs` | Handles staff/pastor/volunteer registrations from Google Form trigger |
| `Email.gs` | Sends HTML confirmation emails via Gmail |
| `EmailTemplate.html` | HTML email template with dynamic content and QR code |
| `Inventory.gs` | Housing availability checks (`getAvailability`, `checkAvailability`) |
| `MealTickets.gs` | Meal ticket creation, redemption (single and bulk), and queries |
| `Payments.gs` | Payment recording and registration balance updates |
| `Operations.gs` | Check-in/check-out (simple version) and waitlist management |
| `CheckIn.gs` | Full check-in system: search, check-in, check-out, room management, stats |
| `Admin.gs` | Admin utilities: recalculate totals, key reports, housing changes, waitlist promotion |
| `AdminSidebar.html` | Admin sidebar UI rendered in Google Sheets |
| `appsscript.json` | Apps Script project manifest (runtime, scopes, webapp config) |

## API Endpoints

All API calls go through `Code.gs`. Actions are dispatched via the `action` parameter.

### GET Actions (`doGet`)
| Action | Handler | Description |
|---|---|---|
| `ping` | inline | Health check, returns `{success: true, status: 'online'}` |
| `getAvailability` | `Inventory.gs:getAvailability()` | Returns housing options with availability |
| `getGuestMeals` | `MealTickets.gs:getGuestMeals(id)` | Returns meal tickets for a registration |

### POST Actions (`doPost`)
| Action | Handler | Description |
|---|---|---|
| `submitRegistration` | `Registration.gs:processRegistration()` | Process new paid registration |
| `addToWaitlist` | `Operations.gs:addToWaitlist()` | Add to housing waitlist |
| `redeemMeal` | `MealTickets.gs:redeemMealTicket()` | Redeem a single meal ticket |
| `checkIn` | `Operations.gs:checkInRegistration()` | Simple check-in |
| `checkOut` | `Operations.gs:checkOutRegistration()` | Simple check-out |
| `updatePayment` | `Payments.gs:recordPayment()` | Record a payment |

## Key ID Formats

- **Registration:** `CM26-0001` (sequential, zero-padded 4 digits)
- **Guest:** `G-xxxxxxxx` (UUID-based, 8 chars)
- **Meal Ticket:** `MT-00001` (sequential, zero-padded 5 digits)
- **Payment:** `PAY-xxxxxxxx` (UUID-based, 8 chars)
- **Waitlist:** `WL-xxxxxx` (UUID-based, 6 chars)

## Coding Conventions

### File Organization
- One domain per `.gs` file, each prefixed with a header block:
  ```
  // ==========================================
  // FILE: FileName.gs
  // ==========================================
  ```
- HTML templates in separate `.html` files
- Config and constants in `Config.gs` and `Utilities.gs`

### Naming
- **Functions:** camelCase (`processRegistration`, `createMealTickets`)
- **Variables:** camelCase (`regSheet`, `housingOption`)
- **Global constants:** UPPER_SNAKE_CASE (`SPREADSHEET_ID`)
- **Sheet tab names:** PascalCase (`MealTickets`, `GuestDetails`, `ActivityLog`)

### Error Handling
- All API-facing functions return `{success: boolean, error?: string, ...}` objects
- Lock-based concurrency via `LockService.getScriptLock()` with 5-30 second timeouts
- Try-catch blocks around all critical paths
- Failed operations log to the `ActivityLog` sheet via `logActivity()`

### Data Access Patterns
- Always use `getSS()` from `Utilities.gs` to open the spreadsheet (never hardcode the ID elsewhere)
- Column indices are 0-based in `.getValues()` arrays but 1-based in `.getRange()` calls
- Batch writes with `getRange().setValues()` for performance (see `MealTickets.gs`)
- Single-row appends use `sheet.appendRow()`
- JSON-encoded complex data stored in single cells (guest_details in column T, meal_selections in column U)

### Concurrency
- All mutating operations that could race (registration, check-in, check-out, meal redemption) acquire `LockService.getScriptLock()` before proceeding
- Lock timeouts range from 5s (meal scan) to 30s (registration)
- Locks are released in both success and error paths

## Spreadsheet Column Map (Registrations Sheet)

Key columns (0-indexed for code arrays):

| Index | Column | Field |
|---|---|---|
| 0 | A | reg_id |
| 1 | B | created_at |
| 2 | C | reg_type |
| 3 | D | status |
| 4 | E | primary_name |
| 5 | F | email |
| 6 | G | phone |
| 12 | M | housing_option |
| 13 | N | nights |
| 14 | O | num_nights |
| 15 | P | housing_subtotal |
| 16-18 | Q-S | adults_count, children_count, total_guests |
| 19 | T | guest_details (JSON) |
| 20 | U | meal_selections (JSON) |
| 23 | X | meal_subtotal |
| 24 | Y | subtotal |
| 26 | AA | total_charged |
| 27 | AB | amount_paid |
| 28 | AC | balance_due |
| 30 | AE | payment_status |
| 34 | AI | room_assignment |
| 44 | AS | checked_in |
| 45 | AT | check_in_time |
| 49 | AW | checked_out |

Note: `CheckIn.gs`, `Operations.gs`, and `Registration.gs` all use the expanded column layout (through column AY).

## Configuration

Runtime configuration is read from the `Config` sheet (key-value pairs in columns A-B). Key settings include:

- `event_name`, `event_start`, `event_end`
- `deposit_amount` ($65), `cancellation_fee` ($10)
- `dorm_price` ($25/night), `rv_price` ($15/night), `tent_price` ($5/night)
- `adult_breakfast`, `adult_lunch`, `adult_supper` (meal prices)
- `child_breakfast`, `child_lunch`, `child_supper` (meal prices)
- `key_deposit_amount` ($10)
- `square_fee_percent` (2.9%), `square_fee_fixed` ($0.30)

The `SPREADSHEET_ID` in `Utilities.gs` is the only hardcoded config. Everything else comes from the Config sheet.

## Google APIs Used

- `SpreadsheetApp` - Read/write Google Sheets data
- `GmailApp` - Send confirmation emails
- `LockService` - Concurrency control
- `ContentService` - JSON HTTP responses
- `HtmlService` - Template rendering (emails, admin sidebar)
- `Session` - Current user email for audit logging
- `Utilities` - UUID generation, date formatting
- `FormApp` - Google Form trigger binding
- `ScriptApp` - Trigger management
- `Logger` / `console` - Logging

## Testing

There is no automated test framework. Manual test functions are embedded in the source:

| Function | File | What it tests |
|---|---|---|
| `testConnection()` | `Code.gs` | Verifies spreadsheet connectivity |
| `testDoGet()` | `Code.gs` | Simulates a GET request for availability |
| `testEmailSystem()` | `Email.gs` | Sends a test confirmation email to the current user |
| `testStaffFormSubmit()` | `StaffRegistration.gs` | Simulates a staff form submission end-to-end |

Run these in the Apps Script editor console. They write to the live spreadsheet.

## Deployment

This is a Google Apps Script Web App:
- **Execution:** Runs as the deploying user (`USER_DEPLOYING`)
- **Access:** Anyone, even anonymous (`ANYONE_ANONYMOUS`)
- **Timezone:** America/Chicago
- **Runtime:** V8

Deployment is manual through the Apps Script editor (Deploy > New deployment > Web app). There is no CI/CD pipeline.

## Important Considerations When Modifying Code

1. **Column indices are critical.** The Registrations sheet has 47+ columns (A through AU+). Any column shift breaks multiple files. Always verify column references against the actual sheet.

2. **Two check-in implementations exist.** `Operations.gs` has a simpler check-in/check-out, while `CheckIn.gs` has a more complete version with room/key management. The `Code.gs` router maps `checkIn`/`checkOut` POST actions to the `Operations.gs` versions. The `CheckIn.gs` functions (`processCheckIn`, `processCheckOut`) are called by the Check-In PWA directly.

3. **Lock discipline.** Any function that writes data and could be called concurrently must acquire a script lock. Always release in both success and error paths.

4. **Staff registrations flow through `processRegistration()`.** The `StaffRegistration.gs` builds a data object and calls the same `processRegistration()` in `Registration.gs`, with `regType: 'staff'` and zero pricing.

5. **Meal ticket distribution uses modular arithmetic.** Tickets rotate across guests first, then days (see `MealTickets.gs` lines 54-65). Changing the distribution logic affects all new registrations.

6. **No authentication on endpoints.** The web app is open to anonymous access. Security relies on registration IDs being difficult to guess and the system being used in a trusted context.

7. **All activity is logged.** Use `logActivity(action, regId, details, source)` from `Utilities.gs` for any new operations that modify data.

## Remaining Work

This section tracks the gap between the project's planning document and the current implementation. Items are categorized by type and priority.

### Backend Features Not Yet Implemented

These are code changes needed within this repository's `.gs` files.

#### 1. `getRegistration` GET Endpoint
- **What:** Add a `getRegistration` case to `doGet()` in `Code.gs` returning full registration details by ID.
- **Why:** Specified in the planning document. `getRegistrationByRegId()` exists in `Email.gs` but is not exposed via the API and returns only a subset of fields.
- **Files:** `Code.gs`, `Email.gs`

#### 2. Cancellation and Refund Processing
- **What:** Create a `cancelRegistration(data)` function that sets status to `cancelled`, applies the $10 `cancellation_fee` (from Config), calculates the refund amount, records it in the Payments sheet, releases housing inventory, and sends a cancellation email.
- **Why:** Config defines `cancellation_fee` and `deposit_amount` but no code uses them for cancellations. The planning document specifies: before May 25 = full refund minus $10 fee; after May 25 or no-show first night = deposit forfeited.
- **Files:** New function in `Registration.gs` or new `Cancellation.gs`; add case to `doPost()` in `Code.gs`

#### 3. Registration and Cancellation Deadline Enforcement
- **What:** Add date checks in `processRegistration()` and the future cancellation function comparing current date against `registration_deadline` and `cancellation_deadline` Config values.
- **Why:** Config keys `registration_deadline` (May 25) and `cancellation_deadline` (May 25) exist but nothing reads or enforces them.
- **Files:** `Registration.gs`, `Config.gs`

#### 4. No-Show Handling
- **What:** Create an admin-triggered function that identifies registrations whose first night has passed without check-in, marks them as `no_show`, and forfeits the deposit per the cancellation policy.
- **Why:** Specified in the planning document; no implementation exists.
- **Files:** `Admin.gs` (new function + add to sidebar menu)

#### 5. Reminder Email
- **What:** Create a pre-event reminder email function and HTML template, triggered by a time-based Apps Script trigger a few days before June 2, 2026.
- **Why:** Specified in planning document Session 4; not implemented.
- **Files:** `Email.gs` (new function), new `ReminderEmailTemplate.html`

### External Systems (Not In This Repository)

These are separate deployments referenced in the planning document but not part of this Apps Script codebase.

| Item | Planning Session | Description | Status |
|---|---|---|---|
| WordPress PHP integration | 5 | `camp-meeting-google-integration.php` — webhook handler with retry logic | Not started |
| WordPress availability shortcode | 5 | PHP shortcode + JS/CSS for live housing availability display | Not started |
| Fluent Forms configuration | 6 | Multi-step registration form with payment in WordPress admin | Not started |
| Google Form (Staff registration) | 7 | The actual Google Form that triggers `onStaffFormSubmit()`; GAS backend is done | Not started |
| Cafe Scanner PWA | 8 | Standalone PWA for meal ticket QR scanning (index.html, app.js, sw.js, manifest.json) | Not started |
| Check-In System PWA | 9 | Standalone PWA frontend calling `CheckIn.gs` functions; backend is done | Not started |
| End-to-end testing | 11 | Full integration testing across all systems with test data | Not started |
| Training materials | 11 | User guides for volunteers operating check-in and scanner systems | Not started |

### Build Session Progress Summary

| Session | Description | Status |
|---|---|---|
| 1 | Google Sheets Foundation | Done |
| 2 | Apps Script Core | Done |
| 3 | Apps Script Complete | Done |
| 4 | Email System | **Partial** — confirmation and waitlist notification done; reminder emails missing |
| 5 | WordPress Integration | Not started (external) |
| 6 | Fluent Form | Not started (external) |
| 7 | Staff Form | **Partial** — GAS backend done; Google Form creation is external |
| 8 | Cafe Scanner PWA | Not started (external) |
| 9 | Check-In System PWA | **Partial** — backend done; PWA frontend not started (external) |
| 10 | Admin Sidebar | Done |
| 11 | Testing and Polish | **Partial** — basic test functions exist; end-to-end testing and training missing |
