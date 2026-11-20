import { Hono } from 'hono';
import { baselineFor, overallImpact } from './baseline';
import { generateSecret, verifyTotp, otpauthUri } from './totp';
import { cors } from 'hono/cors';
import { jwt, sign, verify } from 'hono/jwt';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

type Bindings = {
  DB: D1Database;
  EVIDENCE: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_REDIRECT_URI?: string;
  ASSETS: Fetcher;
};

type Vars = { user: { sub: string; email: string; role: string; tenantId: string | null } };

const app = new Hono<{ Bindings: Bindings; Variables: Vars }>();

// structured request logging
app.use('*', async (c, next) => {
  const start = Date.now();
  const reqId = crypto.randomUUID().slice(0, 8);
  c.header('X-Request-Id', reqId);
  await next();
  const ms = Date.now() - start;
  console.log(JSON.stringify({ ts: new Date().toISOString(), reqId, method: c.req.method, path: c.req.path, status: c.res.status, ms }));
});

app.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'], allowMethods: ['GET','POST','PATCH','DELETE','OPTIONS'] }));

// ---------- helpers ----------
function uid() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

async function hashPassword(password: string, salt: string) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function audit(env: Bindings, tenantId: string, actor: string, action: string, resource: string, resourceId?: string) {
  const id = uid();
  const ts = now();
  const prev = await env.DB.prepare('SELECT hash FROM audit_log WHERE tenant_id=? ORDER BY timestamp DESC LIMIT 1').bind(tenantId).first<{hash:string}>();
  const prevHash = prev?.hash ?? '';
  const payload = `${prevHash}|${tenantId}|${actor}|${action}|${resource}|${resourceId ?? ''}|${ts}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const hash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare('INSERT INTO audit_log (id,tenant_id,actor,action,resource,resource_id,timestamp,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, tenantId, actor, action, resource, resourceId ?? null, ts, prevHash, hash).run();
}

function err(c: any, code: string, message: string, status = 400) {
  return c.json({ code, message }, status);
}

// auth middleware (optional) - sets user if token present
async function authMiddleware(c: any, next: any) {
  const auth = c.req.header('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = await verify(auth.slice(7), c.env.JWT_SECRET, 'HS256');
      c.set('user', payload as any);
    } catch {
      // ignore; route decides
    }
  }
  await next();
}
app.use('*', authMiddleware);

function requireAuth(c: any) {
  const u = c.get('user');
  if (!u) { throw new Response(JSON.stringify({ code: 'unauthorized', message: 'Missing or invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } }); }
  return u;
}

function requireRole(c: any, roles: string[]) {
  const u = requireAuth(c);
  if (!roles.includes(u.role)) { throw new Response(JSON.stringify({ code: 'forbidden', message: 'Insufficient role' }), { status: 403, headers: { 'Content-Type': 'application/json' } }); }
  return u;
}

// ---------- health ----------
app.get('/api/health', (c) => c.json({ status: 'ok', env: c.env.ENVIRONMENT, time: now() }));

// ---------- auth ----------
app.post('/api/auth/register-tenant', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { tenantName, adminEmail, adminName, adminPassword } = body;
  if (!tenantName || !adminEmail || !adminPassword) return err(c, 'validation', 'tenantName, adminEmail, adminPassword required');
  const tenantId = uid();
  const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const userId = uid();
  const salt = uid();
  const hash = await hashPassword(adminPassword, salt);
  const ts = now();
  try {
    await c.env.DB.prepare('INSERT INTO tenants (id,name,slug,created_at) VALUES (?,?,?,?)').bind(tenantId, tenantName, slug, ts).run();
    await c.env.DB.prepare('INSERT INTO users (id,tenant_id,email,name,password_hash,salt,role,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(userId, tenantId, adminEmail, adminName || adminEmail, hash, salt, 'tenant_admin', ts).run();
  } catch (e: any) {
    return err(c, 'conflict', e?.message || 'registration failed', 409);
  }
  const token = await sign({ sub: userId, email: adminEmail, role: 'tenant_admin', tenantId }, c.env.JWT_SECRET, 'HS256');
  await audit(c.env, tenantId, adminEmail, 'tenant.register', 'tenant', tenantId);
  return c.json({ token, user: { id: userId, email: adminEmail, role: 'tenant_admin', tenantId }, tenant: { id: tenantId, name: tenantName, slug } }, 201);
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) return err(c, 'validation', 'email and password required');
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first<any>();
  if (!user) return err(c, 'unauthorized', 'invalid credentials', 401);
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) return err(c, 'unauthorized', 'invalid credentials', 401);
  if (user.mfa_enabled) {
    // issue short-lived mfa challenge token
    const mfaToken = await sign({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenant_id, mfa: true, exp: Math.floor(Date.now()/1000)+300 }, c.env.JWT_SECRET, 'HS256');
    return c.json({ mfaRequired: true, mfaToken });
  }
  const token = await sign({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenant_id }, c.env.JWT_SECRET, 'HS256');
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenant_id } });
});

// ---------- systems ----------
app.get('/api/systems', async (c) => {
  const u = requireAuth(c);
  const tenantId = u.tenantId;
  if (!tenantId && u.role !== 'platform_admin') return err(c, 'forbidden', 'no tenant', 403);
  let q = 'SELECT * FROM systems';
  const params: any[] = [];
  if (u.role !== 'platform_admin') { q += ' WHERE tenant_id=?'; params.push(tenantId); }
  q += ' ORDER BY created_at DESC';
  const res = await c.env.DB.prepare(q).bind(...params).all();
  return c.json({ items: res.results || [] });
});

app.post('/api/systems', async (c) => {
  const u = requireAuth(c);
  const tenantId = u.tenantId;
  if (!tenantId) return err(c, 'forbidden', 'no tenant', 403);
  const roles = ['tenant_admin','isso','system_owner','platform_admin'];
  if (!roles.includes(u.role)) return err(c, 'forbidden', 'role cannot create systems', 403);
  const body = await c.req.json().catch(() => ({}));
  const { name, description, owner, impactC, impactI, impactA } = body;
  if (!name) return err(c, 'validation', 'name required');
  const id = uid(); const ts = now();
  await c.env.DB.prepare('INSERT INTO systems (id,tenant_id,name,description,owner,impact_c,impact_i,impact_a,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, tenantId, name, description ?? null, owner ?? null, impactC ?? 'moderate', impactI ?? 'moderate', impactA ?? 'moderate', ts, ts).run();
  // instantiate controls for baseline? deferred to /baseline
  await audit(c.env, tenantId, u.email, 'system.create', 'system', id);
  return c.json({ id, tenantId, name, description, owner, impactC: impactC ?? 'moderate', impactI: impactI ?? 'moderate', impactA: impactA ?? 'moderate', createdAt: ts, updatedAt: ts }, 201);
});

app.get('/api/systems/:id', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  return c.json(row);
});

app.patch('/api/systems/:id', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const body = await c.req.json().catch(() => ({}));
  const name = body.name ?? row.name;
  const description = body.description ?? row.description;
  const owner = body.owner ?? row.owner;
  const impactC = body.impactC ?? row.impact_c;
  const impactI = body.impactI ?? row.impact_i;
  const impactA = body.impactA ?? row.impact_a;
  const ts = now();
  await c.env.DB.prepare('UPDATE systems SET name=?,description=?,owner=?,impact_c=?,impact_i=?,impact_a=?,updated_at=? WHERE id=?')
    .bind(name, description, owner, impactC, impactI, impactA, ts, id).run();
  await audit(c.env, row.tenant_id, u.email, 'system.update', 'system', id);
  return c.json({ id, updated: true });
});

// categorize (record impact already on system; add monitoring event)
app.post('/api/systems/:id/categorize', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const body = await c.req.json().catch(() => ({}));
  if (body.impactC) await c.env.DB.prepare('UPDATE systems SET impact_c=?,impact_i=?,impact_a=?,updated_at=? WHERE id=?')
    .bind(body.impactC, body.impactI ?? row.impact_i, body.impactA ?? row.impact_a, now(), id).run();
  await audit(c.env, row.tenant_id, u.email, 'system.categorize', 'system', id);
  return c.json({ id, categorized: true });
});

// baseline selection: instantiate SP800-53 controls by impact
const BASELINE_CONTROLS: { id: string; family: string; title: string }[] = [
  { id: 'AC-1', family: 'Access Control', title: 'Policy and Procedures' },
  { id: 'AC-2', family: 'Access Control', title: 'Account Management' },
  { id: 'AC-3', family: 'Access Control', title: 'Access Enforcement' },
  { id: 'AU-1', family: 'Audit and Accountability', title: 'Policy and Procedures' },
  { id: 'AU-2', family: 'Audit and Accountability', title: 'Event Logging' },
  { id: 'AU-9', family: 'Audit and Accountability', title: 'Protection of Audit Information' },
  { id: 'CM-1', family: 'Configuration Management', title: 'Policy and Procedures' },
  { id: 'CM-2', family: 'Configuration Management', title: 'Baseline Configuration' },
  { id: 'IA-1', family: 'Identification and Authentication', title: 'Policy and Procedures' },
  { id: 'IA-2', family: 'Identification and Authentication', title: 'Identification and Authentication (Organizational Users)' },
  { id: 'IA-5', family: 'Identification and Authentication', title: 'Authenticator Management' },
  { id: 'IR-1', family: 'Incident Response', title: 'Policy and Procedures' },
  { id: 'IR-4', family: 'Incident Response', title: 'Incident Handling' },
  { id: 'RA-1', family: 'Risk Assessment', title: 'Policy and Procedures' },
  { id: 'RA-3', family: 'Risk Assessment', title: 'Risk Assessment' },
  { id: 'SC-1', family: 'System and Communications Protection', title: 'Policy and Procedures' },
  { id: 'SC-8', family: 'System and Communications Protection', title: 'Transmission Confidentiality and Integrity' },
  { id: 'SC-28', family: 'System and Communications Protection', title: 'Protection of Information at Rest' },
  { id: 'SI-1', family: 'System and Information Integrity', title: 'Policy and Procedures' },
  { id: 'SI-4', family: 'System and Information Integrity', title: 'Information System Monitoring' },
];

app.post('/api/systems/:id/baseline', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const existing = await c.env.DB.prepare('SELECT COUNT(*) as n FROM controls WHERE system_id=?').bind(id).first<{n:number}>();
  if ((existing?.n ?? 0) > 0) return err(c, 'conflict', 'baseline already selected', 409);
  const impact = overallImpact(row.impact_c, row.impact_i, row.impact_a);
  const controls = baselineFor(impact);
  const ts = now();
  const stmts = controls.map(ctrl =>
    c.env.DB.prepare('INSERT INTO controls (id,system_id,tenant_id,control_id,family,title,status,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(uid(), id, row.tenant_id, ctrl.id, ctrl.family, ctrl.title, 'not_assessed', ts)
  );
  // D1 batch limit ~100; chunk
  for (let k = 0; k < stmts.length; k += 50) {
    await c.env.DB.batch(stmts.slice(k, k + 50));
  }
  await audit(c.env, row.tenant_id, u.email, 'system.baseline', 'system', id);
  return c.json({ systemId: id, impact, controlsCreated: controls.length }, 201);
});

// controls
app.get('/api/systems/:id/controls', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const res = await c.env.DB.prepare('SELECT * FROM controls WHERE system_id=? ORDER BY control_id').bind(id).all();
  return c.json({ items: res.results || [] });
});

app.patch('/api/controls/:id', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM controls WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'control not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'control not found', 404);
  const allowed = ['tenant_admin','isso','assessor','system_owner','platform_admin'];
  if (!allowed.includes(u.role)) return err(c, 'forbidden', 'role cannot update controls', 403);
  const body = await c.req.json().catch(() => ({}));
  const status = body.status ?? row.status;
  const implementation = body.implementation ?? row.implementation;
  const evidenceKey = body.evidenceKey ?? row.evidence_key;
  const ts = now();
  await c.env.DB.prepare('UPDATE controls SET status=?,implementation=?,evidence_key=?,updated_at=? WHERE id=?')
    .bind(status, implementation, evidenceKey, ts, id).run();
  await audit(c.env, row.tenant_id, u.email, 'control.update', 'control', id);
  return c.json({ id, updated: true });
});

// assessments
app.get('/api/systems/:id/assessments', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const res = await c.env.DB.prepare('SELECT * FROM assessments WHERE system_id=? ORDER BY assessed_at DESC').bind(id).all();
  const items = (res.results || []).map((r:any) => ({ ...r, findings: JSON.parse(r.findings || '[]') }));
  return c.json({ items });
});

app.post('/api/systems/:id/assessments', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const allowed = ['tenant_admin','isso','assessor','platform_admin'];
  if (!allowed.includes(u.role)) return err(c, 'forbidden', 'role cannot record assessments', 403);
  const body = await c.req.json().catch(() => ({}));
  const { summary, findings } = body;
  if (!summary) return err(c, 'validation', 'summary required');
  const aid = uid(); const ts = now();
  await c.env.DB.prepare('INSERT INTO assessments (id,system_id,tenant_id,assessed_at,assessor,summary,findings) VALUES (?,?,?,?,?,?,?)')
    .bind(aid, id, row.tenant_id, ts, u.email, summary, JSON.stringify(findings || [])).run();
  await audit(c.env, row.tenant_id, u.email, 'assessment.create', 'system', id);
  return c.json({ id: aid, systemId: id, assessedAt: ts }, 201);
});

// POA&M
app.get('/api/systems/:id/poam', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const res = await c.env.DB.prepare('SELECT * FROM poam WHERE system_id=? ORDER BY created_at DESC').bind(id).all();
  return c.json({ items: res.results || [] });
});

app.post('/api/poam', async (c) => {
  const u = requireAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const { systemId, controlId, title, description, owner, dueDate } = body;
  if (!systemId || !title || !owner || !dueDate) return err(c, 'validation', 'systemId,title,owner,dueDate required');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(systemId).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const allowed = ['tenant_admin','isso','platform_admin'];
  if (!allowed.includes(u.role)) return err(c, 'forbidden', 'role cannot create POA&M', 403);
  const id = uid(); const ts = now();
  await c.env.DB.prepare('INSERT INTO poam (id,system_id,tenant_id,control_id,title,description,owner,due_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, systemId, row.tenant_id, controlId ?? null, title, description ?? null, owner, dueDate, 'open', ts, ts).run();
  await audit(c.env, row.tenant_id, u.email, 'poam.create', 'poam', id);
  return c.json({ id, systemId, title, status: 'open', createdAt: ts }, 201);
});

app.patch('/api/poam/:id', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM poam WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'poam not found', 404);
  const sys = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(row.system_id).first<any>();
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'poam not found', 404);
  const body = await c.req.json().catch(() => ({}));
  const status = body.status ?? row.status;
  const owner = body.owner ?? row.owner;
  const dueDate = body.dueDate ?? row.due_date;
  const description = body.description ?? row.description;
  const ts = now();
  // close requires assessor confirmation if moving to closed
  if (status === 'closed' && u.role !== 'assessor' && u.role !== 'tenant_admin' && u.role !== 'platform_admin') {
    return err(c, 'forbidden', 'only assessor can fully close', 403);
  }
  await c.env.DB.prepare('UPDATE poam SET status=?,owner=?,due_date=?,description=?,updated_at=? WHERE id=?')
    .bind(status, owner, dueDate, description, ts, id).run();
  await audit(c.env, row.tenant_id, u.email, 'poam.update', 'poam', id);
  return c.json({ id, updated: true });
});

// authorization
app.get('/api/systems/:id/authorizations', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const res = await c.env.DB.prepare('SELECT * FROM authorizations WHERE system_id=? ORDER BY decided_at DESC').bind(id).all();
  return c.json({ items: res.results || [] });
});

app.post('/api/systems/:id/authorization', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  // AO-only write
  if (u.role !== 'ao' && u.role !== 'tenant_admin' && u.role !== 'platform_admin') {
    return err(c, 'forbidden', 'only AO can record authorization', 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const { decision, expiry, conditions } = body;
  if (!decision || !expiry) return err(c, 'validation', 'decision and expiry required');
  const aid = uid(); const ts = now();
  await c.env.DB.prepare('INSERT INTO authorizations (id,system_id,tenant_id,decision,decided_by,decided_at,expiry,conditions) VALUES (?,?,?,?,?,?,?,?)')
    .bind(aid, id, row.tenant_id, decision, u.email, ts, expiry, conditions ?? null).run();
  // monitoring event
  await c.env.DB.prepare('INSERT INTO monitoring_events (id,system_id,tenant_id,event_type,description,created_at) VALUES (?,?,?,?,?,?)')
    .bind(uid(), id, row.tenant_id, 'authorization', `Decision ${decision} until ${expiry}`, ts).run();
  await audit(c.env, row.tenant_id, u.email, 'authorization.record', 'system', id);
  return c.json({ id: aid, systemId: id, decision, expiry }, 201);
});

// monitoring events
app.get('/api/systems/:id/monitoring', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const res = await c.env.DB.prepare('SELECT * FROM monitoring_events WHERE system_id=? ORDER BY created_at DESC').bind(id).all();
  return c.json({ items: res.results || [] });
});

app.post('/api/systems/:id/monitoring', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM systems WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'system not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'system not found', 404);
  const body = await c.req.json().catch(() => ({}));
  const { eventType, description } = body;
  if (!eventType) return err(c, 'validation', 'eventType required');
  const eid = uid(); const ts = now();
  await c.env.DB.prepare('INSERT INTO monitoring_events (id,system_id,tenant_id,event_type,description,created_at) VALUES (?,?,?,?,?,?)')
    .bind(eid, id, row.tenant_id, eventType, description ?? null, ts).run();
  await audit(c.env, row.tenant_id, u.email, 'monitoring.event', 'system', id);
  return c.json({ id: eid, createdAt: ts }, 201);
});

// audit log
app.get('/api/audit', async (c) => {
  const u = requireAuth(c);
  if (u.role !== 'tenant_admin' && u.role !== 'auditor' && u.role !== 'platform_admin') return err(c, 'forbidden', 'role cannot view audit', 403);
  const tenantId = u.tenantId;
  let q = 'SELECT * FROM audit_log';
  const params: any[] = [];
  if (u.role !== 'platform_admin') { q += ' WHERE tenant_id=?'; params.push(tenantId); }
  q += ' ORDER BY timestamp DESC LIMIT 200';
  const res = await c.env.DB.prepare(q).bind(...params).all();
  return c.json({ items: res.results || [] });
});

// evidence upload (R2)
app.post('/api/evidence/upload', async (c) => {
  const u = requireAuth(c);
  const tenantId = u.tenantId;
  if (!tenantId) return err(c, 'forbidden', 'no tenant', 403);
  const allowed = ['tenant_admin','isso','assessor','platform_admin'];
  if (!allowed.includes(u.role)) return err(c, 'forbidden', 'role cannot upload evidence', 403);
  const form = await c.req.parseBody().catch(() => ({} as any));
  const file = form?.file;
  if (!file || !(file instanceof File)) return err(c, 'validation', 'file required');
  if (file.size > 10 * 1024 * 1024) return err(c, 'validation', 'file too large (max 10MB)');
  const key = `${tenantId}/${uid()}-${file.name}`;
  await c.env.EVIDENCE.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await audit(c.env, tenantId, u.email, 'evidence.upload', 'evidence', key);
  return c.json({ key }, 201);
});

app.get('/api/evidence/:key{.+}', async (c) => {
  const u = requireAuth(c);
  const key = c.req.param('key');
  // tenant scoping: key must start with user's tenant
  if (u.role !== 'platform_admin' && !(u.tenantId && key.startsWith(u.tenantId + '/'))) {
    return err(c, 'forbidden', 'access denied', 403);
  }
  const obj = await c.env.EVIDENCE.get(key);
  if (!obj) return err(c, 'not_found', 'not found', 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  return new Response(obj.body, { headers });
});

// tenants (platform admin list)
app.get('/api/tenants', async (c) => {
  const u = requireAuth(c);
  if (u.role !== 'platform_admin') return err(c, 'forbidden', 'platform admin only', 403);
  const res = await c.env.DB.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all();
  return c.json({ items: res.results || [] });
});

// SPA fallback
// ---------- users (tenant-scoped management) ----------
app.get('/api/users', async (c) => {
  const u = requireAuth(c);
  if (u.role !== 'tenant_admin' && u.role !== 'platform_admin') return err(c, 'forbidden', 'admin only', 403);
  let q = 'SELECT id,tenant_id,email,name,role,created_at FROM users';
  const params: any[] = [];
  if (u.role !== 'platform_admin') { q += ' WHERE tenant_id=?'; params.push(u.tenantId); }
  q += ' ORDER BY created_at DESC';
  const res = await c.env.DB.prepare(q).bind(...params).all();
  return c.json({ items: res.results || [] });
});

app.post('/api/users', async (c) => {
  const u = requireAuth(c);
  if (u.role !== 'tenant_admin' && u.role !== 'platform_admin') return err(c, 'forbidden', 'admin only', 403);
  const body = await c.req.json().catch(() => ({}));
  const { email, name, password, role, tenantId: reqTenant } = body;
  if (!email || !password) return err(c, 'validation', 'email and password required');
  const tenantId = u.role === 'platform_admin' ? (reqTenant || u.tenantId) : u.tenantId;
  if (!tenantId) return err(c, 'validation', 'tenantId required');
  const allowedRoles = ['isso','system_owner','assessor','auditor','ao','tenant_admin'];
  const r = (role && allowedRoles.includes(role)) ? role : 'isso';
  // tenant_admin can only assign non-admin roles unless platform_admin
  if (role === 'tenant_admin' && u.role !== 'platform_admin') return err(c, 'forbidden', 'cannot assign tenant_admin', 403);
  const id = crypto.randomUUID();
  const salt = crypto.randomUUID();
  const hash = await hashPassword(password, salt);
  const ts = new Date().toISOString();
  try {
    await c.env.DB.prepare('INSERT INTO users (id,tenant_id,email,name,password_hash,salt,role,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, tenantId, email, name || email, hash, salt, r, ts).run();
  } catch (e: any) {
    return err(c, 'conflict', e?.message || 'create failed', 409);
  }
  await audit(c.env, tenantId, u.email, 'user.create', 'user', id);
  return c.json({ id, email, name: name || email, role: r, tenantId }, 201);
});

app.patch('/api/users/:id', async (c) => {
  const u = requireAuth(c);
  if (u.role !== 'tenant_admin' && u.role !== 'platform_admin') return err(c, 'forbidden', 'admin only', 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'user not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'user not found', 404);
  const body = await c.req.json().catch(() => ({}));
  const role = body.role ?? row.role;
  if (role === 'platform_admin') return err(c, 'forbidden', 'cannot assign platform_admin', 403);
  if (role === 'tenant_admin' && u.role !== 'platform_admin') return err(c, 'forbidden', 'cannot assign tenant_admin', 403);
  await c.env.DB.prepare('UPDATE users SET role=?, name=? WHERE id=?')
    .bind(role, body.name ?? row.name, id).run();
  await audit(c.env, row.tenant_id, u.email, 'user.update', 'user', id);
  return c.json({ id, updated: true });
});

app.delete('/api/users/:id', async (c) => {
  const u = requireAuth(c);
  if (u.role !== 'tenant_admin' && u.role !== 'platform_admin') return err(c, 'forbidden', 'admin only', 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<any>();
  if (!row) return err(c, 'not_found', 'user not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'user not found', 404);
  if (row.id === u.sub) return err(c, 'conflict', 'cannot delete self', 409);
  await c.env.DB.prepare('DELETE FROM users WHERE id=?').bind(id).run();
  await audit(c.env, row.tenant_id, u.email, 'user.delete', 'user', id);
  return c.json({ id, deleted: true });
});

// ---------- MFA (TOTP) ----------
app.post('/api/auth/mfa-login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { mfaToken, code } = body;
  if (!mfaToken || !code) return err(c, 'validation', 'mfaToken and code required');
  let payload: any;
  try { payload = await verify(mfaToken, c.env.JWT_SECRET, 'HS256'); } catch { return err(c, 'unauthorized', 'invalid mfa token', 401); }
  if (!payload?.mfa) return err(c, 'unauthorized', 'not an mfa challenge', 401);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(payload.sub).first<any>();
  if (!user || !user.mfa_enabled || !user.mfa_secret) return err(c, 'unauthorized', 'mfa not enabled', 401);
  const ok = await verifyTotp(user.mfa_secret, code);
  if (!ok) return err(c, 'unauthorized', 'invalid code', 401);
  const token = await sign({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenant_id }, c.env.JWT_SECRET, 'HS256');
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenant_id } });
});

app.post('/api/mfa/enroll', async (c) => {
  const u = requireAuth(c);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(u.sub).first<any>();
  if (!user) return err(c, 'not_found', 'user not found', 404);
  const secret = generateSecret();
  await c.env.DB.prepare('UPDATE users SET mfa_secret=? WHERE id=?').bind(secret, u.sub).run();
  return c.json({ secret, otpauthUri: otpauthUri(secret, user.email) });
});

app.post('/api/mfa/verify-enroll', async (c) => {
  const u = requireAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const { code } = body;
  if (!code) return err(c, 'validation', 'code required');
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(u.sub).first<any>();
  if (!user?.mfa_secret) return err(c, 'validation', 'enroll first', 400);
  const ok = await verifyTotp(user.mfa_secret, code);
  if (!ok) return err(c, 'unauthorized', 'invalid code', 401);
  await c.env.DB.prepare('UPDATE users SET mfa_enabled=1 WHERE id=?').bind(u.sub).run();
  await audit(c.env, u.tenantId || 'platform', u.email, 'mfa.enable', 'user', u.sub);
  return c.json({ enabled: true });
});

app.post('/api/mfa/disable', async (c) => {
  const u = requireAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const targetId = body.userId || u.sub;
  // only self or tenant_admin/platform_admin
  if (targetId !== u.sub && u.role !== 'tenant_admin' && u.role !== 'platform_admin') return err(c, 'forbidden', 'forbidden', 403);
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(targetId).first<any>();
  if (!row) return err(c, 'not_found', 'user not found', 404);
  if (u.role !== 'platform_admin' && row.tenant_id !== u.tenantId) return err(c, 'not_found', 'user not found', 404);
  await c.env.DB.prepare('UPDATE users SET mfa_enabled=0, mfa_secret=NULL WHERE id=?').bind(targetId).run();
  await audit(c.env, row.tenant_id, u.email, 'mfa.disable', 'user', targetId);
  return c.json({ disabled: true });
});

// ---------- OIDC (optional, configured via env vars) ----------
app.get('/api/auth/oidc/login', async (c) => {
  const issuer = c.env.OIDC_ISSUER;
  const clientId = c.env.OIDC_CLIENT_ID;
  const redirectUri = c.env.OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !redirectUri) return err(c, 'not_configured', 'OIDC not configured', 501);
  // discovery
  const disc: any = await fetch(issuer.replace(/\/$/, '') + '/.well-known/openid-configuration').then(r => r.json()).catch(() => null);
  if (!disc?.authorization_endpoint) return err(c, 'internal', 'OIDC discovery failed', 500);
  const state = crypto.randomUUID();
  const url = new URL(disc.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  return c.redirect(url.toString());
});

app.get('/api/auth/oidc/callback', async (c) => {
  const code = c.req.query('code');
  const issuer = c.env.OIDC_ISSUER;
  const clientId = c.env.OIDC_CLIENT_ID;
  const clientSecret = c.env.OIDC_CLIENT_SECRET;
  const redirectUri = c.env.OIDC_REDIRECT_URI;
  if (!code || !issuer || !clientId || !redirectUri) return err(c, 'validation', 'missing code/config', 400);
  const disc: any = await fetch(issuer.replace(/\/$/, '') + '/.well-known/openid-configuration').then(r => r.json()).catch(() => null);
  if (!disc?.token_endpoint) return err(c, 'internal', 'OIDC discovery failed', 500);
  const tokenRes = await fetch(disc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret || '' }).toString(),
  });
  const tokenJson: any = await tokenRes.json().catch(() => ({}));
  if (!tokenJson.access_token) return err(c, 'unauthorized', 'token exchange failed', 401);
  const userinfo: any = await fetch(disc.userinfo_endpoint, { headers: { Authorization: 'Bearer ' + tokenJson.access_token } }).then(r => r.json()).catch(() => ({}));
  const email = userinfo?.email;
  if (!email) return err(c, 'unauthorized', 'no email from IdP', 401);
  // find or create user (platform scope: tenant must exist; default to first tenant or create)
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first<any>();
  if (!user) {
    // create in a default tenant if provided, else reject
    return err(c, 'not_found', 'user not provisioned in portal', 404);
  }
  const jwt = await sign({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenant_id }, c.env.JWT_SECRET, 'HS256');
  return c.json({ token: jwt, user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenant_id } });
});


// ---------- notifications ----------
app.get('/api/notifications', async (c) => {
  const u = requireAuth(c);
  let q = 'SELECT * FROM notifications WHERE tenant_id=?';
  const params: any[] = [u.tenantId];
  if (u.sub) { q += ' AND (user_id IS NULL OR user_id=?)'; params.push(u.sub); }
  q += ' ORDER BY created_at DESC LIMIT 100';
  const res = await c.env.DB.prepare(q).bind(...params).all();
  return c.json({ items: res.results || [] });
});

app.post('/api/notifications/:id/read', async (c) => {
  const u = requireAuth(c);
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE notifications SET read=1 WHERE id=? AND tenant_id=?').bind(id, u.tenantId).run();
  return c.json({ ok: true });
});

app.post('/api/notifications/read-all', async (c) => {
  const u = requireAuth(c);
  await c.env.DB.prepare('UPDATE notifications SET read=1 WHERE tenant_id=?').bind(u.tenantId).run();
  return c.json({ ok: true });
});

// ---------- CSV exports ----------
function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCsv(headers: string[], rows: any[][]): string {
  return [headers.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
}

app.get('/api/export/systems', async (c) => {
  const u = requireAuth(c);
  let q = 'SELECT id,name,description,owner,impact_c,impact_i,impact_a,created_at,updated_at FROM systems';
  const params: any[] = [];
  if (u.role !== 'platform_admin') { q += ' WHERE tenant_id=?'; params.push(u.tenantId); }
  const res = await c.env.DB.prepare(q).bind(...params).all();
  const rows = (res.results || []).map((r: any) => [r.id, r.name, r.description, r.owner, r.impact_c, r.impact_i, r.impact_a, r.created_at, r.updated_at]);
  const csv = toCsv(['id','name','description','owner','impact_c','impact_i','impact_a','created_at','updated_at'], rows);
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="systems.csv"' } });
});

app.get('/api/export/controls', async (c) => {
  const u = requireAuth(c);
  const systemId = c.req.query('systemId');
  let q = 'SELECT id,system_id,control_id,family,title,status,implementation,updated_at FROM controls';
  const params: any[] = [];
  const conds: string[] = [];
  if (u.role !== 'platform_admin') { conds.push('tenant_id=?'); params.push(u.tenantId); }
  if (systemId) { conds.push('system_id=?'); params.push(systemId); }
  if (conds.length) q += ' WHERE ' + conds.join(' AND ');
  q += ' ORDER BY control_id';
  const res = await c.env.DB.prepare(q).bind(...params).all();
  const rows = (res.results || []).map((r: any) => [r.id, r.system_id, r.control_id, r.family, r.title, r.status, r.implementation, r.updated_at]);
  const csv = toCsv(['id','system_id','control_id','family','title','status','implementation','updated_at'], rows);
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="controls.csv"' } });
});

app.get('/api/export/audit', async (c) => {
  const u = requireAuth(c);
  if (u.role !== 'tenant_admin' && u.role !== 'auditor' && u.role !== 'platform_admin') return err(c, 'forbidden', 'forbidden', 403);
  let q = 'SELECT id,tenant_id,actor,action,resource,resource_id,timestamp,hash FROM audit_log';
  const params: any[] = [];
  if (u.role !== 'platform_admin') { q += ' WHERE tenant_id=?'; params.push(u.tenantId); }
  q += ' ORDER BY timestamp DESC LIMIT 5000';
  const res = await c.env.DB.prepare(q).bind(...params).all();
  const rows = (res.results || []).map((r: any) => [r.id, r.tenant_id, r.actor, r.action, r.resource, r.resource_id, r.timestamp, r.hash]);
  const csv = toCsv(['id','tenant_id','actor','action','resource','resource_id','timestamp','hash'], rows);
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="audit.csv"' } });
});

// manual trigger for scheduled checks (demo/admin)
app.post('/api/admin/run-checks', async (c) => {
  const u = requireAuth(c);
  if (u.role !== 'tenant_admin' && u.role !== 'platform_admin') return err(c, 'forbidden', 'admin only', 403);
  // run checks scoped: reuse runChecks but it iterates all tenants; for demo run globally
  await runChecks(c.env);
  return c.json({ ok: true });
});

// ---------- dashboard ----------
app.get('/api/dashboard', async (c) => {
  const u = requireAuth(c);
  const tenantId = u.tenantId;
  const scope = u.role === 'platform_admin' ? '' : ' WHERE tenant_id=?';
  const params = u.role === 'platform_admin' ? [] : [tenantId];
  const systems = await c.env.DB.prepare('SELECT COUNT(*) as n FROM systems' + scope).bind(...params).first<{n:number}>();
  // controls by status
  let cq = 'SELECT status, COUNT(*) as n FROM controls';
  const cparams: any[] = [];
  if (u.role !== 'platform_admin') { cq += ' WHERE tenant_id=?'; cparams.push(tenantId); }
  cq += ' GROUP BY status';
  const controlRows = await c.env.DB.prepare(cq).bind(...cparams).all<any>();
  const controlStatus: Record<string, number> = {};
  for (const r of (controlRows.results || [])) controlStatus[r.status] = r.n;
  // systems by impact
  let iq = 'SELECT impact_c, COUNT(*) as n FROM systems';
  const iparams: any[] = [];
  if (u.role !== 'platform_admin') { iq += ' WHERE tenant_id=?'; iparams.push(tenantId); }
  iq += ' GROUP BY impact_c';
  const impactRows = await c.env.DB.prepare(iq).bind(...iparams).all<any>();
  const systemsByImpact: Record<string, number> = {};
  for (const r of (impactRows.results || [])) systemsByImpact[r.impact_c] = r.n;
  // POA&M open count
  let pq = "SELECT COUNT(*) as n FROM poam WHERE status IN ('open','closed_pending_verification')";
  const pparams: any[] = [];
  if (u.role !== 'platform_admin') { pq += ' AND tenant_id=?'; pparams.push(tenantId); }
  const poamOpen = await c.env.DB.prepare(pq).bind(...pparams).first<{n:number}>();
  // overdue POA&M
  const today = new Date().toISOString().slice(0, 10);
  let oq = "SELECT COUNT(*) as n FROM poam WHERE status='open' AND due_date < ?";
  const oparams: any[] = [today];
  if (u.role !== 'platform_admin') { oq += ' AND tenant_id=?'; oparams.push(tenantId); }
  const poamOverdue = await c.env.DB.prepare(oq).bind(...oparams).first<{n:number}>();
  // authorizations expiring within 30 days
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  let aq = 'SELECT COUNT(*) as n FROM authorizations WHERE expiry <= ?';
  const aparams: any[] = [in30];
  if (u.role !== 'platform_admin') { aq += ' AND tenant_id=?'; aparams.push(tenantId); }
  const authExpiring = await c.env.DB.prepare(aq).bind(...aparams).first<{n:number}>();
  // recent audit count (last 7 days)
  const in7 = new Date(Date.now() - 7 * 86400000).toISOString();
  let rq = 'SELECT COUNT(*) as n FROM audit_log WHERE timestamp >= ?';
  const rparams: any[] = [in7];
  if (u.role !== 'platform_admin') { rq += ' AND tenant_id=?'; rparams.push(tenantId); }
  const recentAudit = await c.env.DB.prepare(rq).bind(...rparams).first<{n:number}>();
  // notifications unread
  let nq = 'SELECT COUNT(*) as n FROM notifications WHERE read=0';
  const nparams: any[] = [];
  if (u.role !== 'platform_admin') { nq += ' AND tenant_id=?'; nparams.push(tenantId); }
  const unreadNotif = await c.env.DB.prepare(nq).bind(...nparams).first<{n:number}>();
  // users count
  let uq = 'SELECT COUNT(*) as n FROM users';
  const uparams: any[] = [];
  if (u.role !== 'platform_admin') { uq += ' WHERE tenant_id=?'; uparams.push(tenantId); }
  const usersCount = await c.env.DB.prepare(uq).bind(...uparams).first<{n:number}>();

  return c.json({
    systems: systems?.n ?? 0,
    users: usersCount?.n ?? 0,
    controlStatus,
    systemsByImpact,
    poamOpen: poamOpen?.n ?? 0,
    poamOverdue: poamOverdue?.n ?? 0,
    authExpiring: authExpiring?.n ?? 0,
    recentAudit: recentAudit?.n ?? 0,
    unreadNotifications: unreadNotif?.n ?? 0,
  });
});

app.all('*', async (c) => {
  // serve assets
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
  if (err instanceof Response) return err;
  console.error(err);
  return c.json({ code: "internal", message: String(err?.message || err) }, 500);
});


// ---------- scheduled checks (cron) ----------
async function runChecks(env: any) {
  const tenants = await env.DB.prepare('SELECT id FROM tenants').all();
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  for (const t of (tenants.results || [])) {
    const tid = t.id;
    // overdue / due-soon POA&M
    const poams = await env.DB.prepare("SELECT id,title,due_date,status FROM poam WHERE tenant_id=? AND status IN ('open','closed_pending_verification')").bind(tid).all();
    for (const p of (poams.results || [])) {
      if (p.due_date <= in7) {
        const overdue = p.due_date < today;
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO notifications (id,tenant_id,title,message,kind,created_at) VALUES (?,?,?,?,?,?)')
          .bind(id, tid, overdue ? 'Overdue POA&M item' : 'POA&M due soon', `${p.title} (due ${p.due_date})`, overdue ? 'warning' : 'info', new Date().toISOString()).run();
      }
    }
    // expiring authorizations
    const auths = await env.DB.prepare('SELECT id,system_id,decision,expiry FROM authorizations WHERE tenant_id=?').bind(tid).all();
    for (const a of (auths.results || [])) {
      if (a.expiry <= in30) {
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO notifications (id,tenant_id,title,message,kind,created_at) VALUES (?,?,?,?,?,?)')
          .bind(id, tid, 'Authorization expiring', `System ${a.system_id}: ${a.decision.toUpperCase()} expires ${a.expiry}`, 'warning', new Date().toISOString()).run();
      }
    }
  }
}

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: any, ctx: any) {
    ctx.waitUntil(runChecks(env));
  },
};
