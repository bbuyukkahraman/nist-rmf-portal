import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Systems() {
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  async function load() {
    try { const r = await api('/api/systems'); setItems(r.items || []); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    try { await api('/api/systems', { method: 'POST', body: JSON.stringify({ name }) }); setName(''); load(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <div>
      <h1>Systems</h1>
      <div className="card">
        <form onSubmit={create} className="row">
          <input className="input" placeholder="New system name" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1 }} />
          <button className="btn">Create</button>
        </form>
        {err && <div className="error">{err}</div>}
      </div>
      <div className="card">
        {items.length === 0 ? <div className="empty">No systems yet.</div> : (
          <table>
            <thead><tr><th>Name</th><th>Impact C/I/A</th><th>Updated</th></tr></thead>
            <tbody>
              {items.map(s => (
                <tr key={s.id}>
                  <td><Link to={`/systems/${s.id}`}>{s.name}</Link></td>
                  <td>{s.impact_c}/{s.impact_i}/{s.impact_a}</td>
                  <td>{new Date(s.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
