# Deployment Guide

## Goal

This backend is designed to be deployable on:

- Cloud Run
- Railway
- Render
- Fly.io
- a VM or container host you manage yourself

Cloud Run is included here as a concrete reference because it is a good low-cost default, but the runtime contract is intentionally provider-neutral.

Use these companion checklists together:

- [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
- [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)

## Deployment Shape

Recommended production shape:

- Flutter driver app distributed separately
- backend container running Node.js service from `backend/`
- Postgres as the primary database
- Firebase Admin service account injected as a secret file or secret value
- optional Google Maps API key for traffic-aware ETA
- optional Redis for shared rate limiting across multiple backend instances

## Required Environment Variables

Use [backend/.env.example](/c:/dev/DriverApp/backend/.env.example) as the baseline.

Production-critical:

- `HOST`
- `PORT`
- `DATABASE_URL`
- `SESSION_TTL_HOURS`
- `STALE_LOCATION_MINUTES`
- `DISPATCH_INTERVAL_MS`
- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `ADMIN_API_KEY`
- `ALLOW_ADMIN_API_KEY_FALLBACK`
- `ALLOWED_WEB_ORIGINS`

Operationally recommended:

- `METRICS_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `PASSWORD_RESET_BASE_URL`
- `GOOGLE_MAPS_API_KEY`
- `ALERT_WEBHOOK_URL`

Optional:

- `REDIS_URL`

## Database Strategy

Use Postgres for deployed environments.

Why:

- real transactional persistence
- safer concurrent writes than file-backed storage
- easier backup/restore
- easier multi-instance deployment later

## Prisma Role

Prisma is included for:

- schema definition
- migrations
- generated typed client for standard CRUD-style administration/reporting paths

Prisma is not forced into the dispatch engine.

That is deliberate. Dispatch, reassignment, and capacity filtering are latency-sensitive and domain-heavy. Those code paths are better kept in repository-controlled persistence where raw SQL remains available when needed.

Recommended rule:

- use Prisma for schema management and standard table access
- keep dispatch-heavy queries under explicit repositories

## Generic Container Workflow

From `backend/`:

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run check
npm test
npm start
```

## Cloud Run Example

Cloud Run is optional, not required.

Typical setup:

1. Build a container from `backend/`.
2. Attach a managed Postgres instance or external Postgres.
3. Inject environment variables and secrets.
4. Mount the Firebase service account secret or provide it via secret manager.
5. Set the service port to match `PORT`.

Important:

- do not rely on local file-backed storage in Cloud Run
- use Postgres only
- keep `ADMIN_API_KEY`, `METRICS_API_KEY`, and Firebase credentials in secrets, not repo files

## If You Do Not Use Cloud Run

The same environment contract still works.

You only need:

- a Node.js runtime
- Postgres connectivity
- secret injection for Firebase Admin and runtime secrets
- outbound internet access for FCM and optional Google Routes

## Pre-Go-Live Commands

- `npm run check`
- `npm test`
- `npm run smoke:deploy`
- if you have an isolated Postgres test database: `npm run test:postgres`

## Current Deployment Notes

- in-memory rate limiting is fine for one backend instance but not ideal for horizontally scaled abuse control; set `REDIS_URL` only when scale requires shared distributed limiting
- background location handling still needs full iOS validation on macOS hardware; see `docs/IOS_BACKGROUND_VALIDATION.md`
- the backend code is in much better shape now, but real production confidence still depends on the staged and live validation steps in [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)
