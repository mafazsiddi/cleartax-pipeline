import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { X, Trash2, Check, Copy, Zap, Bookmark, CheckSquare, Bug, CornerDownRight, ExternalLink } from 'lucide-react';
import { upload } from '@vercel/blob/client';
import { useAuth } from '../auth/AuthContext.jsx';
import { PRIORITIES, PRIORITY_LIMITS, activePriorityUsage, todayStr, timeAgo } from '../shared/helpers.js';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import LabelPicker from './LabelPicker.jsx';
import CommentThread from './CommentThread.jsx';
import AttachmentList from './AttachmentList.jsx';
import LinkList from './LinkList.jsx';

const TYPE_ICONS = { epic: Zap, story: Bookmark, task: CheckSquare, bug: Bug, subtask: CornerDownRight };

export default function IssueDetailPanel({
  issueId, projectId, statuses, members, issueTypes, projectLabels, issues,
  onClose, onChanged, onLabelCreated,
}) {
  const { request, user, token } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canComment = isAdmin || user?.role === 'member';
  const canDelete = isAdmin;
  const issueTypesById = Object.fromEntries(issueTypes.map((t) => [t.id, t]));

  const [issue, setIssue] = useState(null);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [descCopied, setDescCopied] = useState(false);

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

  const markDirty = (setter) => (val) => { setter(val); setDirty(true); };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDirty(false);
    (async () => {
      try {
        const [issueData, commentsData, attachmentsData, linksData] = await Promise.all([
          request(`/issues/${issueId}`),
          request(`/issues/${issueId}/comments`),
          request(`/issues/${issueId}/attachments`),
          request(`/issues/${issueId}/links`),
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
        setComments(commentsData.comments);
        setAttachments(attachmentsData.attachments);
        setLinks(linksData.links);
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
          property: property.trim() || null,
          region: region.trim() || null,
        },
      });
      setIssue((prev) => ({ ...prev, ...updated }));
      setDirty(false);
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  // Status and the link save immediately on change/blur — any member (not
  // just the assignor/admin) can touch these, unlike the rest of the form,
  // which is gated behind canEditCard + the Save button above.
  const changeStatus = async (newStatusId) => {
    const prevStatusId = statusId;
    setStatusId(newStatusId);
    try {
      const { issue: updated } = await request(`/issues/${issueId}`, { method: 'PATCH', body: { statusId: newStatusId } });
      setIssue((prev) => ({ ...prev, ...updated }));
      onChanged?.();
    } catch (err) {
      setStatusId(prevStatusId);
      toast.error(err.message || 'Could not change status.');
    }
  };

  const saveLink = async () => {
    const value = link.trim() || null;
    if (value === (issue.link || null)) return;
    try {
      const { issue: updated } = await request(`/issues/${issueId}`, { method: 'PATCH', body: { link: value } });
      setIssue((prev) => ({ ...prev, ...updated }));
      onChanged?.();
    } catch (err) {
      setLink(issue.link || '');
      toast.error(err.message || 'Could not save the link.');
    }
  };

  const copyDescription = async () => {
    if (!description) return;
    try {
      await navigator.clipboard.writeText(description);
      setDescCopied(true);
      setTimeout(() => setDescCopied(false), 1500);
    } catch {
      toast.error('Could not copy description.');
    }
  };

  const addIssueLink = async (url) => {
    try {
      const { link: created } = await request(`/issues/${issueId}/links`, { method: 'POST', body: { url } });
      setLinks((prev) => [...prev, created]);
    } catch (err) {
      toast.error(err.message || 'Could not add that link.');
    }
  };
  const deleteIssueLink = async (id) => {
    try {
      await request(`/issue-links/${id}`, { method: 'DELETE' });
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      toast.error(err.message || 'Could not remove that link.');
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

  return (
    <>
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal issue-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="issue-type" style={{ color: issueType?.color }}>
              <TypeIcon size={14} /> {issue.key}
            </span>
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

          {!canEditCard && canComment && (
            <p className="hint">Only {members.find((m) => m.id === issue.assignorId)?.name || 'the assignor'} or an admin can edit this card's details. You can still change its status, add attachments, and comment.</p>
          )}

          <label className="field">
            <span className="field-lbl-row">
              <span className="field-lbl">Description</span>
              <button
                type="button"
                className="icon-btn small"
                onClick={copyDescription}
                disabled={!description}
                title="Copy description"
                aria-label="Copy description"
              >
                {descCopied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </span>
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
                <select className="sel wide" value={statusId} onChange={(e) => changeStatus(e.target.value)} disabled={!canComment}>
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
                <input className="in" type="url" value={link} onChange={(e) => setLink(e.target.value)} onBlur={saveLink} disabled={!canComment} placeholder="https://…" />
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

          <div className="field">
            <span className="field-lbl">Links</span>
            <LinkList
              links={links}
              canEdit={canComment}
              canDelete={canDelete}
              onAdd={addIssueLink}
              onDelete={deleteIssueLink}
            />
          </div>

          <div className="field">
            <span className="field-lbl">Attachments</span>
            <AttachmentList
              attachments={attachments}
              canEdit={canComment}
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

          {issue.createdAt && (
            <p className="created-meta" title={new Date(issue.createdAt).toLocaleString()}>
              Created {timeAgo(issue.createdAt)}
            </p>
          )}
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
