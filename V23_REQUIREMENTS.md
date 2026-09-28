# V23_REQUIREMENTS.md — Josh's requirements, decisions and working rules, consolidated from 41 sessions

Compiled 14 September 2026 by the v2.3 planner from Josh's own typed turns in every JSTACK Claude Code
session since 30 August (extracted verbatim per session into the planner's scratch `inputs/` folder),
his V2 design brief (`Dev PM/JSTACK why build an app - brief v2.html`, "decided" sections), his 7 Sep
QA notes (`_planner-notes/JOSH_QA_v22.md`) and his 13–14 Sep instructions to the REMAP review and to
this planner. **Precedence: the newest instruction wins.** Quotes are Josh's words; everything else is
the planner's reading, marked as such. Status column: **built** (in v2.2, with where), **v2.3** (this
round), **stage 3** (REMAP's backend/native work), **later** (a version Josh has named), **open**.

## 1. Purpose, and what must never change

- Why the app exists: "an interface that helps me understand what's going on in my world as well as in
  the agent stack to verify what's happening but also then make key decisions and take action much
  faster and easier than I would if this was me texting at an agent back-and-forth through telegram"
  (3 Sep). The four jobs, from the brief: decide, verify, teach, see; plus share (Joce, later) and keep
  (maintained through Claude Code).
- "My brain flow is less centred around 'when will i need something' and more about what do i 'want
  focus on / think about now'" (3 Sep) → the focus switcher, Option B, five tabs.
- Consolidation earns its place: "having information consolidated in one view does make sense — to avoid
  me having to look at 2-3-4 different apps" and "links to other important portals" (3 Sep).
- Product rules that shape everything (brief, "What can't change"): no send/pay/book/revoke verb
  anywhere; provenance visible; Needs you capped at five a day; security designed in and visible;
  touch targets (46 px buttons, 44 pt minimum, mic tap target ≥ 60 pt); light and dark first-class with
  WCAG AA in dark; phone = bottom tabs + floating mic, iPad/desktop = rail, columns from content width;
  focal dialogs; React Native (Expo) on iOS and web; reduced-motion fallbacks; **battery: no background
  work, no polling, live connections only while visible**.
- The never-reintroduce list (brief): taglines under the greeting, memory conflicts in the daily feed, a
  Projects top-level view, an algorithmic learning feed, small touch targets, an off-centre or bold orb,
  terminal steps for bug logging, any send or pay affordance, a Today shaped by time of day, an energy
  or readiness section, a Sunday-only review, marketing gloss, invented data.
- Taste: "Calm over clever. The app should disappear: glance, act, leave." "I notice alignment, wasted
  space, tiny dialogs, decorative noise lines and anything that looks tappable but isn't."
- "It's easier to remove a feature than to add it — as I'll be doing the coding changes through CC
  myself" (3 Sep). "Optimise for a great app experience, stability, maintainability and human dev
  handover & improvement" (4 Sep).

## 2. Scope decisions that bound v2.3 (newest first)

| Date | Decision (Josh) | Effect on v2.3 |
|---|---|---|
| 15 Sep | "Teach to form part of JStack V3 multi agent as memory refinement will be an agent task. Teach feeds that agent better info from me based on what it finds as conflicts/gaps/improvements." | Answers the 14 Sep row below: memory curation's stage is **V3**, not REMAP's to pick; `DECISIONS.md` ADR-71, `KNOWN_GAPS.md` §2 |
| 14 Sep | "Voice and files will be included in this first version. Money and health can come later revisions. Remap devs to decide when memory curation falls in JStack dev stages" | Voice and files defects fixed now (WP-B); money/health untouched; memory curation listed for REMAP, not built |
| 14 Sep | "the real version will be using my Apple Developer account pushed to an app on my iPhone and iPad. So, we don't need to use Expo Go" | `eas.json`, `NATIVE_RUNBOOK.md`, native dictation wired (WP-B/WP-D); Expo Go described as a temporary demo channel |
| 14 Sep | "make sure offline mode works well in the version that I start using … capture thoughts and new notes and plan tasks and so on that then sync as it comes back online automatically in the background … I don't want to cache the whole database" | WP-A: reachability on native, offline empty states, last-seen cache for Today/Tasks/Brain only, encrypted queues, the logged offline defects |
| 14 Sep | "Include cleanup of the defects remaining" | The REMAP first-look's "still to fix" list and the carried rows that are data loss or wrong writes are all in WP-A..D |
| 14 Sep | Handover: "hybrid human + agent process flow + supporting materials … humans do the stuff only humans can do, and enable an agent to do what an agent can do … <1 week, 1–2 realistic" | WP-E: the hybrid plan tab in the REMAP pack |
| 14 Sep | Token rule: "Fable must do the thinking and verification … cheaper models to get things done"; < 50 % of the weekly Fable allowance for Task 1, < 10 % for Task 2 | Planner (Fable) plans, verifies and releases; Opus/Sonnet build; Opus audits; Fable QA runs once at the end |
| 13 Sep | "Ignore the bug capture" (in-app bug reporter) | Not built, not listed as a gap |
| 7 Sep | "Audit caps: decide now whether tag v2.2 is allowed with open non-security items. Yes. Remap to plumb in the security ready for live app" | Server-side security (Q8–Q14, Q20, Q24) stays REMAP's; the app-side items REMAP's review named are fixed in WP-D |
| 7 Sep | "I consider V2.2 to be the final product that gets handed over to remap … I do not want to hear that they a) cant understand or disagree with the code structure decisions, b) see errors and dumb logic, or c) find bugs" | The bar for v2.3's handover |
| 5 Sep | "I dont want to do Cloudflare. I want to hand it to remap for them to do that or vercel" | Hosting stays REMAP's choice; `DEPLOY.md` keeps both recipes |
| 5 Sep | "EA created sections we'll do later … Prob part of remap project v3" | Config-record sections only (ADR-39); code-brick sections are V3 |
| 3 Sep | Focus switcher Option B; "Start with Everything (always keep this as an option), Personal, Family, Work" | Built |

## 3. Requirements by area, with status

Sources: brief = V2 design brief (decided sections); QA = 7 Sep QA notes; Bp = V2 planning session (4–8 Sep);
P4 = planner 4 session (10–14 Sep); RO = REMAP review session (13–14 Sep). "built" cites where.

### 3.1 Today
| Requirement | Source | Status |
|---|---|---|
| Needs you (max 5, counter, history), From your EA with "because" chips, calendar with free gaps, Your tasks (unfinished only), At a glance, Close the day (habit check + journal with mic and keyboard), footline, Review on demand | brief | built (V2.0 acceptance set, `QA_REPORT_v22.md` §1) |
| Calendar on Today: "helps me see everything in the same place and consider when I might reschedule" | Bp 3 Sep | built (read); write-back and drag-to-gap proposals (`getEvent`, `patchEvent`, `deleteEvent`, `postCalendarPropose`: routes exist with no caller, `evidence/wiring-orphans.json`) → **answered (Josh, 15 Sep, Q1):** "Part of V2. Will have 1 gmail calendar in V2, adding a second calendar to see combined view in V3." One Google calendar's write-back is REMAP's stage 2; a second calendar and the combined view are **V3** (`KNOWN_GAPS.md`) |
| "Talk with EA" and "Dictate to EA" reachable from Today | QA 11 | built (CHANGES_v22 §7) |
| Sync dot: green/amber/red, subtle, in the toolbar; desktop beside the health line labelled "sync status" | QA 16, Bp 7 Sep | built (`components/chrome/SyncDot.tsx`); label reads "Sync" with the state in colour and `aria-label` — accepted deviation, planner's note |

### 3.2 Tasks
| Requirement | Source | Status |
|---|---|---|
| List · Board · Gantt · Done; slicers; owner marks (me, EA, Joce); Delegate one tap; EA edits with reason and undo; recurring incl. EA-owned; Done searchable with reports | brief | built (V2.0/V2.1) |
| Delegate the whole task, label it, picker with default pre-selected; subtask "⋮" menu (edit, change delegation, delete) | QA 2 | built (CHANGES_v22 §2) |
| Files section on the card with the task's AND all subtasks' files; recent-files cache that drops off | QA 2 | built roll-up (`components/tasks/Files.tsx`); cache expiry is a server/Dropbox concern → stage 3 |
| Edit priority, start and end date/time (defaults 09:00/17:00), complete-all-subtasks, the "not all subtasks done" prompt, completion timestamps, models and tokens per task/subtask | QA 2 | built (CHANGES_v22 §2: card, completion rule, timestamps, usage rows) |
| Filter on all four views; date range default 90 days (Done shows all); owner filter human vs agent; active filters visible; slicers editable like Focus filters; Clear all | QA 3, Bp 7 Sep | built (CHANGES_v22 §3) |
| All times local and readable | QA 4 | built (ADR-47, `lib/time.ts`, two-zone test runs) |
| Board: human vs EA visible; edit columns in Twenty, app mirrors; drag between columns; column in the filter | QA 5 | built (CHANGES_v22 §4) |
| Gantt: date axis, filters applied, drag to reschedule, drag ends to resize | QA 6–7 | built (CHANGES_v22 §4) |
| Agent-in-progress visible on card and summary | QA 8 | built (CHANGES_v22 §2 "usage rows per run"; live progress needs the run log → stage 3) |
| "Archive of deliverable documents … searchable" | QA 9 | built as Brain › Files + `GET /search`; the store is Dropbox (ADR-64) → the server index is stage 3 |
| Focus border blocks the cursor on PC | QA 10 | built (fixed in V2.2) |
| 8 Sep six lines: labels on start/end date fields; Delegate popup front and centre; "high priority" readable and coloured; owners JO and JM; "select date range"; collapsing Waiting on must not hide Gantt | Bp 8 Sep (`history/v2/JOSH_QA.md`) | built (JQ-1..JQ-6, `STATE.md` josh_qa line) |

### 3.3 Brain
| Requirement | Source | Status |
|---|---|---|
| Mind dump (mic + keyboard), Talk with EA (two-way voice, in app), Dictate to EA (EA replies in text), Find; Latest in with routing chips and silo/label chips; Memory proposals ok/edit with full history; Rules for my EA moved to Settings | brief, QA 11, Bp 7 Sep | built (CHANGES_v22 §7–§9); **MH-A: the mock writes no history entry on accept** → v2.3 (WP-C C-6) |
| Mic state always visible; never a mic left on unknowingly: "this must never happen" | QA 11 | built (D-6 fixed at A-6); **Talk after a lock still says "listening"** → v2.3 (WP-B B-3) |
| Search results and Latest in open to full content with the topic highlighted | QA 11 | built (CHANGES_v22 §8) |
| All inputs go to the default agent for triage, labels and storage; replies come back to Brain, Today and push | QA 11 | built client-side (replies, triage cards); the agent behaviour is stage 3 |
| Share from iPhone/iPad "in the main app options list"; scrape shared content by default (YouTube transcripts) | Bp 7 Sep | built as the iOS Shortcut + PWA share target (`HANDOVER.md` §8); **native share extension (Q22) and scraping/screening (Q24) are stage 3 — screening is a REMAP security decision** |
| Mind dump box larger, font normal; Latest in cards shorter; Talk simplified | Bp 7 Sep | built (V2.2 ux rounds) |

### 3.4 Life
| Requirement | Source | Status |
|---|---|---|
| Goals with edit, tasks from a goal, history on complete/delete | QA 12 | built (CHANGES_v22 §9) |
| Habits: month, year, all-time views; delete retains data; restore | QA 12 | built (CHANGES_v22 §9) |
| Learning items open; view all + search | QA 12 | built (CHANGES_v22 §8) |
| People kept by the EA; sections configurable by the agent | brief | built as config records (ADR-39); the EA's proposals are stage 3 |
| Money (budget vs spend, bills, subscriptions, feed) | brief, 14 Sep | **V5** (Josh, 15 Sep: "Money & health move to JStack V5 stage") |
| Health | brief, 14 Sep | **V5** (Josh, 15 Sep: "Money & health move to JStack V5 stage") |

### 3.5 Agents
| Requirement | Source | Status |
|---|---|---|
| Stats, spend ring with caps (units "$AUD/mth"), portals grid, 24-hour feed, Decision history opens with detail, Agent issues open + view all + search, Security checks | brief, QA 13 | built (CHANGES_v22 §8–§9) |
| Emergency lock: hold to lock; cancel resets the subtext; recovery without losing memory | QA 13, Bp 3 Sep | built client-side; **recovery runbook is REMAP's** (brief: "REMAP owns the runbook") |
| Recurring tasks for the EA; schedules with pause and run-now | Bp 3 Sep | built (V2.0 Settings › Schedules) |

### 3.6 Settings, search, sync
| Requirement | Source | Status |
|---|---|---|
| Notification names 5–10 chars, TG explained; autonomy expandable; voice speeds incl. 1.75x/2x; "End my turn after silence" off by default with 10 s and 60 s | QA 15 | built (`components/settings/Voice.tsx`) |
| Push notification toggle in Settings | Bp 7 Sep | built (`components/settings/Notifications.tsx` `push-switch`) |
| Global search with silo and sensitivity filters | QA 14, Bp | built (CHANGES_v22 §8, server-scoped) |
| Lock: 10 min inactivity on desktop, a parameter the EA can change; phone/iPad lock on device sleep with Face ID to reopen | QA 1, Bp 7 Sep | built (CHANGES_v22 §1: lock on hide on touch, tunable on desktop, parameters registry) |

### 3.7 Voice (in the first release)
| Requirement | Source | Status |
|---|---|---|
| Two-way voice in the app; text both ways; replies read aloud; "my driving mode"; full-screen or large overlay; a visible live state so it cannot be left on by accident | Bp, QA 11 | built (Talk is the only `screen` overlay; Close and End) |
| Pauses of seconds to minutes must not end a turn; "still there?" after 10 min; end phrases confirmed with yes/no | Bp 5 Sep | built (`lib/voice/session.ts` hold, `data/mock/voice.ts` presence at 10 min, "End the conversation? Yes or no.") |
| Voice must work on the iPhone build ("the voice feature doesn't work at all") | QA iPhone 2 | **v2.3**: native dictation wired behind the one mic owner (WP-B B-4); the Talk socket needs REMAP's provider (stage 3); iOS Safari audio path is a device check |
| A dropped socket must not lose speech; a typed line shown once | RO | **v2.3** (WP-B B-1, B-2) |

### 3.8 Files
| Requirement | Source | Status |
|---|---|---|
| "All files should be saved in Dropbox, including what I share and what the agent creates"; attach to tasks and to the Brain entry; Files section shows mine and the EA's with a filter | Bp 7 Sep | built (ADR-64, CHANGES_v22 §6); the Dropbox app, index and inbox watcher are stage 3 |
| An upload queued while its capture goes through online must be filed with the capture | RO | **v2.3** (WP-B B-7) |

### 3.9 Offline and sync
| Requirement | Source | Status |
|---|---|---|
| "Make sure offline capture is seamless" — outbox, ordered replay with offlineId, visible queued/syncing states, delta fetch on open, decisions online-only | Bp 5 Sep | built (`data/transport/outbox.ts`, `e2e/core/offline.spec.ts`) |
| Works well in the native build: knows it is offline, tells you when nothing is cached, keeps last-seen Today/Tasks/Brain, syncs on its own when back | 14 Sep | **v2.3** (WP-A A-1..A-3); replay while the app is closed is not possible on either platform without background modes — recorded, not pretended (WP-A A-11) |
| No capture lost: refused captures survive reload; the native key race; the share carries an offlineId; the web queue encrypted like native | RO, offline audit | **v2.3** (WP-A A-4..A-9) |

### 3.10 Security
| Requirement | Source | Status |
|---|---|---|
| Security by design, visible, continuously checked (watchdog, blocked-action tests, injection tests, canaries, secrets scan, restore drill) | brief | app surfaces built; **the checks themselves are REMAP's** (KNOWN_GAPS §3) |
| "Leave some questions in the remap handover doc/map for them to 'harden' security" | Bp 5 Sep | Q8–Q14, Q20, Q24 in `CONTRACT.md` §8, restated in the pack's questions list |
| Pinning honest (fail closed), credentials explicit, request timeout, typed passkey ceremony | RO | **v2.3** (WP-D D-3..D-6) |
| Prompt-injection screening of shared/scraped content: "a remap team discussion point" | Bp 7 Sep | stage 3, REMAP decision (Q24) |

### 3.11 Native iOS/iPad
| Requirement | Source | Status |
|---|---|---|
| iPhone home-screen app, iPad both orientations, desktop; one state on the server, encrypted cache on devices; battery: no background work | brief | built (PWA + Expo); native build track is Josh's |
| Josh publishes on his own Apple developer account; Expo Go temporary | 14 Sep | **v2.3**: `eas.json`, `NATIVE_RUNBOOK.md` (WP-D D-8, D-9) |
| iPhone keyboard: no zoom, bigger text box above the keyboard | QA iPhone 3 | built (V2.2 §10, 16 px inputs, mock viewport fixed 14 Sep) |
| Widgets, watch, CarPlay, board mode | brief | later (V3) |

### 3.12 Backend and plumbing (REMAP's stage 3, restated for the handover)
| Requirement | Source | Status |
|---|---|---|
| Every run logs which memories and rules it used (Josh: "yes"); last-seen timestamps and change log ("yes"); source URL and receipt on every card ("recommended yes") | brief, decided before build | contract fields exist for receipts and since; the run log is a REMAP table → stage 3 |
| Calendar events and captures carry a focus/project label; the exit pack (one-action export) | brief, questions for REMAP | **open, REMAP** |
| Twenty for tasks/people and board columns; Google for calendar; REMAP memory; LiteLLM caps; n8n; OpenClaw EA; Telegram as fallback door; Dropbox files; push; voice provider | brief, Bp | stage 3 (`KNOWN_GAPS.md` §3, `CONTRACT.md`) |
| Finance feed (Redbark/PocketSmith), helped-or-misled report | brief | later (V2.1 in the brief, then "money later" 14 Sep; report timing is REMAP's) |
| Second user (Joce), family tenant, EA-created code sections | brief, Bp | V3 |

## 4. What the handover must be (Josh's words, 7–14 Sep)

- "a full set that Remap can use to plug this in and get it working in minimum time & effort. Code on
  github (as v2.2), handover docs, and other useful notes. Ensure these are not too long winded like you
  tend to do — concise and accurate" (11 Sep).
- "a simple summary of what JStack needs to be setup to run — in other words, very clear terms what they
  need to 'connect' on the back end … Include database schemas … Assume competent devs, and keep the
  words to a minimum. I want their work to be to a) understand the app, b) understand the code c)
  understand how to connect it to their back end, d) understand what other tasks they must complete
  (eg security, iphone readiness, face ID etc.), and e) how they should test it" (11 Sep).
