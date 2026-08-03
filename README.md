# Mira — Design & Development Kanban Board

**Mira** is a sleek, modern Kanban board tailored for page design and development teams. It provides an intuitive interface to manage tasks, track priorities, assign teammates, attach Figma mockup links, and monitor progress across six workflow stages — powered by a lightweight Express & Vercel serverless backend.

---

## ✨ Features

- **6 Workflow Stages**: `Backlog`, `Design`, `Design Review`, `Development`, `QA`, `Done`.
- **Drag & Drop**: Smoothly drag cards between workflow stages.
- **Email OTP Sign-in**: A 6-digit code is mailed to the user; only allow-listed company domains can request one.
- **Assignment Notifications**: Whoever a card is assigned to gets an email with the card's details.
- **Priority Management**: Visual indicators for Urgent, High, Medium, and Low priorities.
- **Filter & Search**: Search cards by title/description and filter by assignee or priority.
- **Team Management**: Add or remove teammates (with their email) and track active cards per member.
- **Figma Integration**: Direct link access to Figma mockups right from card badges.
- **Due Date Tracking**: Highlights overdue cards and upcoming deadlines automatically.
- **Dual Persistence**: SQLite database (`mira.sqlite`) for local use & Vercel Serverless Functions (`api/index.js`) for online deployment.

---

## ✉️ Email Setup (required for sign-in)

Mira supports three mail transports. Set the variables locally (`.env`) and in
**Vercel → Project → Settings → Environment Variables**. When more than one is configured
the priority is **Gmail API → SMTP → Resend**.

### Option A — Gmail API over OAuth2 (recommended)

Sends as a real Google Workspace mailbox over HTTPS. Use this when the Workspace admin has
disabled password-based SMTP AUTH, or when deploying to a serverless runtime where an
outbound SMTP connection is undesirable. Needs no DNS changes and no admin involvement,
provided the domain hasn't restricted third-party API access.

| Variable | Required | Description |
| --- | --- | --- |
| `GMAIL_CLIENT_ID` | Yes | OAuth client id from the Google Cloud console. |
| `GMAIL_CLIENT_SECRET` | Yes | OAuth client secret. |
| `GMAIL_REFRESH_TOKEN` | Yes | Minted by `npm run gmail-auth` (see below). |
| `MAIL_FROM` | Recommended | Must be the mailbox you consented as. Gmail rewrites a mismatched From. |
| `MAIL_REPLY_TO` | Optional | Where replies should land. |

**Setup:**

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create
   or pick a project and **enable the Gmail API**.
2. Create an OAuth client of type **Desktop app** — that type allows loopback redirects on
   an arbitrary port, so no redirect URI needs registering.
3. Put the client id and secret in `.env`.
4. Run `npm run gmail-auth`. It opens Google's consent screen, captures the code on a
   throwaway local server, and prints a `GMAIL_REFRESH_TOKEN` to paste into `.env`.

Sign in as the sending mailbox during step 4 — if several Google accounts are active, the
consent screen will happily authorise the wrong one. Refresh tokens don't expire, but are
revoked when the account password changes; re-run the script if sending starts failing with
`invalid_grant`.

### Option B — SMTP (send as a real mailbox)

Sends as an actual Google Workspace / Microsoft 365 account, so **no DNS changes are
needed** — the provider signs the mail, and SPF/DKIM align automatically.

| Variable | Required | Description |
| --- | --- | --- |
| `SMTP_HOST` | Yes | e.g. `smtp.gmail.com` (Google Workspace) or `smtp.office365.com` (M365). |
| `SMTP_PORT` | Optional | Defaults to `465` (implicit TLS). Use `587` for STARTTLS. |
| `SMTP_USER` | Yes | The full mailbox address, e.g. `demandgen@cleartax.com`. |
| `SMTP_PASS` | Yes | A **Google App Password**, not the account password. Spaces are stripped, so you can paste it as shown. |
| `MAIL_FROM` | Recommended | Must match `SMTP_USER`, e.g. `Mira <demandgen@cleartax.com>`. Gmail rewrites a mismatched From to the authenticated mailbox. |
| `MAIL_REPLY_TO` | Optional | Where replies should land, if not the sending mailbox. |
| `MIRA_APP_URL` | Optional | Public board URL for the "Open the board" button. Falls back to the request's host. |

