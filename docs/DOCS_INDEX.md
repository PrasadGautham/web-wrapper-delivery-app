# Documentation Index

## Purpose

This document is the main entry point for understanding the project.

Use it if you are new to the repository and want to know:
- what the system includes
- which document to read first
- where backend, portal, mobile, deployment, and business documentation live

## Recommended Reading Order

### 1. Start Here

- [README.md](/c:/dev/DriverApp/README.md)
  High-level product summary, role model, local run commands, and core verification commands.

- [PROJECT_STATUS.md](/c:/dev/DriverApp/docs/PROJECT_STATUS.md)
  Current implementation status, scope, and what is verified right now.

### 2. Business And Product Understanding

- [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md)
  Business model, role responsibilities, feature surfaces, and end-to-end test flows.

### 3. Local Development And Daily Use

- [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md)
  Local setup, Postgres startup, Flutter startup, and local verification.

- [DEPLOY_CHECKS.md](/c:/dev/DriverApp/docs/DEPLOY_CHECKS.md)
  Which checks to run before a normal deployment, before a release candidate, and before first production launch.

### 4. Backend And Architecture

- [BACKEND.md](/c:/dev/DriverApp/docs/BACKEND.md)
  Backend behavior, auth model, dispatch rules, market settings, and portal behavior.

- [SYSTEM_ARCHITECTURE.md](/c:/dev/DriverApp/docs/SYSTEM_ARCHITECTURE.md)
  System structure, runtime boundaries, dispatch ownership, and infrastructure seams.

### 5. Deployment And Production Readiness

- [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
  How to move from local mode to deployed mode.

- [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
  Required and recommended production environment values.

- [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)
  Operational go-live checklist.

- [FINAL_GO_LIVE_GAPS.md](/c:/dev/DriverApp/docs/FINAL_GO_LIVE_GAPS.md)
  Remaining non-code gaps after the current implementation and verification pass.

- [PRODUCTION_READINESS.md](/c:/dev/DriverApp/docs/PRODUCTION_READINESS.md)
  Honest readiness summary and current production scope.

### 6. Mobile Release Track

- [RELEASE.md](/c:/dev/DriverApp/docs/RELEASE.md)
  Android release guidance.

- [IOS_LATER.md](/c:/dev/DriverApp/docs/IOS_LATER.md)
  Deferred iOS work.

- [IOS_BACKGROUND_VALIDATION.md](/c:/dev/DriverApp/docs/IOS_BACKGROUND_VALIDATION.md)
  iOS background and native validation notes.

## Portal Quick Access

- Platform admin portal: `http://127.0.0.1:8080/platform-admin`
  Demo users: `admin@demo.com` / `Password123`, `platform.ops@demo.com` / `Password123`
- Tenant admin portal: `http://127.0.0.1:8080/tenant-admin`
  Demo users: `desertfleet.admin@demo.com` / `Password123`, `metrofleet.admin@demo.com` / `Password123`
- Merchant portal: `http://127.0.0.1:8080/merchant`
  Demo users: `falafel.group@demo.com` / `Password123`, `falafel.ops@demo.com` / `Password123`
- Restaurant portal: `http://127.0.0.1:8080/restaurant`
  Demo users: `falafel.dispatch@demo.com` / `Password123`, `falafel.owner@demo.com` / `Password123`
- Driver app demo user: `driver@demo.com` / `Password123`

Seed source: [seed.json](/c:/dev/DriverApp/backend/data/seed.json)
Current seeded tenants:
- `tnt_fleet_001` = `Desert Fleet Services`
- `tnt_fleet_002` = `Metro Fleet Partners`

Only use `/platform-admin` and `/tenant-admin` for admin access. `/admin` is no longer supported.

## Quick Role Map

- Admin and fleet operations: [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md)
- Merchant-group operations: [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md)
- Restaurant store staff: [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md)
- Driver Android app: [RELEASE.md](/c:/dev/DriverApp/docs/RELEASE.md), [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md)
- Backend implementation: [BACKEND.md](/c:/dev/DriverApp/docs/BACKEND.md), [SYSTEM_ARCHITECTURE.md](/c:/dev/DriverApp/docs/SYSTEM_ARCHITECTURE.md)

## Quick Task Map

- I want to run the system locally:
  [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md)

- I want to understand how dispatch and pricing work:
  [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md)
  [BACKEND.md](/c:/dev/DriverApp/docs/BACKEND.md)

- I want to prepare a deployment:
  [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
  [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
  [DEPLOY_CHECKS.md](/c:/dev/DriverApp/docs/DEPLOY_CHECKS.md)

- I want to know what is still not fully complete:
  [FINAL_GO_LIVE_GAPS.md](/c:/dev/DriverApp/docs/FINAL_GO_LIVE_GAPS.md)
  [PRODUCTION_READINESS.md](/c:/dev/DriverApp/docs/PRODUCTION_READINESS.md)
