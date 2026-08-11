import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, UserPlus, MessageSquare, AtSign } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { timeAgo, avatarColor, initials } from '../shared/helpers.js';

const TYPE_META = {
  assignment: { Icon: UserPlus, verb: 'assigned you' },
  comment: { Icon: MessageSquare, verb: 'commented on' },
  mention: { Icon: AtSign, verb: 'mentioned you in' },
};

export default function NotificationsBell() {
  const { request } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const wrapRef = useRef(null);

  const load = async () => {
    try {
      const data = await request('/me/notifications');
      setItems(data.notifications);
    } catch (err) {
      console.error('Failed to load notifications:', err);
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

  const unreadCount = items.filter((i) => !i.readAt).length;

  const openItem = (item) => {
    setOpen(false);
    if (!item.readAt) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)));
      request(`/me/notifications/${item.id}/read`, { method: 'PATCH' }).catch(() => {});
    }
    navigate(`/projects/${item.projectKey}/board/${item.issueKey}`);
  };

  const markAllRead = () => {
    setItems((prev) => prev.map((i) => (i.readAt ? i : { ...i, readAt: new Date().toISOString() })));
    request('/me/notifications/read-all', { method: 'POST' }).catch(() => {});
  };

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        className="icon-btn notif-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={17} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            Notifications
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={markAllRead}>Mark all read</button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="hint" style={{ padding: '4px 12px 12px' }}>Nothing yet.</p>
          ) : (
            <ul className="notif-list">
              {items.map((i) => {
                const meta = TYPE_META[i.type] || TYPE_META.comment;
                const { Icon } = meta;
                // Assignment previews are just the issue title, already shown
                // right above — showing it twice reads as a bug, not info.
                const showPreview = i.type !== 'assignment' && i.preview;
                return (
                  <li
                    key={i.id}
                    className={`notif-item ${!i.readAt ? 'unread' : ''}`}
                    onClick={() => openItem(i)}
                  >
                    <span className="avatar xs notif-avatar" style={{ background: avatarColor(i.actorName) }}>
                      {initials(i.actorName)}
                    </span>
                    <span className="notif-item-body">
                      <span className="notif-item-top">
                        <span className="notif-item-verb">
                          <Icon size={11} className="notif-item-icon" />
                          {i.actorName ? <><strong>{i.actorName}</strong> {meta.verb}</> : meta.verb}
                        </span>
                        <span className="notif-project-key">{i.projectKey}</span>
                      </span>
                      <span className="notif-item-title">{i.issueKey} — {i.issueTitle}</span>
                      {showPreview && <span className="notif-item-preview">{i.preview}</span>}
                      <span className="notif-item-time">{timeAgo(i.createdAt)}</span>
                    </span>
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
