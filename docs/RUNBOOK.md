# RUNBOOK — NIST RMF Portal

## Service
- Worker: nist-rmf-portal
- URL: https://nist-rmf-portal.axoss.workers.dev
- Repo: https://github.com/bbuyukkahraman/nist-rmf-portal

## Deploy
```
pnpm --filter web build
cd apps/api && wrangler deploy
```

## Migrations
```
cd apps/api && wrangler d1 execute nist-rmf-db --remote --file=../../infra/migrations/0001_init.sql
```

## Rollback
```
cd apps/api && wrangler rollback
```

## Secrets
- JWT_SECRET (wrangler secret)
- CLOUDFLARE_API_TOKEN, GITHUB_TOKEN in ~/.config/taslak/secrets.env

## Health
- GET /api/health
- Smoke: register tenant → create system → select baseline → update control → audit log

## Monitoring
- Cloudflare Workers analytics + D1 metrics.

## Observability
- Worker emits structured JSON logs (method, path, status, ms, reqId) to Cloudflare Logs.
- Request ID returned via `X-Request-Id` header.
- Cron runs daily at 06:00 UTC: checks POA&M due/overdue and authorization expiries, creates notifications.
- Manual trigger: `POST /api/admin/run-checks` (tenant/platform admin).

## Backup & Restore
- D1: Cloudflare Time Travel (automatic point-in-time recovery, 30 days on paid, 7 days free). Manual export: `wrangler d1 export nist-rmf-db --remote --output=backup.sql`
- R2: versioning can be enabled on the bucket; manual copy via `wrangler r2 object get`.
- Restore: `wrangler d1 execute nist-rmf-db --remote --file=backup.sql`
- Backup drill: quarterly (restore to a staging DB and verify smoke).

## Export
- `GET /api/export/systems`, `/api/export/controls?systemId=`, `/api/export/audit` (CSV, auth required).
