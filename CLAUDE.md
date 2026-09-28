# CLAUDE.md — REMAP's work on JSTACK (read before `jstack-app/CLAUDE.md`)

This file sits at the repo root, which plays the role of the client's `jstack-app-source/` folder, one level above the app. It sets **REMAP's current scope**. The app's own `jstack-app/CLAUDE.md`, `AGENTS.md` and `CODEMAP.md` still govern *how* to change code (boundaries, gates, never-list). Where they conflict with this file about *what* to build, this file wins.

## 1. What this is

- **JSTACK** is a finished Expo 54 / React Native Web app (v1.1.0 in `jstack-app/package.json`), built by the client, Josh. Five tabs (Today, Tasks, Brain, Life, Agents) plus Settings and Find. It currently runs on an in-process mock backend with fixture data.
- **The UI is the source of truth.** Don't redesign, restyle or rebuild screens. `jstack-mock-v15.html` (this folder) is the same app on fixture data. Open it from disk and click "Continue — passkeys unavailable here, mock sign-in".
- **REMAP's job (now):** make the app show **Josh's real data, read-only**, by calling his existing **n8n webhooks** directly. There is **no backend server to build**. An OpenClaw agent (managed by another REMAP developer) already uses the same n8n workflows as tools for Josh's Telegram assistant. That Telegram/OpenClaw side is out of scope; don't break it.

## 2. How Josh's docs relate to this scope

The docs in this folder (`HANDOVER.md`, `BACKEND_HANDSHAKE.md`, `CONTRACT.md`, `SECURITY.md`, `DEPLOY.md`, `KNOWN_GAPS.md`, `DECISIONS.md`, the acceptance/audit/QA files) describe the **full V2 plan**. In that plan REMAP builds a complete server: passkey auth, sessions, all 135 routes, writes and the security checklist.

**We are not doing that now.** Use those docs as reference for:
- what each route returns (`CONTRACT.md` §3–§4, `jstack-app/openapi.yaml`, `jstack-app/data/types.ts`)
- which system owns each record (`CONTRACT.md` §2, `HANDOVER.md` §6: Twenty = tasks, Google Calendar = events, Dropbox = files, LiteLLM/OpenClaw = runs and spend)

Don't delete or rewrite Josh's docs. Record our deviations in `jstack-app/../DECISIONS.md` as new ADRs (next free number after ADR-75).

## 3. Architecture — a third transport, not a server

The app already has exactly one seam for this. `jstack-app/data/transport/Transport.ts` defines:

```ts
type Transport = (req: { method, path, query?, body?, multipart? }) => Promise<{ status: number; json: unknown }>;
```

`data/provider.ts` wraps either `httpTransport` (real server) or `mockTransport` (in-process mock) and hands it to `ApiAdapter`. Stores call `getAdapter()`, and components read stores. **Nothing above `data/` knows which transport is live.**

We add **`data/transport/n8n.ts`: `n8nTransport`**. It is a route-by-route dispatcher:

| Route kind | What `n8nTransport` does |
|---|---|
| **Wired GET** (has a row in the webhook registry) | Calls the n8n webhook, validates the raw payload, maps it into the contract shape from `data/types.ts`, returns `{ status: 200, json }` |
| **Derived GET** (e.g. `/today`, `/life`, `/agents/summary`) | Assembles the composite from other wired routes, sharing one in-flight call per webhook so a page load doesn't run a workflow twice |
| **Default GET** (app configuration: `/session`, `/capabilities`, `/layout/*`, `/focuses`, `/parameters`, `/settings/*`, `/portals`…) | Returns a static, honest default. No fixture text that reads as something Josh wrote. |
| **Not-yet-wired GET** | Returns a contract-valid **empty** response (`[]`, empty composite), so the section shows its empty state, never fake data |
| **Any write** (POST/PUT/PATCH/DELETE) | Refused: `{ status: 403, json: { reason: "read-only" } }`. Never reaches n8n. |

Mode switch in `data/config.ts`: `EXPO_PUBLIC_DATA_SOURCE = "mock" | "http" | "n8n"` (default `mock`, so every existing test keeps running on the mock). In `n8n` mode the app must behave as a real build, not the mock. Audit every `USE_API_ADAPTER` read (for example `components/chrome/Gate.tsx` hides the mock sign-in, and `data/provider.ts` adds reachability) and decide each one explicitly.

Code layout for the new work (all under `jstack-app/data/n8n/` unless noted):

```
data/transport/n8n.ts      the dispatcher (the Transport)
data/n8n/registry.ts       route → { kind, webhook?, adapter? }   one row per GET route
data/n8n/client.ts         fetch a webhook: timeout (API_TIMEOUT_MS), no retries on 4xx, plain GET
data/n8n/adapters/*.ts     one per webhook: raw guard + toContract()
data/n8n/defaults.ts       the static config responses
data/n8n/empty.ts          contract-valid empty responses
tests/unit/n8n*.test.ts    adapters against saved samples; every GET route validated against openapi.yaml
tests/fixtures/n8n/*.json  real webhook samples (redacted)
```

