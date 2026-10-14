# Present — classroom attendance MVP

A runnable mobile-first attendance app: Next.js/React, server APIs, SQLite (Node's built-in driver), signed rotating QR codes, and Leaflet/OpenStreetMap maps. Requires **Node 24+**.

## Run locally

```sh
npm ci
# Optional: copy .env.example to .env.local, replace secret/password.
# For desktop simulation set ENABLE_SIMULATION=true in .env.local.
npm run dev
```

Open the app on port 3000. Teacher demo password is `teacher-demo` when not configured. Create a session, display its QR, and scan on a phone. Demo students are `S001 / Demo Student 1` through `S025 / Demo Student 25`; the teacher roster shows all accounts. New courses enroll all demo students in this MVP.

Seed course: **LAWS7701 — Data Applications and Regulation in Digital Society** (25 fake students). Session form defaults to **E32-G007**, with **0, 0 placeholder coordinates**. These are NOT the real classroom coordinates. Replace latitude/longitude with instructor-verified coordinates before class. The instructor can choose start time and duration (end = start + duration), normal/review radii, and maximum adjustment. Defaults are 3 minutes, 100 m, 300 m, and 50 m.

Student flow: scan → identify → request location → inspect/adjust marker → confirm. A code expires 20 seconds after issuance (or earlier at session end). If login or GPS retrieval takes longer, rescan the current QR; do not reuse the old tab's token. In development the desktop simulator can place a fix 0, 150 or 400 m north of the classroom. Simulations are server-gated, flagged in records, and disabled in production.

**Phone geolocation requires HTTPS.** HTTP localhost works on the same device; a phone accessing a laptop's plain HTTP LAN address generally cannot use browser geolocation. Use a trusted HTTPS reverse proxy for phone testing. Set the external origin correctly so QR links point to that HTTPS address.

## Commands and validation

```sh
npm test
npm run typecheck
npm run build
npm start
# In a separate run, with no other server on port 3100:
npm run smoke
npm run db:prune
```

Tests cover Haversine calculations, expiration and tampering, server rejection of expired codes, correction limits, boundaries, malformed/stale locations, poor accuracy, teacher/student permissions, duplicate submissions, CSV and retention. There is no separate lint configuration; TypeScript and the production build are the static checks.

## Architecture / schema

- `app/page.tsx`: teacher login, course/session creation, large QR projection, live polling, summary, anomaly filters, sorting, roster, CSV, location map.
- `app/student/page.tsx`: student identity, one-shot high-accuracy browser geolocation, draggable correction marker, status receipt, optional desktop simulator.
- `app/api/[...path]/route.ts`: Node-only server API, authentication, validation, attendance classification and export.
- `lib/auth.ts`: replaceable demo identity adapter. Cookies are HttpOnly, SameSite=Lax, signed and expire after eight hours; Secure in production.
- `lib/core.ts` / `lib/geo.ts`: signed tokens, validation and Haversine.
- `lib/db.ts`: parameterized SQLite persistence; WAL and unique student/session constraint.
- `migrations/001_initial.sql`: initial idempotent schema, foreign keys and indexes, user_version=1. Future schema changes require sequential versioned migrations.
- `scripts/prune.ts`: clears precise raw/corrected coordinates while retaining aggregate attendance records.

SQLite is created automatically at `data/attendance.sqlite`. Tables: courses, students, enrollments, sessions, attendance. Attendance stores student/course/session IDs, server submission time, browser fix timestamp, raw and corrected coordinates, accuracy, correction distance, classroom distance, QR identifier, status, poor-accuracy and simulation flags. Keep SQLite data outside the public directory. The data-access module isolates persistence for later PostgreSQL migration; replacing the driver requires SQL migration and a distributed rate-limit backend.

## QR and server validation

QR contains only a signed opaque session reference, random 128-bit token identifier, token type and expiry. It contains no student identity, classroom name or coordinates. HMAC-SHA256 integrity and expiry are checked on the server using a constant-time signature comparison. Tokens can be shared among students during their short valid interval, as intended; each student can submit once per session. Expired tokens and tokens used outside the session window are rejected.

Every submission validates numeric ranges, timestamp freshness (last two minutes, at most ten seconds future), nonnegative accuracy, enrollment, correction distance and session limits. The server recalculates both distances using Haversine. Corrected distance <= normal radius is NORMAL, <= review radius is REVIEW, otherwise REJECTED. Accuracy > normal radius flags the record without automatically rejecting it. Dashboard checked-in count includes NORMAL and REVIEW; REJECTED remains absent. Invalid token/correction requests are errors, not attendance records; valid submissions outside the fence are recorded as REJECTED. Duplicate submissions return HTTP 409.

Basic per-identity write rate limits and a global demo login limiter run in memory; production behind multiple instances needs shared limits and trusted client IP handling. Same-origin checks protect cookie-authenticated writes. Inputs use Zod and SQL is parameterized; CSV escapes spreadsheet formula prefixes. Teacher-only endpoints protect roster, coordinates, records and exports. Do not publicly expose the demo identity system as trustworthy attendance authentication.

## Privacy and limitations

Location is requested only when the student presses Allow location. No watchPosition, background tracking or continuous collection. Raw and corrected points are kept separately and never overwritten by marker adjustment. Defaults to 30-day precise-coordinate retention. Teacher record reads apply pruning; schedule `npm run db:prune` daily for deletion even when nobody opens the dashboard. Metrics, status, token identifier and identity remain; implement institutional record deletion and backup expiry policy separately. OpenStreetMap tile requests reveal viewport/network information to the tile provider; retain attribution and comply with its usage policy. Map tiles require an Internet connection; allow a.tile.openstreetmap.org, b.tile.openstreetmap.org and c.tile.openstreetmap.org in restricted cloud network settings. The current cloud proxy returned HTTP 403 for tile access, so basemap imagery was not verified here; map markers, fences and submission were verified. GPS confirmation and server checks remain available if tiles fail.

Demo ID/name authentication is intentionally low assurance and permits impersonation. GPS payloads can be forged; the app cannot prove device presence or prevent sophisticated GPS spoofing. QR screenshots remain usable during the short validity window. Geofencing and teacher review provide deterrence, not proof. Indoor GPS and device permissions can fail; instructors must have a manual exception workflow. This MVP records anomalies but does not yet support teacher status overrides. Under-ten-second completion is a UX target, not a measured guarantee.

## University SSO

Replace `demoStudent` and the student login API with a server-side OAuth/OIDC callback or SAML assertion validation. Validate issuer, audience, signature, state/nonce and expiration; map verified claims to institution-managed student IDs, enforce enrollment and continue issuing the same role-scoped session cookie. Add a teacher identity provider and role policy. Never trust a client-supplied student ID as an authenticated claim. No University of Macau endpoints or credentials are assumed.

## Production deployment

1. Install Node 24+, `npm ci`; run tests, typecheck and build.
2. Set a random AUTH_SECRET of at least 32 characters and a strong TEACHER_PASSWORD of at least 12 characters. Generate the secret securely with `openssl rand -hex 32`. Do not commit secrets. Production refuses missing/default secrets when authentication is used.
3. Disable simulation; replace demo authentication with verified institutional identity before real student use. Configure actual classroom coordinates and roster.
4. Run `npm start` under a process manager. Terminate trusted HTTPS at a reverse proxy and forward requests preserving the same external Origin/Host. Ensure app is served at the public QR origin. Expose only HTTPS to students, restrict internal API/server ports, and configure appropriate secure headers at the proxy.
5. Mount persistent writable storage for DATABASE_PATH, backed up securely. Use one application instance for SQLite/in-memory limits. Start from the repository root so migration paths resolve. Schedule retention pruning and backup expiry. Protect teacher credentials and CSV exports. Switch to PostgreSQL and shared rate limits before horizontal scaling.

No production deployment, SSO integration or measured classroom trial is implied by local tests.
