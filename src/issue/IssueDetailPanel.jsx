import React, { useState, useEffect, useCallback } from 'react';
import { X, Trash2, Check, Plus, Zap, Bookmark, CheckSquare, Bug, CornerDownRight, ArrowUp, ExternalLink } from 'lucide-react';
import { upload } from '@vercel/blob/client';
import { useAuth } from '../auth/AuthContext.jsx';
import { PRIORITIES, PRIORITY_LIMITS, activePriorityUsage, todayStr } from '../shared/helpers.js';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import LabelPicker from './LabelPicker.jsx';
import CommentThread from './CommentThread.jsx';
import AttachmentList from './AttachmentList.jsx';

const TYPE_ICONS = { epic: Zap, story: Bookmark, task: CheckSquare, bug: Bug, subtask: CornerDownRight };
const CHILD_TYPES_BY_LEVEL = { 0: ['story', 'task', 'bug'], 1: ['subtask'] };

export default function IssueDetailPanel({
  issueId, projectId, statuses, members, issueTypes, projectLabels, issues,
  onClose, onChanged, onCreateIssue, onLabelCreated, onOpenIssue,
}) {
  const { request, user, token } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canComment = isAdmin || user?.role === 'member';
  const canDelete = isAdmin;
  const issueTypesById = Object.fromEntries(issueTypes.map((t) => [t.id, t]));

  const [issue, setIssue] = useState(null);
  const [children, setChildren] = useState([]);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [addingChild, setAddingChild] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [childType, setChildType] = useState('subtask');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [assignorId, setAssignorId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [storyPoints, setStoryPoints] = useState('');
  const [property, setProperty] = useState('');
  const [region, setRegion] = useState('');
  const [link, setLink] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');

  const markDirty = (setter) => (val) => { setter(val); setDirty(true); };

  const refreshChildren = useCallback(async (iss) => {
    const type = issueTypesById[iss.issueTypeId];
    if (type && type.hierarchyLevel < 2) {
      const data = await request(`/issues/${iss.id}/children`);
      setChildren(data.issues);
    } else {
      setChildren([]);
    }
  }, [request, issueTypesById]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDirty(false);
    (async () => {
      try {
        const [issueData, commentsData, attachmentsData] = await Promise.all([
          request(`/issues/${issueId}`),
          request(`/issues/${issueId}/comments`),
          request(`/issues/${issueId}/attachments`),
        ]);
        if (!alive) return;
        const iss = issueData.issue;
        setIssue(iss);
        setTitle(iss.title);
        setDescription(iss.description || '');
        setStatusId(iss.statusId);
        setAssigneeId(iss.assigneeId || '');
        setAssignorId(iss.assignorId || '');
        setPriority(iss.priority);
        setDueDate(iss.dueDate || '');
        setStoryPoints(iss.storyPoints ?? '');
        setProperty(iss.property || '');
        setRegion(iss.region || '');
        setLink(iss.link || '');
        setAttachmentLink(iss.attachmentLink || '');
        setComments(commentsData.comments);
        setAttachments(attachmentsData.attachments);
        await refreshChildren(iss);
      } catch (err) {
        console.error('Failed to load issue:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  const save = async () => {
    setSaving(true);
    try {
      const { issue: updated } = await request(`/issues/${issueId}`, {
        method: 'PATCH',
        body: {
          title: title.trim(),
          description,
          assigneeId: assigneeId || null,
          priority,
          dueDate: dueDate || null,
          storyPoints: storyPoints === '' ? null : Number(storyPoints),
          statusId,
          property: property.trim() || null,
          region: region.trim() || null,
          link: link.trim() || null,
          attachmentLink: attachmentLink.trim() || null,
        },
      });
      setIssue((prev) => ({ ...prev, ...updated }));
      setDirty(false);
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const removeIssue = async () => {
    setConfirmingDelete(false);
    await request(`/issues/${issueId}`, { method: 'DELETE' });
    onChanged?.();
    onClose();
  };

  const addComment = async (body) => {
    const { comment } = await request(`/issues/${issueId}/comments`, { method: 'POST', body: { body } });
    setComments((prev) => [...prev, comment]);
  };
  const editComment = async (id, body) => {
    const { comment } = await request(`/comments/${id}`, { method: 'PATCH', body: { body } });
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, ...comment } : c)));
  };
  const deleteComment = async (id) => {
    await request(`/comments/${id}`, { method: 'DELETE' });
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  const attachLabel = async (labelId) => {
    await request(`/issues/${issueId}/labels`, { method: 'POST', body: { labelId } });
    const label = projectLabels.find((l) => l.id === labelId);
    setIssue((prev) => ({ ...prev, labels: [...(prev.labels || []), label] }));
    onChanged?.();
  };
  const detachLabel = async (labelId) => {
    await request(`/issues/${issueId}/labels/${labelId}`, { method: 'DELETE' });
    setIssue((prev) => ({ ...prev, labels: (prev.labels || []).filter((l) => l.id !== labelId) }));
    onChanged?.();
  };
  const createLabel = async (name, color) => {
    const { label } = await request(`/projects/${projectId}/labels`, { method: 'POST', body: { name, color } });
    onLabelCreated?.(label);
    await attachLabel(label.id);
  };

  const uploadFile = async (file) => {
    setUploadError('');
    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: 'private',
        handleUploadUrl: '/api/attachments/blob-token',
        clientPayload: JSON.stringify({ token, issueId }),
      });
      await request(`/issues/${issueId}/attachments/confirm`, {
        method: 'POST',
        body: { blobUrl: blob.url, fileName: file.name, fileSize: file.size, mimeType: file.type },
      });
      const { attachments: refreshed } = await request(`/issues/${issueId}/attachments`);
      setAttachments(refreshed);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };
  const downloadAttachment = async (attachment) => {
    const res = await fetch(`/api/attachments/${attachment.id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Download failed');
    }
    const blobData = await res.blob();
    const url = URL.createObjectURL(blobData);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const deleteAttachment = async (id) => {
    await request(`/attachments/${id}`, { method: 'DELETE' });
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const addChild = async () => {
    if (!childTitle.trim()) return;
    await onCreateIssue({ issueTypeId: childType, title: childTitle.trim(), parentId: issueId });
    await refreshChildren(issue);
    setChildTitle('');
    setAddingChild(false);
  };

  if (loading || !issue) {
    return (
      <div className="overlay" onMouseDown={onClose}>
        <div className="modal issue-panel" onMouseDown={(e) => e.stopPropagation()}>
          <div className="modal-body" style={{ alignItems: 'center', padding: '40px 0' }}>
            <div className="spinner" />
          </div>
        </div>
      </div>
    );
  }

  const canEditCard = isAdmin || issue.assignorId === user?.id;
  const priorityUsage = activePriorityUsage(issues, issue.assignorId, issue.id);
  const issueType = issueTypesById[issue.issueTypeId];
  const TypeIcon = TYPE_ICONS[issue.issueTypeId] || CheckSquare;
  const childTypeOptions = (CHILD_TYPES_BY_LEVEL[issueType?.hierarchyLevel] || []).map((id) => issueTypesById[id]).filter(Boolean);
  const parent = issue.parent || null;

  return (
    <>
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal issue-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="issue-type" style={{ color: issueType?.color }}>
              <TypeIcon size={14} /> {issue.key}
            </span>
            {parent && (
              <button className="parent-link" onClick={() => onOpenIssue(parent.key)}>
                <ArrowUp size={11} /> {parent.key}
              </button>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body issue-panel-body">
          <label className="field">
            <input
              className="in issue-title-in"
              value={title}
              onChange={(e) => markDirty(setTitle)(e.target.value)}
              disabled={!canEditCard}
            />
          </label>

          {!canEditCard && (
            <p className="hint">Only {members.find((m) => m.id === issue.assignorId)?.name || 'the assignor'} or an admin can edit this card. You can still comment below.</p>
          )}

          <label className="field">
            <span className="field-lbl">Description</span>
            <textarea
              className="in area"
              rows={4}
              value={description}
              onChange={(e) => markDirty(setDescription)(e.target.value)}
              disabled={!canEditCard}
              placeholder="Add a description…"
            />
          </label>

          <label className="field">
            <span className="field-lbl">Labels</span>
            <LabelPicker
              projectLabels={projectLabels}
              attachedLabels={issue.labels || []}
              onAttach={attachLabel}
              onDetach={detachLabel}
              onCreateLabel={createLabel}
              canEdit={canEditCard}
            />
          </label>

          <div className="row2">
            <label className="field">
              <span className="field-lbl">Status</span>
              <div className="selwrap">
                <select className="sel wide" value={statusId} onChange={(e) => markDirty(setStatusId)(e.target.value)} disabled={!canEditCard}>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="field">
              <span className="field-lbl">Priority</span>
              <div className="selwrap">
                <select className="sel wide" value={priority} onChange={(e) => markDirty(setPriority)(e.target.value)} disabled={!canEditCard}>
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.id !== priority && priorityUsage[p.id] >= PRIORITY_LIMITS[p.id]}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>
          <p className="hint">
            This assignor has {priorityUsage.urgent}/{PRIORITY_LIMITS.urgent} urgent and {priorityUsage.high}/{PRIORITY_LIMITS.high} high cards active elsewhere in this project.
          </p>

          <div className="row2">
            <label className="field">
              <span className="field-lbl">Assignee</span>
              <div className="selwrap">
                <select className="sel wide" value={assigneeId} onChange={(e) => markDirty(setAssigneeId)(e.target.value)} disabled={!canEditCard}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </label>
            <div className="field">
              <span className="field-lbl">Assignor</span>
              <span className="readonly-value" title="Set automatically from the account that added this card">
                {members.find((m) => m.id === assignorId)?.name || '—'}
              </span>
            </div>
          </div>

          <div className="row2">
            <label className="field">
              <span className="field-lbl">Due date</span>
              <input className="in" type="date" min={todayStr()} value={dueDate} onChange={(e) => markDirty(setDueDate)(e.target.value)} disabled={!canEditCard} />
            </label>
            <label className="field">
              <span className="field-lbl">Link</span>
              <div className="link-input-row">
                <input className="in" type="url" value={link} onChange={(e) => markDirty(setLink)(e.target.value)} disabled={!canEditCard} placeholder="https://…" />
                {link && (
                  <a className="link-open-btn" href={link} target="_blank" rel="noopener noreferrer" title="Open link" aria-label="Open link">
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </label>
          </div>

          <div className="row2">
            <label className="field">
              <span className="field-lbl">Property</span>
              <input className="in" value={property} onChange={(e) => markDirty(setProperty)(e.target.value)} disabled={!canEditCard} placeholder="e.g. Website, Landing Page" />
            </label>
            <label className="field">
              <span className="field-lbl">Region</span>
              <input className="in" value={region} onChange={(e) => markDirty(setRegion)(e.target.value)} disabled={!canEditCard} placeholder="e.g. Global, Norway" />
            </label>
          </div>

          {canEditCard && (
            <div className="save-row">
              <button className="btn primary" disabled={!dirty || saving} onClick={save}>
                <Check size={15} /> {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}

          {childTypeOptions.length > 0 && (
            <div className="field">
              <span className="field-lbl">{issueType?.hierarchyLevel === 0 ? 'Child cards' : 'Subtasks'}</span>
              <ul className="child-list">
                {children.map((c) => {
                  const ChildIcon = TYPE_ICONS[c.issueTypeId] || CheckSquare;
                  return (
                    <li key={c.id} className="child-row" onClick={() => onOpenIssue(c.key)}>
                      <ChildIcon size={13} />
                      <span className="child-key">{c.key}</span>
                      <span className="child-title">{c.title}</span>
                    </li>
                  );
                })}
              </ul>
              {canEditCard && !addingChild && (
                <button className="label-add-btn" onClick={() => { setAddingChild(true); setChildType(childTypeOptions[0].id); }}>
                  <Plus size={12} /> Add {issueType?.hierarchyLevel === 0 ? 'child card' : 'subtask'}
                </button>
              )}
              {addingChild && (
                <div className="child-create">
                  {childTypeOptions.length > 1 && (
                    <div className="selwrap">
                      <select className="sel" value={childType} onChange={(e) => setChildType(e.target.value)}>
                        {childTypeOptions.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <input
                    className="in"
                    autoFocus
                    placeholder="Title"
                    value={childTitle}
                    onChange={(e) => setChildTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addChild()}
                  />
                  <button className="btn primary" onClick={addChild}>Add</button>
                  <button className="btn ghost" onClick={() => setAddingChild(false)}>Cancel</button>
                </div>
              )}
            </div>
          )}

          <div className="field">
            <span className="field-lbl">Attachments</span>
            <div className="link-input-row" style={{ marginBottom: 8 }}>
              <input
                className="in"
                type="url"
                value={attachmentLink}
                onChange={(e) => markDirty(setAttachmentLink)(e.target.value)}
                disabled={!canEditCard}
                placeholder="Link to an externally-hosted attachment (from import)…"
              />
              {attachmentLink && (
                <a className="link-open-btn" href={attachmentLink} target="_blank" rel="noopener noreferrer" title="Open attachment link" aria-label="Open attachment link">
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
            <AttachmentList
              attachments={attachments}
              canEdit={canEditCard}
              canDelete={canDelete}
              uploading={uploading}
              uploadError={uploadError}
              onUpload={uploadFile}
              onDownload={downloadAttachment}
              onDelete={deleteAttachment}
            />
          </div>

          <div className="field">
            <span className="field-lbl">Comments</span>
            <CommentThread
              comments={comments}
              currentUser={user}
              canComment={canComment}
              mentionCandidates={members.filter((m) => !m.deactivatedAt)}
              onAdd={addComment}
              onEdit={editComment}
              onDelete={deleteComment}
            />
          </div>
        </div>

        {canComment && (
          <div className="modal-foot">
            {canDelete ? (
              <button className="btn danger" onClick={() => setConfirmingDelete(true)}>
                <Trash2 size={15} /> Delete
              </button>
            ) : <span />}
            <div className="foot-right">
              <button className="btn ghost" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>

    {confirmingDelete && (
      <ConfirmDialog
        title="Delete this card?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={removeIssue}
        onCancel={() => setConfirmingDelete(false)}
      />
    )}
    </>
  );
}
