import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Dashboard() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/api/dashboard').then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="error">{err}</div>;
  if (!d) return <div>Loading...</div>;
  const totalControls = Object.values(d.controlStatus || {}).reduce((a: any, b: any) => a + b, 0) as number;
  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <div className="card"><div style={{ fontSize: '2rem', fontWeight: 700 }}>{d.systems}</div><div style={{ color: '#94a3b8' }}>Systems</div></div>
        <div className="card"><div style={{ fontSize: '2rem', fontWeight: 700 }}>{totalControls}</div><div style={{ color: '#94a3b8' }}>Controls</div></div>
        <div className="card"><div style={{ fontSize: '2rem', fontWeight: 700 }}>{d.users}</div><div style={{ color: '#94a3b8' }}>Users</div></div>
        <div className="card"><div style={{ fontSize: '2rem', fontWeight: 700 }}>{d.poamOpen}</div><div style={{ color: '#94a3b8' }}>Open POA&M</div></div>
        <div className="card"><div style={{ fontSize: '2rem', fontWeight: 700, color: d.poamOverdue > 0 ? '#f87171' : undefined }}>{d.poamOverdue}</div><div style={{ color: '#94a3b8' }}>Overdue POA&M</div></div>
        <div className="card"><div style={{ fontSize: '2rem', fontWeight: 700, color: d.authExpiring > 0 ? '#fbbf24' : undefined }}>{d.authExpiring}</div><div style={{ color: '#94a3b8' }}>Auth expiring (30d)</div></div>
        <div className="card"><div style={{ fontSize: '2rem', fontWeight: 700 }}>{d.recentAudit}</div><div style={{ color: '#94a3b8' }}>Audit (7d)</div></div>
        <div className="card"><div style={{ fontSize: '2rem', fontWeight: 700 }}>{d.unreadNotifications}</div><div style={{ color: '#94a3b8' }}>Unread notifications</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card">
          <h3>Control status</h3>
          {Object.entries(d.controlStatus || {}).map(([k, v]) => (
            <div key={k} className="row" style={{ justifyContent: 'space-between', padding: '.25rem 0' }}>
              <span>{k}</span><span className="badge">{String(v)}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Systems by impact</h3>
          {Object.entries(d.systemsByImpact || {}).map(([k, v]) => (
            <div key={k} className="row" style={{ justifyContent: 'space-between', padding: '.25rem 0' }}>
              <span>{k}</span><span className="badge">{String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
