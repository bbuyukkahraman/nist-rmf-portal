# A-03 System

## System context
- Web portal (SPA + API) serving multiple tenants. External: identity provider (OIDC/SAML), object storage for evidence, email/notification service.

## Components and responsibilities
- Web client: rendering, form validation, offline-friendly draft (optional).
- API service: business logic, authorization, tenant scoping, audit logging.
- Database: relational (PostgreSQL) with tenant_id on every entity; row-level security as defense in depth.
- Object storage: evidence files, tenant-prefixed keys, signed URLs.
- Worker/queue: notifications, exports, scheduled monitoring checks.

## Data ownership
- Tenant owns all its data; platform owns tenant registry and billing.
- System of record for RMF artifacts is the database; evidence files in object storage referenced by metadata.

## Tenant isolation
- Every table has tenant_id NOT NULL; all queries filtered by tenant context from auth token.
- Row-level security (RLS) policies enforce tenant_id = current_setting('app.tenant_id').
- Separate encryption keys per tenant (KMS) for data at rest where required.
- No shared mutable state across tenants.

## Failure and recovery
- Partial failure: assessment save retries idempotently; evidence upload resumable.
- Backup: daily full + WAL archiving; restore tested quarterly.
- RPO <= 24h, RTO <= 8h.

## Migration and backwards compatibility
- Schema migrations via versioned migration tool; backwards-compatible API versioning (/v1); deprecation notices 90 days.

## Capacity assumptions
- 100 tenants, 50 users each, 10k systems total, 1M controls. Horizontal scale of API; read replicas for reporting.

## Observability
- Structured logs with tenant_id (redacted PII); metrics: request latency, error rate, queue depth; traces for critical paths; alerting on SLO breach.

## NFR and controls
- NFR: as A-02.
- Controls: encryption at rest/transit; immutable audit log append-only table with hash chain; MFA enforcement; backup/restore evidence.
