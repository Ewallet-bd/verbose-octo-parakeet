# Telegram Payment Request Management & Transaction Tracking System

A complete, production-ready system to automatically monitor Telegram groups for payment requests, parse them using natural language patterns, and manage the complete workflow (Complete, Cancel, Limit) via interactive inline buttons. Includes a full React admin dashboard.

## Technology Stack

- **Backend**: Node.js, Express, Grammy (Telegram Bot API), Drizzle ORM, SQLite (`@libsql/client`). *(Note: AI Studio preview environment uses TypeScript/Node.js, so the stack was adapted from Python to full-stack TypeScript to ensure robust execution while maintaining identical architecture and features.)*
- **Frontend**: React, Vite, Tailwind CSS, Recharts.
- **Authentication**: JWT, bcrypt.

## Setup Instructions

### 1. Create Telegram Bot
Open Telegram and search for `@BotFather`. Use the `/newbot` command to create a new bot and obtain the API token.

### 2. Obtain BOT_TOKEN
Copy the token provided by BotFather (e.g., `123456789:ABCdefGhIJKlmNoPQRstuVWXyz`).

### 3. Configure .env
Create a `.env` file in the root directory (based on `.env.example`) and add your token:
```env
TELEGRAM_BOT_TOKEN="your_bot_token_here"
JWT_SECRET="your_custom_jwt_secret"
PORT=3000
```

### 4. Add bot to Telegram group
Add your newly created bot to the Telegram group where payment requests are sent.

### 5. Configure permissions
Ensure the bot has admin permissions in the group so it can read all messages and edit its own inline keyboards. (Specifically, disable "Group Privacy" in BotFather using `/setprivacy` if you want it to read messages without being an admin, though making it an admin is recommended).

### 6. Start the Backend & Frontend
The backend and frontend are tightly integrated. Run the development server:
```bash
npm run dev
```
*(The SQLite database `sqlite.db` is automatically created and migrations/tables are auto-initialized on first boot. The default admin user `admin` is seeded with `ADMIN_INITIAL_PASSWORD` (or a random password printed once in the startup log)).*

### 7. Test NEW REQUEST
In your Telegram group, send the following message:
```text
🔔🔔🔔 NEW REQUEST 🔔🔔🔔
🆔 ID: 5206290885
📱 Nagad Number: 01924347827
💰 Amount: 7000
👤 Assigned: KHAN
```
The bot will automatically parse the ID, wallet, amount, and payment method, save it to the database, and reply with inline buttons.

### 8. Test Inline Buttons
- **Copy Number**: Telegram will copy `01924347827` to your clipboard.
- **Copy Amount**: Telegram will copy `7000` to your clipboard.
- **Cancel**: Click "❌ Cancel". The request status changes to CANCELLED in the DB, and the message updates.
- **Limit**: Click "⚠️ Limit". The request status changes to LIMIT.
- **Complete**: Click "✅ Complete". The bot will reply with a force-reply prompt asking for the Transaction ID. Reply to that prompt with your TX ID (e.g., `75VTJ0J2`). The bot will update the status to COMPLETED and update the message.

### 9. View Admin Dashboard
Open the web preview (or `http://localhost:3000`). Log in using:
- **Username**: admin
- **Password**: value of `ADMIN_INITIAL_PASSWORD`, or the one printed in the first startup log

You can view the daily reports, charts, and search transactions by ID or Wallet Number in the Transactions tab.
