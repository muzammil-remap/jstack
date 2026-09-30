# WEBHOOKS.md — the n8n workflows, and what the dashboard does with each

Source: the 10 workflow exports (28 Sep). All are self-hosted on Josh's box: n8n at `localhost:5678`, Twenty at `172.17.0.1:3000`, LiteLLM at `172.23.0.1:4000`, Qdrant at `jstack-qdrant:6333`.

Every JSTACK webhook is `POST` with a JSON body and uses **one shared header-auth credential, "JSTACK Webhook Auth"**. That includes the write webhooks. So the header value must **never** reach the browser: the proxy adds it (`remap/dev-proxy.mjs` locally, nginx in production).

## A. The ten workflows

| Workflow | Trigger | Reads or writes | Dashboard use (v1) | Why |
|---|---|---|---|---|
| **WF-01 calendar-read** · `POST /webhook/jstack-calendar-read` | Webhook | Read · Google Calendar `primary` | **Smoke test only**, then replaced by the DASH variant | No event `id` (the contract needs one), no Google link, no all-day flag. Default `timeMin` is *now*, so earlier events today are missed. Default 10 results, cap 50. Any reply over 4,000 characters **drops every event** (`events_omitted: true`). Built for an LLM, not a week or month view. |
| **DASH calendar-read** · `POST /webhook/jstack-dash-calendar-read` (new, `remap/n8n/`) | Webhook | Read | **Wired** → `GET /calendar`, feeds `/today` | Copy of WF-01 with ids, full titles, `allDay`, `htmlLink`, up to 500 events, a 45-day window, and no prose or size cap. A separate path, so OpenClaw's WF-01 is untouched. |
| **DASH tasks-read** · `POST /webhook/jstack-dash-tasks-read` (new, `remap/n8n/`) | Webhook | Read · Twenty REST `/rest/tasks` | **Wired** → `GET /tasks`, derives `/tasks/waiting`, `/tasks/{id}`, feeds `/today` | **No existing workflow serves tasks by webhook.** WF-06 and WF-07 read Twenty inside scheduled runs. This one uses the same internal URL and the "JSTACK Twenty" credential, and passes records through with paging. |
| **WF-03 gmail-read** · `POST /webhook/jstack-gmail-read` | Webhook | Read · Gmail | **Not needed by the app** | Works, but the app has no inbox section. The mock's EMAIL rows in Needs you are EA decisions, not raw mail. Also no message id and a 4,000-character cap. Josh decides if and where mail shows. |
| **memory-search** · `POST /webhook/jstack-memory-search` | Webhook | Read · Qdrant memory (embeddings via LiteLLM) | **Use as is**, Wave 2: Brain › Find, `GET /brain/search` | Returns Josh's private memory, by silo clearance. With a blank type filter, sensitive types (health, legal, money, kids) come back too. Don't expose it until access control is stronger than one site password. Its silo names (`personal_josh`, `family`, `work`) differ from the app's (`personal:josh`, `personal:joce`, `family1`, `family2`, `work`), so it needs a mapping table. |
| **dropbox-fetch** · `POST /webhook/jstack-dropbox-fetch` | Webhook | Read · Dropbox | **Changed copy**, Wave 2: `GET /files`, list mode only | Its default `fetch` mode **downloads file bytes as base64** (up to 3 MB each), so the browser must never call it. If files are wanted, make a list-only DASH variant with a fixed folder. |
| **WF-02 calendar-create** | Webhook | **Write** (Telegram approval, then Google) | **Changed copy** for "Block it" (`WORKFLOWS-NEEDED.md` §1) | The original asks for a second approval on Telegram after Josh already tapped in the app. The original gets no key. |
| **WF-04 gmail-compose** | Webhook | **Write** (sends email after Telegram approval) | **Never** | It *sends*; the contract forbids the app sending (§1.1). Drafts only: DASH gmail-draft. |
| **WF-05 gmail-reply** | Webhook | **Write** | **Never** | Same: it sends. |
| **SEND-OR-QUEUE** | Sub-workflow (Execute Workflow) | Write · Telegram | **Not callable** | No webhook. |
| **WF-06 morning-digest** | Schedule, 07:00 | Read, then sends Telegram | **Not callable**; useful reference | Its Build Digest code shows how Twenty task fields look (`status` `DONE`, `dueAt`) and how overdue and due-today are judged. |
| **WF-07 followup-reminders** | Schedule, weekdays | Read, then sends Telegram | **Not callable**; reference | Comments confirm Twenty's reply shape: `{ data: { tasks: [...] }, totalCount, pageInfo }`. |

