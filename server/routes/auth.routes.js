import { Router } from 'express';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { authOtps, userSessions, users } from '../../db/schema/index.js';
import { sendMail, mailEnabled, consoleOtpAllowed, otpEmail } from '../../lib/mail.js';
import { displayNameFromEmail } from '../../lib/members.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || 'clear.in,cleartax.in,cleartax.com,cleartax.email')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function domainAllowed(email) {
  const domain = email.split('@')[1];
  return !!domain && ALLOWED_DOMAINS.includes(domain);
}
function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

router.post('/request-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!domainAllowed(email)) {
    return res.status(403).json({ error: 'Please enter correct email address.' });
  }

  try {
    const now = new Date();
    const [existing] = await db.select().from(authOtps).where(eq(authOtps.email, email)).limit(1);
    const lastSentAt = existing ? new Date(existing.createdAt).getTime() : 0;
    if (lastSentAt && now.getTime() - lastSentAt < OTP_RESEND_MS) {
      const wait = Math.ceil((OTP_RESEND_MS - (now.getTime() - lastSentAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
    }

    const code = generateOtp();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    await db
      .insert(authOtps)
      .values({ email, otp: code, expiresAt, attempts: 0, createdAt: now })
      .onConflictDoUpdate({
        target: authOtps.email,
        set: { otp: code, expiresAt, attempts: 0, createdAt: now },
      });

    const tpl = otpEmail({ code, minutes: Math.round(OTP_TTL_MS / 60000) });
    const result = await sendMail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });

    if (!result.sent && !mailEnabled()) {
      // No mail provider configured — surface the code in the server log so a
      // local/dev deployment is still usable, but never in the HTTP response.
      console.warn(`[auth] Mail disabled. OTP for ${email} is ${code}`);
      if (consoleOtpAllowed()) {
        return res.json({
          success: true,
          email,
          devConsole: true,
          expiresInSeconds: Math.round(OTP_TTL_MS / 1000),
        });
      }
      return res.status(503).json({
        error: 'Email delivery is not configured yet. Set SMTP_HOST/SMTP_USER/SMTP_PASS to receive codes.',
      });
    }
    if (!result.sent) {
      await db.delete(authOtps).where(eq(authOtps.email, email));
      return res.status(502).json({ error: "Couldn't send the code. Please try again in a moment." });
    }

    res.json({ success: true, email, expiresInSeconds: Math.round(OTP_TTL_MS / 1000) });
  } catch (err) {
    console.error('Request OTP error:', err);
    res.status(500).json({ error: 'Server error sending the code' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.otp || '').trim();
  if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
  if (!domainAllowed(email)) {
    return res.status(403).json({ error: 'Please enter correct email address.' });
  }

  try {
    const [record] = await db.select().from(authOtps).where(eq(authOtps.email, email)).limit(1);
    if (!record) return res.status(400).json({ error: 'Request a new code to continue.' });

    if (Date.now() > new Date(record.expiresAt).getTime()) {
      await db.delete(authOtps).where(eq(authOtps.email, email));
      return res.status(400).json({ error: 'That code has expired. Request a new one.' });
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await db.delete(authOtps).where(eq(authOtps.email, email));
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
    }

    const expected = Buffer.from(String(record.otp));
    const given = Buffer.from(code);
    const matches = expected.length === given.length && crypto.timingSafeEqual(expected, given);

    if (!matches) {
      await db.update(authOtps).set({ attempts: record.attempts + 1 }).where(eq(authOtps.email, email));
      const left = OTP_MAX_ATTEMPTS - (record.attempts + 1);
      return res.status(401).json({
        error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Request a new one.',
      });
    }

    // Correct — burn the code and find-or-create the account.
    await db.delete(authOtps).where(eq(authOtps.email, email));

    let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      [user] = await db.insert(users).values({ email, name: displayNameFromEmail(email) }).returning();
      console.log(`[auth] Created user ${user.name} <${email}>`);
    }
    if (user.deactivatedAt) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(userSessions).values({ token, userId: user.id, expiresAt });

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Server error verifying the code' });
  }
});

router.post('/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      await db.delete(userSessions).where(eq(userSessions.token, authHeader.slice('Bearer '.length)));
    } catch (e) {
      console.error('Logout error:', e);
    }
  }
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
