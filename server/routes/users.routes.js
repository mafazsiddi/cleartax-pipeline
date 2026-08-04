import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      deactivatedAt: users.deactivatedAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(users.name);
  res.json({ users: rows });
});

router.patch('/:id/role', requireRole(['admin']), async (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'member', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const [updated] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'User not found' });
  res.json({ user: updated });
});

router.patch('/:id/deactivate', requireRole(['admin']), async (req, res) => {
  const deactivate = req.body?.deactivate !== false;
  const [updated] = await db
    .update(users)
    .set({ deactivatedAt: deactivate ? new Date() : null, updatedAt: new Date() })
    .where(eq(users.id, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'User not found' });
  res.json({ user: updated });
});

export default router;
