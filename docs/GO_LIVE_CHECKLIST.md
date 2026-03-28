# Go Live Checklist

## Business Checklist

- admin users confirmed
- merchant users confirmed
- restaurant staff users confirmed
- store pricing rules confirmed
- driver assignment rules confirmed
- reporting expectations confirmed

## Technical Checklist

- backend running on Postgres
- health endpoint verified
- metrics endpoint verified
- Firebase Admin credential configured
- production web origins configured
- session security configured
- password reset path configured or intentionally disabled

## Portal Checklist

- admin portal login and logout verified
- admin can update store commercial terms
- admin can update driver settings
- merchant can see only owned stores
- merchant can update owned-store settings
- restaurant can create orders
- merchant and restaurant live updates verified

## Driver Checklist

- Android release build verified
- driver login verified
- location permission and sync verified
- online toggle verified
- incoming order verified
- accept, pickup, deliver verified
- earnings update verified

## Final End-To-End Checklist

1. create order in restaurant portal
2. confirm eligible driver receives it
3. accept on driver app
4. confirm merchant and restaurant live updates
5. complete delivery
6. confirm reporting and earnings update

## Current Launch Note

Current supported launch assumption:
- Android production rollout

iOS remains a separate validation and release track.
