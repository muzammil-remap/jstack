# BACKEND_HANDSHAKE — fill this in, hand it back to Josh

**REMAP:** do `HANDOVER.md` §4 first — the base URL, your token issuance in `AUTH.getToken()`
(`jstack-app/data/config.ts`), the CSP. Then send this to Josh: Claude maps any deviation in
`jstack-app/data/ApiAdapter.ts` and re-runs the acceptance suite against your server as the go-live
gate. Aim for the exact routes (§4) and camelCase shapes (§3, `jstack-app/data/types.ts`); silent
differences become test failures with your name on them. A bare § is `CONTRACT.md`'s.

## 1. Server

- Base URL (§4): `https://________________/api/v1`
- TLS: public cert? ☐ yes ☐ no (provide the CA) · any SPKI pins for `jstack-app/data/pins.ts`: `________`
- Liveness (GET, no auth, 200) outside the API — `GET /health` is Josh's Health section (§4.7): ☐ `https://<host>/healthz` ☐ other: `________`
- API origin: ☐ same-origin ☐ `https://________` (in `connect-src`, `HANDOVER.md` §4 step 2, and CORS)
- `node jstack-app/tools/conformance.mjs <base URL>` is green: ☐ (summary in section 8)

## 2. Auth (§4.1; §8 Q9, Q12, Q20)

- `AUTH.getToken()` written: ☐ commit: `________` · token: ☐ JWT ☐ other: `________`
- Token lifetime (the app assumes `tokenTtlSeconds: 900`, a 12-hour session): `______`
- First token, the exact requests (`GET /auth/nonce`, `POST /auth/register-device`, `POST /auth/webauthn/{step}`):

```
________________________________
```

- Refresh (`POST /auth/refresh`): rotation, reuse (`401 { reason: "reuse" }`), custody: `________`
- What the server verifies in `nonce` + `biometricAssertion` (`POST /devices/{id}/revoke`, `POST /lock`, `POST /recover`, `PUT /agents/caps`): `________`
- A test token for the QA run (or how to mint one):

```
________________________________
```

## 3. Sample responses (real JSON, one per family)

- `GET /session` (§4.1) →
- `GET /today` (§4.2) →
- `POST /actions/{id}` with `{ verb: "approve" }` (§4.3) →
- `GET /calendar?view=week&anchor=YYYY-MM-DD` (§4.4) →
- `GET /tasks?view=gantt` + `PATCH /tasks/{id}` (§4.5, §4.15) →
- `POST /brain/dump` twice with one `offlineId` + `GET /brain/latest` (§4.6, §4.12) →
- `GET /search?q=` (§4.19) →
- `GET /life` + `POST /habits/{id}/log` (§4.7) →
- `GET /agents/summary` + `GET /agents/feed` + `GET /security/checks` (§4.8) →
- `GET /settings/notifications` + `GET /capabilities` (§4.9) →
- `GET /sections` (§4.10) + `GET /parameters` (§4.14) →
- `GET /files` (§4.17) →

## 4. Deviations from the contract (none is the right answer)

| Contract says | Your server does | Why |
|---|---|---|
| | | |

## 5. Behaviour confirmations (tick each — the suite tests all of them)

- ☐ `PUT /settings/notifications/{id}` on the locked `security` group → **423** (§4.9)
- ☐ A `t1` record is never served → **403** `{ reason }` (§1.8)
- ☐ Captures (`offline: true` in `jstack-app/data/routes.ts`) dedupe on `offlineId` → `{ duplicate: true }` (§1.12)
- ☐ `POST /calendar/propose` only drafts; nothing is ever sent (§4.4)
- ☐ No send, pay, book or revoke verb in any agent grant (§1.1)
- ☐ At most 5 open Needs-you cards (§1.4)
- ☐ `POST /actions/{id}/undo` after the 10-second window → **409** (§4.3)
- ☐ `PATCH /tasks/{id}` with `endsAt` before `startsAt` → **422** (§3)
- ☐ `PUT /brain/items/{id}` keeps versions (`GET /brain/items/{id}/versions`) (§4.6)
- ☐ `PUT /layout/{tab}` hiding a pinned section → **422** (§4.9)
- ☐ Any write while the session is locked → **401** (§4.12)

## 6. Voice and push (§4.11, §4.13; §8 Q4–Q6, Q19)

- Voice provider: `________` · cost/hour: `______` · takes `audio/mp4` and `audio/webm;codecs=opus`: ☐ (not ready at go-live? say so)
- Web Push: `pushPublicKey` served: ☐

## 7. Habit cutover readiness (do NOT run before go-live QA — MIGRATION_PLAN.md)

- Import lands: ☐ direct DB (Postgres URL for the run) ☐ via API (`PUT /habits`, `POST /habits/{id}/log`)
- Who runs it, when: `________`

## 8. Anything else Claude should know

(conformance summary, rate limits, staging vs prod, test tenant, log access…)

```
________________________________
```
