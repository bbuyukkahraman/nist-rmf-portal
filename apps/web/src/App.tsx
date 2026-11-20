import React from 'react';
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Systems from './pages/Systems';
import SystemDetail from './pages/SystemDetail';
import Audit from './pages/Audit';
import Security from './pages/Security';
import Notifications from './pages/Notifications';
import Dashboard from './pages/Dashboard';
import { getToken, clearToken } from './api';
import { t, setLang, getLang } from './i18n';

function Nav() {
  const nav = useNavigate();
  const authed = !!getToken();
  const [lang, setL] = React.useState(getLang());
  function toggle() { const n = lang === 'en' ? 'tr' : 'en'; setLang(n); setL(n); }
  return (
    <div className="nav">
      <Link to="/"><strong>NIST RMF Portal</strong></Link>
      {authed && <Link to="/dashboard">{t('nav.dashboard')}</Link>}
      {authed && <Link to="/systems">{t('nav.systems')}</Link>}
      {authed && <Link to="/audit">{t('nav.audit')}</Link>}
      {authed && <Link to="/notifications">{t('nav.notifications')}</Link>}
      {authed && <Link to="/security">{t('nav.security')}</Link>}
      <div className="spacer" />
      <button className="btn secondary" onClick={toggle} style={{ marginRight: '.5rem' }}>{lang === 'en' ? 'TR' : 'EN'}</button>
      {authed && <button className="btn secondary" onClick={() => { clearToken(); nav('/login'); }}>{t('nav.logout')}</button>}
    </div>
  );
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Nav />
      <div className="container" id="main">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/systems" element={getToken() ? <Systems /> : <Navigate to="/login" />} />
          <Route path="/systems/:id" element={getToken() ? <SystemDetail /> : <Navigate to="/login" />} />
          <Route path="/audit" element={getToken() ? <Audit /> : <Navigate to="/login" />} />
          <Route path="/security" element={getToken() ? <Security /> : <Navigate to="/login" />} />
          <Route path="/notifications" element={getToken() ? <Notifications /> : <Navigate to="/login" />} />
          <Route path="/dashboard" element={getToken() ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/" element={getToken() ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </>
  );
}
