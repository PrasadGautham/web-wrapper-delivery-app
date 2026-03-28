# Production Environment Checklist

## Purpose

Use this when preparing staging or production environment values.

## Required Backend Values

- `DATABASE_URL`
- `SESSION_SECRET`
- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `ALLOWED_WEB_ORIGINS`
- `WEB_SESSION_COOKIE_SECURE`
- `WEB_SESSION_COOKIE_SAME_SITE`

## Recommended Backend Values

- `METRICS_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- alert webhook envs if used

## Optional Values

- `GOOGLE_MAPS_API_KEY` for traffic-aware ETA
- `REDIS_URL` only if multi-instance shared rate limiting is needed

## Portal-Related Notes

- browser portals should use hosted HTTPS origins
- allowed origins must match actual admin, merchant, and restaurant portal hosts
- cookie security settings should match the target environment

## Mobile-Related Notes

- backend URL must point to deployed backend
- Firebase app config must match deployed project
- Android signing and release configuration must be prepared before store release

## Secrets Handling

- do not commit secrets into the repo
- keep Firebase Admin JSON outside the repo
- keep production env files outside the repo or in a secure secret manager
