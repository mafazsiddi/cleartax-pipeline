import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { LayoutGrid, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { avatarColor, initials } from '../shared/helpers.js';
import Sidebar from './Sidebar.jsx';

export default function Layout() {
  const { request, user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const refreshProjects = useCallback(async () => {
    const data = await request('/projects');
    setProjects(data.projects);
    return data.projects;
  }, [request]);

  useEffect(() => {
    (async () => {
      setLoadingProjects(true);
      try {
        await refreshProjects();
      } catch (e) {
        console.error('Failed to load projects:', e);
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, [refreshProjects]);

  const createProject = async (key, name) => {
    const { project } = await request('/projects', { method: 'POST', body: { key, name } });
    setProjects((prev) => [...prev, project].sort((a, b) => a.name.localeCompare(b.name)));
    return project;
  };

  return (
    <div className="app shell">
      <Sidebar projects={projects} loading={loadingProjects} onCreateProject={createProject} />
      <div className="main-col">
        <header className="topbar">
          <div className="brand">
            <span className="mark" aria-hidden="true"><LayoutGrid size={16} strokeWidth={2.4} /></span>
            <div className="brand-txt">
              <h1>Mira</h1>
            </div>
          </div>
          <div className="tools">
            <span className="avatar sm" style={{ background: avatarColor(user?.name) }} title={user?.email}>
              {initials(user?.name)}
            </span>
            <button className="btn ghost" onClick={logout} style={{ color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.2)' }} title={`Logged in as ${user?.email}`}>
              <LogOut size={15} />
              <span className="btn-lbl">Log Out</span>
            </button>
          </div>
        </header>
        <div className="page-outlet">
          <Outlet context={{ projects, loadingProjects, refreshProjects }} />
        </div>
      </div>
    </div>
  );
}
