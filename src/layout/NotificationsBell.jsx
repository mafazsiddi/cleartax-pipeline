import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Calendar } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { PMAP, dueMeta, sortIssues } from '../shared/helpers.js';

export default function NotificationsBell() {
  const { request } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const wrapRef = useRef(null);

  const load = async () => {
    try {
      const data = await request('/me/assigned-issues');
      setItems([...data.issues].sort(sortIssues));
    } catch (err) {
      console.error('Failed to load assigned cards:', err);
    }
  };

  useEffect(() => { load(); }, []);
  usePolling(load, { paused: () => open });

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  const openCard = (item) => {
    setOpen(false);
    navigate(`/projects/${item.projectKey}/board/${item.key}`);
  };

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        className="icon-btn notif-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label="Cards assigned to you"
        title="Cards assigned to you"
      >
        <Bell size={17} />
        {items.length > 0 && <span className="notif-badge">{items.length > 9 ? '9+' : items.length}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">Assigned to you</div>
          {items.length === 0 ? (
            <p className="hint" style={{ padding: '4px 12px 12px' }}>Nothing assigned to you right now.</p>
          ) : (
            <ul className="notif-list">
              {items.map((i) => {
                const p = PMAP[i.priority] || PMAP.medium;
                const due = dueMeta(i.dueDate, false);
                return (
                  <li key={i.id} className="notif-item" onClick={() => openCard(i)}>
                    <span className="notif-item-top">
                      <span className="notif-project-key">{i.projectKey}</span>
                      <span className="prio-dot" style={{ background: p.color }} title={p.name} />
                    </span>
                    <span className="notif-item-title">{i.title}</span>
                    {due && (
                      <span className={`due due-${due.state}`}>
                        <Calendar size={11} />
                        {due.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
