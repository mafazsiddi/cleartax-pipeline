import React from 'react';
import { Calendar, Link as LinkIcon, Zap, Bookmark, CheckSquare, Bug, CornerDownRight } from 'lucide-react';
import { PMAP, avatarColor, initials, dueMeta, timeAgo } from '../shared/helpers.js';

const TYPE_ICONS = { epic: Zap, story: Bookmark, task: CheckSquare, bug: Bug, subtask: CornerDownRight };

export default function IssueCard({ issue, issueType, dragging, canDrag, onOpen, onDragStart, onDragEnd }) {
  const p = PMAP[issue.priority] || PMAP.medium;
  const isDone = issue.statusCategory === 'done';
  const due = dueMeta(issue.dueDate, isDone);
  const TypeIcon = TYPE_ICONS[issue.issueTypeId] || CheckSquare;

  return (
    <article
      className={`card ${dragging ? 'is-dragging' : ''}`}
      style={{ '--spine': p.color }}
      draggable={canDrag}
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
        <div className="card-foot-right">
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
          {issue.createdAt && (
            <span className="card-created" title={`Created ${new Date(issue.createdAt).toLocaleString()}`}>
              {timeAgo(issue.createdAt)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
