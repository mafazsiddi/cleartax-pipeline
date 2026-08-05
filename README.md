# Mira — Project & Issue Tracker

**Mira** is a Jira-style project/issue tracker: multiple projects, each with its own
configurable workflow (statuses), issue hierarchy (Epics → Stories/Tasks/Bugs → Subtasks),
comments, labels, and file attachments. Auth is email-OTP (no passwords), with org-wide
roles (`admin` / `member` / `viewer`).

---

## ✨ Features

- **Multiple projects**, each with its own key (e.g. `ENG-123`) and configurable workflow columns.
- **Issue hierarchy**: Epic → Story/Task/Bug → Subtask, enforced server-side.
- **Comments, labels, and file attachments** (attachments via Cloudflare R2 — see below).
- **Roles**: `admin` (manage projects/workflow/users), `member` (full issue CRUD), `viewer` (read-only).
- **Email OTP sign-in**: a 6-digit code is mailed to the user; only allow-listed domains can request one. Accounts are created automatically on first sign-in — there's no invite-by-email yet.
- **Assignment notifications**: whoever an issue is assigned to gets an email with its details.
- **Drag & drop** between workflow columns, with search/filter by assignee, type, and priority.

---

## 🚀 Quick Start (local development)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local Postgres) and Node 20+.

```bash
npm install
npm run db:up        # starts local Postgres via docker-compose
npm run db:migrate   # applies the Drizzle schema
npm run db:seed      # seeds the fixed issue-type list (Epic/Story/Task/Bug/Subtask)
npm run dev          # starts the Express API (3001) + Vite dev server (5173)
```

Open **http://localhost:5173/mira**. Sign in with an email on one of the allowed domains
(`clear.in`, `cleartax.in`, `cleartax.com` by default — see `ALLOWED_EMAIL_DOMAINS` below).
If no mail transport is configured, the OTP is printed to the server console (set
`ALLOW_CONSOLE_OTP=1` to let sign-in proceed past the email step in that case).

### First admin

