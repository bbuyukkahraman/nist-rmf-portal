# A-07 Threats

## Assets
- RMF artifacts, control implementations, evidence files, authorization decisions, POA&M, audit logs, tenant data.

## Actors
- Users (ISSO, AO, etc.), platform admins, hostile external actors, malicious insiders.

## Abuse cases
- Cross-tenant data access; privilege escalation; tampering with audit log; unauthorized authorization decision; evidence exfiltration; denial of service.

## Top risks
1. Tenant isolation breach — preventive: tenant_id filtering + RLS; detective: anomaly alerts; recovery: incident response + audit.
2. Privilege escalation — preventive: RBAC + MFA for privileged; detective: audit log review; recovery: revoke + rotate.
3. Audit log tampering — preventive: append-only hash-chained table; detective: integrity checks; recovery: restore from backup.
4. Evidence exfiltration — preventive: signed short-lived URLs, access checks; detective: download logs; recovery: revoke URLs.

## Controls
- Consent: tenant data processing agreement; retention/deletion per tenant policy.
- Retention: configurable per tenant, default 7 years for authorization records.
- Deletion: soft delete + scheduled purge with audit.
- Compliance: supports control tracking; not a certification claim; aligns with NIST/FedRAMP awareness.

## Incident owners and escalation
- Security lead owns incidents; escalate to platform admin and tenant admin within 24h for confirmed breach.
