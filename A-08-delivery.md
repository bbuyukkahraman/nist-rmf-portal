# A-08 Delivery

## Repository and workspace
- Monorepo: apps/web, apps/api, packages/shared, infra/terraform, docs/.

## Environments
- dev, staging, prod; promotion via CI with approvals for prod.

## Build and dependencies
- Reproducible builds (lockfile); dependency review; SCA scanning.

## Test evidence
- Unit + integration + e2e; tenant isolation tests; security tests; accessibility audit.

## Migration and compatibility
- Versioned migrations; backward-compatible API; deprecation 90 days.

## Release order and health checks
- Deploy API then web; health endpoints; smoke tests; canary.

## Rollback
- Triggers: error rate > 1%, SLO breach, failed smoke; owner: on-call engineer; evidence: metrics + logs.

## Cost
- Decision (researched): Use open-source stack (PostgreSQL, S3-compatible storage) to avoid paid license dependencies. Managed services only where operational risk justifies (managed Postgres, managed object storage).
- Cost ceiling: USD 2,000/month for first 12 months, covering up to 100 tenants / 10k systems. Variable overage requires re-approval.
- Paid dependencies: none approved beyond managed infra; any future paid dep (e.g., IdP, email service) requires cost ceiling + approval.
- Fixed estimate: compute $600, storage $200, DB $400, egress $100, monitoring $100 = ~$1,400/mo with headroom to $2,000.

## NFR and control verification
- Load tests, security scan, accessibility audit, backup restore drill.

## Gaps
- Cost ceiling and paid dependencies unresolved (blocking release).
