# Playwright Automation & Dual OTP Integration Plan

Playwright-based automated withdraw order crawler integrated into the existing Node.js/TypeScript backend. It features dual OTP submission (Telegram Bot + Web Dashboard), automatic storage in MySQL/SQLite with deduplication, and instant Telegram broadcast alerts.

---

## 1. System Architecture & Workflow

```
+-----------------------------------------------------------------------------------+
|                              Web Target / Gateway Portal                          |
|   [Login Page] <---> [OTP Verification] <---> [Withdrawal Orders Table / API]    |
+-----------------------------------------------------------------------------------+
                                         ^
                                         | Playwright Headless Engine (Node.js/TS)
                                         v
+-----------------------------------------------------------------------------------+
|                         Backend Automation Daemon (server/scraper)                 |
|  - Headless Browser Controller (Playwright Chromium)                             |
|  - Session Storage State (cookies / tokens / storage_state.json)                  |
|  - OTP Event Coordinator (Awaiting OTP State Machine)                            |
|  - Deduplication & Persistence Layer (MySQL & SQLite)                             |
|  - Polling Scheduler (every 15-30s / configurable)                               |
+-------------------------+-----------------------------------+---------------------+
                          |                                   |
                          v                                   v
+-----------------------------------+   +-------------------------------------------+
|      Telegram Bot Integration     |   |         Operator Web Dashboard            |
|  - Alerts: "OTP required! Reply"  |   |  - Live Automation Status & Logs          |
|  - Telegram message listener      |   |  - Real-time OTP Input Modal              |
|  - Instant alerts for new orders  |   |  - Start / Pause / Re-login Controls      |
+-----------------------------------+   +-------------------------------------------+
```

---

## 2. Key Components to Implement

### A. Playwright Engine & Automation Daemon (`server/scraper/index.ts`)
- **Headless Browser Manager**: Launches Chromium via Playwright in headless mode (with configurable viewport and user-agent).
- **Session State Cache**: Saves and restores cookies/tokens (`storage_state.json`) so OTP is requested only when the session expires.
- **Login Flow**:
  1. Navigates to the portal login page.
  2. Fills configured credentials from `.env` or system settings.
  3. Detects whether 2FA/OTP prompt appears.
  4. If OTP requested: emits `AWAITING_OTP` event to both Telegram Bot and Web Dashboard, waits up to 3 minutes for user input.
  5. Once OTP is received, inputs it into the portal and saves the new authenticated session state.
- **Polling & Extraction**:
  - Periodically navigates to or queries the Withdraw Orders section.
  - Inspects Network requests first for fast direct JSON API responses; falls back to DOM table parsing if rendered server-side.
  - Normalizes extracted records: `order_id`, `amount`, `payment_method` (bKash, Nagad, Rocket), `wallet_number`, `status`, `requested_at`.

### B. Database Deduplication & Storage (`server/db/`)
- Saves incoming withdrawal requests into the primary database (`payment_requests` table in CloudPanel MySQL / SQLite).
- Strict deduplication using `order_id` (or `request_id`) unique constraints (`INSERT IGNORE` / `ON CONFLICT DO NOTHING`).
- Automatically logs all newly discovered orders into `audit_logs` for transaction traceability.

### C. Telegram Bot Dual Integration (`server/bot/`)
- **OTP Alerts & Responses**:
  - When the scraper enters `AWAITING_OTP` state, sends a priority notification to the admin/operator: *"⚠️ লগিনের জন্য OTP প্রয়োজন! এই চ্যাটে OTP কোডটি লিখুন (যেমন: 123456)।"*
  - Listens for operator's reply in Telegram, verifies format, and forwards it to the active Playwright prompt.
- **New Order Broadcast**:
  - When new orders are inserted into the database, instantly formats and broadcasts a Telegram message:
    `🔔 নতুন উইথড্রল রিকোয়েস্ট #ORD-XXXX`
    `💰 পরিমাণ: ৳৫,০০০`
    `📱 মেথড: bKash (017XXXXXXXX)`
    `🕒 সময়: 02:30 PM`

### D. Web Dashboard Control & Live OTP Modal (`src/components/AutomationManager.tsx`)
- **Automation Status Card**: Displays engine state (`IDLE`, `LOGGING_IN`, `AWAITING_OTP`, `ACTIVE_POLLING`, `ERROR`).
- **Interactive OTP Modal**: When OTP is needed, a modal appears with an input field, countdown timer, and "Submit OTP" button.
- **Scraper Configuration Panel**: Target portal URL, poll interval (seconds), enable/disable toggle, and manual "Test Login / Refresh Session" button.
- **Live Activity Log**: Displays timestamped events (logins, session refreshes, newly fetched orders).

---

## 3. Step-by-Step Implementation Sequence

1. **Install Dependencies**:
   - Install `playwright` (Chromium browser binaries).
2. **Scraper Engine Core**:
   - Create `server/scraper/crawler.ts` with browser lifecycle, credential injection, session persistence, and OTP resolver promises.
   - Create `server/scraper/orderParser.ts` for extracting and normalizing table/API data into standard `PaymentRequest` format.
3. **Database & API Routes**:
   - Add backend routes:
     - `POST /api/automation/start` & `POST /api/automation/stop`
     - `GET /api/automation/status`
     - `POST /api/automation/submit-otp`
     - `GET /api/automation/logs`
4. **Telegram Bot Enhancement**:
   - Register Telegram bot handler for incoming OTP codes from authorized admin Telegram IDs.
   - Add broadcast helper to send newly fetched orders to the designated Telegram alert group.
5. **Frontend UI Integration**:
   - Build `AutomationManager` component inside the Admin Dashboard.
   - Add real-time polling / status check for `AWAITING_OTP` state and interactive modal submission.
6. **Testing & Verification**:
   - Verify Playwright build compilation.
   - Test OTP resolution flow from both web UI and Telegram.
   - Test deduplication logic in MySQL/SQLite.
