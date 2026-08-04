import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import LoginScreen from './auth/LoginScreen.jsx';
import Layout from './layout/Layout.jsx';
import HomeRedirect from './layout/HomeRedirect.jsx';
import BoardPage from './board/BoardPage.jsx';
import ProjectSettingsPage from './projects/ProjectSettingsPage.jsx';
import UsersAdminPage from './admin/UsersAdminPage.jsx';
import { CSS } from './styles.js';

function Gate() {
  const { loading, session } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at 10% 20%, rgb(87, 108, 117) 0%, rgb(37, 50, 55) 100.2%)',
        color: 'white', fontFamily: "'Space Grotesk', sans-serif",
      }}>
        <div className="spinner" style={{ borderTopColor: '#4F46E5', width: '40px', height: '40px', borderWidth: '3px' }} />
        <div style={{ marginTop: '16px', fontSize: '14px', opacity: 0.8 }}>Authenticating session...</div>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/projects/:projectKey/board" element={<BoardPage />} />
        <Route path="/projects/:projectKey/board/:issueKey" element={<BoardPage />} />
        <Route path="/projects/:projectKey/settings" element={<ProjectSettingsPage />} />
        <Route path="/admin/users" element={<UsersAdminPage />} />
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <style>{CSS}</style>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
