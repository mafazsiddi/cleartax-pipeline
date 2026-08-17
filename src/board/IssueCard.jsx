import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Calendar, Link as LinkIcon, Zap, Bookmark, CheckSquare, Bug, CornerDownRight, Pencil, Check, X as XIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { PMAP, avatarColor, initials, dueMeta } from '../shared/helpers.js';

const TYPE_ICONS = { epic: Zap, story: Bookmark, task: CheckSquare, bug: Bug, subtask: CornerDownRight };

export default function IssueCard({ issue, issueType, dragging, canDrag, onOpen, onDragStart, onDragEnd, onLinkChanged }) {
  const { user, request } = useAuth();
  const canEditLink = user?.role === 'admin' || user?.role === 'member';

  const [editingLink, setEditingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState(issue.link || '');
  const [savingLink, setSavingLink] = useState(false);

  const p = PMAP[issue.priority] || PMAP.medium;
  const isDone = issue.statusCategory === 'done';
  const due = dueMeta(issue.dueDate, isDone);
  const TypeIcon = TYPE_ICONS[issue.issueTypeId] || CheckSquare;

  const startEditLink = (e) => {
    e.stopPropagation();
    setLinkDraft(issue.link || '');
    setEditingLink(true);
  };
  const cancelEditLink = (e) => {
    e.stopPropagation();
    setEditingLink(false);
  };
  const saveLink = async (e) => {
    e.stopPropagation();
    const value = linkDraft.trim() || null;
    if (value === (issue.link || null)) {
      setEditingLink(false);
      return;
    }
    setSavingLink(true);
    try {
      await request(`/issues/${issue.id}`, { method: 'PATCH', body: { link: value } });
      onLinkChanged?.(issue.id, value);
      setEditingLink(false);
    } catch (err) {
      toast.error(err.message || 'Could not save that link.');
    } finally {
      setSavingLink(false);
    }
  };

  return (
    <article
      className={`card ${dragging ? 'is-dragging' : ''}`}
      style={{ '--spine': p.color }}
      draggable={canDrag && !editingLink}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
    >
      <div className="card-top">
        <span className="issue-type" style={{ color: issueType?.color || 'var(--muted)' }} title={issueType?.name}>
          <TypeIcon size={13} />
          {issue.key}
        </span>
        <span className="prio" style={{ color: p.color }}>
          <span className="prio-dot" style={{ background: p.color }} />
          {p.name}
        </span>
      </div>

      <h3 className="card-title">{issue.title}</h3>

      {(issue.property || issue.region) && (
        <div className="card-meta">
          {[issue.property, issue.region].filter(Boolean).join(' · ')}
        </div>
      )}

      {issue.labels?.length > 0 && (
        <div className="card-labels">
          {issue.labels.map((l) => (
            <span key={l.id} className="label-chip" style={{ background: `${l.color}22`, color: l.color }}>
              {l.name}
            </span>
          ))}
        </div>
      )}

      <div className="card-foot">
        <span className="card-foot-left">
          {editingLink ? (
            <span className="card-link-edit" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
              <input
                className="card-link-in"
                type="url"
                autoFocus
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveLink(e);
                  if (e.key === 'Escape') cancelEditLink(e);
                }}
                placeholder="https://…"
                disabled={savingLink}
              />
              <button className="card-link-ic-btn" onClick={saveLink} disabled={savingLink} aria-label="Save link" title="Save">
                <Check size={12} />
              </button>
              <button className="card-link-ic-btn" onClick={cancelEditLink} disabled={savingLink} aria-label="Cancel" title="Cancel">
                <XIcon size={12} />
              </button>
            </span>
          ) : (
            <>
              {issue.link && (
                <a
                  className="card-link"
                  href={issue.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={issue.link}
                  aria-label="Open linked document"
                >
                  <LinkIcon size={12} />
                </a>
              )}
              {canEditLink && (
                <button
                  className="card-link-edit-btn"
                  onClick={startEditLink}
                  onMouseDown={(e) => e.stopPropagation()}
                  title={issue.link ? 'Edit link' : 'Add link'}
                  aria-label={issue.link ? 'Edit link' : 'Add link'}
                >
                  <Pencil size={11} />
                </button>
              )}
            </>
          )}
          {due ? (
            <span className={`due due-${due.state}`}>
              <Calendar size={12} />
              {due.label}
            </span>
          ) : (
            <span className="due due-empty">
              <Calendar size={12} />
              No date
            </span>
          )}
        </span>
        <span className="card-people">
          {issue.assignorName && (
            <span className="avatar outline" title={`Assigned by ${issue.assignorName}`}>
              {initials(issue.assignorName)}
            </span>
          )}
          {issue.assigneeName ? (
            <span className="avatar" style={{ background: avatarColor(issue.assigneeName) }} title={`Assignee: ${issue.assigneeName}`}>
              {initials(issue.assigneeName)}
            </span>
          ) : (
            <span className="avatar unassigned" title="Unassigned">—</span>
          )}
        </span>
      </div>
    </article>
  );
}
