# WORKFLOWS-NEEDED.md — what n8n must provide for the full app

Source of truth: Josh's documents (`HANDOVER.md` §6, `CONTRACT.md` §1–§4). The app is **not** read-only. It does everything the contract lists, with one hard rule from `CONTRACT.md` §1.1: **the app never sends, pays, books or revokes.** Email becomes a Gmail **draft** Josh sends himself, and calendar proposals are drafts. Wire shapes for every route are in `jstack-app/data/types.ts` and `openapi.yaml`.

Every new workflow follows the same pattern as the existing ones: a webhook (POST, header auth), then validation, then the work, then a JSON reply `{ ok, data }` or `{ ok: false, error }`. Name them `JSTACK-DASH-…` so they're clearly separate from OpenClaw's tools.

## 1. Existing workflows

| Workflow | Verdict | What to do |
|---|---|---|
| WF-01 calendar-read | Replaced for the app | Use **JSTACK-DASH-calendar-read** (already written, in `remap/n8n/`). WF-01 stays for OpenClaw. |
| WF-02 calendar-create | **Replaced for the app** by DASH calendar-edit's `block` | "Block it" creates an EA-protected event with no second Telegram approval: Josh already decided by tapping. WF-02 stays for OpenClaw. |
| WF-03 gmail-read | Not needed by the app | Email reaches the app as Needs-you cards the EA writes (see 2.3), not as a raw inbox. |
| WF-04 gmail-compose · WF-05 gmail-reply | **Don't use** | They *send*. The contract forbids the app sending. Use the new Gmail-draft workflow instead (2.6). |
| memory-search | **Use as is** | Powers Brain › Find (`GET /brain/search`). The app passes its silos from the session; its silo names need a mapping (`personal_josh` ↔ `personal:josh`, `family` ↔ `family1`/`family2`). |
| dropbox-fetch | **Replaced for the app** by DASH files-list | List only, under `/JSTACK/`, never file bytes. dropbox-fetch stays for ingestion. |
| SEND-OR-QUEUE · WF-06 digest · WF-07 reminders | Not needed by the app | Telegram side. They keep running. |

## 2. New workflows

✅ = written and in `remap/n8n/`, tested in a simulator (44 checks), ready to import (`remap/IMPORT-GUIDE.md`). ⏳ = still to build.

| # | Workflow | Status | Proxy key | App routes it serves |
|---|---|---|---|---|
| 2.1 | DASH calendar-read | ✅ (now with `protectedByEa`) | `calendar` | `GET /calendar`, feeds `/today` |
| 2.2 | DASH tasks-read | ✅ | `tasks` | `GET /tasks`, `/tasks/{id}`, `/tasks/waiting` |
| 2.3 | DASH tasks-write (create · update · delete; create is deduped on `offlineId`) | ✅ | `tasks-write` | `POST /tasks`, `PATCH`/`PUT /tasks/{id}`, `/accept`, complete |
| 2.4 | DASH calendar-edit (get · update · delete · **block**) | ✅ | `calendar-edit` | `GET`/`PATCH`/`DELETE /events/{id}`, `POST /insights/{id}` block |
| 2.5 | DASH actions: the Needs-you store (put · list · get · answer · undo) | ✅ | `actions` | `GET /actions`, `/actions/{id}`, `POST /actions/{id}`, `/undo` |
| 2.6 | DASH records: the settings store (get · put · history · list; append-only) | ✅ | `records` | `/settings/*`, `/layout/*`, `/focuses`, `/parameters`, `/goals`, `/habits`, **habit logs and stats**, `/sections`, `/life/sections/*`, `PUT /actions/{id}/draft` |
| 2.7 | DASH gmail-draft (never sends) | ✅ | `gmail-draft` | behind approve-on-email, `/tasks/{id}/nudge`, `/people/{id}/act` |
| 2.8 | DASH people-read | ✅ | `people` | `GET /people`, `/life` |
| 2.9 | DASH files-list (`/JSTACK/`, metadata only) | ✅ | `files` | `GET /files`, `/tasks/{id}/files` |
| 2.10 | memory-search (existing, as is) | ✅ | `memory` | `GET /brain/search`, `/search` |
| 2.11 | **DASH capture**: sends a mind-dump, journal line or "Dictate to EA" to the EA for triage; returns the item with its routing; dedupes on `offlineId` | ⏳ needs the EA's intake (colleague) | `capture` | `POST /brain/dump`, `/journal`, `/chat` |
| 2.12 | **DASH brain-read**: latest captures, EA replies, chat thread | ⏳ needs to know where the EA stores them (colleague) | `brain` | `GET /brain/latest`, `/brain/replies`, `/chat/thread` |
| 2.13 | **DASH agent-stats**: runs, spend, caps from LiteLLM + OpenClaw's run log | ⏳ needs LiteLLM's admin key and where OpenClaw logs runs | `agents` | `GET /agents/summary`, `/agents/spend`, `/agents/runs`, `/usage` |
| 2.14 | **DASH agent-health**: security checks, agent issues, last-24-hours feed | ⏳ depends on whether a watchdog exists yet | `agent-health` | `GET /security/checks`, `/agents/issues`, `/agents/feed` |
| 2.15 | Files upload | ⏳ later (binary through the proxy) | — | `POST /files` |

