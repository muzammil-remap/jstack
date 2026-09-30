# IMPORT-GUIDE.md — putting the dashboard workflows on n8n

Nine new workflows, all named `JSTACK-DASH-…`. They sit **beside** your existing ones, on new webhook paths, so nothing OpenClaw uses changes. You only need these JSON files once, to import them. After that the app talks only to the published webhooks.

## Step 1 — Create two Data Tables (n8n → Data tables → Create)

**`jstack_dash_records`**: settings, layouts, goals, habits, habit logs and the like. It is append-only: every save adds a new version.

| Column | Type |
|---|---|
| `key` | string |
| `version` | number |
| `value_json` | string |
| `saved_at` | string |
| `saved_by` | string |

**`jstack_dash_actions`**: the Needs-you cards, shared by the app and the EA.

| Column | Type |
|---|---|
| `card_id` | string |
| `state` | string |
| `card_json` | string |
| `rank` | number |
| `expires_at` | string |
| `answer_json` | string |
| `undo_until` | string |
| `updated_at` | string |

**`jstack_dash_brain`**: captures, journal and chat from Josh; replies and insights from the EA.

| Column | Type |
|---|---|
| `item_id` | string |
| `kind` | string |
| `text` | string |
| `source` | string |
| `by` | string |
| `offline_id` | string |
| `state` | string |
| `data_json` | string |
| `created_at` | string |
| `updated_at` | string |

Copy each table's **id**: it's in the browser address bar when the table is open.

## Step 2 — Import (Workflows → Import from File), one at a time

| File | What it's for | Before activating |
|---|---|---|
| `JSTACK-DASH-calendar-read.json` | Calendar on Today and the calendar views | If you imported the earlier version, **replace it with this one**. It adds "protected by EA". |
| `JSTACK-DASH-tasks-read.json` | Tasks list | — |
| `JSTACK-DASH-people-read.json` | Life › People (Twenty people) | — |
| `JSTACK-DASH-files-list.json` | Files under `/JSTACK/` in Dropbox (names only, never contents) | — |
| `JSTACK-DASH-tasks-write.json` | Create, edit, complete or delete tasks in Twenty | — |
| `JSTACK-DASH-calendar-edit.json` | Move, rename or delete events, and "Block it" (protected time). Guests are never emailed. | — |
| `JSTACK-DASH-gmail-draft.json` | Makes a Gmail **draft**; never sends | — |
| `JSTACK-DASH-records.json` | The settings store | Open **Validate Input** and replace `REPLACE_WITH_RECORDS_TABLE_ID` with the `jstack_dash_records` id |
| `JSTACK-DASH-actions.json` | The Needs-you cards | Open **Validate Input** and replace `REPLACE_WITH_ACTIONS_TABLE_ID` with the `jstack_dash_actions` id |
| `JSTACK-DASH-brain.json` | Captures, journal, Dictate to EA; the EA's replies and insights | Open **Validate Input** and replace `REPLACE_WITH_BRAIN_TABLE_ID` with the `jstack_dash_brain` id |

Credentials should link by themselves, because they point at the same credentials your workflows already use: JSTACK Webhook Auth, JSTACK Twenty, JSTACK Google Calendar, JSTACK Gmail, JSTACK Dropbox and JSTACK n8n API Auth. If a node shows a red credential, pick the matching one. The n8n API key behind "JSTACK n8n API Auth" must be allowed to read and write data table rows.

Then **Activate** each one.

## Step 3 — Check each one (Git Bash, proxy running: `node remap/dev-proxy.mjs`)

```bash
P=http://127.0.0.1:8787/n8n; H='content-type: application/json'
t(){ echo "== $1"; curl -s -w '\n[HTTP %{http_code}]\n' -X POST "$P/$1" -H "$H" -d "$2" | cut -c1-300; echo; }
t calendar '{"timeMin":"2026-09-27T14:00:00Z","timeMax":"2026-10-04T14:00:00Z"}'
t tasks    '{"limit":5}'
t people   '{"limit":5}'
t files    '{}'
t records  '{"op":"put","key":"test:hello","value":{"hi":1}}'
t records  '{"op":"get","key":"test:hello"}'
t records  '{"op":"list","prefix":"test:"}'
t actions  '{"op":"list"}'
ID=$(curl -s -X POST "$P/calendar" -H "$H" -d '{"timeMin":"2026-09-27T14:00:00Z","timeMax":"2026-10-04T14:00:00Z"}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
t calendar-edit "{\"op\":\"get\",\"eventId\":\"$ID\"}"
```

Each should answer `{"ok":true,...}`.

Leave these out until you're ready to change real data:
- `tasks-write` (`{"op":"create","offlineId":"<uuid>","fields":{"title":"Test from dashboard"}}`, then delete it with `{"op":"delete","id":"<id>"}`)
- `calendar-edit` block
- `gmail-draft` (creates a draft you can delete in Gmail)

If `records` `list` answers with an error about the filter, tell me. It uses the data table's `like` condition, and that's the one part I couldn't test against a live n8n.

## What's still missing (needs your colleague or a decision)

See `remap/WORKFLOWS-NEEDED.md` §2: **capture** and **brain-read** (the EA's side), **agent-stats**, and **agent-health**. The EA also has to start writing Needs-you cards into `jstack_dash_actions`, and reading Josh's answers back. That's the "EA card contract" section in the same file.
