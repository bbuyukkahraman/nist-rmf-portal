import React from 'react';
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Systems from './pages/Systems';
import SystemDetail from './pages/SystemDetail';
import Audit from './pages/Audit';
import Security from './pages/Security';
import { getToken, clearToken } from './api';

function Nav() {
  const nav = useNavigate();
  const authed = !!getToken();
  return (
    <div className="nav">
      <Link to="/"><strong>NIST RMF Portal</strong></Link>
      {authed && <Link to="/systems">Systems</Link>}
      {authed && <Link to="/audit">Audit</Link>}
      {authed && <Link to="/security">Security</Link>}
      <div className="spacer" />
      {authed && <button className="btn secondary" onClick={() => { clearToken(); nav('/login'); }}>Logout</button>}
    </div>
  );
}

export default function App() {
  return (
    <>
      <Nav />
      <div className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/systems" element={getToken() ? <Systems /> : <Navigate to="/login" />} />
          <Route path="/systems/:id" element={getToken() ? <SystemDetail /> : <Navigate to="/login" />} />
          <Route path="/audit" element={getToken() ? <Audit /> : <Navigate to="/login" />} />
          <Route path="/security" element={getToken() ? <Security /> : <Navigate to="/login" />} />
          <Route path="/" element={getToken() ? <Navigate to="/systems" /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </>
  );
}