`data/n8n/` sits under `data/` because only `data/` may know which server it's talking to (CT-03).

## 4. Hard rules (ours, on top of `AGENTS.md`)

1. **Read-only.** No write ever leaves the browser. This matches the app's own rule of never sending, paying, booking or revoking.
2. **Contract shapes only.** Raw n8n JSON never reaches a store. Every webhook gets an adapter; its output must validate against that route's response schema in `openapi.yaml`. Reuse `data/mock/schemaValidate.ts` / `tools/schema-validate.mjs`; don't add a validation library (no new dependencies).
3. **No fake data in `n8n` mode.** Fixtures stay in the mock. An unwired section is empty, not demo content.
4. **Don't change shared n8n workflows** that OpenClaw uses. If a workflow's output isn't structured enough (text summaries, missing ids or timestamps), ask for a **separate dashboard webhook** that reuses the workflow (Execute Workflow node). Don't parse prose.
5. **Dates:** the app is Brisbane, held as UTC fields. All date work goes through `lib/time.ts` (see `CODEMAP.md` §6). Adapters emit ISO 8601 UTC strings, as `data/types.ts` specifies.
6. **Mock mode stays at baseline.** Run `pnpm codemap && pnpm check && pnpm lint && pnpm test`, `JSTACK_TZ=Australia/Brisbane pnpm test` and `node tools/build-web.mjs`. They must add no new failures beyond the setup baseline (§6). Never edit an existing test to make it pass.
7. **Keep the maps honest.** New files show up in `pnpm codemap`. Add a hand-written `CODEMAP.md` paragraph for the n8n transport (it's a new convention), and an ADR in `DECISIONS.md`.

## 5. Networking and security (decide before go-live)

- The production CSP is `connect-src 'self'` (`jstack-app/public/_headers` and `vercel.json`, kept identical by `tests/unit/pwa.test.ts`). A browser call to another origin is blocked.
- **Preferred: same-origin proxy.** Serve the built app and forward a path to n8n from the same host (e.g. nginx on the Ubuntu server: `location /n8n/ { proxy_pass https://<n8n-host>/webhook/; }`). Then:
  - the CSP stays as it is
  - no CORS setup is needed
  - the n8n host isn't exposed
  - one HTTP Basic Auth on the whole site becomes the real access control

  `EXPO_PUBLIC_N8N_BASE_URL=/n8n`.
- **Alternative: direct.** Add the n8n origin to `connect-src` in both header files, and enable CORS on every webhook. Send plain GETs with no custom headers, so there's no preflight.
- **Anything in the browser bundle is public**, including webhook URLs and any header token. The passkey lock screen runs only on the device (`lib/webauthnGate.ts`); it protects the screen, not the data. So the webhooks, or the proxy in front of them, need their own protection.
- The app refuses to call APIs from a non-HTTPS origin (except localhost). Serve over HTTPS.

## 6. Folder layout and the setup baseline

```
<repo root>/                (= the client's jstack-app-source/)
  CLAUDE.md                 ← this file
  remap/SETUP-PROMPT.md     how this repo was assembled from the downloaded folders
  remap/KICKOFF-PROMPT.md   the n8n work, in phases
  remap/WEBHOOKS.md         the webhook registry (fill in as webhooks arrive)
  remap/PROGRESS.md         setup results and progress log
  HANDOVER.md … (Josh's docs, reference only)
  jstack-mock-v15.html      the app on fixture data
  jstack-app/               the app (pnpm commands run from here)
```

We have **no GitHub access** to the client's repo. This repo was assembled from a download of his server (`remap/SETUP-PROMPT.md`). The app's `CLAUDE.md` mentions a check ending in `JStack/App/App`; that's his original path, so ignore it.

**Known gaps in the download:** root `.github/`, `.githooks/`, `history/`, `appendix/` and `diagrams/`, and the original `jstack-app/.npmrc` (reconstructed as `node-linker=hoisted` + `minimum-release-age=4320`). So:
- `pnpm test` has a **baseline of 18 failing suites**, all documentation/CI checks that read those missing paths, plus the codemap freshness check. The exact list is in `remap/PROGRESS.md`.
- **A change is only "green" if it adds no new failure to that baseline.** Never fix a baseline failure by editing its test or inventing the missing document.
- There's no pre-commit hook in this copy, so run `pnpm codemap` yourself before committing.

## 7. Working style

- Work in the phases of `remap/KICKOFF-PROMPT.md`. Stop at each checkpoint with a short report.
- Wire webhooks **one at a time**: sample → adapter → test → registry row flipped to live → check in the browser.
- When unsure whether data has a home in the UI, ask. Don't invent sections. (Open example: Twenty CRM "client updates" have no dedicated section. The nearest fit is Life › People; Josh decides.)
