import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { sortIssues, todayStr } from '../shared/helpers.js';
import IssueCard from '../board/IssueCard.jsx';
import UserFilter from './UserFilter.jsx';

export default function MyIssuesPage() {
  const { request, user } = useAuth();
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [issueTypes, setIssueTypes] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState(() => (user?.id ? [user.id] : []));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await request('/users');
        setMembers(data.users.filter((u) => !u.deactivatedAt));
      } catch (err) {
        console.error('Failed to load users:', err);
      }
    })();
  }, [request]);

  const load = useCallback(async () => {
    if (selectedUserIds.length === 0) { setIssues([]); return; }
    const params = new URLSearchParams({ userIds: selectedUserIds.join(',') });
    const [assigned, types] = await Promise.all([
      request(`/me/assigned-issues?${params.toString()}`),
      request('/issue-types'),
    ]);
    setIssues(assigned.issues);
    setIssueTypes(types.issueTypes);
  }, [request, selectedUserIds]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (err) {
        console.error('Failed to load assigned issues:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  usePolling(load, { enabled: true });

  const issueTypesById = useMemo(() => Object.fromEntries(issueTypes.map((t) => [t.id, t])), [issueTypes]);

  const overdueCount = useMemo(
    () => issues.filter((i) => i.dueDate && i.dueDate < todayStr()).length,
    [issues]
  );

  const groups = useMemo(() => {
    const byProject = {};
    issues.forEach((i) => {
      (byProject[i.projectKey] ||= { projectKey: i.projectKey, projectName: i.projectName, issues: [] }).issues.push(i);
    });
    return Object.values(byProject)
      .sort((a, b) => a.projectKey.localeCompare(b.projectKey))
      .map((g) => ({ ...g, issues: g.issues.slice().sort(sortIssues) }));
  }, [issues]);

  const openIssue = (issue) => navigate(`/projects/${issue.projectKey}/board/${issue.key}`);

  return (
    <div className="board-page">
      <header className="topbar">
        <div className="tools" style={{ marginLeft: 0 }}>
          <h2 className="my-issues-title">My Issues</h2>
          <UserFilter
            members={members}
            selectedIds={selectedUserIds}
            onChange={setSelectedUserIds}
            currentUserId={user?.id}
          />
          {overdueCount > 0 && (
            <span className="overdue-pill" title="Cards past their due date">
              <AlertTriangle size={12} strokeWidth={2.4} /> {overdueCount} overdue
            </span>
          )}
        </div>
      </header>

      {loading ? (
        <div className="loading"><div className="spinner" /> Loading issues…</div>
      ) : issues.length === 0 ? (
        <div className="my-issues-empty">
          <CheckCircle2 size={34} strokeWidth={1.5} />
          <h3>All caught up</h3>
          <p>Nothing is assigned to the selected people right now.</p>
        </div>
      ) : (
        <div className="my-issues-body">
          {groups.map((g) => (
            <section key={g.projectKey} className="my-issues-group">
              <div className="my-issues-group-head">
                <span className="my-issues-project-key">{g.projectKey}</span>
                <span className="my-issues-project-name">{g.projectName}</span>
                <span className="col-count">{g.issues.length}</span>
              </div>
              <div className="my-issues-grid">
                {g.issues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    issueType={issueTypesById[issue.issueTypeId]}
                    canDrag={false}
                    onOpen={() => openIssue(issue)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
