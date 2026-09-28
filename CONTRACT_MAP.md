# CONTRACT_MAP — read this first

The developer implementing the backend should start here, not at the top of `history/v2/CONTRACT_v2.md`.
This is `history/v2/CONTRACT_v2.md` §6, `history/v21/CONTRACT_v21.md` §6 and `history/v22/CONTRACT_v22.md` §6 copied verbatim, in
that order — every endpoint family, which system of record owns it, which screen(s) call it,
which acceptance IDs prove it, and the `TODO(BACKEND: §4.n)` marker to search for in
`data/DataProvider.ts` and `data/ApiAdapter.ts` to find the exact call site.
`tests/unit/openapi.test.ts`'s WM-06 keeps this table identical to all three source sections —
if they ever drift, that test fails, rather than silently going stale. It read only the first
two until the Stage 6 audit (A4-05), which is how every V2.2 endpoint family came to be missing
from the table a backend developer is told to start at.

## §6. CONTRACT_MAP (the developer reads this first)

Marker = the `TODO(BACKEND: §4.n)` string in `ApiAdapter.ts` and the transport. Acceptance IDs are `02_ACCEPTANCE_TESTS_v2.md`, `_v21.md` and `_v22.md`. "Mock" = the in-process handler the app ships with.

| Endpoint | System of record | Screen(s) | Acceptance IDs | Marker |
|---|---|---|---|---|
| `/auth/*`, `/session`, `/devices/{id}/revoke` | vault, session store | Gate, Settings › Devices | LK-01..03, SEC-02, SEC-05 | §4.1 |
| `/lock`, `/recover` | vault, agents pause | Agents › Emergency, Settings, lock screen | LK-04..06 | §4.1 |
| `/push/subscribe` | push service | Settings › Notifications | SE-02 | §4.1 |
| `/today` | EA, Twenty, Google, memory | Today | TD-01..08, FS-02, DC-01 | §4.2 |
| `/review`, `/journal` | EA, memory | Today › Review, Close the day | TD-07, TD-08 | §4.2 |
| `/actions`, `/actions/{id}`, `/actions/{id}/undo`, `/actions/{id}/draft` | REMAP memory | Needs you, Decision history, Telegram | DC-01..10, UN-01..04, AG-09 | §4.3 |
| `/insights/{id}` | EA | Today › From your EA | TD-03 | §4.3 |
| `/calendar`, `/events/{id}`, `/calendar/propose` | Google | Today › All calendars, Calendar list | CG-01..08 | §4.4 |
| `/tasks*`, `/undo` | Twenty, run log | Tasks, Task detail, Today › Your tasks | TK-01..14, TD-05 | §4.5 |
| `/tasks/{id}/delegate`, `/report`, `/accept`, `/nudge`, `/waiting` | Twenty, EA skill, Gmail Drafts | Task detail, Waiting on | TK-08..12 | §4.5 |
| `/brain/dump`, `/brain/latest`, `/brain/items/{id}`, `/brain/search`, `/chat`, WS `/voice` | REMAP memory, Librarian, EA | Brain, mic on every page | BR-01..07, VO-01..05 | §4.6 |
| `/memory/proposals`, `/memory/hitrate`, `/rules` | Librarian, vault | Brain › Memory, Rules, Teach sheet | BR-08..12, DC-08 | §4.6 |
| `/life`, `/goals`, `/habits*`, `/people*`, `/money`, `/health`, `/learning`, `/life/sections/*` | config records, Twenty people, memory | Life, Today › At a glance, Close the day | LF-01..10, TD-06 | §4.7 |
| `/agents/summary`, `/agents/spend`, `/agents/caps`, `/portals`, `/agents/feed`, `/agents/runs` | LiteLLM, OpenClaw | Agents, rail health line | AG-01..05, AG-10 | §4.8 |
| `/agents/issues`, `/security/checks` | watchdog, suites | Agents › Agent issues, Security checks | AG-06..08 | §4.8 |
| `/settings/notifications`, `/settings/quiet-hours`, `/settings/autonomy`, `/settings/voice`, `/schedules*`, `/focuses` | config records, OpenClaw cron | Settings sheet, Focus switcher | SE-01..10, FS-01..05 | §4.9 |
| `/layout/{tab}`, `/layout/app` | config records | Arrange on every tab | AR-01..07 | §4.9 |
| `/capabilities`, `/export`, `/labels/*` | backend, REMAP core | Help › What works, Settings › Export, label chips | CT-05, SE-08, CT-06 | §4.9 |

