# A-02 Requirements

## Package
- Package ID: PKG-NISTRMF-001
- Tenancy: multi-tenant

## Primary persona
- ISSO / Risk Manager managing RMF lifecycle for multiple information systems within a tenant (agency/org).

## MVP capability boundary (max 5)
1. System Inventory & Categorization — register systems; assign impact levels (C/I/A) per FIPS 199; record categorization rationale.
2. Control Baseline Selection & Implementation — select SP 800-53 baseline by impact; track implementation status per control (implemented/partially/alternative/not applicable) with evidence links.
3. Assessment & Findings — record assessment events, findings, and risk ratings; link to controls.
4. POA&M Management — create, track, update, and close POA&M items with milestones and owners.
5. Authorization Decision & Continuous Monitoring — record AO authorization decision (ATO/DATO/IATO) with expiry; log monitoring events and trigger re-assessment.

## Acceptance scenarios (Given/When/Then)
- Given a tenant with an ISSO role, When they register a new system with impact levels, Then a categorization record is created and visible to tenant members with read access.
- Given a categorized system, When a baseline is selected, Then applicable controls are instantiated with status "not assessed".
- Given a control implementation, When evidence is attached, Then the control status can be moved to "implemented" and audit history records the change with actor and timestamp.
- Given an assessment, When a finding is recorded, Then a POA&M item is optionally created and linked.
- Given an open POA&M item, When its milestone is completed, Then status moves to "closed pending verification" and requires assessor confirmation to fully close.
- Given an authorization decision, When recorded, Then the system's authorization expiry is set and monitoring schedule is established.

## Negative / recovery / permission / abuse scenarios
- A user without tenant membership cannot view or modify any tenant data (403 + no data leakage).
- A user with read-only role cannot mutate controls, POA&M, or authorization (403).
- Cross-tenant access attempt returns 404 (no existence disclosure) and is logged.
- Deleting a system with linked authorization records is blocked unless archived.
- Concurrent edits to the same control produce a conflict (409) requiring refresh; no silent overwrite.
- Evidence upload exceeding size/type limits is rejected with clear error.
- Tenant admin cannot escalate to platform admin.

## Success metrics
- Baseline: manual RMF cycle ~ 6-12 weeks per system. Target: cycle tracked end-to-end in portal with >=80% of controls having status + evidence.
- Metric: % of controls with implementation evidence (target >=90% for ATO-ready systems).
- Metric: POA&M closure cycle time (target <= 30 days median).
- Metric: user task completion in usability test (target >=60% unaided).

## One-tenant vs multi-tenant behavior
- Single-tenant: one organization, one database schema, simpler deployment.
- Multi-tenant: shared application, tenant-scoped data isolation via tenant_id on every entity; tenant context derived from authenticated session; no cross-tenant queries permitted; tenant provisioning by platform admin; per-tenant configuration (branding, retention).

## NFR requirements
- Performance: p95 page load <= 2s; p95 API <= 500ms for list endpoints up to 10k records.
- Availability: 99.5% business hours.
- Recovery: RPO <= 24h, RTO <= 8h.
- Accessibility: WCAG 2.1 AA; keyboard navigation; screen reader support.
- Security: MFA for privileged roles; encryption at rest (AES-256) and in transit (TLS 1.2+); immutable audit log; session timeout 30 min idle.
- Localization: English only for MVP; i18n-ready structure.
- Data residency: configurable per tenant (region selection).

## Gaps
- Cost ceiling and paid dependencies unresolved.
- AI necessity: not required for MVP (RMF is rules/records driven); skip A-05 unless AI added.
- Specific compliance certification scope (FedRAMP) undecided — portal supports control tracking but does not claim certification.