**Getting a Google App Password:** 2-Step Verification must be on for the account, then
visit [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). If the
page is unavailable, the Workspace admin has disabled app passwords — ask them to allow it,
or to enable SMTP AUTH for the account under *Admin → Apps → Gmail → End user access*.

Google Workspace caps sending at **2,000 recipients/day** per account, which is far above
OTP volume.

### Option C — Resend HTTP API

| Variable | Required | Description |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | API key from the [Resend](https://resend.com) dashboard. |
| `MAIL_FROM` | Recommended | Sender on a domain **verified in Resend**. Defaults to the `onboarding@resend.dev` sandbox sender, which only delivers to your own Resend account email. |

Note that Resend can't send as `@cleartax.com` unless that domain is verified in Resend —
its SPF record ends in `-all`, so mail sent through any non-Google service is hard-failed.
Use Option A for that address.

### Local development without mail

If no transport is configured, `/api/auth/request-otp` returns a 503 and logs the generated
code to the server console. Since a 503 leaves the UI stuck on the email screen, set
`ALLOW_CONSOLE_OTP=1` to let sign-in advance to the code entry step instead — the code is
still only ever written to the log, never to the HTTP response.

**Don't set `ALLOW_CONSOLE_OTP` in production.** It's off by default, and it only applies
when no transport is configured, so it can't mask a broken mail setup — but leaving it on
would turn a loud failure into a quiet one.

### No-reply behaviour

Leave `MAIL_REPLY_TO` blank and Mira sends as no-reply: it adds `Auto-Submitted:
auto-generated` (RFC 3834) and `X-Auto-Response-Suppress: All`, which stop out-of-office
autoresponders bouncing back at the sending mailbox, and the email footer tells recipients
not to reply. Set `MAIL_REPLY_TO` to an address if replies should reach a human instead.

### Who receives assignment emails

Assignment notices go to the email stored against the teammate in **Team → Add**. Teammates
without an email on file are simply skipped (logged as a warning). To add or update an
address, enter the existing name with the new email and click **Add**.

---

## 🔐 Auth Flow

1. `POST /api/auth/request-otp` — validates the email domain (`clear.in`, `cleartax.in`, `cleartax.com`), generates a 6-digit code, stores it for 10 minutes, and mails it. Re-requests are throttled to one every 30 seconds.
2. `POST /api/auth/verify-otp` — checks the code (max 5 attempts, constant-time compare), burns it, adds the user to the team, and returns a 7-day session token plus the resolved `member` name.
3. Every other `/api` route requires `Authorization: Bearer <token>`. A 401 clears the stored session and returns the user to the sign-in screen.

**Auto-added members.** A successful sign-in puts that address on the board, with a display
name derived from the email (`mafas.s@clear.in` → `Mafas S`). Existing members are reused
rather than duplicated: an address already on file keeps its current name even if it was
renamed in **Team**, a matching name with no address on file adopts it, and a name held by a
*different* address gets a numeric suffix. A failure here is logged but never blocks login.

---

## 🚀 Quick Start Guide

### Local Development
```bash
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 🐙 Step 1: Push to GitHub

Your local Git repository is initialized and committed. Follow these steps to push to GitHub:

1. Your repository is live at: **[https://github.com/mafazsiddi/cleartax-pipeline](https://github.com/mafazsiddi/cleartax-pipeline)**
2. To push future changes from your computer, run:
   ```bash
   git push origin main
   ```

---

## 📐 Step 2: Deploy to Vercel

### Option A: Via Vercel Dashboard (Easiest)
1. Log in to [vercel.com](https://vercel.com).
2. Click **"Add New"** → **"Project"**.
3. Import your GitHub repository.
4. Add the email environment variables listed above.
5. Click **"Deploy"** (Vercel will detect Vite + `api/index.js` serverless function automatically).

### Option B: Via Terminal
Run the following command directly in your project folder:
```bash
npx vercel
```
Follow the prompts to publish instantly!

---

## 📁 Project Structure

```text
Mira/
├── mira.jsx            # Main React component & UI
├── lib/
│   └── mail.js         # SMTP/Resend sender + OTP / assignment email templates
├── server/
│   ├── index.js        # Express API server (local dev)
│   └── db.js           # SQLite handler & queries
├── api/
│   └── index.js        # Vercel Serverless API handler
├── vercel.json         # Vercel route rewrites
├── mira.sqlite         # Local SQLite database
├── index.html          # HTML entry point
├── package.json        # Dependencies & scripts
├── vite.config.js      # Vite build & proxy config
└── README.md           # Documentation
```
