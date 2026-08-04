import React from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';

export default function HomeRedirect() {
  const { projects, loadingProjects } = useOutletContext();

  if (loadingProjects) {
    return <div className="loading"><div className="spinner" /> Loading…</div>;
  }
  if (projects.length === 0) {
    return <div className="loading">No projects yet. An admin needs to create one from the sidebar.</div>;
  }
  return <Navigate to={`/projects/${projects[0].key}/board`} replace />;
}