- "DO NOT reconstruct this deliverable, update what is there in the current format … add additional
  sections using the same style with collapseable fields" (11 Sep) — the REMAP pack format stands.
- "Improve this so they understand in 20% of the time / reading effort. Include details (collapsed?) so
  they can dig in if they want" (7 Sep). "Give me the files here. No MD files for me. Create a html."
- "Give me a version with auth temporarily disabled for today" (10 Sep) → the review mock
  (`jstack-mock-v1N-review.html`, passkey gate off, fixture data) is a standing deliverable beside the mock.
- 14 Sep (this round): why-build-an-app brief for peers (minimal change); the mock; ONE Remap pack that
  keeps its simplicity, adds the hybrid human + agent plan without overlap, links everything else, says
  what works at the end of stage 2 and what is stage 3/4, and lists questions and decisions ranked by
  impact and risk; consolidate other deliverables where possible; appendix with collapsibles rather than
  losing context.

## 5. Working rules Josh has set (for every instance, any version)

- Quality first, then calendar time, then tokens: "Quality output then speed are our goals" (7 Sep);
  "QA matters more than speed" (14 Sep). "A guard you have not watched fail is not evidence."
- Never ask, never wait: "Never ask; take the safer default, write NEEDS_JOSH.md if a decision is Josh's,
  and keep going" (4 Sep). Action from Josh only in daylight 07:00–17:00, with warning.
