# CHANGESET.md — every file REMAP changed or added, and why

One line per file. Newest phase first. Josh's own files are named with what was added to them; nothing of his was removed or rewritten.

**Generated files** are marked **regenerate in the target repo, don't port**: `jstack-mock-v15.html` (re-packaged from the source) and `REMAP_HANDOVER.html` (never committed changed; `remap/codemap.sh` restores it). Port the source and rebuild them there.

## Phase 1 — the n8n transport, no live calls (29 Sep 2026)

### App code (`feat(n8n): …`)

| File | Change | Why |
|---|---|---|
| `jstack-app/data/config.ts` | added `DATA_SOURCE`, `N8N_BASE_URL`, `TWENTY_APP_URL`; `USE_API_ADAPTER` now means "not the mock" | `CLAUDE.md` §3's mode switch; unset keeps the old http/mock rule, so every existing test stays on the mock |
| `jstack-app/data/config.swap.ts` | the same three names, fixed to the HTTP swap build's values | metro resolves `data/config` to this file for `build:web:swap`; every name must exist in both |
| `jstack-app/data/provider.ts` | picks `n8nTransport` on n8n (under reachability, under the outbox, as HTTP is); n8n voice socket | the one swap point (ADR-02); on n8n the mock's scripted voice would be fixture content |
| `jstack-app/data/transport/http.ts` | `assertSecureOrigin` exported (one word) | the n8n client obeys the same HTTPS-or-loopback rule instead of keeping a second copy of it |
| `jstack-app/data/transport/n8n.ts` | new: the dispatcher (the third `Transport`) | `CLAUDE.md` §3 |
| `jstack-app/data/n8n/registry.ts` | new: one row per GET route, the write keys, the webhook key allow-list | `CLAUDE.md` §3, `remap/WEBHOOKS.md` §B–§D |
| `jstack-app/data/n8n/client.ts` | new: `callWebhook(key, body)` — timeout, one retry, unwrap, typed errors, 30 s sharing | the one way out to n8n |
| `jstack-app/data/n8n/defaults.ts` | new: the configuration answers (session, capabilities, layouts, focuses, parameters, sections…) | configuration only; fixture content in Josh's voice left out |
| `jstack-app/data/n8n/empty.ts` | new: the contract's empty value per response shape; single records 404 | an unwired section shows its empty state, never demo data |
| `jstack-app/tools/web-n8n.mjs` | new: `pnpm web:n8n` (dev server, `--build`, `--serve`) with settings from `.env.n8n.local` | Expo loads `.env.local` into every export, so n8n settings there would turn the mock gate build into an n8n build |
| `jstack-app/package.json` | added the `web:n8n` script | runs the tool above |
| `jstack-app/tests/unit/n8nRoutes.test.ts` | new | every GET validates against `openapi.yaml`; every keyless write is 501 with no call; registry covers the table; no fixture personal text |
| `jstack-app/tests/unit/n8nClient.test.ts` | new | the client's request, error mapping, retry, timeout and sharing |
| `jstack-app/tests/unit/n8nAllowList.test.ts` | new | registry keys = dev proxy `ALLOW`; nothing that sends or returns bytes; no n8n path in app source |
| `jstack-app/tests/unit/n8nConfig.test.ts` | new | the mode switch, and the provider really routing through n8n |
| `jstack-app/CODEMAP.md` | hand-written: §1 paragraph, §4 test rows, §5 recipe and directory row; generated sections regenerated | a new convention updates its CODEMAP section (AGENTS.md) |
| `jstack-mock-v15.html` | re-packaged from this source (`build:web:prod` + `tools/build-mock.mjs`), in its own commit | QA-06: the packaged mock must carry the current source's fingerprint; mock mode itself is unchanged. **Generated — regenerate in the target repo, don't port** |

### Josh's documents (additions only)

| File | Change | Why |
|---|---|---|
| `DECISIONS.md` | new section "ADR-76.. — REMAP's n8n build": ADR-76 (the transport), ADR-77 (site password as the passkey stand-in, proposed) | `CLAUDE.md` §2, §5; in a table of its own so RM-09's pinned 01..75 run stays as Josh wrote it |
| `KNOWN_GAPS.md` | new subsection "REMAP's n8n build": N8N-1 (no server-side session/lock), N8N-2 (empties that read as facts) | `CLAUDE.md` §5 |
| `CONTRIBUTING.md` | four rows in the environment table (`EXPO_PUBLIC_DATA_SOURCE`, `EXPO_PUBLIC_N8N_BASE_URL`, `EXPO_PUBLIC_TWENTY_APP_URL`, `JSTACK_N8N_DIST`) | RM-03: every variable the app and its tools read is listed |

### REMAP files (`chore(remap): …`)

| File | Change | Why |
|---|---|---|
| `remap/PROGRESS.md` | Phase 1 section | the progress log |
| `remap/CHANGESET.md` | new | this file |
| `remap/codemap.sh` | new: `pnpm codemap`, then restores `REMAP_HANDOVER.html` while `diagrams/` is missing | the generator drops the page's four diagrams without that folder; Josh's tools are not edited |
| `remap/screens/checkpoint-1/` | new: 14 screenshots and the capture report | Checkpoint 1 evidence (the n8n build, empty, proxy unreachable) |

### Committed as found (REMAP's own files, written before Phase 1)

| File | What it is |
|---|---|
| `CLAUDE.md`, `remap/KICKOFF-PROMPT.md`, `remap/WEBHOOKS.md` | REMAP's scope and webhook analysis, as edited before this session |
| `remap/IMPORT-GUIDE.md`, `remap/N8N-INTEGRATION-PROMPT.md`, `remap/WORKFLOWS-NEEDED.md` | how the DASH workflows were imported, the phased prompt, which workflow serves which route |
| `remap/dev-proxy.mjs` | the local proxy; `tests/unit/n8nAllowList.test.ts` reads its `ALLOW` |
| `remap/n8n/JSTACK-DASH-*.json` | the nine DASH workflows as deployed (record only) |
| `remap/n8n/reference/` | **not committed**: Josh's original workflows carry his Telegram chat id |
