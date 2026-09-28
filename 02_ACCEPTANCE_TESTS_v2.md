# 02_ACCEPTANCE_TESTS_v2.md — JSTACK V2 definition of done

Planner: Claude Fable 5.1, 4 September 2026. Every row: ID · screen · the check in one line. Tests assert on state (`__JSTACK__` stores, `db()`, `calls()`) and `data-testid` locators, never on logs. "Core" specs run at `w393-light` and `w1366-light`; "matrix" specs run at 393, 1024, 1366, 1920 × light, dark. Jest rows say so. §1 is the V2 list (166 IDs). §2 rules on every v1.2 ID. §3 is the protocol. §4 holds expected-value updates the build logs (never deletions).

## §1. V2 acceptance IDs

### GL · Global (core unless noted)
| ID | Screen | Check |
|---|---|---|
| GL-01 | every flow | Console error and warning count is 0 across every Playwright test (budget zero, kept from v1.2 GL-00) |
| GL-02 | gate | App opens locked; a passkey assertion (virtual authenticator) unlocks; a tap without one does not; relaunch locks again |
| GL-03 | every tab | Theme Auto follows the emulated scheme; Light and Dark override for the session; `html`/`body` background equals the ground token (no light flash); Jest: dark set complete |
| GL-04 | every tab | Hide sensitive ON blurs every `sens`-tagged element (count tagged = count blurred: money, journal, spend); OFF restores |
| GL-05 | every tab | Every interactive element ≥ 36 px on phone, measured on its REAL box, **except the components whose size the pack itself fixes** (icon button 32/36, checkbox 15, habit chip 32/34, switch, chip, row verb, 30 px field button, desktop segment) — those are asserted against the pack's own size instead, which is stricter than a floor. Amended at row 23, A-46 |
| GL-06 | every tab | `prefers-reduced-motion` drops the mic pulse and transforms, keeps opacity changes |
| GL-07 | shell | Five tabs route (Today, Tasks, Brain, Life, Agents), active state in accent ink with the filled icon; rail ≥ 768, tab bar below; Find and Settings on the rail |
| GL-08 | Help | "What works in this build" lists every capability from `capabilities()` with its honest status and every section hidden by a missing feed |

### FS · Focus switcher (core)
| ID | Screen | Check |
|---|---|---|
| FS-01 | every tab but Agents | Chips Everything · Personal · Family · Work + `tune`; selected chip accent-soft with accent-ink text at 500 |
| FS-02 | Today, Tasks, Brain, Life | Selecting Work narrows Needs you, Your tasks, the task list, Latest in, proposals, goals, people; the adapter receives `?focus=work`; the open decision resets to the first in focus |
| FS-03 | every tab | Everything widens back to the full set |
| FS-04 | Settings › Focus filters | Add a focus (name + saved filter) → new chip; rename; remove; Everything cannot be removed; saved through `PUT /focuses` |
| FS-05 | Arrange, Agents | Focus row switch off hides the chips on every tab; Agents never shows chips |

### DC · Decision cards (core)
| ID | Screen | Check |
|---|---|---|
| DC-01 | Today › Needs you | Exactly one card open (first undecided or the tapped one), the rest as waiting rows; badge equals open count; "history" link opens the dialog |
| DC-02 | Clash card | Three 1-3-1 options; the recommended row is accent-soft; tapping row 2 moves the recommendation and the primary reads "Go with 2"; answering records `option: 2` |
| DC-03 | Email card | Quote inset; Approve → server returns `outbox_user_sends`; toast "Approved · Reply to Andy, in Gmail Drafts"; card leaves; next opens |
| DC-04 | Bill card | `payee / BSB / ref` grid with `copy` links (clipboard + "Copied"); "Open NAB" answers with `approve` and toasts "Opened NAB · RACQ bill"; no payment call exists |
| DC-05 | any card | Revise → toast "Sent back to revise · <title>"; on an email card Revise opens the draft editor and saves a version via `PUT /actions/{id}/draft` |
| DC-06 | any card | Later → toast "Later · returns Mon 8am · <title>"; the record carries `laterUntil`; the card leaves today |
| DC-07 | any card | ··· reveals Never and Teach as a second row; Never → toast "Never · rule offered · <title>" and history state `never` |
| DC-08 | any card, EA report | Teach → sheet with one line; "Save as a rule" → `POST /rules` with `from`; the rule appears first in Brain › Rules; "Just this once" saves nothing |
| DC-09 | any card | Card shows type, expiry and then-what in accent ink, the why-line with source links, the silence rule and "undo 10s"; receipt fields present in the record |
| DC-10 | waiting rows, end line | Tapping a row's verb answers it without opening; tapping its title opens it and closes the current; end line reads "That's all until 4pm. Two more return then." with cards left and "Nothing needs you. Two more return at 4pm." when none |

### UN · Undo ledger (core; UN-01 also Jest)
| ID | Screen | Check |
|---|---|---|
| UN-01 | toast | Every answered card shows the undo toast with a ring counting from 10; Undo within the window calls `/actions/{id}/undo`, restores the card as open and reopens it; Jest: ledger entries expire at 10 s |
| UN-02 | toast | After 10 s the toast is gone; a forced late undo returns 409 and the app shows nothing wrong (no console error, no state change) |
| UN-03 | Today, Life, Brain, Agents | Task done, habit toggle, proposal ok and agent-issue verb each offer undo and revert through the adapter |
| UN-04 | toast | A new undoable action replaces the previous toast and ledger entry (one entry at a time) |