- Reports: "Only update me at major events. Minimal text. Kiss" (7 Sep). "Reply more concisely. I dont
  have time to read everything in all the CC instances" (8 Sep). A morning report when asked, on time.
- Tokens: conserve; no polling; no excessive swaps ("Opus 1 only has 235k context used and this swapping
  is the token waste"); Fable for planning and verification only; cheaper models execute.
- Trust: "Josh has seen too many unverified claims" — every claim names the file and the command;
  a check not run is reported as not run. Opus models have made planning mistakes; the process must
  catch them, not the planner's hope.
- Files: GitHub is the primary home; Dropbox mirrors and replaces rather than accumulates versions;
  v2.x code saved in Dropbox as the backup; no branch protection (RR-05 closed 7 Sep).
- Docs: least words, professional, no "AI babble", tables without white space, a clickable TOC,
  collapsibles for depth, Australian spelling, sentence case.

## 6. Open questions and decisions (to be ranked in the pack)

**Josh's**: what Teach stores on a non-triage card; the Talk-after-lock copy (planner's default:
"Paused — locked" + Resume, WP-J); accept the security assumptions in `CONTRACT.md` §8; the go/no-go
before real data. *Answered 15 Sep:* calendar write-back staging (Q1: V2 stage 2 for one Google
calendar, V3 for a second and the combined view); memory curation's stage (P-7: V3); money and health's
stage (P-9: V5); the emergency lock's local-vs-full behaviour and what a wipe touches (P-10); rules and
memory history (Q4: append-only); native dictation (P-2: unsure — moved to REMAP's list below to
confirm in planning).

**REMAP's**: the voice provider (open-source STT/TTS candidates in the pack); prompt-injection
screening design (Q24); focus labels on calendar events; the exit pack; hosting (Vercel or Cloudflare);
pagination timing; the recovery runbook after an emergency lock; EAS project ownership (Josh's account)
vs their own; native dictation approach — confirm in planning (P-2, `KNOWN_GAPS.md`); the
unreachable-lock threat model — check the scenarios still hold (Q3, `KNOWN_GAPS.md`, `SECURITY.md`).

## 7. What v2.3 changes, mapped

WP-A offline (3.9, 3.11); WP-B voice and writes (3.3, 3.7, 3.8, plus A4R6-11 and A4R8-02); WP-C
keyboard, dialogs, acceptance IDs, MH-A (3.3, product rule "one close per open", the nine PARTIAL rows);
WP-D connect toolkit, transport truth, native config (3.10, 3.11, REMAP's review §3); WP-E the handover
(§4). Money, health, memory curation, the native share extension, scraping and screening, the run log,
the exit pack and the second user are not in v2.3 by Josh's decisions in §2.
