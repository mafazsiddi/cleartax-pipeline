import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initDb,
  getBoard,
  upsertTask,
  updateTaskStage,
  deleteTask,
  addMember,
  listMembers,
  removeMember,
  clearAllTasks,
  getTaskAssignee,
  getMemberEmail,
  saveOtp,
  getOtp,
  bumpOtpAttempts,
  deleteOtp,
  saveSession,
  getSession,
  deleteSession,
} from './db.js';
import { sendMail, mailEnabled, mailConfig, consoleOtpAllowed, otpEmail, assignmentEmail } from '../lib/mail.js';
import { resolveMemberName } from '../lib/members.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

/* ------------------------------ auth ------------------------------ */

const ALLOWED_DOMAINS = ['clear.in', 'cleartax.in', 'cleartax.com'];
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const domainAllowed = (email) => {
  const domain = email.split('@')[1];
  return !!domain && ALLOWED_DOMAINS.includes(domain);
};

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api') || req.path.startsWith('/api/auth/')) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  try {
    const session = await getSession(authHeader.split(' ')[1]);
    if (!session || Date.now() > Number(session.expires_at)) {
      return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
    }
    req.user = { email: session.email };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Internal Auth Error' });
  }
});

app.post('/api/auth/request-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!domainAllowed(email)) {
    return res.status(403).json({ error: 'Please enter correct email address.' });
  }

  try {
    const now = Date.now();
    const existing = await getOtp(email);
    const lastSentAt = Number(existing?.created_at || 0);
    if (lastSentAt && now - lastSentAt < OTP_RESEND_MS) {
      const wait = Math.ceil((OTP_RESEND_MS - (now - lastSentAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await saveOtp(email, code, now + OTP_TTL_MS, now);

    const tpl = otpEmail({ code, minutes: Math.round(OTP_TTL_MS / 60000) });
    const result = await sendMail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });

    if (!result.sent && !mailEnabled()) {
      console.warn(`[auth] Mail disabled. OTP for ${email} is ${code}`);
      if (consoleOtpAllowed()) {
        // Advance the sign-in flow; the code stays in the log, never in the body.
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
      // Nothing was delivered, so don't let the stored row hold the caller in
      // the resend throttle for a code they never received.
      await deleteOtp(email);
      return res.status(502).json({ error: "Couldn't send the code. Please try again in a moment." });
    }
    res.json({ success: true, email, expiresInSeconds: Math.round(OTP_TTL_MS / 1000) });
  } catch (err) {
    console.error('Request OTP error:', err);
    res.status(500).json({ error: 'Server error sending the code' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.otp || '').trim();
  if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
  if (!domainAllowed(email)) {
    return res.status(403).json({ error: 'Please enter correct email address.' });
  }

  try {
    const record = await getOtp(email);
    if (!record) return res.status(400).json({ error: 'Request a new code to continue.' });

    if (Date.now() > Number(record.expires_at)) {
      await deleteOtp(email);
      return res.status(400).json({ error: 'That code has expired. Request a new one.' });
    }
    if (Number(record.attempts) >= OTP_MAX_ATTEMPTS) {
      await deleteOtp(email);
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
    }

    const expected = Buffer.from(String(record.otp));
    const given = Buffer.from(code);
    const matches = expected.length === given.length && crypto.timingSafeEqual(expected, given);

    if (!matches) {
      await bumpOtpAttempts(email);
      const left = OTP_MAX_ATTEMPTS - (Number(record.attempts) + 1);
      return res.status(401).json({
        error: left > 0
          ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'Incorrect code. Request a new one.',
      });
    }

    await deleteOtp(email);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await saveSession(token, email, expiresAt);

    // Put whoever just signed in on the board. Never let this fail the login.
    let member = '';
    try {
      const existing = await listMembers();
      const resolved = resolveMemberName(email, existing);
      if (resolved.name) {
        await addMember(resolved.name, email);
        member = resolved.name;
        if (resolved.isNew) console.log(`[auth] Added ${resolved.name} <${email}> to the team`);
      }
    } catch (err) {
      console.error('[auth] Could not add member on login:', err.message);
    }

    res.json({ token, email, member });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Server error verifying the code' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      await deleteSession(authHeader.split(' ')[1]);
    } catch (e) {
      console.error('Logout error:', e);
    }
  }
  res.json({ success: true });
});

/**
 * Notify a teammate that a card is now theirs. Never throws.
 */
async function notifyAssignment(task, previousAssignee, req) {
  try {
    const assignee = (task.assignee || '').trim();
    if (!assignee || assignee === (previousAssignee || '').trim()) return;
    if (!mailEnabled()) return;

    const to = await getMemberEmail(assignee);
    if (!to) {
      console.warn(`[mail] No email on file for "${assignee}" — assignment notice not sent.`);
      return;
    }

    const { appUrl } = mailConfig();
    const link = appUrl || (req.headers.host ? `http://${req.headers.host}` : '');
    const tpl = assignmentEmail({ task, assignee, assignedBy: task.assignedBy || '', appUrl: link });
    await sendMail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
  } catch (err) {
    console.error('[mail] Assignment notification failed:', err.message);
  }
}

// API Routes
app.get('/api/board', async (req, res) => {
  try {
    const data = await getBoard();
    res.json(data);
  } catch (err) {
    console.error('Error getting board data:', err);
    res.status(500).json({ error: 'Failed to retrieve board data' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const task = req.body;
    if (!task || !task.id || !task.title) {
      return res.status(400).json({ error: 'Invalid task data' });
    }
    const previousAssignee = await getTaskAssignee(task.id);
    await upsertTask(task);
    await notifyAssignment(task, previousAssignee, req);
    res.json({ success: true, task });
  } catch (err) {
    console.error('Error upserting task:', err);
    res.status(500).json({ error: 'Failed to save task' });
  }
});

app.patch('/api/tasks/:id/stage', async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;
    if (!stage) {
      return res.status(400).json({ error: 'Stage is required' });
    }
    await updateTaskStage(id, stage);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating task stage:', err);
    res.status(500).json({ error: 'Failed to move task stage' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteTask(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

app.post('/api/members', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Member name required' });
    }
    const email = normalizeEmail(req.body?.email);
    if (email && !email.includes('@')) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    await addMember(name.trim(), email);
    res.json({ success: true, name: name.trim(), email });
  } catch (err) {
    console.error('Error adding member:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

app.delete('/api/members/:name', async (req, res) => {
  try {
    const { name } = req.params;
    await removeMember(decodeURIComponent(name));
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing member:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

app.post('/api/clear', async (req, res) => {
  try {
    await clearAllTasks();
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing tasks:', err);
    res.status(500).json({ error: 'Failed to clear tasks' });
  }
});

// Serve static frontend files in production
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));

// SPA Fallback
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api')) return next();
  res.sendFile(path.resolve(distPath, 'index.html'));
});

// Initialize database and start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Mira Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
  });
