import React, { useState, useEffect } from 'react';
import { UserX, UserCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { avatarColor, initials } from '../shared/helpers.js';

const ROLES = ['admin', 'member', 'viewer'];

export default function UsersAdminPage() {
  const { request, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    const data = await request('/users');
    setUsers(data.users);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeRole = async (id, role) => {
    try {
      const { user } = await request(`/users/${id}/role`, { method: 'PATCH', body: { role } });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...user } : u)));
    } catch (e) {
      setErr(e.message);
    }
  };

  const toggleDeactivate = async (u) => {
    try {
      const { user } = await request(`/users/${u.id}/deactivate`, { method: 'PATCH', body: { deactivate: !u.deactivatedAt } });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...user } : x)));
    } catch (e) {
      setErr(e.message);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /> Loading users…</div>;

  return (
    <div className="settings-page">
      <h2 className="settings-h">Users</h2>
      <p className="hint" style={{ marginBottom: 16 }}>
        Accounts are created automatically the first time someone signs in — there's no invite-by-email yet.
      </p>
      {err && <p className="err">{err}</p>}

      <ul className="member-list">
        {users.map((u) => (
          <li key={u.id} className="member-row">
            <span className="avatar sm" style={{ background: avatarColor(u.name), opacity: u.deactivatedAt ? 0.4 : 1 }}>
              {initials(u.name)}
            </span>
            <span className="member-block">
              <span className="member-name">{u.name}{u.id === currentUser.id ? ' (you)' : ''}</span>
              <span className="member-email">{u.email}</span>
            </span>
            <div className="selwrap">
              <select
                className="sel"
                value={u.role}
                disabled={u.id === currentUser.id}
                onChange={(e) => changeRole(u.id, e.target.value)}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button
              className="icon-btn small"
              disabled={u.id === currentUser.id}
              onClick={() => toggleDeactivate(u)}
              title={u.deactivatedAt ? 'Reactivate' : 'Deactivate'}
            >
              {u.deactivatedAt ? <UserCheck size={15} /> : <UserX size={15} />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
