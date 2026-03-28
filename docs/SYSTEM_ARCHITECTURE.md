# System Architecture

## Scope

This repository currently contains three product surfaces backed by one shared backend:

- Flutter driver mobile app in the repo root
- Node.js backend in [backend](/c:/dev/DriverApp/backend)
- backend-served web portals in [backend/public](/c:/dev/DriverApp/backend/public)
  - admin portal
  - merchant portal
  - restaurant portal

## Architectural Principles

### 1. Server-owned dispatch

The backend owns:

- driver eligibility
- nearest-driver selection
- merchant/store dispatch scope
- capacity checks
- reassignment after reject or timeout
- order payout and billing snapshotting

Clients do not decide dispatch.

### 2. Clear role separation

Current role boundaries:

- driver: delivery execution only
- restaurant staff: one store only
- merchant user: all stores under one merchant or franchise group
- platform admin: global operational control

### 3. Loosely coupled infrastructure seams

The backend is structured so these concerns can evolve independently:

- storage provider
- ETA provider
- push provider
- rate limiter provider
- read model provider
- web portal clients

## Backend Structure

### Bootstrap

- [server.ts](/c:/dev/DriverApp/backend/src/server.ts)
- [app.ts](/c:/dev/DriverApp/backend/src/app.ts)

Responsibilities:

- config loading
- Fastify bootstrap
- store/provider selection
- route registration
- metrics and security hooks
- dispatch cycle scheduling

### Facade

- [backend-service.ts](/c:/dev/DriverApp/backend/src/services/backend-service.ts)

Responsibility:

- stable application-facing API used by routes and portal surfaces

### Workflow Services

- auth workflow
- admin workflow
- merchant workflow
- driver workflow
- restaurant workflow

These split the business logic by operational area instead of keeping one oversized service.

### Runtime Boundary

- [backend-runtime.ts](/c:/dev/DriverApp/backend/src/services/backend-runtime.ts)

Responsibilities:

- store access boundaries
- session cleanup
- audit writes
- notification flush after mutation

### Dispatch Engine

- [dispatch-service.ts](/c:/dev/DriverApp/backend/src/services/dispatch-service.ts)

Responsibilities:

- dispatch ranking
- reassignment
- capacity checks
- stale-location filtering

## Persistence Model

### Local development

- file-backed store using [db.json](/c:/dev/DriverApp/backend/data/db.json)

### Production-shaped mode

- Postgres-backed store
- Prisma schema and migrations
- repository-driven write-side access where explicit control matters

Design intent:

- Prisma owns schema evolution and standard CRUD-friendly access
- explicit repositories remain available for dispatch-sensitive operational paths

## Realtime Model

### Driver app

- backend-driven FCM offer notification
- API-based state refresh after notifications and lifecycle changes
- live location POSTs while online or on active order

### Web portals

- restaurant and merchant portals use SSE for realtime updates
- admin portal is operational and refresh-driven

## ETA Model

Default behavior:

- low-cost ETA using known locations and backend estimates

Optional upgrade:

- Google Routes API when `GOOGLE_MAPS_API_KEY` is configured

Recommended current usage:

- restaurant and merchant ETA visibility
- not dispatch ranking itself

## Security Model

Implemented currently:

- password hashing
- session expiry and rotation
- secure token storage in Flutter mobile app
- route-level auth per role scope
- rate limiting
- audit logs
- allowlisted CORS
- optional protected metrics endpoint
- basic CSP and security headers for backend-served portals

## Remaining Non-Code Dependency

The architecture is in good shape, but full readiness still depends on:

- hosted secrets and env setup
- real-device Android validation
- iOS/macOS validation
- monitoring and alert ownership

Use:

- [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
- [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)
