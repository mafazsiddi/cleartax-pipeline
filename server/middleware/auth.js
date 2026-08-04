import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { userSessions, users } from '../../db/schema/index.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const token = authHeader.slice('Bearer '.length);

  try {
    const rows = await db
      .select({
        expiresAt: userSessions.expiresAt,
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        deactivatedAt: users.deactivatedAt,
      })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(eq(userSessions.token, token))
      .limit(1);

    const session = rows[0];
    if (!session || Date.now() > new Date(session.expiresAt).getTime()) {
      return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
    }
    if (session.deactivatedAt) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    req.user = { id: session.id, email: session.email, name: session.name, role: session.role };
    req.token = token;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Internal Auth Error' });
  }
}

export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
