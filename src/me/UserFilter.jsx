import React, { useState, useRef, useEffect } from 'react';
import { Users, ChevronDown } from 'lucide-react';
import { avatarColor, initials } from '../shared/helpers.js';

export default function UserFilter({ members, selectedIds, onChange, currentUserId }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  const toggle = (id) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]);
  };

  const label = () => {
    if (selectedIds.length === 1 && selectedIds[0] === currentUserId) return 'Just me';
    if (selectedIds.length === members.length) return 'Everyone';
    if (selectedIds.length === 1) return members.find((m) => m.id === selectedIds[0])?.name || '1 person';
    return `${selectedIds.length} people`;
  };

  return (
    <div className="user-filter" ref={wrapRef}>
      <button className="btn ghost user-filter-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <Users size={14} />
        {label()}
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="label-dropdown user-filter-dropdown">
          <div className="user-filter-quick">
            <button className="label-option" onClick={() => onChange([currentUserId])}>Just me</button>
            <button className="label-option" onClick={() => onChange(members.map((m) => m.id))}>Everyone</button>
          </div>
          <div className="user-filter-list">
            {members.map((m) => (
              <label key={m.id} className="label-option user-filter-option">
                <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggle(m.id)} />
                <span className="avatar xs" style={{ background: avatarColor(m.name) }}>{initials(m.name)}</span>
                {m.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