### TD · Today (core; TD-01 matrix)
| ID | Screen | Check |
|---|---|---|
| TD-01 | header | Day name in Source Serif 4 (32 desktop, 26 phone), date on the baseline, delta line "Since 9pm: … Review the week" with the live proposal count; matrix: at every width |
| TD-02 | header, rail | Phone: "all healthy · $4.20" on its own line under the header; desktop: at the rail bottom; the spend is `sens` |
| TD-03 | From your EA | "Block it" → `POST /insights/{id} {block}` → collapses to "Blocked 9 to 12 tomorrow. The EA will hold it."; "Leave it" → the left-open line |
| TD-04 | Calendar (list) | Rows: time 34 px, title, prep line in accent ink, free gaps as muted lines; hint "today · 3 days · google"; google opens the external-link confirmation |
| TD-05 | Your tasks | Top three open tasks in focus; checkbox → `PATCH /tasks/{id}` done + undo toast "Done"; hint "all" switches to Tasks |
| TD-06 | At a glance | Four cells (Habits n/9, People, Money, Goals); habits count equals the Life store; each cell switches to Life |
| TD-07 | Close the day | Nine compact habit chips (32 px) sharing state with Life; journal field with mic and keyboard; submit → `POST /journal`; empty is blocked |
| TD-08 | Review | Delta link opens Review: the week that was (decisions, promises, time by focus bars), the week ahead, three things; from `GET /review` |

### CG · Calendar grid (core; CG-02 and CG-07 also matrix)
| ID | Screen | Check |
|---|---|---|
| CG-01 | All calendars | Segmented Today / 3 days / Week / Month, default Today; exactly one selected |
| CG-02 | Today view | Track 336 px (6:00–20:00 at 24 px/h); each event's top = (start − 6) × 24 and height = duration × 24 − 2 (assert computed styles for the three fixtures); time shown only when height ≥ 36 |
| CG-03 | Today view | The now line renders on today's track only, at the offset clock time; absent on other days |
| CG-04 | 3 days | Three columns; today's label reads "TODAY · THU 4" in accent ink; today's track has the 2 px accent-ink top |
| CG-05 | Week | Seven columns, 9 px titles, no times; today outlined |
| CG-06 | Month | 7 × 5 grid; day numbers; up to two dots per day; today's number in accent ink |
| CG-07 | legend, events | Legend lists Personal, Work, Family · shared, EA protects, Now; every event fill and border is a token value (accent, accent-ink, muted, accent-soft, hairline), never a per-calendar hue; matrix: both themes |
| CG-08 | range line | ‹ › move the anchor for 3 days / Week / Month and the adapter call carries it; Today has no navigation; Week and Month segments are absent when `capabilities.calendarViews` is off |

### TK · Tasks (core; TK-05 also matrix)
| ID | Screen | Check |
|---|---|---|
| TK-01 | Tasks | Segmented List · Board · Gantt · Done, List default; slicer chips This week · Waiting · Delegated · Agent · Recurring + Filter shown for List only |
| TK-02 | List | Each slicer shows only its rows (Waiting: the waiting fixtures; Delegated: EA or subtask rows; Agent: EA-owned; Recurring: repeat rows); the adapter receives `?slice=` |
| TK-03 | List | Owner marks: EA tag with a dashed accent-ink checkbox on EA-owned rows, J tag on Joce's; Josh's rows carry no tag |
| TK-04 | List | Checkbox → done (strikethrough, muted) via `PATCH`, toast "Done" with undo; undo reopens |
| TK-05 | Board | Now / Next / Waiting / Done columns with the fixture counts; Done dimmed; horizontal scroll under 1180; a card opens the task; matrix: columns ≥ 200 px |
| TK-06 | Gantt | Bars per project from `GET /tasks/gantt`; EA bars dashed accent-soft; tapping a bar opens the task; no drag; footer "Bar dates come from Twenty. Open in Twenty for the full timeline." links out (copy corrected at row 23 — A-45) |
| TK-07 | Done | Search field filters done rows; "No matches." when none; done rows keep the EA meta and cost |
| TK-08 | Task detail | Title, meta with repeat, focus chip, Twenty and Dropbox links (confirmation), subtasks "2 of 3 done" with owner tags, activity list |
| TK-09 | Task detail | "+ subtask" adds a titled subtask via `POST /tasks/{id}/subtasks`; "Delegate to the EA" → `POST /tasks/{id}/delegate` → acknowledged state on the row and an activity line |
| TK-10 | EA report | Report title, quote, file chips, flagged count; Looks right / Revise / Teach → `POST /tasks/{id}/report`; Revise toasts "Revision requested · the EA redoes the flagged part" |
| TK-11 | Waiting on | Rows "Steve · villa contract · 9 days" with "Draft a nudge" → `POST /tasks/{id}/nudge` → toast "Nudge drafted · in Gmail Drafts · never sends itself" |
| TK-12 | List, detail | A task from Joce shows "accept" and "delegate to EA"; accept → `POST /tasks/{id}/accept` → owner Josh |
| TK-13 | List | Recurring rows show the rule and last-run cost; the Recurring slicer lists them; Settings › Schedules lists EA recurring tasks |
| TK-14 | Filter | Filter dialog with Priority / Status / Project / Owner / Due, multi-select; applied chips with ✕; Clear all; filters compose with the slicer (AND across groups, OR within) |