### §6 additions · CONTRACT_v21.md

The V2.1 endpoint families, in the same columns. Acceptance IDs here are
`02_ACCEPTANCE_TESTS_v21.md`. `tests/unit/openapi.test.ts`'s WM-06 keeps this half identical to
`history/v21/CONTRACT_v21.md` §6, the same way CT-02 does for the V2 half above — so the developer reads one
table and neither source can drift away from it quietly.

| Endpoint | System of record | Screen(s) | Acceptance IDs | Marker |
|---|---|---|---|---|
| `/sections*`, `/sections/propose`, `/sections/catalogue` | config records, EA | Life (dynamic sections), Arrange, Needs you (Section card) | CB-01..CB-10 | §4.10 |
| WS `/voice` | streaming provider | Brain › Talk with EA, car mode | VP-01..VP-07 | §4.11 |
| `offlineId` on captures, `/sync/status`, `?since=` | backend | every capture surface, Settings › Sync, delta line | OF-01..OF-10 | §4.12 |
| `/push/subscribe`, push payloads, server events | push service | Settings › Notifications, service worker, every composite | PU-01..PU-05, TM-01..TM-03 | §4.13 |
| `GET /session` user and silos | auth | watermark, From Joce, silo scoping | ID-01..ID-05, MU-01..MU-04 | §4.1 |
| §1.11 time zone | backend | every server string | TZ-01..TZ-04 | §1.11 |

### V2.2 additions (`history/v22/CONTRACT_v22.md` §6)

| Endpoint family | System of record | Screens | Acceptance IDs | Marker |
|---|---|---|---|---|
| `/parameters*` | config records, EA | Settings › Security, Needs you (parameter card) | LK-01..LK-05 | §4.14 |
| `/tasks/{id}` PATCH, `/delegate`, `/complete`, `/subtasks/{sid}`, `/columns`, `/slicers`, `?view=gantt` | Twenty | Task card, List, Board, Gantt, Done | TK-01..TK-13, TF-01..TF-09, BD-01..BD-06, GT-01..GT-08, WK-01..WK-04 | §4.15 |
| `/tasks/{id}/usage`, `/usage` | backend (provider usage) | Task card activity, Agents › Usage | US-01..US-05 | §4.16 |
| `/files*`, `/tasks/{id}/files` | Dropbox (the record), Postgres index | Task card › Files, Brain › Files, Find | FL-01..FL-06 | §4.17 |
| `/brain/replies`, `/brain/items/{id}`, `/memory/history`, `/chat/thread` | EA, memory layer | Brain, Today › From your EA, Dictate to EA | RP-01..RP-05, OP-01..OP-03, TS-04 | §4.18 |
| `/search` | Postgres full-text | Find (every width) | GS-01..GS-07 | §4.19 |
| `/goals*`, `/habits/stats`, `/habits` PUT, `/learning*` | config records, habit logs | Life | LG-01..LG-05, LH-01..LH-08, LL-01..LL-03 | §4.20 |
| `/actions/{id}`, `/agents/issues*` | backend | Agents | AG-01..AG-06 | §4.21 |
| `/settings/autonomy/rules*`, `/settings/voice` | config records, EA | Settings, Needs you (rule card) | ST-01..ST-07 | §4.22 |
| §1.15 instants | backend | every timestamp | TD-01..TD-06 | §1.15 |

---

## Where the machine-readable version lives

`openapi.yaml` (generated by `tools/gen-openapi.mjs`, checked by `tools/validate-openapi.mjs`) is
this same table with the shapes filled in: every route above as a path item, its request and
response schema walked out of `data/types.ts`, and a worked example taken from the fixture the
mock handler reads. `WIRING.html` is the picture — one diagram per section, endpoint to store
action to component. Both regenerate on every commit; neither is hand-edited.
