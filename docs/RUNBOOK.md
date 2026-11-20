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
