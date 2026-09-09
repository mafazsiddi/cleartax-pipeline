import { asyncRouter as Router } from '../lib/asyncRouter.js';
import { db } from '../../db/client.js';
import { issueTypes } from '../../db/schema/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const rows = await db.select().from(issueTypes).orderBy(issueTypes.hierarchyLevel);
  res.json({ issueTypes: rows });
});

export default router;
