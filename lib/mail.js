/* ------------------------------------------------------------------ *
 * Mira — outbound email.
 *
 * Three transports, picked from the environment in this order:
 *   gmail  — GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN.
 *            Sends through the Gmail API over HTTPS as the consenting
 *            mailbox. Works when a Workspace admin has disabled password
 *            based SMTP AUTH, and needs no outbound TCP — the best fit for
 *            serverless. Run `npm run gmail-auth` to mint the refresh token.
 *   smtp   — SMTP_HOST / SMTP_USER / SMTP_PASS. Sends as a real mailbox
 *            (e.g. Google Workspace) with no DNS changes, because the
 *            provider signs the mail itself. SMTP_PASS is an app password.
 *   resend — RESEND_API_KEY. HTTP only, but the From domain has to be
 *            verified in Resend with DNS records.
 * ------------------------------------------------------------------ */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_ENDPOINT =
  'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

function cleanEnv(v) {
  if (!v) return '';
  return String(v).trim().replace(/^["'](.*)["']$/, '$1');
}

export function mailConfig() {
  const host = cleanEnv(process.env.SMTP_HOST);
  const user = cleanEnv(process.env.SMTP_USER);
  // App passwords are shown in groups of four — Google ignores the spaces.
  const pass = cleanEnv(process.env.SMTP_PASS).replace(/\s+/g, '');
  const port = Number(cleanEnv(process.env.SMTP_PORT)) || 465;
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);

  const clientId = cleanEnv(process.env.GMAIL_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.GMAIL_CLIENT_SECRET);
  const refreshToken = cleanEnv(process.env.GMAIL_REFRESH_TOKEN);

  const gmail = clientId && clientSecret && refreshToken
    ? { clientId, clientSecret, refreshToken }
    : null;

  const smtp = host && user && pass
    ? { host, port, secure: port === 465, user, pass }
    : null;

  const provider = gmail ? 'gmail' : smtp ? 'smtp' : apiKey ? 'resend' : null;

  // Sending as a mailbox means the From address has to be that mailbox.
  // Gmail rewrites a mismatched From to the authenticated account anyway.
  const fallbackFrom = smtp
    ? `Mira <${user}>`
    : gmail
      ? 'Mira'
      : 'Mira <onboarding@resend.dev>';

  return {
    gmail,
    smtp,
    apiKey,
    provider,
    from: cleanEnv(process.env.MAIL_FROM) || fallbackFrom,
    appUrl: (cleanEnv(process.env.MIRA_APP_URL) || '').replace(/\/$/, ''),
  };
}

export function mailEnabled() {
  return !!mailConfig().provider;
}

/**
 * Headers that mark a message as machine-generated. Auto-Submitted (RFC 3834)
 * stops out-of-office autoresponders bouncing back at the sending mailbox;
 * X-Auto-Response-Suppress is the Exchange/Outlook equivalent. Applied unless
 * MAIL_REPLY_TO names somewhere replies should actually go.
 */
function noReplyHeaders() {
  if (cleanEnv(process.env.MAIL_REPLY_TO)) return {};
  return {
    'Auto-Submitted': 'auto-generated',
    'X-Auto-Response-Suppress': 'All',
  };
}

/**
 * Dev escape hatch: with no transport configured, let the sign-in flow carry
 * on and read the code off the server console. Opt-in only — the code is
 * still never returned over HTTP.
 */
export function consoleOtpAllowed() {
  const v = cleanEnv(process.env.ALLOW_CONSOLE_OTP).toLowerCase();
  return !mailEnabled() && (v === '1' || v === 'true' || v === 'yes');
}

/* Reused across warm invocations so the TLS handshake isn't paid per email. */
let transporter = null;
let transporterKey = '';

async function getTransport(smtp) {
  const key = `${smtp.host}:${smtp.port}:${smtp.user}`;
  if (transporter && transporterKey === key) return transporter;

  const { default: nodemailer } = await import('nodemailer');
  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  transporterKey = key;
  return transporter;
}

async function sendViaSmtp({ smtp, from, to, subject, html, text }) {
  try {
    const tx = await getTransport(smtp);
    await tx.sendMail({
      from,
      // Replies should reach a human, not the automation mailbox.
      ...(cleanEnv(process.env.MAIL_REPLY_TO) ? { replyTo: cleanEnv(process.env.MAIL_REPLY_TO) } : {}),
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      ...(text ? { text } : {}),
      headers: noReplyHeaders(),
    });
    return { sent: true };
  } catch (err) {
    console.error('[mail] SMTP send failed:', err.message);
    // A bad password can be cached in the pooled transport — drop it.
    transporter = null;
    transporterKey = '';
    return { sent: false, error: err.message };
  }
}

/* ------------------------- Gmail API (OAuth2) ---------------------- *
 * Access tokens last an hour, so one is cached and reused across warm
 * invocations rather than re-minted per email.
 * ------------------------------------------------------------------- */
let gmailToken = null; // { value, expiresAt, key }

async function gmailAccessToken({ clientId, clientSecret, refreshToken }) {
  const key = `${clientId}:${refreshToken.slice(-8)}`;
  // 60s of slack so a token can't expire mid-flight.
  if (gmailToken && gmailToken.key === key && Date.now() < gmailToken.expiresAt - 60_000) {
    return gmailToken.value;
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant means the token was revoked or the consent was withdrawn.
    throw new Error(`oauth-${res.status}: ${body.error || 'token refresh failed'}`);
  }

  gmailToken = {
    key,
    value: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000,
  };
  return gmailToken.value;
}

/* Non-ASCII headers must be RFC 2047 encoded or Gmail rejects the message. */
function encodeHeader(value) {
  const s = String(value == null ? '' : value);
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

function buildMime({ from, to, replyTo, subject, html, text, extraHeaders = {} }) {
  const recipients = Array.isArray(to) ? to.join(', ') : to;
  // A fixed-prefix boundary keeps the message deterministic per send.
  const boundary = `mira-${Buffer.from(String(process.hrtime.bigint())).toString('hex').slice(0, 24)}`;

  const headers = [
    `From: ${from}`,
    `To: ${recipients}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
  ];

  // Bodies are base64'd so long lines and UTF-8 survive transport intact.
  const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');

  if (!text) {
    headers.push('Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64');
    return `${headers.join('\r\n')}\r\n\r\n${b64(html)}`;
  }

  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  return [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

async function sendViaGmail({ gmail, from, to, subject, html, text }) {
  try {
    const token = await gmailAccessToken(gmail);
    const mime = buildMime({
      from,
      to,
      replyTo: cleanEnv(process.env.MAIL_REPLY_TO),
      subject,
      html,
      text,
      extraHeaders: noReplyHeaders(),
    });
    // Gmail wants base64url, unpadded.
    const raw = Buffer.from(mime, 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await fetch(GMAIL_SEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[mail] Gmail API rejected the message:', res.status, body.slice(0, 300));
      // A 401 means the cached token went stale early — drop it so the next
      // attempt re-mints rather than replaying a dead token.
      if (res.status === 401) gmailToken = null;
      return { sent: false, error: `gmail-${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('[mail] Gmail API send failed:', err.message);
    gmailToken = null;
    return { sent: false, error: err.message };
  }
}

async function sendViaResend({ apiKey, from, to, subject, html, text }) {
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(text ? { text } : {}),
        ...(cleanEnv(process.env.MAIL_REPLY_TO)
          ? { reply_to: cleanEnv(process.env.MAIL_REPLY_TO) }
          : {}),
        headers: noReplyHeaders(),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[mail] Resend rejected the message:', res.status, body.slice(0, 300));
      return { sent: false, error: `resend-${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('[mail] Failed to reach Resend:', err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Send one email. Never throws — returns { sent, skipped?, error? } so a
 * mail failure can't take down the request that triggered it.
 */
export async function sendMail({ to, subject, html, text }) {
  const { provider, gmail, smtp, apiKey, from } = mailConfig();

  if (!provider) {
    console.warn(
      '[mail] No transport configured (GMAIL_*, SMTP_* or RESEND_API_KEY) — skipping email to',
      to
    );
    return { sent: false, skipped: 'no-transport' };
  }
  if (!to) return { sent: false, skipped: 'no-recipient' };

  if (provider === 'gmail') return sendViaGmail({ gmail, from, to, subject, html, text });
  if (provider === 'smtp') return sendViaSmtp({ smtp, from, to, subject, html, text });
  return sendViaResend({ apiKey, from, to, subject, html, text });
}

/* ---------------------------- templates --------------------------- */

const BRAND = '#4338CA';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function shell(inner) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:32px 16px;background:#F5F6F9;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E6E9F0;border-radius:16px;">
    <tr><td style="padding:32px;">
      <div style="display:inline-block;width:40px;height:40px;line-height:40px;text-align:center;border-radius:11px;background:${BRAND};color:#ffffff;font-size:18px;font-weight:700;">M</div>
      <div style="margin:14px 0 22px 0;font-size:20px;font-weight:700;color:#1B2333;letter-spacing:-0.4px;">Mira</div>
      ${inner}
    </td></tr>
  </table>
  <p style="max-width:480px;margin:16px auto 0 auto;font-size:11.5px;color:#8A93A6;text-align:center;line-height:1.6;">
    Mira — design &amp; development board<br>
    This is an automated message from an unmonitored address. Please don't reply.
  </p>
</body></html>`;
}

export function otpEmail({ code, minutes }) {
  return {
    subject: `${code} is your Mira sign-in code`,
    text: `Your Mira sign-in code is ${code}. It expires in ${minutes} minutes. If you didn't request it, you can ignore this email.\n\nThis is an automated message from an unmonitored address. Please don't reply.`,
    html: shell(`
      <p style="margin:0 0 8px 0;font-size:15px;color:#1B2333;font-weight:600;">Your sign-in code</p>
      <p style="margin:0 0 20px 0;font-size:13.5px;color:#586074;line-height:1.5;">
        Enter this code to open the board. It expires in ${minutes} minutes.
      </p>
      <div style="padding:16px;border:1px solid #E6E9F0;border-radius:12px;background:#FBFBFD;text-align:center;
                  font-size:30px;font-weight:700;letter-spacing:9px;color:${BRAND};">${esc(code)}</div>
      <p style="margin:20px 0 0 0;font-size:12px;color:#8A93A6;line-height:1.5;">
        Didn't try to sign in? You can safely ignore this email — the code only works from the sign-in screen.
      </p>
    `),
  };
}

const STAGE_NAMES = {
  backlog: 'Backlog',
  design: 'Design',
  design_review: 'Design Review',
  development: 'Development',
  qa: 'QA',
  done: 'Done',
};

const PRIORITY_NAMES = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function assignmentEmail({ task, assignee, assignedBy, appUrl }) {
  const stage = STAGE_NAMES[task.stage] || task.stage || 'Backlog';
  const priority = PRIORITY_NAMES[task.priority] || task.priority || 'Medium';
  const by = assignedBy ? ` by ${assignedBy}` : '';

  const row = (label, value) => `
    <tr>
      <td style="padding:6px 0;font-size:12px;color:#8A93A6;width:96px;">${esc(label)}</td>
      <td style="padding:6px 0;font-size:13px;color:#1B2333;font-weight:500;">${esc(value)}</td>
    </tr>`;

  return {
    subject: `You've been assigned: ${task.title}`,
    text: `${assignee}, you've been assigned "${task.title}"${by}. Stage: ${stage}. Priority: ${priority}.${task.dueDate ? ` Due: ${task.dueDate}.` : ''}${appUrl ? ` Open the board: ${appUrl}` : ''}\n\nThis is an automated message from an unmonitored address. Please don't reply.`,
    html: shell(`
      <p style="margin:0 0 8px 0;font-size:15px;color:#1B2333;font-weight:600;">
        Hi ${esc(assignee)}, a card is yours
      </p>
      <p style="margin:0 0 20px 0;font-size:13.5px;color:#586074;line-height:1.5;">
        You were assigned a card on the Mira board${esc(by)}.
      </p>

      <div style="padding:16px;border:1px solid #E6E9F0;border-radius:12px;background:#FBFBFD;">
        <p style="margin:0 0 10px 0;font-size:15px;font-weight:600;color:#1B2333;line-height:1.4;">${esc(task.title)}</p>
        ${task.description ? `<p style="margin:0 0 12px 0;font-size:13px;color:#586074;line-height:1.55;">${esc(task.description)}</p>` : ''}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${row('Stage', stage)}
          ${row('Priority', priority)}
          ${task.dueDate ? row('Due', task.dueDate) : ''}
          ${assignedBy ? row('Assigned by', assignedBy) : ''}
        </table>
        ${task.figmaLink ? `<p style="margin:12px 0 0 0;font-size:13px;"><a href="${esc(task.figmaLink)}" style="color:${BRAND};font-weight:500;">Open Figma file →</a></p>` : ''}
      </div>

      ${appUrl ? `<p style="margin:22px 0 0 0;">
        <a href="${esc(appUrl)}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};
           color:#ffffff;font-size:13.5px;font-weight:600;text-decoration:none;">Open the board</a>
      </p>` : ''}
    `),
  };
}
