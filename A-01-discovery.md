# A-01 Discovery

## Package context
- Domain: NIST Risk Management Framework (RMF) based Risk Management portal
- Source standard: NIST SP 800-37 Rev. 2 (RMF), SP 800-53 Rev. 5 (security/privacy controls), SP 800-60 (categorization), FIPS 199/200.

## Observations
- Federal/agency and regulated organizations must run RMF steps (Prepare, Categorize, Select, Implement, Assess, Authorize, Monitor) across many information systems, producing authorization packages.
- Existing tooling is often spreadsheet/Word-driven, leading to stale control implementations, missing evidence, and missed continuous-monitoring events.

## User claims
- Security officers and system owners need a single place to track system categorization, control baselines, implementations, assessments, POA&M items, and authorization decisions.
- Auditors need traceable evidence and immutable history.

## Unsupported beliefs
- That automation can replace assessor judgment. (Assessment requires human authority.)
- That a single tenant model fits all agencies. (Tenancy must be decided.)

## Affected actor
- Primary: Information System Security Officer (ISSO) / Risk Manager.
- Secondary: System Owner, Authorizing Official (AO), Assessor, Auditor.

## Current workaround
- Spreadsheets, Word templates, email, and shared drives; manual evidence collection; periodic re-authorization every 3 years.

## Consequence of inaction
- Stale authorization, untracked POA&M items, failed audits, and unmitigated risk accumulation.

## Proposed outcome (no implementation details)
- A web portal that lets an organization manage RMF lifecycle artifacts (systems, categorizations, control baselines, implementations, assessments, POA&M, authorization decisions, continuous monitoring) with role-based access, evidence attachments, and audit history.

## Riskiest decision that could invalidate the product
- Whether organizations will adopt a structured portal over their existing GRC tools / spreadsheets, i.e., whether the value is in workflow + traceability rather than another GRC suite.

## Riskiest experiment
- Participants: 5-8 ISSOs/AOs from 2-3 agencies or regulated orgs.
- Input: clickable prototype covering one full RMF cycle for a single moderate-impact system.
- Expected signal: >=60% complete a full cycle unaided; >=70% say traceability/audit readiness improved vs current process.
- Stop rule: If fewer than 3 of 8 complete the cycle unaided, or value not perceived, stop and re-scope before building.

## NFR and control constraints (must survive later stages)
- NFR: availability 99.5% during business hours; RPO <= 24h, RTO <= 8h; p95 page load <= 2s; WCAG 2.1 AA; data residency configurable.
- Controls: RBAC with least privilege; immutable audit log; encryption at rest (AES-256) and in transit (TLS 1.2+); MFA for privileged roles; retention/deletion policy; tenant isolation if multi-tenant; FedRAMP-relevant controls awareness (not a certification claim).

## Gaps
- Tenancy mode (single vs multi) unresolved.
- Whether AI is structurally necessary: likely NO (RMF is rules/records driven); to be decided in A-05 only if needed.
- Cost ceiling and paid dependencies unresolved.
