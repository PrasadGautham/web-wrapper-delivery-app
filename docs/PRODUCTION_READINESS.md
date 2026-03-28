# Production Readiness

## Honest Status

The current system is in strong pilot or early-production shape for an Android-first rollout.

## Strong Areas

- backend architecture is production-shaped for current scale
- store and driver policy controls are implemented
- separate driver pay and store charge model is implemented
- browser auth uses HttpOnly cookie sessions
- driver app uses secure token storage
- browser E2E portal coverage exists
- backend checks and tests are in place

## Remaining Non-Code Production Work

- deploy with Postgres and production env values
- validate hosted origins and HTTPS behavior
- validate Android app against hosted backend
- validate alerting in the actual hosted environment

## Android

Android is a valid current production target after deployment validation.

## iOS

iOS is not currently production-ready from this Windows-only setup because native validation still requires:
- macOS
- Xcode
- APNs validation
- real iPhone testing

## Operational Notes

- Redis is not required for single-instance production
- SMTP is optional until email password reset is required in production
- Google traffic-aware ETA is optional

## Security Notes

Current security posture is good for this stage:
- browser portals use HttpOnly cookie sessions
- Flutter uses secure device storage
- cookie SameSite and Secure settings are env-driven
- admin API-key fallback can be disabled and should stay disabled in production
- CSP reporting, metrics protection, and frame protection are implemented

Remaining production security work is mainly operational:
- production secret management
- hosted TLS and origin validation
- Firebase service-account protection
- monitoring and alert routing
