import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api } from '../api';

export default function Security() {
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (uri) {
      QRCode.toDataURL(uri, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(''));
    } else {
      setQr('');
    }
  }, [uri]);

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
      await api('/api/mfa/verify-enroll', { method: 'POST', body: JSON.stringify({ code }) });
      setMsg('MFA etkinleştirildi. Google Authenticator artık bu hesabı gösterecek.');
      setSecret(''); setUri(''); setCode(''); setQr('');
    } catch (e: any) { setErr(e.message); }
  }
  async function disable() {
    setErr(''); setMsg('');
    try {
      await api('/api/mfa/disable', { method: 'POST', body: JSON.stringify({}) });
      setMsg('MFA devre dışı bırakıldı.');
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <div>
      <h1>Güvenlik (MFA)</h1>
      {err && <div className="error">{err}</div>}
      {msg && <div style={{ color: '#4ade80' }}>{msg}</div>}
      <div className="card">
        <h3>Google Authenticator ile bağla</h3>
        <p style={{ color: '#94a3b8', fontSize: '.9rem' }}>
          1) "Secret üret" butonuna tıklayın. 2) QR kodu Google Authenticator (veya Authy, 1Password) ile tarayın. 3) Uygulamada görünen 6 haneli kodu girip doğrulayın.
        </p>
        <button className="btn" onClick={enroll}>Secret üret</button>
        {secret && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {qr && <img src={qr} alt="MFA QR code" style={{ border: '4px solid #fff', borderRadius: 8 }} />}
            <div style={{ flex: 1, minWidth: 240 }}>
              <label className="label">Secret (manuel giriş için)</label>
              <input className="input" value={secret} readOnly onClick={e => (e.target as HTMLInputElement).select()} />
              <label className="label">otpauth URI</label>
              <input className="input" value={uri} readOnly style={{ fontSize: '.75rem' }} />
              <label className="label">Doğrulama kodu (6 hane)</label>
              <input className="input" value={code} onChange={e => setCode(e.target.value)} autoFocus maxLength={6} />
              <div style={{ marginTop: '.5rem' }}>
                <button className="btn" onClick={verify}>Doğrula ve etkinleştir</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="card">
        <h3>MFA'yı devre dışı bırak</h3>
        <button className="btn secondary" onClick={disable}>Hesabım için MFA'yı kapat</button>
      </div>
    </div>
  );
}
