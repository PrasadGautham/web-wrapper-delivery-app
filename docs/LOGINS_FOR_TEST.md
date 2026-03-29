# Logins For Test

Source of truth:
- [seed.json](/c:/dev/DriverApp/backend/data/seed.json)

Important:
- this file lists seeded demo accounts only
- stores, merchant groups, or users created later through the admin portals will not appear here automatically
- for runtime-created restaurants, the login email is whatever was entered at creation time, but the original plaintext password is not recoverable from the database because passwords are stored as hashes

Shared password for all seeded demo users:
- `Password123`

## Platform Admin

URL:
- `http://127.0.0.1:8080/platform-admin`

Accounts:
- `admin@demo.com` - Platform Admin
- `platform.ops@demo.com` - Ops Lead

## Tenant Admin

URL:
- `http://127.0.0.1:8080/tenant-admin`

Accounts:
- `desertfleet.admin@demo.com` - Desert Fleet Admin
- `metrofleet.admin@demo.com` - Metro Fleet Admin

## Merchant Portal

URL:
- `http://127.0.0.1:8080/merchant`

Accounts:
- `falafel.group@demo.com` - Falafel Group Owner
- `falafel.ops@demo.com` - Falafel Group Manager
- `burger.group@demo.com` - Burger Collective Owner

## Restaurant Portal

URL:
- `http://127.0.0.1:8080/restaurant`

Accounts:
- `falafel.owner@demo.com` - Falafel Owner
- `falafel.dispatch@demo.com` - Falafel Dispatch
- `burger.owner@demo.com` - Burger Owner
- `burger.manager@demo.com` - Burger Manager

## Driver App

Accounts:
- `driver@demo.com` - Alex Driver
- `nadia@demo.com` - Nadia Rider
- `omar@demo.com` - Omar Flex

## Tenant Mapping

Desert Fleet Services:
- `desertfleet.admin@demo.com`
- `falafel.group@demo.com`
- `falafel.ops@demo.com`
- `falafel.owner@demo.com`
- `falafel.dispatch@demo.com`
- `driver@demo.com`
- `omar@demo.com`

Metro Fleet Partners:
- `metrofleet.admin@demo.com`
- `burger.group@demo.com`
- `burger.owner@demo.com`
- `burger.manager@demo.com`
- `nadia@demo.com`
