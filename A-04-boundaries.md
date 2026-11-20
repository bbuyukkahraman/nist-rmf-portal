# A-04 Boundaries

## Trust boundaries
- Browser <-> API (TLS); API <-> DB (private network); API <-> IdP (OIDC); API <-> object storage (signed URLs); API <-> queue.

## Identities
- Human: ISSO, System Owner, AO, Assessor, Auditor, Tenant Admin, Platform Admin.
- Service: API service account, worker, backup agent.

## Resource-level permissions
- system: read/write per role; authorization records: AO-only write.
- control implementation: ISSO/Assessor write.
- POA&M: ISSO write; Assessor verify close.
- evidence: upload by ISSO/Assessor; read by authorized tenant roles.

## Public operations (max 10)
1. POST /systems — create system
2. GET /systems/{id} — get system
3. PATCH /systems/{id} — update system
4. POST /systems/{id}/categorize — set categorization
5. POST /systems/{id}/baseline — select baseline
6. PATCH /controls/{id} — update control implementation
7. POST /systems/{id}/assessments — record assessment
8. POST /poam — create POA&M item
9. PATCH /poam/{id} — update/close POA&M item
10. POST /systems/{id}/authorization — record authorization decision

## Request/response contracts
- JSON over HTTPS; standard error envelope {code, message, details}; pagination via cursor.

## Validation and errors
- Input validation server-side (schema); 400 validation, 401 unauth, 403 forbidden, 404 not found, 409 conflict, 429 rate limit, 500 internal.

## Rate limits
- Per user: 100 req/min; per tenant: 1000 req/min; service accounts: 5000 req/min.

## Idempotency
- Mutations accept optional Idempotency-Key header; stored 24h; replay returns original response.

## NFR and controls
- NFR: as A-02.
- Controls: authn via IdP + MFA for privileged; authz at API + DB RLS; audit log on every mutation.