FYI for the OpenClaw/Telegram colleague, outside our scope: WF-02's approval card formats times in **PKT** (`TZ = 'Asia/Karachi'`), and memory-search and SEND-OR-QUEUE have their workflow time zone set to Asia/Karachi. Josh is in Brisbane.

## B. Route plan with the webhooks known

| App route | v1 kind | Webhook key → n8n path | Notes |
|---|---|---|---|
| `GET /calendar?view&anchor&focus` | **wired** | `calendar` → `jstack-dash-calendar-read` | Window exactly as the mock builds it (`data/mock/handlers/calendar.ts` `rangeFor`: Brisbane midnight to midnight, 1/3/7 days or 1 month). `gaps` computed like the mock's `gapsFor` (06:00–20:00, ≥60 min, `today` view only). |
| `GET /tasks` (+ view/filter query) | **wired** | `tasks` → `jstack-dash-tasks-read` | Page through with `cursor` until `pageInfo.hasNextPage` is false, capped at 10 pages. Filter and sort client-side the way the mock's tasks handler does. |
| `GET /tasks/{id}` · `GET /tasks/waiting` | derived | from `tasks` | Waiting rows only if a real waiting signal exists in Twenty. Otherwise empty. |
| `GET /today` | derived | `calendar` + `tasks` | Shares the in-flight calls. `needsYou: []`, and `glance` computed from what's known. |
| `GET /portals` | default | none | Static links from config (Twenty, Google Calendar, Gmail, Dropbox, n8n). |
| Everything else | default / empty | none | As listed in §D below. |
| Every write | wired as its workflow arrives, else 501 | per `WORKFLOWS-NEEDED.md` | `501 { reason: "not connected yet" }` until wired. |

## C. What the proxy exposes (must match `remap/dev-proxy.mjs` `ALLOW`)

| Key (browser sees) | n8n path (browser never sees) | Kind |
|---|---|---|
| `calendar` | `jstack-dash-calendar-read` | read |
| `tasks` | `jstack-dash-tasks-read` | read |
| `people` | `jstack-dash-people-read` | read |
| `files` | `jstack-dash-files-list` | read |
| `memory` | `jstack-memory-search` (existing) | read |
| `tasks-write` | `jstack-dash-tasks-write` | write |
| `calendar-edit` | `jstack-dash-calendar-edit` | write (never notifies guests) |
| `gmail-draft` | `jstack-dash-gmail-draft` | write (draft only) |
| `records` | `jstack-dash-records` | write (append-only) |
| `actions` | `jstack-dash-actions` | write |
| `brain` | `jstack-dash-brain` | write (captures, journal, chat; EA replies and insights) |

Adding a key is a deliberate change, made in **three places**: `remap/dev-proxy.mjs`, the nginx config, and the app's `data/n8n/registry.ts`. Workflows that send or return file bytes never get a key. Every DASH workflow takes `POST` JSON (with `op` where it has several), and answers `{ ok: true, request_id, data }` or `{ ok: false, error: { code, message } }`. The codes are `VALIDATION_ERROR` 400, `NOT_FOUND` 404, `CONFLICT`/`UNDO_EXPIRED` 409, `SETUP_ERROR` 500, `UPSTREAM_ERROR` and `UPSTREAM_UNREACHABLE` 502. The app's adapters map these to the contract's codes (validation → `422`).

## D. Every GET route the app calls (full list, for the registry)

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
`POST` / `PUT` / `PATCH` / `DELETE` → wired one by one (`WORKFLOWS-NEEDED.md`); until then `501 { reason: "not connected yet" }`.
