import React, { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { PRIORITIES } from '../shared/helpers.js';

const TOP_LEVEL_TYPES = ['epic', 'story', 'task', 'bug'];

export default function CreateIssueModal({ issueTypes, statuses, members, defaultStatusId, onClose, onCreate }) {
  const creatable = issueTypes.filter((t) => TOP_LEVEL_TYPES.includes(t.id));
  const [issueTypeId, setIssueTypeId] = useState(creatable.find((t) => t.id === 'task')?.id || creatable[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState(defaultStatusId || statuses[0]?.id || '');
  const [assigneeId, setAssigneeId] = useState('');
  const [assignorId, setAssignorId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [property, setProperty] = useState('');
  const [region, setRegion] = useState('');
  const [link, setLink] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const save = async () => {
    if (!title.trim()) return setErr('Give the issue a title so the team knows what it is.');
    setSaving(true);
    try {
      await onCreate({
        issueTypeId, title: title.trim(), description: description.trim(),
        statusId, assigneeId: assigneeId || null, assignorId: assignorId || null, priority, dueDate: dueDate || null,
        property: property.trim() || null, region: region.trim() || null, link: link.trim() || null,
      });
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New issue</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="row2">
            <label className="field">
              <span className="field-lbl">Type</span>
              <div className="selwrap">
                <select className="sel wide" value={issueTypeId} onChange={(e) => setIssueTypeId(e.target.value)}>
                  {creatable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </label>
            <label className="field">
              <span className="field-lbl">Status</span>
              <div className="selwrap">
                <select className="sel wide" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                  {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </label>
          </div>

          <label className="field">
            <span className="field-lbl">Title</span>
            <input
              ref={titleRef}
              className="in"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (err) setErr(''); }}
              placeholder="e.g. Redesign pricing page hero"
            />
          </label>
          {err && <p className="err">{err}</p>}

          <label className="field">
            <span className="field-lbl">Description</span>
            <textarea className="in area" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Context, acceptance criteria, links…" />
          </label>

          <div className="row2">
            <label className="field">
              <span className="field-lbl">Assignee</span>
              <div className="selwrap">
                <select className="sel wide" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </label>
            <label className="field">
              <span className="field-lbl">Assignor</span>
              <div className="selwrap">
                <select className="sel wide" value={assignorId} onChange={(e) => setAssignorId(e.target.value)}>
                  <option value="">Unspecified</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </label>
          </div>

          <div className="row2">
            <label className="field">
              <span className="field-lbl">Priority</span>
              <div className="selwrap">
                <select className="sel wide" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </label>
            <label className="field">
              <span className="field-lbl">Due date</span>
              <input className="in" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>

          <div className="row2">
            <label className="field">
              <span className="field-lbl">Property</span>
              <input className="in" value={property} onChange={(e) => setProperty(e.target.value)} placeholder="e.g. Website, Landing Page" />
            </label>
            <label className="field">
              <span className="field-lbl">Region</span>
              <input className="in" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Global, Norway" />
            </label>
          </div>

          <label className="field">
            <span className="field-lbl">Link</span>
            <input className="in" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/…" />
          </label>
        </div>

        <div className="modal-foot">
          <span />
          <div className="foot-right">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={saving} onClick={save}>
              <Check size={16} strokeWidth={2.4} /> Add issue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
