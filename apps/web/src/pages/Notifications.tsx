import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Notifications() {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState('');
  async function load() {
    try { const r = await api('/api/notifications'); setItems(r.items || []); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  async function markRead(id: string) {
    await api(`/api/notifications/${id}/read`, { method: 'POST' }); load();
  }
  async function markAll() {
    await api('/api/notifications/read-all', { method: 'POST' }); load();
  }
  return (
    <div>
      <h1>Notifications</h1>
      {err && <div className="error">{err}</div>}
      <div className="row" style={{ marginBottom: '1rem' }}>
        <button className="btn secondary" onClick={markAll}>Mark all read</button>
      </div>
      <div className="card">
        {items.length === 0 ? <div className="empty">No notifications.</div> : items.map(n => (
          <div key={n.id} style={{ borderBottom: '1px solid #334155', padding: '.5rem 0', opacity: n.read ? .6 : 1 }}>
            <strong>{n.title}</strong> <span className="badge">{n.kind}</span>
            <p style={{ margin: '.25rem 0', color: '#94a3b8', fontSize: '.9rem' }}>{n.message}</p>
            <small style={{ color: '#64748b' }}>{new Date(n.created_at).toLocaleString()}</small>
            {!n.read && <button className="btn secondary" style={{ marginLeft: '.5rem', padding: '.15rem .4rem', fontSize: '.75rem' }} onClick={() => markRead(n.id)}>mark read</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
