import React, { useState } from 'react';
import { api } from '../api';

export default function Security() {
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function enroll() {
    setErr(''); setMsg('');
    try {
      const r = await api('/api/mfa/enroll', { method: 'POST' });
      setSecret(r.secret); setUri(r.otpauthUri);
    } catch (e: any) { setErr(e.message); }
  }
  async function verify() {
    setErr(''); setMsg('');
    try {
      const r = await api('/api/mfa/verify-enroll', { method: 'POST', body: JSON.stringify({ code }) });
      setMsg('MFA enabled successfully.');
      setSecret(''); setUri(''); setCode('');
    } catch (e: any) { setErr(e.message); }
  }
  async function disable() {
    setErr(''); setMsg('');
    try {
      await api('/api/mfa/disable', { method: 'POST', body: JSON.stringify({}) });
      setMsg('MFA disabled.');
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <div>
      <h1>Security (MFA)</h1>
      {err && <div className="error">{err}</div>}
      {msg && <div style={{ color: '#4ade80' }}>{msg}</div>}
      <div className="card">
        <h3>Enroll TOTP Authenticator</h3>
        <p style={{ color: '#94a3b8', fontSize: '.9rem' }}>Use an authenticator app (Google Authenticator, Authy, 1Password). Enroll, then scan/add the secret and verify with a code.</p>
        <button className="btn" onClick={enroll}>Generate Secret</button>
        {secret && (
          <div style={{ marginTop: '1rem' }}>
            <label className="label">Secret (base32)</label>
            <input className="input" value={secret} readOnly />
            <label className="label">otpauth URI</label>
            <input className="input" value={uri} readOnly />
            <label className="label">Verification code</label>
            <input className="input" value={code} onChange={e => setCode(e.target.value)} />
            <div style={{ marginTop: '.5rem' }}>
              <button className="btn" onClick={verify}>Verify & Enable</button>
            </div>
          </div>
        )}
      </div>
      <div className="card">
        <h3>Disable MFA</h3>
        <button className="btn secondary" onClick={disable}>Disable MFA for my account</button>
      </div>
    </div>
  );
}
