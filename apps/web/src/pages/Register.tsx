import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api';

export default function Register() {
  const [tenantName, setTenantName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const r = await api('/api/auth/register-tenant', { method: 'POST', body: JSON.stringify({ tenantName, adminName, adminEmail, adminPassword }) });
      setToken(r.token);
      nav('/systems');
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }
  return (
    <div className="card" style={{ maxWidth: 400, margin: '2rem auto' }}>
      <h2>Register Tenant</h2>
      <form onSubmit={submit}>
        <label className="label">Organization / Tenant name</label>
        <input className="input" value={tenantName} onChange={e => setTenantName(e.target.value)} />
        <label className="label">Admin name</label>
        <input className="input" value={adminName} onChange={e => setAdminName(e.target.value)} />
        <label className="label">Admin email</label>
        <input className="input" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
        <label className="label">Admin password</label>
        <input className="input" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} />
        {err && <div className="error">{err}</div>}
        <div style={{ marginTop: '1rem' }}>
          <button className="btn" disabled={loading}>{loading ? '...' : 'Register'}</button>
        </div>
      </form>
      <p style={{ marginTop: '1rem', fontSize: '.9rem' }}><Link to="/login">Back to login</Link></p>
    </div>
  );
}
