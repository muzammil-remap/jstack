# WEBHOOKS.md — n8n webhooks and what each route gets

Two tables. **Table A** is the n8n webhooks as they arrive; fill in one row per webhook. **Table B** is every GET route the app actually calls, taken from `jstack-app/WIRING.md` (routes with no caller are left out), with the planned source for v1. `data/n8n/registry.ts` must match Table B, and a test should assert that every GET in `data/routes.ts` has a registry row.

Kinds: **wired** = from an n8n webhook · **derived** = assembled from wired routes · **default** = static app config · **empty** = contract-valid empty until a source exists.

## A. Webhooks received

| # | Workflow name | Webhook URL (prod) | Method | Params | Auth | Source system | Shared with OpenClaw? | Sample file | Structured JSON? | Feeds routes | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | `jstack-app/tests/fixtures/n8n/…json` | | | not started |

For each webhook we need: the prod URL, the method, the parameters it accepts (date range, limit, id), its auth, **one real response** (redacted if needed, same shape), one **empty** response, and roughly how long it takes to answer.

## B. Route plan (v1)

### Today tab
| Route | Contract (`data/types.ts`) | v1 kind | Source |
|---|---|---|---|
| `GET /today` | `TodayComposite` | derived | calendar + tasks webhooks; `needsYou` empty until an EA source exists; `glance` computed |
| `GET /calendar` (`?view=`, `anchor`) | `CalendarWindow` | **wired** | Google Calendar |
| `GET /review` | `ReviewComposite` | empty | — |
| `GET /actions` | `ActionItem[]` (history) | empty | OpenClaw decisions, later |
| `GET /brain/replies` | `Reply[]` | empty | OpenClaw, later |

### Tasks tab
| Route | Contract | v1 kind | Source |
|---|---|---|---|
| `GET /tasks` (`?view=`, filters) | `Task[]` | **wired** | Twenty (to-dos; confirm whether Notion is involved) |
| `GET /tasks/{id}` | `Task` | derived | same webhook, by id, or a detail webhook |
| `GET /tasks/waiting` | `WaitingRow[]` | derived | from tasks with `waitingOn` |
| `GET /tasks/columns` | `Column[]` | default or wired | Twenty pipeline stages |
| `GET /tasks/{id}/usage` · `/tasks/{id}/files` | `Usage[]` · `Attachment[]` | empty | — |
| `GET /agents` (roster for delegation) | `AgentRoster` | default | — |

### Brain tab
| Route | Contract | v1 kind | Source |
|---|---|---|---|
| `GET /brain/latest` | `BrainItem[]` | empty | OpenClaw memory, later |
| `GET /memory/proposals` · `/memory/hitrate` | `MemoryProposal[]` · `MemoryHitRate` | empty | — |
| `GET /brain/search` · `GET /search` | `BrainSearchResult` · `SearchResponse` | empty | — |
| `GET /chat/thread` · `/brain/items/{id}/versions` | | empty | — |
| `GET /files` | `Attachment[]` | empty → wired | Dropbox, later |

### Life tab
| Route | Contract | v1 kind | Source |
|---|---|---|---|
| `GET /life` | `LifeComposite` | derived | people (+ others as they arrive) |
| `GET /people` (inside `/life`) | `Person[]` | wired? | Twenty contacts / CRM updates. **Placement is Josh's call** |
| `GET /goals` · `/habits` · `/habits/stats` | | empty | — |
| `GET /money` · `/health` · `/learning` | | empty | money/health are V5 per Josh |
| `GET /life/sections/{id}/config` · `GET /sections` | | default | — |

### Agents tab
| Route | Contract | v1 kind | Source |
|---|---|---|---|
| `GET /agents/summary` · `/agents/spend` · `/agents/issues` · `/agents/feed` · `/security/checks` · `/usage` · `/schedules` | | empty | OpenClaw / LiteLLM ledger, later |
| `GET /portals` | `Portal[]` | default | static links: OpenClaw, Twenty, n8n, Gmail, Calendar, Dropbox. Real URLs from config |

### App configuration (all default)
`GET /session` (one owner user, this device) · `GET /capabilities` (everything `false` except what really works; `calendarViews: true`) · `GET /focuses` · `GET /layout/app` · `GET /layout/{tab}` · `GET /parameters` (the defaults in `data/parameters.ts`) · `GET /settings/notifications` · `/settings/quiet-hours` · `/settings/autonomy` · `/settings/autonomy/rules` (empty list) · `/settings/voice`.

Take defaults from the mock where they are **configuration** (layouts, focuses, parameter defaults). Don't copy mock content that reads as Josh's own words, such as EA rules or notes.

### Every write route
`POST` / `PUT` / `PATCH` / `DELETE` → `403 { reason: "read-only" }`.