Habit logging no longer needs its own workflow: it's records keys like `habitlog:<habitId>:<YYYY-MM-DD>`, and the app computes the stats.

### The EA card contract (for the colleague who runs OpenClaw)

The app and Telegram must see **the same** Needs-you card (`CONTRACT.md` §2). So:

1. **The EA writes each card** with `POST /webhook/jstack-dash-actions` `{ "op": "put", "card": <ActionItem> }`. The card is an `ActionItem` from `jstack-app/data/types.ts`:
   - **required** — the app leaves out a card missing any of them (one console warning names it), because they are words only the EA can write: `id`, `type` ("Clash", "Email"…), `kind` (`opts | quote | bill | section | parameter | triage | rule`), `title`, `rank` (lower shows first), `why`, `expiresAt`, `thenWhat` ("expires Fri 5pm · then proposes 1"), `silence`, `verb` (the primary button, "Go with"), `toast` ("{n}" is the option chosen), `receipt` (`{ cost, model, sources, seconds }`), `labels` (`{ silo, types, setBy }`), `setAt`, `focus`
   - optionally `options` (exactly 3), `recommended`, `sources`, `quote` (the draft email text), `bill`, `sourceUrl`, and the kind's own `section` / `triage` / `rule` / `parameter`; `history` is the store's to add to
   - for an email card, also `draft: { to, subject, threadId? }`, so the app can make the Gmail draft on approve

   The store keeps at most 5 visible. Putting the same `id` again refreshes the card and reopens it.
2. **The EA reads Josh's answers** with `{ "op": "list", "state": "history" }`. Each answered card has `answer: { verb, option, revision, rule, until, at, via }`. The EA carries out the decision **after** `undoUntil` has passed (10 s), because Josh can still undo before then.
3. **If Josh answers on Telegram**, the EA records it the same way: `{ "op": "answer", "id", "verb", …, "via": "telegram" }`.
4. **Never send, pay or book** as a result of an answer. An approved email is a Gmail draft (DASH gmail-draft) that Josh sends himself.
5. **Never act on a card whose id starts with `dashtest-`.** Those are REMAP's test cards for wiring the dashboard, answered Never and nothing else; REMAP deletes them (`KNOWN_GAPS.md` N8N-12).
6. **At expiry, the EA carries out `thenWhat`** — the store only stops showing an expired card — and records what it did as the card's answer.

### Proposed change: JSTACK-DASH-tasks-read, `op: "columns"` (spec — not deployed, nothing built on it)

**Why.** The Board's columns should mirror Twenty's `bucket` SELECT: every option, empty ones
included, in Twenty's order, with Twenty's labels. Today the app can only see the `bucket` values
that tasks happen to carry, so an empty stage has no column and the order is a guess (alphabetical,
done last — `KNOWN_GAPS.md` N8N-7). The options live in Twenty's field metadata, which the tasks
page read does not return.

