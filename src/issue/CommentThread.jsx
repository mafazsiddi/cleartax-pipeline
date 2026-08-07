import React, { useState, useRef, useEffect, Fragment } from 'react';
import { Send, Pencil, Trash2, X, Check } from 'lucide-react';
import { avatarColor, initials } from '../shared/helpers.js';

// Mentions are stored inline as `@[Display Name](userId)`, inserted only by
// the picker below — never hand-typed — so both the server and the renderer
// can parse them exactly instead of guessing at freeform "@name" text.
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

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

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Strips mentions down to "@Name" for display in the plain <textarea> while
// composing/editing, so the raw @[Name](id) storage format never has to be
// hand-edited by the user.
function toDisplayText(raw) {
  return raw.replace(MENTION_RE, (_, name) => `@${name}`);
}

// Re-inflates "@Name" back into the @[Name](id) storage format using a
// registry of mentions the textarea knows about (picked this session, or
// parsed out of the comment's existing raw body). Longest names are matched
// first so "Yash More" doesn't get shadowed by a shorter "Yash".
function toStoredText(display, knownMentions) {
  let result = display;
  const sorted = [...knownMentions].sort((a, b) => b.name.length - a.name.length);
  for (const { id, name } of sorted) {
    const pattern = new RegExp(`(^|[^\\w@])@${escapeRegExp(name)}(?!\\w)`, 'g');
    result = result.replace(pattern, (_, pre) => `${pre}@[${name}](${id})`);
  }
  return result;
}

function renderBody(text) {
  const parts = [];
  let lastIndex = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push(
      <span key={`${m.index}-${m[2]}`} className="mention-chip">@{m[1]}</span>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}

// Returns the partial name being typed right after an "@" ending at the
// cursor, or null if the cursor isn't in mention position.
function mentionQueryAt(text, cursor) {
  const upToCursor = text.slice(0, cursor);
  const match = upToCursor.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
  return match ? match[1] : null;
}

// `value`/`onChange` speak the raw @[Name](id) storage format, same as
// before — but the textarea itself only ever shows "@Name". `value` is read
// once at mount to seed the display text and the known-mentions registry;
// after that the component owns its own text and reports raw conversions
// upward. Callers that need to reset the field (e.g. after posting) should
// remount via a changing `key` rather than pushing a new `value`.
function MentionTextarea({ value, onChange, candidates, placeholder, rows, onKeyDown }) {
  const [text, setText] = useState(() => toDisplayText(value));
  const [query, setQuery] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const taRef = useRef(null);
  const pendingSelection = useRef(null);
  const knownMentions = useRef(
    new Map([...value.matchAll(MENTION_RE)].map((m) => [m[1], { id: m[2], name: m[1] }]))
  );

  useEffect(() => {
    if (pendingSelection.current == null || !taRef.current) return;
    taRef.current.setSelectionRange(pendingSelection.current, pendingSelection.current);
    pendingSelection.current = null;
  }, [text]);

  const matches = query === null
    ? []
    : candidates.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    onChange(toStoredText(val, [...knownMentions.current.values()]));
    const q = mentionQueryAt(val, e.target.selectionStart);
    setQuery(q);
    setActiveIndex(0);
  };

  const insertMention = (candidate) => {
    knownMentions.current.set(candidate.name, { id: candidate.id, name: candidate.name });
    const cursor = taRef.current.selectionStart;
    const upToCursor = text.slice(0, cursor);
    const start = upToCursor.search(/@[a-zA-Z0-9._-]*$/);
    const token = `@${candidate.name} `;
    const newText = text.slice(0, start) + token + text.slice(cursor);
    pendingSelection.current = start + token.length;
    setText(newText);
    onChange(toStoredText(newText, [...knownMentions.current.values()]));
    setQuery(null);
  };

  const handleKeyDown = (e) => {
    if (query !== null && matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(matches[activeIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="mention-input-wrap">
      <textarea
        ref={taRef}
        className="in area"
        rows={rows}
        placeholder={placeholder}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {query !== null && matches.length > 0 && (
        <ul className="mention-menu">
          {matches.map((c, i) => (
            <li
              key={c.id}
              className={`mention-menu-item ${i === activeIndex ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); insertMention(c); }}
            >
              <span className="avatar sm" style={{ background: avatarColor(c.name) }}>{initials(c.name)}</span>
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CommentThread({ comments, currentUser, canComment, mentionCandidates = [], onAdd, onEdit, onDelete }) {
  const [body, setBody] = useState('');
  const [composerKey, setComposerKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      await onAdd(body.trim());
      setBody('');
      setComposerKey((k) => k + 1); // remounts the textarea so its display text actually clears
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
                  <MentionTextarea value={editBody} onChange={setEditBody} candidates={mentionCandidates} rows={2} />
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
                <p className="comment-text">{renderBody(c.body)}</p>
              )}
            </div>
          </div>
        );
      })}

      {canComment && (
        <div className="comment-composer">
          <MentionTextarea
            key={composerKey}
            value={body}
            onChange={setBody}
            candidates={mentionCandidates}
            rows={2}
            placeholder="Add a comment… (@ to mention someone)"
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