### BR · Brain (core)
| ID | Screen | Check |
|---|---|---|
| BR-01 | Dump | Typed text + send → `POST /brain/dump {typed}` → new Latest-in row with "→ filing · Librarian" and toast "In. Filing itself · check Latest in"; empty is blocked with "Type or dictate first" |
| BR-02 | Dump | Mic button starts listening; partial transcript renders in the listening bar; stop files the text with `source: voice` |
| BR-03 | Talk with EA, Chat | Talk sheet shows the honest line when `liveVoice` is off and the live orb when on; Chat dialog sends `POST /chat` and renders the reply row with sources |
| BR-04 | Find | Empty on open (no search call); submit → answer card with headline, synthesis, source links, "confidence high · 0.4s"; results below |
| BR-05 | Latest in | Rows with meta and routing chips in accent ink; "edit" opens the item editor; saving appends a version (`GET /brain/items/{id}/versions` grows) |
| BR-06 | Memory | Badge = open proposals; `ok` → accepted, toast "Accepted · versioned, nothing overwritten", undo restores |
| BR-07 | Memory | `edit` → dialog with the proposal text; "Save my version" → `POST /memory/proposals/{id} {edit, text}` → toast "Saved · the Librarian learns from the correction" |
| BR-08 | Memory | With no proposals: "All caught up. The Librarian runs again at 2:00." |
| BR-09 | Memory | Hit-rate row "27 of 30 test questions right last week" with meta and `fix` opening the two wrong answers with their sources |
| BR-10 | Rules | Numbered newest first (N … 1); "all" opens the full list; footer line present |
| BR-11 | Rules | `edit` → Save keeps the previous wording as a version (toast "Rule updated"); Retire removes it from the active list (toast "Rule retired · kept in history") |
| BR-12 | Rules | A rule saved from Teach (DC-08) appears as rule N+1 with the source card in its history |

