import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

const CATEGORIES = ['todo', 'in_progress', 'done'];
const SWATCHES = ['#8b5cf6', '#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#64748b', '#ec4899', '#06b6d4'];

export default function ProjectSettingsPage() {
  const { projectKey } = useParams();
  const { request } = useAuth();
  const navigate = useNavigate();
  const { refreshProjects } = useOutletContext();
  const [project, setProject] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusCategory, setNewStatusCategory] = useState('todo');
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(SWATCHES[0]);

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { project: proj } = await request(`/projects/by-key/${projectKey}`);
        setProject(proj);
        const [statusData, labelData] = await Promise.all([
          request(`/projects/${proj.id}/statuses`),
          request(`/projects/${proj.id}/labels`),
        ]);
        setStatuses(statusData.statuses);
        setLabels(labelData.labels);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  const addStatus = async () => {
    if (!newStatusName.trim()) return;
    try {
      const { status } = await request(`/projects/${project.id}/statuses`, {
        method: 'POST',
        body: { name: newStatusName.trim(), category: newStatusCategory, order: statuses.length },
      });
      setStatuses((prev) => [...prev, status]);
      setNewStatusName('');
    } catch (e) {
      setErr(e.message);
    }
  };

  const deleteStatus = async (id) => {
    try {
      await request(`/statuses/${id}`, { method: 'DELETE' });
      setStatuses((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setErr(e.message);
    }
  };

  const addLabel = async () => {
    if (!newLabelName.trim()) return;
    try {
      const { label } = await request(`/projects/${project.id}/labels`, {
        method: 'POST',
        body: { name: newLabelName.trim(), color: newLabelColor },
      });
      setLabels((prev) => [...prev, label]);
      setNewLabelName('');
    } catch (e) {
      setErr(e.message);
    }
  };

  const deleteLabel = async (id) => {
    try {
      await request(`/labels/${id}`, { method: 'DELETE' });
      setLabels((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      setErr(e.message);
    }
  };

  const deleteProject = async () => {
    if (deleteConfirm.trim().toUpperCase() !== project.key) return;
    setDeleting(true);
    setErr('');
    try {
      await request(`/projects/${project.id}`, { method: 'DELETE' });
      await refreshProjects();
      navigate('/');
    } catch (e) {
      setErr(e.message);
      setDeleting(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /> Loading settings…</div>;
  if (!project) return <div className="loading">{err || 'Project not found.'}</div>;

  return (
    <div className="settings-page">
      <h2 className="settings-h">{project.name} settings</h2>
      {err && <p className="err">{err}</p>}

      <section className="settings-section">
        <h3 className="settings-h3">Workflow statuses</h3>
        <p className="hint">These are the board's columns, in order.</p>
        <ul className="settings-list">
          {statuses.map((s) => (
            <li key={s.id} className="settings-row">
              <span className={`status-cat-badge status-cat-${s.category}`}>{s.category.replace('_', ' ')}</span>
              <span className="settings-row-name">{s.name}</span>
              <button className="icon-btn small" onClick={() => deleteStatus(s.id)} title="Delete status" aria-label={`Delete ${s.name}`}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="settings-add-row">
          <input className="in" placeholder="Status name" value={newStatusName} onChange={(e) => setNewStatusName(e.target.value)} />
          <div className="selwrap">
            <select className="sel" value={newStatusCategory} onChange={(e) => setNewStatusCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </div>
          <button className="btn primary" onClick={addStatus}><Plus size={14} /> Add</button>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-h3">Labels</h3>
        <ul className="settings-list">
          {labels.map((l) => (
            <li key={l.id} className="settings-row">
              <span className="label-chip" style={{ background: `${l.color}22`, color: l.color }}>{l.name}</span>
              <span style={{ marginLeft: 'auto' }} />
              <button className="icon-btn small" onClick={() => deleteLabel(l.id)} title="Delete label" aria-label={`Delete ${l.name}`}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {labels.length === 0 && <li className="empty-row">No labels yet.</li>}
        </ul>
        <div className="settings-add-row">
          <input className="in" placeholder="Label name" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} />
          <div className="label-swatches">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`label-swatch-btn ${newLabelColor === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setNewLabelColor(c)}
                aria-label={`Choose color ${c}`}
              />
            ))}
          </div>
          <button className="btn primary" onClick={addLabel}><Plus size={14} /> Add</button>
        </div>
      </section>

      <section className="settings-section danger-zone">
        <h3 className="settings-h3" style={{ color: '#EF4444' }}>Danger zone</h3>
        <p className="hint">
          Permanently deletes <strong>{project.key}</strong> and everything in it — every issue, comment, label,
          and attachment. This cannot be undone.
        </p>
        <div className="settings-add-row">
          <input
            className="in"
            placeholder={`Type ${project.key} to confirm`}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
          />
          <button
            className="btn danger"
            disabled={deleting || deleteConfirm.trim().toUpperCase() !== project.key}
            onClick={deleteProject}
          >
            <Trash2 size={14} /> Delete project
          </button>
        </div>
      </section>
    </div>
  );
}
