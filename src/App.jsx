import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import LoginScreen from './auth/LoginScreen.jsx';
import Layout from './layout/Layout.jsx';
import HomeRedirect from './layout/HomeRedirect.jsx';
import NotFoundPage from './layout/NotFoundPage.jsx';
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

// Vercel rewrites /mira/* to the app root on cleartax.email (see vercel.json),
// but the browser's URL bar still shows the /mira prefix — so the router needs
// it too. Locally (npm run dev) the app is served at "/" with no such prefix.
const basename = window.location.pathname.startsWith('/mira') ? '/mira' : '';

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <style>{CSS}</style>
      <AuthProvider>
        <Gate />
      </AuthProvider>
      <ToastContainer position="top-right" autoClose={4000} closeOnClick pauseOnHover theme="light" />
    </BrowserRouter>
  );
}
