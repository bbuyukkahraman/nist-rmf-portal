-- NIST RMF Portal schema (D1/SQLite)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL DEFAULT 'us-east',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS systems (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  owner TEXT,
  impact_c TEXT NOT NULL DEFAULT 'moderate',
  impact_i TEXT NOT NULL DEFAULT 'moderate',
  impact_a TEXT NOT NULL DEFAULT 'moderate',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS controls (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  control_id TEXT NOT NULL,
  family TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_assessed',
  implementation TEXT,
  evidence_key TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (system_id) REFERENCES systems(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  assessor TEXT NOT NULL,
  summary TEXT NOT NULL,
  findings TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (system_id) REFERENCES systems(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS poam (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  control_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  owner TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (system_id) REFERENCES systems(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS authorizations (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  expiry TEXT NOT NULL,
  conditions TEXT,
  FOREIGN KEY (system_id) REFERENCES systems(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS monitoring_events (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (system_id) REFERENCES systems(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  timestamp TEXT NOT NULL,
  prev_hash TEXT,
  hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_systems_tenant ON systems(tenant_id);
CREATE INDEX IF NOT EXISTS idx_controls_system ON controls(system_id);
CREATE INDEX IF NOT EXISTS idx_controls_tenant ON controls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_poam_system ON poam(system_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