### LF · Life (core; LF-10 Jest + matrix)
| ID | Screen | Check |
|---|---|---|
| LF-01 | Goals | Three rows, name at 500, status meta; "behind" rendered in accent ink; filtered by focus |
| LF-02 | Habits | Nine labelled chips (34 px, radius 8, mark 14 px); toggle → `POST /habits/{id}/log`; the same toggle is reflected in Today's compact chips and the glance count |
| LF-03 | Trends | Dialog with Week / Month / Year / All time from `GET /habits/stats`; dot rows per habit; the summary line "This week 61% · 33 of 54" |
| LF-04 | People | Rows name · item · meta with the verb (Draft a note / Draft / Nudge / Done) → `POST /people/{id}/act`; draft verbs toast "Drafted · never sends itself" |
| LF-05 | Money | Rows `label 44px · track · amount`; Family over budget renders the track in alert at .8 and the amount in alert; amounts blur under GL-04 |
| LF-06 | Money | Due line "RACQ $1,184.20 due 19 Sep" in accent ink with "feed: Redbark, V2.1" |
| LF-07 | Health | Ghost card (dashed hairline, muted) with the skin-check line until `healthFeed` is on |
| LF-08 | Learning | Two rows with meta from `GET /learning` |
| LF-09 | Configure | People / Money / Health "configure" → dialog (categories with the EA's reason, warn threshold, show-within) → Save writes `PUT /life/sections/{id}/config`; "Revert to the EA's" reverts |
| LF-10 | Life, Today | No per-category colour anywhere: every habit chip, budget track and calendar event uses accent tokens only (Jest on styles; matrix visual) |

### AG · Agents (core)
| ID | Screen | Check |
|---|---|---|
| AG-01 | Stats | Four stat cards (18 px serif number, 11.5 label) derived from runs: runs today, success %, spend (sens), agent issues with the alert dot when > 0; equal to `GET /agents/summary` |
| AG-02 | Spend | Ring 56 px at the spent fraction, "$61 of $200 this month", "landing about $88", heartbeat line, caps chips; "edit caps" → dialog → `PUT /agents/caps` behind a biometric re-assertion |
| AG-03 | Portals | Eight tiles (OpenClaw, Twenty, n8n, Paperclip, NAB, Gmail, Calendar, Dropbox); each opens the external-link confirmation showing the real domain; nothing opens without it |
| AG-04 | Agent issues | Badge = open issues; each row: alert dot, title, why, verb (Renew / Run now) → `POST /agents/issues/{id}` → row leaves, toast with undo; empty "Nothing failing. Every check ran when it should." |
| AG-05 | Last 24 hours | Rows with ok / muted / alert dots, time, text, meta; the alert row carries Renew until its issue is done |
| AG-06 | Security checks | The fixed seven with status; the stale check reads "7 days stale · see agent issues" in accent ink with an alert dot |
| AG-07 | Security checks | Resolving the suite issue (Run now) flips Injection tests to "ran just now" with an ok dot |
| AG-08 | Security checks | Hint "schedules" opens the Settings sheet at Schedules |
| AG-09 | Decision history | Two rows (title · verb at 500 · time via door); "search" opens the dialog with a search field over every answered card; `reopen` puts the card back in Needs you |
| AG-10 | header | Subtitle "2 need you · 47 runs today"; no focus chips on Agents |
| AG-11 | Emergency | "Hold to lock" needs 1.2 s (hint text changes to "Keep holding…", then "Locking…"); an early release resets; then the confirm dialog with four rows and "Lock everything now" |
| AG-12 | Emergency | Confirm → `POST /lock` behind a biometric assertion → locked screen with the emergency text; "Recover" → `POST /recover` → toast "Secrets rotated · your session restored · agents resuming one at a time" |

### SE · Settings (core; SE-09 matrix)
| ID | Screen | Check |
|---|---|---|
| SE-01 | Settings | Opens from the rail (desktop) and the header button (phone); scrim; close by the button, the scrim or Esc; header "Settings" + "One account · 3 devices · changes save as you make them" |
| SE-02 | Notifications | Nine groups × iPh / iPad / PC / TG switches; toggling persists through `PUT /settings/notifications`; the Security group returns 423 and toasts "Security notifications are always on · by design" |
| SE-03 | Notifications | Footer "Quiet hours, 9pm to 7am, apply to all but security." from `GET /settings/quiet-hours` |
| SE-04 | Schedules | Seven rows with cadence in accent ink; "run" → `POST /schedules/{id}/run` → toast "Running now · the result lands in the feed"; pause / resume flip the row |
| SE-05 | Autonomy | Six card types × Ask me / Propose / Auto; a choice persists via `PUT /settings/autonomy` and toasts "Autonomy saved · enforced server-side" |
| SE-06 | Voice | Style and Speed pickers and the "Read the brief at 6:30" switch persist via `PUT /settings/voice` |
| SE-07 | Focus filters | Rows with edit; "Add a focus" opens the editor (FS-04) |
| SE-08 | Appearance and account | Theme segmented (GL-03); Devices "manage" lists devices with revoke; "Hide sensitive figures" switch (GL-04); Export is enabled only when `capabilities.export`, else disabled with the reason; "Hold to lock" (AG-11) |
| SE-09 | Settings | Phone: full screen with 12 px padding; ≥ 768: sheet max 900 wide; ≥ 1180: the two-column grid; matrix: both themes, no clipping |
| SE-10 | Settings | Every change goes through the adapter (assert `calls()` after each row above); nothing is written to `localStorage` except theme mode and privacy |

### AR · Arrange (core)
| ID | Screen | Check |
|---|---|---|
| AR-01 | Arrange | Header Arrange button opens "Arrange · <Tab>" listing the tab's sections in order with up / down and a switch |
| AR-02 | Arrange | Up / down reorders the rendered sections within their column and persists via `PUT /layout/{tab}` with history |
| AR-03 | Arrange | Switch off hides a section; pinned rows (Needs you; Agent issues, Security checks, Emergency lock) show "cannot be hidden" and no switch; a forced hide returns 422 |
| AR-04 | Arrange › App | Focus row switch (FS-05); tab switches hide Tasks, Brain, Life or Agents from the rail and tab bar; Today cannot be hidden; hiding the current tab returns to Today |
| AR-05 | Arrange | "Revert to yesterday" restores the previous layout through `/layout/{tab}/revert` and `/layout/app`; toast "Reverted to yesterday" |
| AR-06 | any tab | An EA layout (rig: `__JSTACK__.eaLayout(tab, order, reason)`) renders the banner with the reason and "Revert"; an EA layout without a reason or one that re-shows a Josh-hidden section is rejected (422) |
| AR-07 | Help | A section whose feed capability is off is not rendered and is listed under "What works in this build" (BUGLOG_v2.md A-37: Health is deliberately exempt — B-20/LF-07 needs it visible as a ghost card instead — so this is proved against a synthetic section in `tests/unit/registry.test.ts`, not a live UI example) |

### LK · Lock, recovery, sessions (core)
| ID | Screen | Check |
|---|---|---|
| LK-01 | gate | Locked screen text "Locked. Unlock with your passkey." and the primary button; nothing behind it is reachable (GL-02) |
| LK-02 | gate | Auto-lock after the configured inactivity (`__JSTACK__.setAutoLockMs`) locks; a visibility hide locks |
| LK-03 | deep link | A route opened while locked shows the gate first, then lands on the route; an unknown route drops to Today with a toast |
| LK-04 | Emergency | `POST /lock` revokes: after locking, `GET /session` returns 401 until recovery; the locked screen shows the emergency text |
| LK-05 | Recovery | Recover needs the passkey and the recovery key field; success restores the session and the agents list resumes one at a time (toast) |
| LK-06 | Devices | Revoke a device → biometric re-assertion → `POST /devices/{id}/revoke`; the current device cannot be revoked from itself |

### RL · Responsive layout (matrix)
| ID | Screen | Check |
|---|---|---|
| RL-01 | every tab | 393: one column in registry order; floating tab bar inset 14 px, height 60; mic orb fixed right 20, bottom 88 |
| RL-02 | every tab | 1024: 200 px rail; two columns `1.3fr 1fr`; column 3's sections stack directly under column 1 (no empty row); column 2 spans both rows |
| RL-03 | every tab | 1366 and 1920: three columns `1.3fr 1fr .95fr`; gap 18; columns start-aligned, never stretched |
| RL-04 | every tab | 1920: content max-width 1500, left-aligned after the rail |
| RL-05 | header | Phone: Settings + Theme buttons and the health line under the header; desktop: Arrange + Help + Theme, health at the rail bottom |
| RL-06 | dialogs, sheets | Phone: dialogs full screen, sheets from the bottom; desktop: dialogs 66vw (max 1000), sheets 420 wide bottom-right; the Settings sheet per SE-09 |
| RL-07 | every tab | Resizing across 768 and 1180 re-lays out live and keeps the open dialog, focus and scroll |
| RL-08 | every tab | Text-clipping sweep: no text node with `scrollWidth > clientWidth`, no single-character orphan lines, at every width and theme |

### VO · Voice (core)
| ID | Screen | Check |
|---|---|---|
| VO-01 | mic | Tapping the mic replaces the tab bar with the listening bar (phone) or shows the 360 px bar (desktop): live orb, transcript, "listening · tap the mic to stop · files to Brain", Cancel |
| VO-02 | mic | Stopping files the transcript via `POST /brain/dump {voice}` and toasts "Filed to Brain · …" from the response; Cancel files nothing |
| VO-03 | mic, Dump | Permission denied → "Microphone permission needed — typing still works." in the sheet; typing path works |
| VO-04 | mic, Talk | Native STT module absent → every voice entry point shows "Voice capture needs the phone build — typing works everywhere." and stays usable |
| VO-05 | storage | After any voice flow no audio blob exists in storage (IndexedDB, localStorage, memory rig) |

### SEC · Security (core unless Jest or process)
| ID | Screen | Check |
|---|---|---|
| SEC-01 | prod build | `window.__JSTACK__` undefined; `testHook` and the STT rig absent from the production bundle (grep). The MOCK SERVER is present by design and always was — it is what the demo build runs on (ADR-02) — so the row no longer claims otherwise; what must never ship is a build pointed at a real backend while serving fixture data. Amended at row 23, A-47 |
| SEC-02 | gate | WebAuthn assertion required (virtual authenticator); a bare context cannot unlock |
| SEC-03 | gate | Auto-lock and background lock (LK-02) |
| SEC-05 | Jest | Refresh token stored through SecureStore; access token in memory only |
| SEC-06 | Jest | Persistent store encrypted (`encryptedStore` wraps every write); `sens` records unreadable at rest |
| SEC-07 | caps, lock, revoke, memory | High-risk actions need a fresh biometric assertion bound to a server nonce; decline → toast "Cancelled — … needs a fresh Face ID", no state change |
| SEC-08 | Jest | Pinning scaffold rejects a host whose certificate pin does not match |
| SEC-09 | web build | No request to a third-party origin during the board (fonts and icons ship in the bundle); CSP meta present |
| SEC-10 | portals, links | Every external link opens the confirmation sheet with the real domain first; content renders as text |
| SEC-11 | deep link | LK-03 |
| SEC-12 | Talk, mic | STT engine is on-device by default when available; the browser engine is named in Help |
| SEC-13 | process | `pnpm audit --prod` no high or critical; `tools/secret-scan.mjs` clean |
| SEC-14 | process | No `sens` fixture value appears in console output or test logs during the board |
| SEC-15 | Jest + grep | No adapter method, route pattern, handler or fixture verb named send, pay, book or revoke; the runtime guard throws on such a path |

### CT · Contract and data path (Jest)
| ID | Screen | Check |
|---|---|---|
| CT-01 | code | Every `TODO(BACKEND: §4.n)` marker names a subsection that exists in `CONTRACT_v2.md`; `evidence/todo-backend-grep.txt` equals a live scan |
| CT-02 | code | Every endpoint in `CONTRACT_v2.md` §6 has a `CALL_ROUTES` entry and a `DataProvider` method; `CONTRACT_MAP.md` equals §6 |
| CT-03 | code | Nothing outside `data/mock/`, `data/provider.ts` and tests imports the mock server; `getAdapter()` returns the one `ApiAdapter` |
| CT-04 | transport | The mock server behind `node:http` driven through `httpTransport` passes the same store-level tests as the in-process transport (status codes 401/403/409/422/423 surface as `ContractError`) |
| CT-05 | capabilities | `capabilities()` drives Help, the Export button, Talk with EA, Week/Month segments and the Health section; flipping a flag flips the surface |
| CT-06 | fixtures | Every fixture record of a labelled noun carries `labels` (scheme-valid) and `focus`; the scheme in `data/labels.ts` matches `GET /labels/scheme` |
| CT-07 | mock server | §7 semantics: cap 5 open cards; expiry applies then-what; undo after 10 s → 409; pinned hide → 422; EA layout without reason → 422; locked group → 423; `?focus=` filters every noun |

### DS · Design system (Jest unless noted)
| ID | Screen | Check |
|---|---|---|
| DS-01 | tokens | `tools/gen-tokens.mjs` regenerated equals the committed `theme/tokens.ts`; every light key has a dark value; the pack README's named values hold (ground `#EDEBE5`, card `.58`, stat 18) |
| DS-02 | lint | A colour literal outside `theme/` fails lint (planted fixture proves it) |
| DS-03 | fonts, type | Instrument Sans 400/500/600 and Source Serif 4 400/500 load from the bundle; the type scale in `tokens.ts` matches `typography.css`; page title 32/26, body 12.5, meta 10.5 (core: computed styles on Today) |
| DS-04 | icons | `icons.generated.ts` holds every name in `iconNames` plus the mock's extras, each with a plain path and the active tab uses the fill variant |
| DS-05 | surfaces | Card = card token + blur 20 + card border + radius 10 + shadow; bar = bar token + blur 24; inset = accent-soft radius 8; ghost = dashed hairline (core: computed styles) |
| DS-06 | lint | `useWindowDimensions` or `Dimensions` outside `theme/useLayout.ts` fails lint; `useLayout` table: 393 → 1 column no rail, 768 → 2 with rail, 1024 → 2, 1180 → 3, 1366 → 3, 1920 → 3 |

### NR · Native lane (Jest `jest-expo/ios`)
| ID | Screen | Check |
|---|---|---|
| NR-01 | `lib/stt.ts` | `getSttEngine()` never throws with the native module absent; returns `available: false` with the honest line |
| NR-02 | overlays | A dialog or sheet that throws in render or mount is closed by its boundary with a toast; the tab stays usable |
| NR-03 | root | An error outside overlays renders the recovery screen in app colours with "Try again" |
| NR-04 | every surface | Every tab, dialog, sheet and primitive mounts under `jest-expo/ios` with the real stores; every string sits inside `<Text>` (tree walk) |

### QA · Process gates
| ID | Owner | Check |
|---|---|---|
| QA-01 | Stage 1c | `CONTROLS_v2.md` lists every `testID` with its promise and handler; a test cross-checks source ↔ file |
| QA-02 | Stage 1c | `tests/unit/handover.test.ts` guards every count quoted in `HANDOVER_v2.md`, `README.md`, `QA_REPORT_v2.md` against `evidence/*.json`, the marker count and this file's ID count (166) |
| QA-03 | Stage 1c | `evidence/mutation-pass.json` records the ten seams of `BUILD_PLAN_v2.md` §5 red→green |
| QA-04 | Stage 2 | `evidence/ux-review.md` signed by `ux-reviewer` on `demo/v2/` captures dated after the last code commit |
| QA-05 | Stage 2 | `AUDIT_v2.md` SIGNED OFF by `qa-auditor` dated after the last code commit |
| QA-06 | Stage 2 | `jstack-mock-v12.html` built by `tools/build-mock.mjs` from the production export, newer than the last app source change; **served** over `http://localhost`, the gate opens with a passkey and every tab runs on fixture data. Amended at row 24, A-55 |
| QA-07 | Stage 2 | `demo/v2/` holds Today, Tasks (list, board, gantt, done), Brain, Life, Agents, Settings, Arrange, task detail, decision history, locked screen at 393, 1024, 1366, 1920 × light, dark from the production build |
| QA-08 | Stage 2 | `main` == `v2-build` == `origin/main`, tag `v2.0` pushed, tree clean, `DONE.md` written |

**Count: 166** (GL 8, FS 5, DC 10, UN 4, TD 8, CG 8, TK 14, BR 12, LF 10, AG 12, SE 10, AR 7, LK 6, RL 8, VO 5, SEC 14, CT 7, DS 6, NR 4, QA 8). `tests/unit/handover.test.ts` asserts this number against the table rows.

## §2. Ruling on every v1.2 ID

Kept = re-cut into the V2 ID named. Retired = deleted with its surface or test; the reason is the ADR or the row.

| v1.2 IDs | Ruling |
|---|---|
| GL-00 | Kept as GL-01 |
| GL-01 | Kept as GL-02, LK-01 |
| GL-02 | Kept as GL-03 |
| GL-03 | Kept as GL-04 |
| GL-04 | Kept as GL-05 (36 px phone per the pack; 44 px rows) |
| GL-05, GL-10 | Retired: the orb is no longer centred (pack: bottom-right mic); Habits tab deleted (ADR-06) |
| GL-06 | Kept as GL-06 |
| GL-07 | Kept as UN-01/UN-04 (10 s undo toast replaces the 2.2 s toast) |
| GL-08, ST-05, CB-02 | Retired: bug reporter not in the V2 design (ADR-06) |
| GL-09 | Kept as GL-07 |
| TD-01 | Kept as TD-01 |
| TD-02 | Kept as BR-03 (Talk with EA moves to Brain) |
| TD-03..TD-07 | Kept as DC-01..DC-10 (five verbs replace approve/defer/dismiss/handled) |
| TD-08..TD-10 | Kept as TD-03 (Block it / Leave it) |
| TD-11, SH-03, SH-04 | Retired: memory conflicts modal replaced by Brain › Memory proposals (BR-06..08) |
| TD-12, TD-13, TD-20 | Retired: schedule attachments and prep escalation UI not in the V2 design; prep line kept in TD-04 |
| TD-14 | Kept as TD-05 |
| TD-15..TD-17 | Retired: News deleted (ADR-06) |
| TD-18, TD-19, RL-10 | Kept as AR-01..AR-06 (Arrange on every tab) |
| CA-01..CA-09 | Kept as CG-01..CG-08 (window 6–20, tonal, now line) |
| CA-10 | Retired: event detail dialog not in the V2 design; events open in Google (TD-04) |
| TK-01 | Kept as TK-01 (Done view added) |
| TK-02, TK-03 | Kept as TK-02 |
| TK-04..TK-08 | Kept as TK-14 |
| TK-09 | Kept as TK-04 |
| TK-10 | Retired: undo of filter and slice changes (undo is for record changes; ADR-04) |
| TK-11 | Kept as TK-05 |
| TK-12, TK-13 | Kept as TK-06 (read-only, ADR-12) |
| TK-14 | Kept as TK-03 (priority reads in the meta line, no red) |
| TK-15, TK-16, TE-01..TE-08, AT-01..AT-04 | Retired: the v1.2 task editor (tags, checklist, attachments, quick-add) is replaced by the mock's task detail (TK-08..TK-10); attachments contract kept for V2.1 |
| BR-01..BR-04 | Kept as BR-01, BR-02 (offline queue kept in the adapter, asserted in Jest) |
| BR-05, BR-06, BX-02..BX-05, ST-06 | Kept as BR-04 |
| BR-07, BR-08 | Retired: category chips and the Brain filter panel are not in the V2 design |
| BR-09 | Kept as GL-04 (journal is `sens`) |
| BR-10 | Kept as BR-03 |
| BR-11, BR-12, BR-13 | Kept as BR-05 (delete is V2.1) |
| BX-01, RL-04 | Retired: the 40/60 Brain split is replaced by the three-column registry (RL-02, RL-03) |
| HB-01..HB-08 | Kept as LF-02, LF-03, TD-07 (colours removed, ADR-06) |
| HB-09..HB-14 | Retired from the app suite: `migration/` is a standalone go-live tool, untouched; its own tests stay in `migration/` |
| AG-01, AG-09..AG-11 | Retired: Direct lines and agent threads deleted (ADR-06) |
| AG-02 | Kept as AG-01 |
| AG-03, AG-04, AG-06, AG-08 | Retired: forecast chart, model mix, skills list deleted (brief: off; ADR-06); landing figure kept in AG-02 |
| AG-05 | Kept as AG-02 |
| AG-07 | Kept as AG-05 |
| AG-12, AG-13, AG-14 | Kept as AG-04, AG-06, AG-07 (Security tab becomes Security checks and Agent issues) |
| AG-15 | Kept as SEC-15 |
| AX-01..AX-04 | Kept as AG-01 (stats derived from runs; drill-down kept small) |
| SH-01, SH-02 | Kept as VO-01, BR-03 |
| ST-01 | Retired: Pulse dialog replaced by the health line (TD-02) and Agents |
| ST-02, ST-03, ST-04 | Kept as SE-02, SE-03 (Face ID setting row not in the V2 design) |
| QB-01 | Kept as the per-row gates |
| QB-02, QB-03, GD-07 | Retired: performance traces (no list over 50 rows in the design; no drag) |
| QB-04 | Kept inside GL-05 (accessibility label on every control, asserted by the same sweep) |
| QB-05 | Kept as the copy checks inside DC, TD, BR, AG rows (exact strings) |
| QB-06, RL-11, LY-07 | Retired: screenshot regression replaced by the Stage 2 device pass (QA-04, QA-07; ADR-05) |
| QB-07 | Kept as CT-01 |
| RL-01, RL-02, RL-06, LY-01..LY-03 | Kept as RL-01..RL-04 (pack breakpoints 768/1180; ADR-07) |
| RL-03 | Kept as TK-05 |
| RL-05, LY-05 | Kept as RL-06 |
| RL-07, LY-06 | Kept as RL-07 |
| RL-08 | Kept inside GL-07 and the shortcuts row 6 (1–5, Esc, Cmd/Ctrl+K, Cmd/Ctrl+Z, A/R/L) |
| RL-09 | Kept as GL-05 |
| LY-04, BT-02 | Kept as RL-08 |
| BT-01, BT-03 | Retired: v1.2 button-centring defects; the pack's primitives are asserted by DS-05 and RL-08 |
| KB-01..KB-03 | Retired: keyboard-inset rig; the V2 sheets are short and the mic hides while listening, not while typing |
| OR-01..OR-04 | Retired: the orb is redesigned as the pack's mic (RL-01, VO-01); no scroll-shrink |
| GD-01..GD-06, GX-01..GX-05 | Retired: Gantt drag (ADR-12) |
| NC-01 | Kept as QA-01 (`CONTROLS_v2.md` plus the handler cross-check) |
| NC-02 | Kept as DC-05 |
| NC-03 | Kept as DC-02 (alternatives are the card's options) |
| NC-04 | Kept as DC-06 |
| NC-05 | Kept as BR-01, TD-07 (empty blocked) |
| VO-01..VO-05 | Kept as VO-01..VO-05, BR-02 |
| DM-01..DM-03 | Kept as DS-01, GL-03; contrast values are the pack's (README "Accessibility") and are spot-checked by `ux-reviewer` |
| TM-01..TM-05 | Retired: Test mode deleted (ADR-06); the `__JSTACK__` rig carries the levers; SEC-01 keeps the prod strip |
| SEC-01..SEC-03, SEC-05..SEC-14 | Kept, same numbers (SEC-04 native snapshot retired: no phone build in V2; SEC-07's high-risk set is the V2 one) |
| BS-01..BS-06 | Retired: backend starter retired (ADR-02); CT-04 keeps the HTTP proof |
| NR-01..NR-04 | Kept as NR-01..NR-04 |
| NR-05 | Kept as NR-04 |
| NR-06 | Retired: Expo Go module inventory (no dev-server delivery in V2; the production web build is the deliverable) |
| NR-07 | Kept as DS-02, DS-06 (the guard mechanism, with V2 rules) |
| MS-01..MS-04 | Kept as RL-06 and the `session` store's single dialog/sheet stack (one open surface; a child returns to its opener) |
| NX-01..NX-04 | Retired: News (ADR-06) |
| PL-01..PL-03, PL-08 | Kept as CT-06 |
| PL-04..PL-07 | Retired as UI: label chips and the label editor are not in the V2 design; labels stay on every record and drive focus (FS-02); legend and editor return in V2.1 if a design exists |
| CB-01, CB-03 | Kept as GL-08, CT-05, VO-04 |
| QA-01..QA-05 | Kept as QA-01..QA-08 |

## §3. Protocol

- A row's tests are written first and shown red for the right reason. Never edit a test to make it pass; a wrong expectation is logged in `BUGLOG_v2.md` as an A-row and the change is recorded in §4 before the code moves.
- Every Playwright test installs the virtual authenticator, collects the console and asserts the budget is zero at the end (GL-01).
- Every mutation is asserted through `db()` or a store snapshot after reload, never through UI text alone; copy assertions are additional.
- Core specs run at `w393-light` and `w1366-light`; matrix specs run on all eight projects; a test that is flaky under parallel workers moves to `@timing`, never gets loosened.
- Exact copy comes from mock v11 and the design pack's content rules; a new string not in the mock is written in the pack's voice and listed in `CHANGES_v2.md`.

## §4. Expected-value updates (the build appends; never deletions)

<!-- ID · old expectation · new expectation · BUGLOG_v2 A-row · reason -->

| ID | Old expectation | New expectation | A-row | Reason |
|---|---|---|---|---|
| BR-09 | Memory hit-rate why-line reads `2 wrong sources · 3 miss · 1 rules misled` | `2 wrong sources · 3 misses · 1 rule misled` | A-42 | The old string was the defect, not the spec: it disagreed with its own counts on the one row in Brain whose job is honesty about the system's accuracy (README Content, "Plain words"). Raised by the Stage 2 ux-reviewer as D28. The copy is now pluralised from the count, so it stays right at any value. |
| DC-04 | "`payee / BSB / ref` grid with `copy` links" — read as a link on every row | copy links on BSB and ref; none on payee | A-52 | The build had shipped ONE copy link (ref) and the spec asserted the absence of the others, which made a narrowing look like the design — the one place this stage skipped §3's route, found by the audit as B4-03. Corrected in the direction of the row rather than away from it: a bill card's purpose is to hand the owner the strings they paste into a banking app, which is the account/BSB and the reference. The payee is a name you read, so it keeps no link — stated here rather than implied by a test. |
| QA-06 | mock v12 "opens unlocked on `?unlocked=1`" | served over `http://localhost`, the gate opens with a passkey and every tab runs on fixture data | A-55 | There is no `?unlocked=1` in V2 — no query parameter, no lever, nothing reads it; the rig's unlock is `__JSTACK__.unlockForCapture()` and the production export this row also requires the mock to be built from strips the whole rig (SEC-01). So the old expectation named a mechanism that does not exist and, if it had, could not have survived the build the same row demands. What the mock actually needs to prove is that the SHIPPED app runs on fixture data, and it does: served on localhost the gate takes a real passkey ceremony and all five tabs render, zero console errors, zero off-origin requests, `__JSTACK__` undefined. Opened from `file://` it shows the gate and cannot unlock, because WebAuthn has neither a secure context nor an RP ID there — so the README and `HANDOVER_v2.md` tell the reader to serve it rather than double-click it. Raised by the audit's round 7, which also caught this row's first draft crediting "or show the gate honestly" to QA-06: that phrase is `12_CC_V2_AUDIT_PROMPT.md` §3's, not the acceptance row's, and citing it as the row's own would have made the amendment look like a reading rather than a change. |
| SEC-01 | "`testHook`, the STT rig and **mock seams** absent from the production bundle" | the test hook and STT rig absent; the mock server present by design | A-47 | The clause was unprovable as written and had been quietly treated as satisfied. `mockTransport` IS in the production bundle and must be: ADR-02 makes the mock an in-process server and the demo build is the app running on it — that is the artifact Josh opens. The grep half that matters (`__JSTACK__`, `testHook`, `useMockStt`, the clock and connectivity levers) is real, runs, and returns 0. Raised as A-12 in the audit's round 1 and, as its round 2 correctly noted, neither fixed nor logged then; the honest fix is to say what ships rather than to claim a strip that cannot happen. |
| GL-05 | "Every interactive element ≥ 36 px on phone", with `hitSlop` counted toward it | 36 px on the element's REAL box, with pack-fixed component sizes exempt and asserted against the pack instead | A-46 | Two things were wrong. `hitSlop` is a **no-op on react-native-web** (only its legacy Touchables honour it), so crediting `2 × data-hitslop` toward the floor passed controls whose tap target was unchanged — an 11 × 14 link measured as 39 × 42, and 24 controls sat at 13–14 px while GL-05 read PASS. Removing the credit then exposed a second thing the credit had been hiding: the pack FIXES several component sizes below 36 ("Icon button: 32 or 36 square", "Checkbox: 15px", "Habit chip: min-height 34", "switches 26 × 15", "30px buttons"), so a blanket 36 cannot be met without breaking the pack GL-05 exists to enforce. The rule now says what is actually true and checkable. |
| TK-06 | Gantt footer reads "Drag a bar to change dates. Open in Twenty for the full timeline." | "Bar dates come from Twenty. Open in Twenty for the full timeline." | A-45 | The row instructed an action the build deliberately does not have: ADR-12 retired Gantt drag entirely and TK-06's own text says "no drag" in the same sentence. The string came from mock v11, where the Gantt is a static card. Told to drag a bar, the owner finds no affordance — the copy was wrong, not the build. |
| TD-06 / TD-07 / CG-04 / LF-02 | Surfaces key "today" off `TodayComposite.dateLabel` | They key off the new `TodayComposite.todayDate`; `dateLabel` is display-only | A-43 | `dateLabel` was doing double duty as the rendered subtitle AND the machine date key. Row 22 made the subtitle human ("4 September", ux-review D26) and so emptied every surface that compared a habit-log or calendar date against it. The two meanings are now two fields (B-55). |