There's no signup form, so the very first admin has to be promoted by hand after signing in
once:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@yourdomain.com';
```

An admin can promote/demote everyone else from **Admin → Users** in the app.

---

## 🗄️ Database (Drizzle ORM + Postgres)

Schema lives in `db/schema/*.js`. After changing a schema file:

```bash
npm run db:generate   # writes a new SQL migration into drizzle/migrations/
npm run db:migrate    # applies pending migrations
```

`npm run db:studio` opens Drizzle Studio against your local database.

In production, `DATABASE_URL` should point at a **pooled** connection (Neon/Vercel Postgres
pooler) since the app runs as serverless functions. Migrations run as part of the Vercel
**build** (not at request time, to avoid races between concurrently-warming instances) — wire
`npm run db:migrate` into your Vercel build command.

### One-time production cutover from the old schema

If you're upgrading a deployment that still has the old flat `tasks`/`members` tables,
run `scripts/backfill-legacy.js` **once, manually**, against production, before deploying
this version — it migrates old data into the new schema and drops the old tables (which
collide by name with the new `auth_otps`/`user_sessions` tables). Read the comment at the
top of that file before running it; take a database snapshot first if your host offers one.

```bash
DATABASE_URL=<prod-connection-string> MIGRATION_FALLBACK_EMAIL=you@yourdomain.com node scripts/backfill-legacy.js
```

---

## 📎 File attachments (Vercel Blob)

Attachments are stored in a **private** Vercel Blob store (`mira-attachments`, already created
and linked to this Vercel project). Uploads go directly from the browser to Blob storage using
a short-lived client token (`@vercel/blob/client`'s `upload()` + a server-side `handleUpload()`
token-minting route) — the file never passes through our own server, so there's no Vercel
function body-size limit on attachment size. Downloads are streamed back through our own
`GET /api/attachments/:id/download` route (private blobs aren't directly browser-fetchable,
so this route is the access-control boundary — it requires a valid session, same as everything
else).

| Variable | Description |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Long-lived read-write token for the store. Already set in Vercel's Production/Preview/Development env vars; run `vercel env pull` to get it into `.env.local` for local dev (then copy it into `.env`, since npm scripts load `.env`, not `.env.local`). |

Until this is set, the attachment UI shows a "storage not configured" message instead of failing.

**Why the upload route isn't behind the usual `requireAuth` middleware:** `@vercel/blob/client`'s
`upload()` helper has no way to attach a custom `Authorization` header to its token-request call.
Per Vercel's documented pattern for authenticating client uploads, the session token instead
travels through `clientPayload` and is validated manually inside `onBeforeGenerateToken`
(`server/routes/attachments.routes.js`).

---

## ✉️ Email Setup (required for sign-in to actually deliver codes)

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
| `MIRA_APP_URL` | Optional | Public app URL for the "Open the board" button. Falls back to the request's host. |

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

---

## 🔐 Auth & Roles

1. `POST /api/auth/request-otp` — validates the email domain against `ALLOWED_EMAIL_DOMAINS`
   (defaults to `clear.in,cleartax.in,cleartax.com`), generates a 6-digit code, stores it for
   10 minutes, and mails it. Re-requests are throttled to one every 30 seconds.
2. `POST /api/auth/verify-otp` — checks the code (max 5 attempts, constant-time compare),
   burns it, creates a `users` row on first sign-in (role defaults to `member`), and returns
   a 7-day session token.
3. Every other `/api` route requires `Authorization: Bearer <token>`. A 401 clears the stored
   session and returns the user to the sign-in screen.
4. Roles are enforced server-side: `viewer` is read-only everywhere, `member` can create/edit
   issues/comments/labels/attachments, `admin` can additionally manage projects, workflow
   statuses, and other users' roles.

---

## 📐 Deploying to Vercel

1. Set the environment variables above (`DATABASE_URL`, mail transport, `R2_*`,
   `ALLOWED_EMAIL_DOMAINS`) in **Vercel → Project → Settings → Environment Variables**.
2. Wire `npm run db:migrate` into the Vercel build command so schema changes apply once per
   deploy, not per cold start.
3. Deploy via the dashboard (import the repo) or `npx vercel`. Vercel picks up the Vite build
   and the `api/index.js` serverless function automatically; `vercel.json` routes `/api/*`
   there and everything else to the SPA shell.
4. After the first deploy, promote your own account to `admin` (see above).

---

## 📁 Project Structure

```text
Mira/
├── src/                    # React frontend
│   ├── App.jsx              # Router + auth gate
│   ├── auth/                 # AuthContext, LoginScreen
│   ├── layout/                # Sidebar, Layout, HomeRedirect
│   ├── board/                  # BoardPage, IssueCard
│   ├── issue/                   # IssueDetailPanel, comments/labels/attachments UI
│   ├── projects/                 # ProjectSettingsPage (workflow + labels admin)
│   ├── admin/                     # UsersAdminPage
│   ├── api/client.js               # fetch wrapper
│   ├── shared/helpers.js            # avatar/priority/due-date helpers
│   └── styles.js                     # CSS-in-JS design system
├── server/
│   ├── app.js               # createApp() — shared by local dev and Vercel
│   ├── index.js               # local dev entrypoint (serves dist/ + SPA fallback)
│   ├── middleware/auth.js       # requireAuth / requireRole
│   ├── routes/                    # one file per resource
│   └── services/                    # issueKey (atomic "ENG-123" generation), r2 (presign)
├── db/
│   ├── schema/               # Drizzle table definitions
│   ├── client.js               # Drizzle client
│   ├── migrate.js                # applies drizzle/migrations/
│   └── seed.js                     # seeds issue_types
├── drizzle/migrations/       # generated SQL migrations (commit these)
├── scripts/backfill-legacy.js  # one-time old-schema → new-schema cutover script
├── lib/mail.js                # mail transports + email templates
├── api/index.js                 # Vercel serverless entrypoint (re-exports server/app.js)
├── docker-compose.yml            # local Postgres for dev
├── drizzle.config.js
├── vercel.json
└── vite.config.js
```
