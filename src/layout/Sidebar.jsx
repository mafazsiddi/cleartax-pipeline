import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Plus, Users, Settings, X, UserCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Sidebar({ projects, loading, onCreateProject, open, onClose, width, onResizeStart, resizing }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [creating, setCreating] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setErr('');
    setSaving(true);
    try {
      await onCreateProject(key.trim().toUpperCase(), name.trim());
      setCreating(false);
      setKey('');
      setName('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <nav className={`sidebar ${open ? 'open' : ''}`} style={{ width, flexBasis: width }}>
      <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
        <X size={17} />
      </button>
      <ul className="sidebar-list">
        <li>
          <NavLink to="/my-issues" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <UserCheck size={14} /> My Tasks
          </NavLink>
        </li>
      </ul>

      <div className="sidebar-section-lbl">Projects</div>
      <ul className="sidebar-list">
        {projects.map((p) => (
          <li key={p.id} className="sidebar-item">
            <NavLink to={`/projects/${p.key}/board`} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="sidebar-project-key">{p.key}</span>
              <span className="sidebar-project-name">{p.name}</span>
            </NavLink>
            {isAdmin && (
              <NavLink to={`/projects/${p.key}/settings`} className="sidebar-settings-link" title="Project settings" aria-label={`${p.name} settings`}>
                <Settings size={13} />
              </NavLink>
            )}
          </li>
        ))}
        {!loading && projects.length === 0 && <li className="hint" style={{ padding: '4px 10px' }}>No projects yet.</li>}
      </ul>

      {isAdmin && (
        creating ? (
          <div className="sidebar-create">
            <input className="in" placeholder="KEY (e.g. ENG)" maxLength={10} value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} />
            <input className="in" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
            {err && <p className="err">{err}</p>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn primary" disabled={saving} onClick={submit}>Create</button>
              <button className="btn ghost" onClick={() => { setCreating(false); setErr(''); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="sidebar-add" onClick={() => setCreating(true)}>
            <Plus size={13} /> New project
          </button>
        )
      )}

      {isAdmin && (
        <>
          <div className="sidebar-section-lbl" style={{ marginTop: 18 }}>Admin</div>
          <ul className="sidebar-list">
            <li>
              <NavLink to="/admin/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Users size={14} /> Users
              </NavLink>
            </li>
          </ul>
        </>
      )}
      <div
        className={`sidebar-resize-handle ${resizing ? 'dragging' : ''}`}
        onMouseDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />
    </nav>
  );
}
