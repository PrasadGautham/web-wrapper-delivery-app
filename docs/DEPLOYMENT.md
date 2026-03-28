# Deployment Guide

## Goal

This guide explains how to move from local mode to deployed mode without changing code.

The system is designed so production deployment is mainly an environment and infrastructure step.

## Local Mode Versus Deployed Mode

Local mode can run with:
- file-store adapter
- in-memory rate limiter
- noop password-reset notifier

Production mode should run with:
- Postgres
- production secrets
- production web origins
- secure cookie settings
- production Firebase Admin credential
- optional SMTP
- optional Redis only if multi-instance shared rate limiting is needed

## Minimum Production-Shaped Deployment Inputs

Required:
- `DATABASE_URL`
- `SESSION_SECRET`
- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `ALLOWED_WEB_ORIGINS`
- secure cookie envs

Recommended:
- `METRICS_API_KEY`
- SMTP settings
- alert webhook settings

## Runtime Model

You can keep the same codebase and switch deployment behavior by env only.

No code change should be required to go from local file-store mode to Postgres-backed mode. For local Windows testing, keep your real `DATABASE_URL` in `backend/.env.local-postgres` and use `start-local-postgres.ps1`.

Important:
- normal startup must preserve existing data
- database reset must be an explicit operator action
- production deployment must never reseed or wipe the live database on boot

## Basic Deployment Steps

1. provision Postgres
2. set environment variables
3. run Prisma generate and migrations
4. start backend in deployed mode
5. verify health, auth, and portal flows
6. verify driver app against deployed backend

## Commands

```powershell
cd C:\dev\DriverApp\backend
npm install
npm run prisma:generate
npm run check
npm test
npm run smoke:deploy
```

## Final Hosted Checks

- admin login works
- merchant login works
- restaurant login works
- SSE updates work over hosted origin
- driver app can log in and go online
- order created in restaurant portal reaches eligible driver
- delivery completion updates merchant and restaurant views

## Notes

- Cloud Run is one valid deployment target, but not mandatory
- Redis is not required for single-instance production
- Android-first go-live is acceptable
- iOS validation remains separate
