import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LayoutGrid, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { avatarColor, initials } from '../shared/helpers.js';
import Sidebar from './Sidebar.jsx';
import NotificationsBell from './NotificationsBell.jsx';

export default function Layout() {
  const { request, user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar projects={projects} loading={loadingProjects} onCreateProject={createProject} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-col">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={19} />
          </button>
          <div className="brand">
            <span className="mark" aria-hidden="true"><LayoutGrid size={16} strokeWidth={2.4} /></span>
            <div className="brand-txt">
              <h1>Mira</h1>
            </div>
          </div>
          <div className="tools">
            <NotificationsBell />
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
