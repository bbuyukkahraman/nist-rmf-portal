import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

export default function SystemDetail() {
  const { id } = useParams();
  const [system, setSystem] = useState<any>(null);
  const [tab, setTab] = useState('controls');
  const [controls, setControls] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [poam, setPoam] = useState<any[]>([]);
  const [auths, setAuths] = useState<any[]>([]);
  const [monitoring, setMonitoring] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const s = await api(`/api/systems/${id}`); setSystem(s);
      const c = await api(`/api/systems/${id}/controls`); setControls(c.items || []);
      const a = await api(`/api/systems/${id}/assessments`); setAssessments(a.items || []);
      const p = await api(`/api/systems/${id}/poam`); setPoam(p.items || []);
      const au = await api(`/api/systems/${id}/authorizations`); setAuths(au.items || []);
      const m = await api(`/api/systems/${id}/monitoring`); setMonitoring(m.items || []);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadAll(); }, [id]);

  async function categorize() {
    try { await api(`/api/systems/${id}/categorize`, { method: 'POST', body: JSON.stringify({ impactC: system.impact_c, impactI: system.impact_i, impactA: system.impact_a }) }); loadAll(); }
    catch (e: any) { setErr(e.message); }
  }
  async function baseline() {
    try { await api(`/api/systems/${id}/baseline`, { method: 'POST' }); loadAll(); }
    catch (e: any) { setErr(e.message); }
  }
  async function updateControl(cid: string, status: string) {
    try { await api(`/api/controls/${cid}`, { method: 'PATCH', body: JSON.stringify({ status }) }); loadAll(); }
    catch (e: any) { setErr(e.message); }
  }
  async function uploadEvidence(cid: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      try {
        const t = localStorage.getItem('token') || '';
        const res = await fetch('/api/evidence/upload', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'upload failed');
        await api(`/api/controls/${cid}`, { method: 'PATCH', body: JSON.stringify({ evidenceKey: data.key }) });
        loadAll();
      } catch (e: any) { setErr(e.message); }
    };
    input.click();
  }
  async function addAssessment() {
    const summary = prompt('Assessment summary:'); if (!summary) return;
    const autoPoam = confirm('Auto-create POA&M items for major/minor findings?');
    const findings: any[] = [];
    let more = true;
    while (more) {
      const ctrl = prompt('Finding control ID (e.g. AC-2) or cancel:'); if (!ctrl) { more = false; break; }
      const rating = prompt('Rating (satisfied/minor/major):') || 'satisfied';
      const note = prompt('Note:') || '';
      findings.push({ controlId: ctrl, rating, note });
      more = confirm('Add another finding?');
    }
    try {
      const a = await api(`/api/systems/${id}/assessments`, { method: 'POST', body: JSON.stringify({ summary, findings }) });
      if (autoPoam) {
        for (const f of findings) {
          if (f.rating === 'major' || f.rating === 'minor') {
            await api('/api/poam', { method: 'POST', body: JSON.stringify({ systemId: id, controlId: f.controlId, title: `Remediate finding: ${f.controlId}`, description: f.note, owner: 'ISSO', dueDate: new Date(Date.now() + 30*86400000).toISOString().slice(0,10) }) });
          }
        }
      }
      loadAll();
    } catch (e: any) { setErr(e.message); }
  }
  async function addPoam() {
    const title = prompt('POA&M title:'); if (!title) return;
    const owner = prompt('Owner:'); if (!owner) return;
    const due = prompt('Due date (YYYY-MM-DD):'); if (!due) return;
    try { await api('/api/poam', { method: 'POST', body: JSON.stringify({ systemId: id, title, owner, dueDate: due }) }); loadAll(); }
    catch (e: any) { setErr(e.message); }
  }
  async function closePoam(pid: string) {
    try { await api(`/api/poam/${pid}`, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) }); loadAll(); }
    catch (e: any) { setErr(e.message); }
  }
  async function authorize() {
    const decision = prompt('Decision (ato/dato/iato):'); if (!decision) return;
    const expiry = prompt('Expiry (YYYY-MM-DD):'); if (!expiry) return;
    try { await api(`/api/systems/${id}/authorization`, { method: 'POST', body: JSON.stringify({ decision, expiry }) }); loadAll(); }
    catch (e: any) { setErr(e.message); }
  }
  async function addMonitoring() {
    const et = prompt('Event type:'); if (!et) return;
    const desc = prompt('Description:'); 
    try { await api(`/api/systems/${id}/monitoring`, { method: 'POST', body: JSON.stringify({ eventType: et, description: desc }) }); loadAll(); }
    catch (e: any) { setErr(e.message); }
  }

  if (loading && !system) return <div>Loading...</div>;
  if (!system) return <div className="error">{err || 'Not found'}</div>;

  const tabs = ['overview', 'controls', 'assessments', 'poam', 'authorization', 'monitoring'];
  return (
    <div>
      <h1>{system.name}</h1>
      {err && <div className="error">{err}</div>}
      <div className="row" style={{ marginBottom: '1rem' }}>
        {tabs.map(t => <button key={t} className={`btn ${tab === t ? '' : 'secondary'}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="card">
          <p><strong>Impact:</strong> C={system.impact_c} I={system.impact_i} A={system.impact_a}</p>
          <p><strong>Owner:</strong> {system.owner || '-'}</p>
          <p><strong>Description:</strong> {system.description || '-'}</p>
          <div className="row">
            <button className="btn secondary" onClick={categorize}>Record Categorization</button>
            <button className="btn secondary" onClick={baseline} disabled={controls.length > 0}>Select Baseline</button>
          </div>
        </div>
      )}

      {tab === 'controls' && (
        <div className="card">
          {controls.length === 0 ? <div className="empty">No controls. Select baseline first.</div> : (
            <table>
              <thead><tr><th>Control</th><th>Family</th><th>Title</th><th>Status</th><th>Evidence</th><th>Action</th></tr></thead>
              <tbody>
                {controls.map(c => (
                  <tr key={c.id}>
                    <td>{c.control_id}</td>
                    <td>{c.family}</td>
                    <td>{c.title}</td>
                    <td><span className="badge">{c.status}</span></td>
                    <td>
                      {c.evidence_key ? <a href={`/api/evidence/${c.evidence_key}`} target="_blank" rel="noreferrer">view</a> : <span style={{ color: '#64748b', fontSize: '.8rem' }}>none</span>}
                      <button className="btn secondary" style={{ marginLeft: '.25rem', padding: '.15rem .4rem', fontSize: '.75rem' }} onClick={() => uploadEvidence(c.id)}>upload</button>
                    </td>
                    <td>
                      <select value={c.status} onChange={e => updateControl(c.id, e.target.value)}>
                        <option value="not_assessed">not_assessed</option>
                        <option value="implemented">implemented</option>
                        <option value="partially">partially</option>
                        <option value="alternative">alternative</option>
                        <option value="not_applicable">not_applicable</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'assessments' && (
        <div className="card">
          <button className="btn" onClick={addAssessment} style={{ marginBottom: '1rem' }}>Record Assessment</button>
          {assessments.length === 0 ? <div className="empty">No assessments.</div> : assessments.map(a => (
            <div key={a.id} style={{ borderBottom: '1px solid #334155', paddingBottom: '.5rem', marginBottom: '.5rem' }}>
              <strong>{new Date(a.assessed_at).toLocaleString()}</strong> by {a.assessor}
              <p>{a.summary}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'poam' && (
        <div className="card">
          <button className="btn" onClick={addPoam} style={{ marginBottom: '1rem' }}>New POA&M</button>
          {poam.length === 0 ? <div className="empty">No POA&M items.</div> : (
            <table>
              <thead><tr><th>Title</th><th>Owner</th><th>Due</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {poam.map(p => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{p.owner}</td>
                    <td>{p.due_date}</td>
                    <td><span className="badge">{p.status}</span></td>
                    <td>{p.status !== 'closed' && <button className="btn secondary" onClick={() => closePoam(p.id)}>Close</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'authorization' && (
        <div className="card">
          <button className="btn" onClick={authorize} style={{ marginBottom: '1rem' }}>Record Authorization</button>
          {auths.length === 0 ? <div className="empty">No authorization decisions.</div> : auths.map(a => (
            <div key={a.id} style={{ borderBottom: '1px solid #334155', paddingBottom: '.5rem', marginBottom: '.5rem' }}>
              <strong>{a.decision.toUpperCase()}</strong> by {a.decided_by} on {new Date(a.decided_at).toLocaleString()} — expires {a.expiry}
              {a.conditions && <p>{a.conditions}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'monitoring' && (
        <div className="card">
          <button className="btn" onClick={addMonitoring} style={{ marginBottom: '1rem' }}>Log Monitoring Event</button>
          {monitoring.length === 0 ? <div className="empty">No monitoring events.</div> : (
            <table>
              <thead><tr><th>Type</th><th>Description</th><th>When</th></tr></thead>
              <tbody>
                {monitoring.map(m => (
                  <tr key={m.id}>
                    <td>{m.event_type}</td>
                    <td>{m.description}</td>
                    <td>{new Date(m.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
