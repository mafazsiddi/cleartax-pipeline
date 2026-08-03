/* ------------------------------------------------------------------ *
 * One-time Gmail OAuth consent.
 *
 *   npm run gmail-auth
 *
 * Opens Google's consent screen, captures the authorization code on a
 * throwaway loopback server, and exchanges it for a refresh token that
 * lib/mail.js can use indefinitely. Run this once per sending mailbox.
 *
 * Prerequisites (Google Cloud console, any project):
 *   1. Enable the Gmail API.
 *   2. Create an OAuth client of type "Desktop app" — that type permits
 *      loopback redirects on an arbitrary port, so nothing needs to be
 *      registered up front.
 *   3. Put the client id/secret in .env as GMAIL_CLIENT_ID /
 *      GMAIL_CLIENT_SECRET, then run this script.
 * ------------------------------------------------------------------ */

import http from 'node:http';
import { spawn } from 'node:child_process';

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const PORT = Number(process.env.GMAIL_AUTH_PORT) || 5555;
const REDIRECT_URI = `http://localhost:${PORT}`;

function cleanEnv(v) {
  if (!v) return '';
  return String(v).trim().replace(/^["'](.*)["']$/, '$1');
}

const clientId = cleanEnv(process.env.GMAIL_CLIENT_ID);
const clientSecret = cleanEnv(process.env.GMAIL_CLIENT_SECRET);

if (!clientId || !clientSecret) {
  console.error(`
Missing credentials. Add these to .env first, then re-run:

  GMAIL_CLIENT_ID=<from Google Cloud console>
  GMAIL_CLIENT_SECRET=<from Google Cloud console>

Create them at https://console.cloud.google.com/apis/credentials
as an OAuth client of type "Desktop app", with the Gmail API enabled.
`);
  process.exit(1);
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    // offline + consent is what actually returns a refresh_token; without
    // prompt=consent Google omits it on repeat authorisations.
    access_type: 'offline',
    prompt: 'consent',
  });

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      // cmd's `start` treats & as a command separator, so the URL has to stay
      // quoted in the raw command line — Node's own arg escaping happens too
      // late to prevent that, hence windowsVerbatimArguments.
      spawn(process.env.COMSPEC || 'cmd.exe', [`/c start "" "${url}"`], {
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: true,
      }).unref();
      return;
    }
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* Opening a browser is a convenience; the printed URL is the real path. */
  }
}

async function exchange(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body.error || ''} ${body.error_description || ''}`);
  return body;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (!code && !error) return res.writeHead(404).end();

  const reply = (msg) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8">
      <body style="font-family:system-ui;padding:48px;text-align:center;color:#1B2333">
        <p style="font-size:16px">${msg}</p>
        <p style="color:#8A93A6;font-size:13px">You can close this tab.</p>
      </body>`);
  };

  /**
   * Exit once the browser has the response. Tearing the loopback server down
   * with process.exit() while its handles are still closing trips a libuv
   * assertion on Windows, so wait for the socket to drain first.
   */
  const finish = (exitCode) => {
    res.on('finish', () => {
      server.closeAllConnections?.();
      server.close(() => process.exit(exitCode));
    });
  };

  if (error) {
    reply('Authorisation was denied.');
    console.error(`\nDenied: ${error}`);
    return finish(1);
  }

  try {
    const token = await exchange(code);
    if (!token.refresh_token) {
      reply('No refresh token returned.');
      console.error(`
Google returned an access token but no refresh token. This happens when the
app was already authorised. Revoke it at
https://myaccount.google.com/permissions and run this again.
`);
      return finish(1);
    }

    reply('Authorised. Mira can now send mail as this account.');
    console.log(`
Success. Add this line to .env (and to Vercel's environment variables):

GMAIL_REFRESH_TOKEN=${token.refresh_token}

Then set MAIL_FROM to the mailbox you just consented as, e.g.
MAIL_FROM=Mira <products@cleartaxmailer.com>

Refresh tokens do not expire, but they are revoked if the account password
changes or access is withdrawn — re-run this script if sending starts
failing with 'invalid_grant'.
`);
    return finish(0);
  } catch (err) {
    reply('Token exchange failed.');
    console.error(`\nToken exchange failed: ${err.message}`);
    return finish(1);
  }
});

server.listen(PORT, () => {
  console.log(`
Opening Google's consent screen. Sign in as the mailbox Mira should send
from — if you are signed into several Google accounts, pick carefully.

If the browser does not open, paste this URL manually:

${authUrl}

Waiting on ${REDIRECT_URI} ...
`);
  openBrowser(authUrl);
});
