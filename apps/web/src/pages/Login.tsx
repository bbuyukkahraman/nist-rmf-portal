import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(r.token);
      nav('/systems');
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }
  return (
    <div className="card" style={{ maxWidth: 400, margin: '2rem auto' }}>
      <h2>Login</h2>
      <form onSubmit={submit}>
        <label className="label">Email</label>
        <input className="input" value={email} onChange={e => setEmail(e.target.value)} />
        <label className="label">Password</label>
        <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        {err && <div className="error">{err}</div>}
        <div style={{ marginTop: '1rem' }}>
          <button className="btn" disabled={loading}>{loading ? '...' : 'Login'}</button>
        </div>
      </form>
      <p style={{ marginTop: '1rem', fontSize: '.9rem' }}>No account? <Link to="/register">Register tenant</Link></p>
    </div>
  );
}
