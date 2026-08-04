import React, { useState } from 'react';
import { Send, Pencil, Trash2, X, Check } from 'lucide-react';
import { avatarColor, initials } from '../shared/helpers.js';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CommentThread({ comments, currentUser, canComment, onAdd, onEdit, onDelete }) {
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      await onAdd(body.trim());
      setBody('');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="comment-thread">
      {comments.length === 0 && <p className="hint">No comments yet.</p>}
      {comments.map((c) => {
        const canModify = currentUser && (c.author?.id === currentUser.id || currentUser.role === 'admin');
        const isEditing = editingId === c.id;
        return (
          <div key={c.id} className="comment-row">
            <span className="avatar sm" style={{ background: avatarColor(c.author?.name) }}>
              {initials(c.author?.name)}
            </span>
            <div className="comment-body">
              <div className="comment-meta">
                <span className="comment-author">{c.author?.name}</span>
                <span className="comment-time">{timeAgo(c.createdAt)}{c.editedAt ? ' (edited)' : ''}</span>
                {canModify && !isEditing && (
                  <span className="comment-actions">
                    <button className="icon-btn small" onClick={() => { setEditingId(c.id); setEditBody(c.body); }} aria-label="Edit comment">
                      <Pencil size={12} />
                    </button>
                    <button className="icon-btn small" onClick={() => onDelete(c.id)} aria-label="Delete comment">
                      <Trash2 size={12} />
                    </button>
                  </span>
                )}
              </div>
              {isEditing ? (
                <div className="comment-edit">
                  <textarea className="in area" rows={2} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button
                      className="btn primary"
                      onClick={async () => { await onEdit(c.id, editBody.trim()); setEditingId(null); }}
                    >
                      <Check size={13} /> Save
                    </button>
                    <button className="btn ghost" onClick={() => setEditingId(null)}>
                      <X size={13} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="comment-text">{c.body}</p>
              )}
            </div>
          </div>
        );
      })}

      {canComment && (
        <div className="comment-composer">
          <textarea
            className="in area"
            rows={2}
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
          <button className="btn primary" disabled={!body.trim() || posting} onClick={submit}>
            <Send size={14} /> Comment
          </button>
        </div>
      )}
    </div>
  );
}
