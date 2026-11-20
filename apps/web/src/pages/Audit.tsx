import React, { useEffect, useState } from 'react';
import { api, downloadCsv } from '../api';

export default function Audit() {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/api/audit').then(r => setItems(r.items || [])).catch(e => setErr(e.message));
  }, []);
  return (
    <div>
      <h1>Audit Log</h1>
      <div className="row" style={{ marginBottom: "1rem" }}>
        <button className="btn secondary" onClick={() => downloadCsv("/api/export/audit","audit.csv")}>Export CSV</button>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="card">
        {items.length === 0 ? <div className="empty">No entries.</div> : (
          <table>
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>ID</th></tr></thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id}>
                  <td>{new Date(a.timestamp).toLocaleString()}</td>
                  <td>{a.actor}</td>
                  <td>{a.action}</td>
                  <td>{a.resource}</td>
                  <td>{a.resource_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