**Request** (same webhook path, same header auth; a body without `op` keeps meaning "one page of
tasks", so nothing that calls the workflow today changes):

```json
{ "op": "columns", "request_id": "dash-…" }
```

Validation: `op` absent → the existing page read; `op` = `"columns"` → this; any other `op` →
`VALIDATION_ERROR` (400). `limit` and `cursor` are ignored with `op: "columns"`.

**What it reads.** Twenty's metadata API with the same "JSTACK Twenty" credential (its API key must
be allowed to read metadata): `GET http://172.17.0.1:3000/rest/metadata/objects`, the object whose
`nameSingular` is `task`, and in its `fields` the one whose `name` is `bucket` (`type` `SELECT`).
Its `options` array holds `{ id, value, label, color, position }` per option. Check the exact path
against the deployed Twenty version: if REST metadata is not exposed there, the GraphQL metadata
endpoint (`POST /metadata`, `objects { edges { node { nameSingular fields { edges { node { name
type options } } } } } }`) returns the same `options`.

**Reply** — the DASH envelope, options sorted by Twenty's `position` ascending, `order` counting
from 1 in that sort:

```json
{
  "ok": true,
  "request_id": "dash-…",
  "data": {
    "field": "bucket",
    "options": [
      { "value": "INBOX", "label": "Inbox", "order": 1 },
      { "value": "NEXT", "label": "Next", "order": 2 },
      { "value": "DONE", "label": "Done", "order": 3 }
    ]
  }
}
```

(`value` exactly as it appears on a task's `bucket`; `label` as Twenty shows it; the values above
are illustrative — only `INBOX` and `DONE` have been seen on tasks.)

**Errors.** No `task` object or no `bucket` SELECT field → `{ "ok": false, "error": { "code":
"SETUP_ERROR", "message": "…" } }` (500); Twenty unreachable → `UPSTREAM_UNREACHABLE` (502); a
Twenty error → `UPSTREAM_ERROR` (502).

**What the app will do with it** (once deployed and confirmed — not before): `GET /tasks/columns`
answers one `Column` per option, in `order`, `id` `bucket-<value>`, `name` = `label`, `statuses`
`["done"]` for the option whose value is `DONE` and `["open", "in_progress", "waiting"]` for the
others; tasks keep landing in their bucket's column, and `status` still decides done-ness. Moving a
card between columns is a write (`tasks-write` `update` of `bucket`) and waits for Phase 6. The
proxy key is unchanged (`tasks`), so no allow-list change.

### Proposed change: JSTACK-DASH-actions (spec — not deployed, nothing built on it)

Three gaps against the mock (`KNOWN_GAPS.md` N8N-10), each additive — a body that does not use them
means what it means today:

1. **`{ "op": "list", "state": "open", "all": true }`** returns every live card by rank, not the
   first five, with `totalOpen` as now. The app then applies the focus and THEN the five — the
   mock's order; today a focus can show fewer than five while more of its cards are open.
2. **`"via": "expiry"`** accepted on `answer` (today only `app` and `telegram`), so the EA can
   record carrying out `thenWhat` and the history says so.
3. **`{ "op": "reopen", "id" }`** — a card answered at any time goes back to `open`, its answer
   cleared, for Agents › Decision history's reopen (`POST /actions/{id}/reopen`, today `501`).
   `409` if the card is already open, `404` if unknown.

## 3. Not n8n, or later by Josh's own stage plan

| Thing | Why it waits |
|---|---|
| Two-way voice (`WS /voice`) | Needs a streaming voice provider; REMAP's choice is open (`HANDOVER.md` §1 Q6) |
| Push notifications / server events | Needs a push service; the app works without it (fetches on open) |
| Memory proposals, Librarian | V3 (`HANDOVER.md` §3) |
| Money and Health feeds | V5 per Josh's 15 Sep note |
| Passkeys verified on a server, sessions, emergency lock and recovery | The documents want a real server for these (`SECURITY.md`). With n8n only, the site password (nginx) is the stand-in, and **Josh should agree to that** |
| The second calendar and combined view | V3 (`HANDOVER.md` §1 Q7) |

## 4. Rules for every new workflow

1. Reply with the contract shape where it's easy, or clean structured JSON the app's adapter maps. Never prose.
2. Writes that Josh can repeat (captures, habit logs, task creates) accept an `offlineId`, and answer `{ duplicate: true }` on a repeat. WF-02/04/05's dedupe table pattern already does this.
3. No workflow the app calls may send, pay, book or revoke.
4. Timestamps are ISO 8601 with an offset.
5. Tell me each new webhook path; it gets added to the proxy allow-list (`remap/dev-proxy.mjs`, nginx) and to the app's registry together.
