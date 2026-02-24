# Issue Review: Proposed Tasks

## 1) Typo Fix Task
**Title:** Normalize "Checkin" to "Check-In" in architecture docs

**Problem found:** The architecture diagram in `CLAUDE.md` uses `Scanner/Checkin`, while the rest of the repo consistently uses `Check-In`.

**Task:**
- Replace `Checkin` with `Check-In` in `CLAUDE.md`.
- Do a quick doc consistency sweep for `Checkin` vs `Check-In` in markdown files.

**Why this matters:** Improves readability and avoids small terminology drift in contributor docs.

---

## 2) Bug Fix Task
**Title:** Fix arrivals date calculation using local timezone in Check-In PWA

**Problem found:** `loadArrivals()` uses `new Date().toISOString().split('T')[0]`, which is UTC-based. For users west of UTC in evening hours, the computed date can shift to the next day and return the wrong arrivals list.

**Task:**
- Replace UTC date generation with local-date formatting (e.g., build `YYYY-MM-DD` from local date parts).
- Add a small helper function for date formatting and unit-test it (if test harness exists).

**Why this matters:** Prevents off-by-one-day arrival queries in production.

---

## 3) Documentation Discrepancy Task
**Title:** Update CLAUDE.md status table to match current repository contents

**Problem found:** `CLAUDE.md` says both the Cafe Scanner PWA and Check-In PWA are "Not started (external)", but this repository already contains full PWA directories and assets under `pwa/cafe-scanner` and `pwa/check-in`.

**Task:**
- Update the "External Systems" and "Build Session Progress Summary" sections in `CLAUDE.md` to reflect implemented PWA artifacts.
- Keep status wording aligned with what exists in this repo vs what remains external.

**Why this matters:** Prevents contributors from making planning decisions based on stale project status.

---

## 4) Test Improvement Task
**Title:** Replace placeholder Node tests with executable assertions

**Problem found:** `tests/Tests.js` currently only logs messages and does not assert behavior, so CI/local test runs cannot catch regressions.

**Task:**
- Convert `tests/Tests.js` into real tests (Node test runner or chosen framework).
- At minimum, add assertions for deterministic helper behavior and one route-level smoke test for `/health` in `server.js`.
- Ensure `npm test` fails on regressions and passes on expected behavior.

**Why this matters:** Creates a baseline safety net for future changes.
