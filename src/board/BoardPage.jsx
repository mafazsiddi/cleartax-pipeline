import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Plus, Search, X, AlertTriangle, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { sortIssues, todayStr } from '../shared/helpers.js';
import IssueCard from './IssueCard.jsx';
import IssueDetailPanel from '../issue/IssueDetailPanel.jsx';
import CreateIssueModal from '../issue/CreateIssueModal.jsx';
import BulkImportModal from '../issue/BulkImportModal.jsx';
import NotFoundPage from '../layout/NotFoundPage.jsx';

export default function BoardPage() {
  const { projectKey, issueKey } = useParams();
  const navigate = useNavigate();
  const { request, user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'member';

  const [project, setProject] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [issues, setIssues] = useState([]);
  const [members, setMembers] = useState([]);
  const [issueTypes, setIssueTypes] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [query, setQuery] = useState('');
  const [fAssignee, setFAssignee] = useState('all');
  const [fPriority, setFPriority] = useState('all');

  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [createFor, setCreateFor] = useState(null); // statusId or null
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const openIssueId = issues.find((i) => i.key === issueKey)?.id || null;

  const loadIssues = useCallback(async (projectId) => {
    const params = new URLSearchParams();
    if (fAssignee !== 'all' && fAssignee !== '__none') params.set('assigneeId', fAssignee);
    if (fPriority !== 'all') params.set('priority', fPriority);
    const data = await request(`/projects/${projectId}/issues?${params.toString()}`);
    setIssues(data.issues);
  }, [request, fAssignee, fPriority]);

  // Initial project + reference data load.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const { project: proj } = await request(`/projects/by-key/${projectKey}`);
        if (!alive) return;
        setProject(proj);
        const [statusData, memberData, typeData, labelData] = await Promise.all([
          request(`/projects/${proj.id}/statuses`),
          request('/users'),
          request('/issue-types'),
          request(`/projects/${proj.id}/labels`),
        ]);
        if (!alive) return;
        setStatuses(statusData.statuses);
        setMembers(memberData.users.filter((u) => !u.deactivatedAt));
        setIssueTypes(typeData.issueTypes);
        setLabels(labelData.labels);
        await loadIssues(proj.id);
      } catch (err) {
        if (err.status === 404) setNotFound(true);
        else console.error('Failed to load project:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  // Refetch when filters change (after the initial load has a project).
  useEffect(() => {
    if (!project) return;
    loadIssues(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fAssignee, fPriority]);

  const modalOpen = !!openIssueId || !!createFor || bulkImportOpen;
  usePolling(() => project && loadIssues(project.id), {
    enabled: !!project,
    paused: () => modalOpen || !!dragId,
  });

  const filtersActive = query.trim() || fAssignee !== 'all' || fPriority !== 'all';
  const visible = useMemo(() => {
    return issues.filter((i) => {
      if (i.parentId) return false; // subtasks live inside their parent's panel, not on the board
      if (fAssignee === '__none' && i.assigneeId) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (!i.title.toLowerCase().includes(q) && !i.key.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [issues, fAssignee, query]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(statuses.map((s) => [s.id, []]));
    visible.forEach((i) => { (map[i.statusId] || (map[i.statusId] = [])).push(i); });
    Object.values(map).forEach((arr) => arr.sort(sortIssues));
    return map;
  }, [visible, statuses]);

  const overdueCount = useMemo(
    () => issues.filter((i) => !i.parentId && i.statusCategory !== 'done' && i.dueDate && i.dueDate < todayStr()).length,
    [issues]
  );

  const moveIssue = async (id, statusId) => {
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, statusId } : i)));
    try {
      await request(`/issues/${id}`, { method: 'PATCH', body: { statusId } });
      if (project) loadIssues(project.id);
    } catch (err) {
      console.error('Failed to move issue:', err);
      toast.error(err.message || 'Could not move that card.');
      if (project) loadIssues(project.id);
    }
  };

  const createIssue = async (payload) => {
    await request(`/projects/${project.id}/issues`, { method: 'POST', body: payload });
    await loadIssues(project.id);
  };

  const bulkImportIssues = async (rows) => {
    const result = await request(`/projects/${project.id}/issues/bulk`, { method: 'POST', body: { rows } });
    await loadIssues(project.id);
    if (result.labels?.length) setLabels((prev) => [...prev, ...result.labels]);
    return result;
  };

  const onCardDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch {}
  };
  const onColDragOver = (e, statusId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== statusId) setDragOver(statusId);
  };
  const onColDrop = (e, statusId) => {
    e.preventDefault();
    const id = dragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
    if (id) moveIssue(id, statusId);
    setDragOver(null);
    setDragId(null);
  };
  const endDrag = () => { setDragOver(null); setDragId(null); };

  const openIssue = (key) => navigate(`/projects/${projectKey}/board/${key}`);
  const closeIssue = () => navigate(`/projects/${projectKey}/board`);

  if (notFound) {
    return <NotFoundPage title="Project not found" message={`We couldn't find a project with the key "${projectKey}".`} />;
  }

  const issueTypesById = Object.fromEntries(issueTypes.map((t) => [t.id, t]));

  return (
    <div className="board-page">
      <header className="topbar">
        <div className="tools" style={{ marginLeft: 0 }}>
          <div className="searchbox">
            <Search size={15} className="search-ic" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards" aria-label="Search cards" />
            {query && <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}
          </div>

          <div className="selwrap">
            <select className="sel" value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} aria-label="Filter by assignee">
              <option value="all">Everyone</option>
              <option value="__none">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="selwrap">
            <select className="sel" value={fPriority} onChange={(e) => setFPriority(e.target.value)} aria-label="Filter by priority">
              <option value="all">Any priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {overdueCount > 0 && (
            <span className="overdue-pill" title="Cards past their due date">
              <AlertTriangle size={12} strokeWidth={2.4} /> {overdueCount} overdue
            </span>
          )}

          {canEdit && (
            <button className="btn ghost" onClick={() => setBulkImportOpen(true)}>
              <Upload size={15} strokeWidth={2.4} /> Bulk import
            </button>
          )}

          {canEdit && (
            <button className="btn primary" onClick={() => setCreateFor(statuses.find((s) => s.isDefault)?.id || statuses[0]?.id)}>
              <Plus size={16} strokeWidth={2.4} /> New card
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="loading"><div className="spinner" /> Loading the board…</div>
      ) : (
        <div className="board">
          {statuses.map((s) => {
            const cards = byStatus[s.id] || [];
            return (
              <section
                key={s.id}
                className={`col ${dragOver === s.id ? 'drop' : ''}`}
                onDragOver={(e) => onColDragOver(e, s.id)}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
                onDrop={(e) => onColDrop(e, s.id)}
              >
                <div className="col-head">
                  <span className="dot" style={{ background: statusColor(s) }} />
                  <span className="col-name">{s.name}</span>
                  <span className="col-count">{cards.length}</span>
                </div>

                <div className="col-body">
                  {cards.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      issueType={issueTypesById[issue.issueTypeId]}
                      dragging={dragId === issue.id}
                      canDrag={canEdit}
                      onOpen={() => openIssue(issue.key)}
                      onDragStart={(e) => onCardDragStart(e, issue.id)}
                      onDragEnd={endDrag}
                    />
                  ))}
                  {cards.length === 0 && <div className="empty">{filtersActive ? 'No matches here' : 'Nothing yet'}</div>}
                </div>

                {canEdit && (
                  <button className="col-add" onClick={() => setCreateFor(s.id)}>
                    <Plus size={14} /> Add card
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {openIssueId && (
        <IssueDetailPanel
          key={openIssueId}
          issueId={openIssueId}
          projectId={project.id}
          statuses={statuses}
          members={members}
          issueTypes={issueTypes}
          projectLabels={labels}
          issues={issues}
          onClose={closeIssue}
          onChanged={() => project && loadIssues(project.id)}
          onLabelCreated={(label) => setLabels((prev) => [...prev, label])}
        />
      )}

      {createFor && (
        <CreateIssueModal
          statuses={statuses}
          members={members}
          issues={issues}
          defaultStatusId={createFor}
          onClose={() => setCreateFor(null)}
          onCreate={createIssue}
        />
      )}

      {bulkImportOpen && (
        <BulkImportModal
          statuses={statuses}
          members={members}
          onClose={() => setBulkImportOpen(false)}
          onImport={bulkImportIssues}
        />
      )}
    </div>
  );
}

function statusColor(status) {
  if (status.color) return status.color;
  if (status.category === 'done') return 'var(--s-done)';
  if (status.category === 'in_progress') return 'var(--s-dev)';
  return 'var(--s-backlog)';
}
