# CODEMAP

**Read this before planning any change to this codebase.**

Eleven sections. Five are **generated** from the source by `tools/gen-codemap.mjs` and stamped
with the commit they were true at (four maps, and the companion lists in section 11); six are
**written by hand** because they carry judgement a generator cannot have. The generated ones are delimited with
`<!-- generated:start … -->` markers — do not edit inside them, your edit will be overwritten
on the next `pnpm codemap`.

> **Verify before you rely on it.** The generated sections are true at the sha stamped on each
> block, not necessarily at the commit you are reading. If you are about to act on a path, a
> line count or a testID from this file, open the file and check. `tests/unit/codemap.test.ts`
> keeps the hand-written sections from naming things that do not exist, which is a weaker
> claim than "everything here is current".

---

## 1. Read this first

**What this is.** JSTACK is a personal executive-assistant app for one person, Josh. The EA
proposes; Josh decides. Every screen is a surface for reviewing what the EA has done or wants
to do — nothing in the app acts on the world without an explicit verb from him, and the four
verbs that would (send, pay, book, revoke) are refused outright in this build.

**The layers, top to bottom.**

```
app/                 expo-router routes — the shell and five tabs, nothing else
components/          the screens, by tab: today, tasks, brain, life, agents, chrome, settings
layout/              the registries — which sections a tab shows, which dialogs exist
stores/              zustand, one per domain; the ONLY place a component gets data
data/                the contract: types, routes table, ApiAdapter, and the mock that serves it
lib/                 cross-cutting: time, auth, keyboard, mic, encrypted storage
theme/              tokens (generated from the design pack) and the ui primitives
```

**The one data path.** A component never fetches. It reads a store; the store calls
`getAdapter()`; the adapter is either `ApiAdapter` (real HTTP, one method per row of
`data/routes.ts`) or the in-process mock (`data/mock/server.ts`, which builds its router from
that same table). Swapping between them is an env flag and nothing else — that is what
`BS-05` proves. A detail dialog fetches through ONE hook, `components/detail/useDetail.ts`,
and an archive through ONE dialog, `components/chrome/SearchableListDialog.tsx`; nothing
else under `components/` or `app/` imports the provider — `tests/unit/boundaries.test.ts`
names those two and refuses a third (P-3, P-4).

**The n8n transport (REMAP, ADR-76).** A third transport sits beside those two:
`data/transport/n8n.ts`, chosen by `EXPO_PUBLIC_DATA_SOURCE=n8n` in `data/config.ts` and wrapped
by the outbox as HTTP is. It reports reachability itself, around its webhook calls only — most of
its answers are made on the device, and `withReachability` would read a local default as the
server answering (ADR-78). It is a dispatcher, not a server: it
matches each request against `data/routes.ts` in table order and answers it by its row in
`data/n8n/registry.ts` — `wired` (one webhook, through an adapter of its own in
`data/n8n/adapters/`, whose output must validate against `openapi.yaml`), `derived` (a composite
assembled from wired rows, sharing one in-flight call per webhook), `default` (configuration,
`data/n8n/defaults.ts`), `empty` (the contract's empty value, `data/n8n/empty.ts`) or
`unavailable` (`501`, where the empty value would claim activity, ADR-78). A write with a key
(the registry's `WRITES`) goes to its webhook and forgets that key's shared reads; a write with
no key answers `501 { reason: "not connected yet" }` and never leaves the device. While the
session is locked every call but the unlocking ones waits for the unlock (ADR-83). The only way out is
`data/n8n/client.ts`'s `callWebhook(key, body)`, a JSON POST to the proxy at
`<N8N_BASE_URL>/<key>`; the browser names a short allow-listed key and never an n8n path or a
secret — the proxy (`remap/dev-proxy.mjs` locally, nginx in production) adds the header. Raw n8n
JSON never reaches a store. `data/n8n/` may not import `data/mock/` (CT-03), so what it needs of
the mock's semantics is copied with its source named. `USE_API_ADAPTER` is true on n8n: no mock
sign-in, no watermark, no fixtures.

**Where truth lives.** The design pack (`design/`) is the truth for anything visual, through
`theme/tokens.ts`, which is generated from it. `data/routes.ts` is the truth for what
endpoints exist. `02_ACCEPTANCE_TESTS_v2.md` (166 IDs), `…_v21.md` (123) and `…_v22.md` (190,
plus Josh's rows and the carried ones in its §3) are the truth for what "done" means — all
three, and the V2.2 file is the one this build was written against. The ADRs are the truth for
why. When two disagree, `design/DISCREPANCIES.md` records
which won and why.

**What will bite you if you skip section 6.** Dates are Brisbane, held as UTC fields — never
read a local date field. Overlays must mount at the root, never inline. Array order is
stacking order. And a green test you have not seen fail is not evidence.

---

## 2. The map of the territory

<!-- generated:start section=2 sha=7b1099c date=2026-09-30 -->

### `app/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `+not-found.tsx` | 27 | Unknown routes are DROPPED (spec §14.9 — SEC-11, LK-03): straight back to Today with a toast, and the Face ID gate still fronts everything (it overlays every route on launch, so a route opened while locked shows the gate first). | — |
| `_layout.tsx` | 99 | The real root layout (row 6, ADR-10, ADR-15). | — |
| `capture.tsx` | 110 | /capture (W-1, UP-04, ADR-64) — where something shared from another app lands. | — |

### `app/(tabs)/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `_layout.tsx` | 51 | The real tabs shell (row 6, ADR-01, ADR-07): Rail (≥768) or TabBar (<768), the mic Orb, and `MicBanner` while a microphone is open. | — |
| `agents.tsx` | 22 | Agents — configuration only (ADR-01). | — |
| `brain.tsx` | 28 | Brain — the entry/latest/memory/rules load lives here (ADR-01), reloading on every focus-chip change (FS-02, brain half). | — |
| `index.tsx` | 53 | Today — needs/insights ship real content (row 7); allcal/calendar/ tasks/glance/close are row 8. | — |
| `life.tsx` | 27 | Life — goals, habits, people, money, health, learning (row 13). | — |
| `tasks.tsx` | 41 | Tasks — the list, waiting and slicer loads live here (ADR-01), reloading on every focus-chip change (FS-02, tasks half); `TaskViews`'s own setView/setSlicer/setFilters/setQuery each reload the list themselves. | — |

### `components/agents/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `CapsDialog.tsx` | 132 | CapsDialog — AG-01/AG-02/SEC-07: the monthly hard stop on what each agent may spend. | `layout/dialogs.tsx` |
| `Checks.tsx` | 97 | Checks — Agents' "Security checks (cannot be hidden)" card (AG-06/07): the fixed seven; a failing check's status carries an accent-ink "· see agent issues" suffix and an alert dot (AG-06). | `layout/registry.tsx` |
| `EmergencyLock.tsx` | 145 | EmergencyLock — Agents' "Emergency" card (AG-11/AG-12): hold the button 1.2s (an early release resets the hint), then a confirm dialog with four rows; confirming needs a fresh biometric assertion (SEC-07) before `session.lock()` calls `POST /lock`. | `layout/dialogs.tsx`, `layout/registry.tsx` |
| `Feed.tsx` | 54 | Feed — Agents' "Last 24 hours" card (AG-05): ok/muted/alert dots, the time, text, meta. | `layout/registry.tsx` |
| `History.tsx` | 46 | History — Agents' "Decision history" card (AG-09): two rows inline (title · verb at 500 · via {channel} — the exact fields Today's own `HistoryDialog.tsx` already renders from `ActionHistoryEntry`; "via door" in the acceptance text doesn't map to any wire field or fixture value, so it isn't reproduced literally — A-33), "search" opens the full searchable dialog with reopen. | `layout/registry.tsx` |
| `HistoryDialog.tsx` | 58 | HistoryDialog — AG-09's "search" dialog: a search field over every answered card, each row's "reopen" puts it back in Needs you (`postActionReopen`, A-31). | `layout/dialogs.tsx` |
| `Issues.tsx` | 61 | Issues — Agents' "Agent issues (cannot be hidden)" card (AG-04): badge = open issues, each row's verb posts `POST /agents/issues/{id}` and leaves with a 10s undo toast (A-32, no undo route on the wire). | `layout/registry.tsx` |
| `IssuesAllDialog.tsx` | 45 | IssuesAllDialog (O-1, OP-05) — Agents › Issues "all". | `layout/dialogs.tsx` |
| `Portals.tsx` | 41 | Portals — Agents' "Portals" card (AG-03/SEC-10): eight tiles, each opening the shared outbound-link confirmation with the real domain — nothing opens without it. | `layout/registry.tsx` |
| `Spend.tsx` | 100 | Spend — Agents' spend ring and per-agent caps (AG-02): a 56px ring at the spent fraction, "$X of $Y this month", a landing estimate, the heartbeat line, and cap chips. | `layout/registry.tsx` |
| `Stats.tsx` | 55 | Stats — Agents' "Runs and spend" card (AG-01): four stat cards (18px serif number via `<Stat>`, 11.5 label), equal to `GET /agents/summary`. | `layout/registry.tsx` |

### `components/brain/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `DictateDialog.tsx` | 141 | DictateDialog (TS-04) — "Dictate to EA", the typed-or-spoken thread. | `layout/dialogs.tsx` |
| `Entry.tsx` | 148 | Entry — Brain's column-1 "entry" section: the mind-dump box (BR-01), mic (VO-01) and send buttons, and Talk with EA / Dictate to EA — mock v11's `brain()` bundles all four into one card block. | `layout/registry.tsx` |
| `FilesArchive.tsx` | 154 | FilesArchive (X-1, FL-03/FL-04) — Brain › Files "all". | `layout/dialogs.tsx` |
| `Find.tsx` | 124 | Find — Brain's search field (BR-04, GS-05). | `layout/registry.tsx` |
| `ItemEditor.tsx` | 56 | ItemEditor — BR-05's "edit" dialog for a Latest-in capture: saving appends a version (`PUT /brain/items/{id}`, `GET /brain/items/{id}/versions` grows). | `layout/dialogs.tsx` |
| `LatestIn.tsx` | 156 | LatestIn — Brain's "Latest in" (BR-05, RP-06): title, ONE meta line (what the Librarian decided, then the source and the time), then the record's data labels as tags. | `layout/registry.tsx` |
| `Memory.tsx` | 108 | Memory — Brain's proposals card (BR-06..08) plus the hit-rate row (BR-09), which mock v11 appends inside the SAME card rather than a separate one. | `layout/registry.tsx` |
| `MemoryHistoryDialog.tsx` | 50 | MemoryHistoryDialog (O-1, OP-03) — Memory's "all". | `layout/dialogs.tsx` |
| `ProposalEdit.tsx` | 37 | ProposalEdit — BR-07's "edit" dialog for a Memory proposal: "Save my version" posts `{verb:"edit", text}`, which also teaches the Librarian. | `layout/dialogs.tsx` |
| `TalkScreen.tsx` | 246 | TalkScreen — "Talk with EA" as a full-screen surface (V-2, VP-04..VP-07). | `layout/dialogs.tsx` |

### `components/chrome/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `ArrangeDialog.tsx` | 158 | ArrangeDialog (AR-01..05) — opened from Header's Arrange button (`session.ts`'s `modal === "arrange"`, payload = tab id, TabScreen.tsx). | `layout/dialogs.tsx` |
| `BottomBanner.tsx` | 93 | BottomBanner (F-42, P-8) — the floating bar `MicBanner` and `TalkBanner` both wore: an overlay on every tab, above the tab bar on a phone and along the foot of the content on a desktop, the frosted bar surface. | 4 files |
| `Columns.tsx` | 96 | `<Columns>` (ADR-01, ADR-07) — the three breakpoint rules, straight from the pack's `.cols` CSS (design/tokens/components.css lines 100-104): under 768 one column, sections in full registry order (not grouped by column); 768–1179 two columns (`1.3fr 1fr`) where column 3's sections stack directly under column 1 (its own `.col:nth-child(3){grid-column:1; grid-row:2}`) and column 2 stands alone beside them; 1180+ three columns (`1.3fr 1fr .95fr`, gap 18), content max-width 1500 (RL-04). | `layout/TabScreen.tsx` |
| `DemoWatermark.tsx` | 155 | DemoWatermark (I-1, ID-02) — the one line that says this is not real data. | `app/_layout.tsx` |
| `Dialog.tsx` | 96 | `<Dialog>` (RL-06) — phone: full screen. | 32 files |
| `DialogHost.tsx` | 140 | Renders whichever dialogs are open, from `layout/dialogs.tsx` (S-3, SM-05/NR-02/RL-06). | `app/_layout.tsx` |
| `EaLayoutBanner.tsx` | 51 | EaLayoutBanner (AR-06) — shown on a tab whose layout the EA last set (`Layout.managedBy === "ea"`), with the reason and a one-tap revert back to Josh's own arrangement. | `layout/TabScreen.tsx` |
| `ErrorBoundary.tsx` | 101 | Recovery instead of white screens (spec §15.11, NR-03/04). | `app/_layout.tsx`, `components/chrome/DialogHost.tsx` |
| `ExternalLinkDialog.tsx` | 31 | ExternalLinkDialog — the confirmation every outbound link goes through before leaving the app (TD-04's "google" link today; Tasks' "open in Twenty" and Agents' portal tiles reuse this in later rows). | `layout/dialogs.tsx` |
| `FindDialog.tsx` | 170 | FindDialog (K-1, GS-02..GS-07) — the app's one global search. | `layout/dialogs.tsx` |
| `FindRow.tsx` | 122 | FindRow (K-1, GS-04/GS-07) — one search result, and what happens when it is touched. | `components/brain/Find.tsx`, `components/chrome/FindDialog.tsx` |
| `FocusChips.tsx` | 29 | `chipsRow()` (mock v11 line 548) — Everything · Personal · Family · Work + a `tune` button opening the focus editor (row 16 fills the real dialog; row 6 ships the frame reading `GET /focuses`). | `components/chrome/FindDialog.tsx`, `layout/TabScreen.tsx` |
| `Gate.tsx` | 144 | Face ID gate — full-screen lock on every app open (GL-01, spec §2.2). | `app/_layout.tsx` |
| `Header.tsx` | 129 | `head()` (mock v11 line 541) — title (Source Serif 4, 32 desktop / 26 phone) + subtitle on the baseline, an optional delta line (row 8 fills it), buttons (desktop: Arrange, Help, Theme; phone: Settings, Theme), and the phone-only health line under the header (RL-05; the rail carries its own health line at the bottom, Rail.tsx). | `layout/TabScreen.tsx` |
| `HealthLine.tsx` | 119 | HealthLine (F-41, P-8) — the health line the rail and the phone header used to write twice, with mirrored comments (OF-08: "the rail and the phone header are one statement in two places"). | `components/chrome/Header.tsx`, `components/chrome/Rail.tsx` |
| `Help.tsx` | 74 | "What works in this build" (GL-08) — every flag from `capabilities()` with its honest status, and every registry section hidden because its `feed` capability is off (ADR-06: a section without a feed hides itself and is listed here, not silently dropped). | `layout/dialogs.tsx` |
| `Icon.tsx` | 32 | Every icon in the app is one of these — a Material Symbols Rounded glyph (weight 300) rendered as an SVG path (ADR-09). | 22 files |
| `LiveMicOrb.tsx` | 132 | The LIVE mic — `.js-mic.is-live` in the pack, `.mic-live` in mock v11: width:42; height:42; border-radius:50%; background: var(--marker); color:#fff; animation: jsPulse 1.4s var(--ease) infinite and README, Components: "Listening: 42px circle, Marker fill, white filled glyph, **pulse ring 1.4s**." AUDIT_v2.md A-05: none of that existed. | `components/brain/TalkScreen.tsx`, `components/tasks/WorkMark.tsx`, `theme/ui/fieldButton.tsx` |
| `LockedScreen.tsx` | 148 | LockedScreen — the two locked-screen states (mock v11 `#lock`, line 281 default / line 556 emergency), rendered by `<FaceIDGate>` once `locked` is true. | `components/chrome/Gate.tsx` |
| `MicBanner.tsx` | 74 | MicBanner (V-1, ADR-49 / MC-03) — the microphone you walked away from. | 4 files |
| `NotConnected.tsx` | 11 | N8N-2: the one line a section shows when its source is not connected yet — where its empty value would have read as a fact ("all healthy", "Nothing failing", "The Librarian runs again at 2:00"). | 6 files |
| `Orb.tsx` | 173 | `.js-mic` (design/tokens/components.css) — the floating mic, push-to-talk. | `app/(tabs)/_layout.tsx`, `components/brain/DictateDialog.tsx`, `layout/TabScreen.tsx` |
| `PrivacyShield.tsx` | 23 | PrivacyShield (F-70, P-8 — out of `app/_layout.tsx`, which sat at 99/100). | `app/_layout.tsx` |
| `Rail.tsx` | 113 | The 200px rail (≥768, RL-02/03/04) — wordmark, the five tabs (filled icon + accent-ink on the active one, GL-07), a separator, Find and Settings, and the health line at the bottom (RL-05). | `app/(tabs)/_layout.tsx`, `components/chrome/DemoWatermark.tsx` |
| `ScreenSurface.tsx` | 80 | ScreenSurface — the surface a `screen`-kind dialog is rendered on. | `layout/dialogKit.tsx` |
| `SearchableListDialog.tsx` | 170 | Search over a list, in one place (S-4). | 8 files |
| `Sens.tsx` | 63 | <Sens> — wraps every sensitive value app-wide (money, journal, health). | 7 files |
| `Sheet.tsx` | 47 | `<Sheet>` (RL-06) — phone: from the bottom, full width. | `components/tasks/DelegatePicker.tsx`, `components/tasks/SubtaskMenu.tsx`, `components/today/TeachSheet.tsx` |
| `SyncDot.tsx` | 94 | SyncDot (SY-02..SY-04) — one dot, in the two places the chrome has room for one: the bottom of the rail above the health line on desktop, and inside the header's health line on a phone. | `components/chrome/Header.tsx`, `components/chrome/Rail.tsx` |
| `TabBar.tsx` | 63 | The floating phone tab bar (<768, RL-01): inset 14px, height 60, `.js-bar` surface (frosted, blur 24). | `app/(tabs)/_layout.tsx` |
| `TabUnavailable.tsx` | 30 | TabUnavailable (A-2, WP-A) — what a tab says when its load failed and there is nothing from before to show. | `layout/TabScreen.tsx` |
| `TalkBanner.tsx` | 76 | TalkBanner (V-2) — the conversation you walked away from. | `components/chrome/DialogHost.tsx`, `components/chrome/MicBanner.tsx` |
| `Toast.tsx` | 213 | `.js-toast` (design/tokens/components.css) — a pill toast with an optional undo ring counting down from `motion.undoSeconds` (10) to 0. | 6 files |
| `icons.generated.ts` | 136 | generated by tools/gen-icons.mjs from node_modules/@material-symbols/svg-300/rounded — do not edit | 5 files |
| `watermarkText.ts` | 26 | The demo watermark's words, in a file with no React and no react-native import (I-1, ID-02). | 6 files |

### `components/detail/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `BrainItemDetail.tsx` | 83 | BrainItemDetail (O-1, OP-01/OP-02) — what a Brain row opens. | `layout/dialogs.tsx` |
| `DecisionDetail.tsx` | 76 | DecisionDetail (O-1, OP-04) — what an Agents › History row opens. | `layout/dialogs.tsx` |
| `FileDetail.tsx` | 102 | FileDetail (O-1's shell, filled by X-1 — FL-02) — what a file row opens. | `layout/dialogs.tsx` |
| `GoalDetail.tsx` | 212 | GoalDetail (O-1, filled at LG-1) — what a Life › Goals row opens, and what "All goals" opens an archived one into. | `layout/dialogs.tsx` |
| `IssueDetail.tsx` | 53 | IssueDetail (O-1, OP-05) — what an Agents › Issues row opens. | `layout/dialogs.tsx` |
| `LearningDetail.tsx` | 53 | LearningDetail (O-1, OP-06) — what a Life › Learning row opens. | `layout/dialogs.tsx` |
| `QueuedItemDetail.tsx` | 40 | QueuedItemDetail (O-1, OP-02) — what a QUEUED Latest in row opens. | `layout/dialogs.tsx` |
| `ReplyDetail.tsx` | 86 | ReplyDetail (R-1, RP-02/RP-03) — what a Replies row, Today's card and a push all open. | `layout/dialogs.tsx` |
| `useDetail.ts` | 50 | useDetail (Stage 5d P-3, F-68) — the ONE way a detail dialog fetches. | 7 files |

### `components/life/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `ConfigureDialog.tsx` | 224 | ConfigureDialog — the "configure" link on a section (LF-09, and B-2's §4.10 half). | `layout/dialogs.tsx` |
| `GoalEditDialog.tsx` | 151 | GoalEditDialog — the goals are a set Josh edits (LG-1, LG-01). | `layout/dialogs.tsx` |
| `Goals.tsx` | 66 | Goals — Life's "Goals" card (LF-01): area at 500 weight, the status line under it, "behind" rendered in accent ink. | `layout/registry.tsx` |
| `GoalsAllDialog.tsx` | 54 | GoalsAllDialog (LG-04) — Goals' "all": every goal that is no longer in play. | `layout/dialogs.tsx` |
| `HabitAllTime.tsx` | 70 | HabitAllTime (LH-04) — a bar row per year, and the line that says how it has gone overall. | `components/life/TrendsDialog.tsx` |
| `HabitBlock.tsx` | 77 | HabitBlock (LH1-04) — one habit's block inside the Trends dialog, on a card. | 4 files |
| `HabitCells.tsx` | 115 | The one cell every habit grid is drawn from (LH-1, LH-02, LH-08). | 4 files |
| `HabitEditDialog.tsx` | 116 | HabitEditDialog — the habits are a set Josh edits (LH-2, LH-06, LH-07). | `layout/dialogs.tsx` |
| `HabitMonth.tsx` | 99 | HabitMonth (LH-02) — one calendar month per habit, seven columns Monday first, with the day numbers. | `components/life/TrendsDialog.tsx` |
| `HabitPager.tsx` | 57 | HabitPager (LH1-05) — `‹ SEPTEMBER 2026 ›` as one group, at content width. | `components/life/HabitMonth.tsx`, `components/life/HabitYear.tsx` |
| `HabitWeek.tsx` | 98 | HabitWeek (LH-05) — a habit's recent days beside its name, and today's cell is the toggle. | `components/life/Habits.tsx` |
| `HabitYear.tsx` | 214 | HabitYear (LH-03) — the year as weeks across and weekdays down, with the month labels above it, and twelve bars of completions beneath ON THE SAME AXIS. | `components/life/TrendsDialog.tsx` |
| `Habits.tsx` | 95 | Habits — Life's habit card (LF-02, LH-05). | `layout/registry.tsx` |
| `LearningAllDialog.tsx` | 51 | LearningAllDialog (LL-03) — Life › Learning "all". | `layout/dialogs.tsx` |
| `TrendsDialog.tsx` | 170 | TrendsDialog (LF-03, LH-02..LH-04) — Week / Month / Year / All time, each a real `GET /habits/stats` call. | `layout/dialogs.tsx` |

### `components/settings/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `Appearance.tsx` | 138 | Appearance — Settings' "Appearance and account" card (SE-08): theme segmented control, Devices summary + "manage" (opens the Devices dialog), "Hide sensitive figures" (privacy blur, GL-04), Export (capability-gated), and a second, compact "Hold to lock" — the mock carries this control twice (here and on Agents' own Emergency card, both wired to the same global hold handler), so this one reuses `lib/holdToLock.ts` and the same root-mounted confirm dialog. | `components/settings/SettingsSheet.tsx` |
| `Autonomy.tsx` | 48 | Autonomy — Settings' "Autonomy" card (SE-05): six card types, each a three-way Ask me / Propose / Auto segmented control persisted via `PUT /settings/autonomy`. | `components/settings/SettingsSheet.tsx` |
| `ChipSetEditDialog.tsx` | 190 | ChipSetEditDialog — one dialog for "a named set the person edits" (S-3). | 5 files |
| `ChipSetForm.tsx` | 159 | ChipSetForm — the FORM half of `ChipSetEditDialog` (S-3, split at LG-1). | `components/settings/ChipSetEditDialog.tsx` |
| `Devices.tsx` | 58 | Devices — SE-08/LK-06: lists every device with a revoke action (SEC-07-gated, a fresh biometric assertion); the current device can't revoke itself. | `layout/dialogs.tsx` |
| `FocusEditDialog.tsx` | 78 | FocusEditDialog — FS-04/SE-07: one dialog for all three entry points — FocusChips' tune icon (`payload` undefined → the manage-all list), Settings' per-row "edit" (`payload` = a focus id), and "Add a focus" (`payload === "new"`). | `layout/dialogs.tsx` |
| `Focuses.tsx` | 37 | Focuses — Settings' "Focus filters" card (SE-07): rows with "edit" (fixed focuses read "always present" instead); "Add a focus" opens the editor (FS-04) — both route through `FocusEditDialog`. | `components/settings/SettingsSheet.tsx` |
| `Notifications.tsx` | 199 | Notifications — Settings' notification matrix (SE-02/SE-03, RP-04): ten groups × 4 devices, each cell a `<Switch>`; the Security group is locked server-side (423) and toasts instead of flipping; the quiet-hours footer line is built from `GET /settings/quiet-hours`, not a fixed string (LF-06-style, this row's own equivalent of A-28). | `components/settings/SettingsSheet.tsx` |
| `Rules.tsx` | 67 | Rules — Settings' "Rules for my EA" card (ST-1, ST-02). | `components/settings/SettingsSheet.tsx` |
| `RulesEditDialog.tsx` | 126 | RulesEditDialog — the standing instructions Josh has given his EA (ST-1, ST-02). | `components/settings/Rules.tsx`, `layout/dialogs.tsx` |
| `Schedules.tsx` | 108 | Schedules — Settings' "Schedules" card (SE-04): the seven routines and EA tasks, cadence in accent ink, pause/resume flips the row (state-driven, unlike the mock's always-"pause" static link), run posts and toasts. | `components/settings/SettingsSheet.tsx` |
| `Security.tsx` | 102 | Security — Settings' parameters card (L-1, LK-03, defaults table #7). | `components/settings/SettingsSheet.tsx` |
| `SettingsSheet.tsx` | 134 | SettingsSheet — SE-01/SE-09: opens from the rail (desktop) or the header button (phone); scrim, X, or Esc closes (Esc already routes through app/_layout.tsx's global shortcut → closeAll()). | `layout/dialogs.tsx` |
| `Sync.tsx` | 147 | Settings › Sync (O-2, OF-05/OF-07) — what is waiting, when it last went, and anything the server would not take. | `layout/dialogs.tsx` |
| `Voice.tsx` | 187 | Voice — Settings' "Voice" card (SE-06): Style and Speed pickers, and "Read the brief" switch. | `components/settings/SettingsSheet.tsx` |
| `chipSet.ts` | 49 | The types `ChipSetEditDialog` and `ChipSetForm` share (S-3, split at LG-1). | `components/settings/ChipSetEditDialog.tsx`, `components/settings/ChipSetEditDialog.tsx`, `components/settings/ChipSetForm.tsx` |

### `components/tasks/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `ActiveFilters.tsx` | 74 | ActiveFilters — what is narrowing this list, on the list (F-1, TF-04, ADR-44). | `components/tasks/TaskViews.tsx` |
| `Activity.tsx` | 89 | Activity — the task detail's activity list (TK-08): who did what, when, most recent first — and, since T-4, what each agent run spent (US-01, US-02). | `components/tasks/TaskDetail.tsx` |
| `Board.tsx` | 246 | Board — Tasks' Board segment (TK-05, B-1, ADR-45): the lanes are TWENTY'S COLUMNS now, in Twenty's order, on the mock's Hairline lane surface (`.board .bcol{background:var(--hairline);border-radius:var(--r-card); padding:8px}`); Done dimmed; a card opens the task, or moves. | `components/tasks/TaskViews.tsx` |
| `BoardCard.tsx` | 159 | BoardCard — one card on the board (B-1, BD-04/BD-05/BD-06, ADR-45). | `components/tasks/BoardLane.tsx` |
| `BoardLane.tsx` | 97 | BoardLane — one of the board's columns (B-1, ADR-45; out of `Board.tsx` at ux round S6-20/S6-35, which took that file past its 250-line cap). | `components/tasks/Board.tsx` |
| `CompleteConfirm.tsx` | 65 | CompleteConfirm — ticking a task that is not finished (T-3, ADR-42, TK-10). | `layout/dialogs.tsx` |
| `DelegatePicker.tsx` | 66 | DelegatePicker — who takes the task (T-2, TK-07). | `layout/dialogs.tsx` |
| `DoneSearch.tsx` | 40 | DoneSearch — Tasks' Done segment (TK-07): a search field filtering done rows server-side (`?q=`), "No matches." when none, done rows keep their EA meta and cost (TaskRow's own `meta` string already carries that). | `components/tasks/TaskViews.tsx` |
| `EaReport.tsx` | 70 | EaReport — the task detail's "The EA's report" card (TK-10): title, quote, file chips, flagged count; Looks right / Revise / Teach → `POST /tasks/{id}/report`. | `components/tasks/TaskDetail.tsx` |
| `Files.tsx` | 91 | Files.tsx (X-1, FL-01/FL-02, UP-01) — the task card's files. | `components/tasks/TaskDetail.tsx` |
| `FilterDialog.tsx` | 186 | FilterDialog — TK-14: Priority / Status / Project / Owner / Due, multi-select; applied chips with ✕; Clear all; composes with the slicer (AND across groups, OR within — `stores/tasks.ts` serialises the same shape `data/mock/handlers/tasks.ts` applies). | `layout/dialogs.tsx` |
| `Gantt.tsx` | 196 | Gantt — Tasks' timeline (G-1, ADR-46): a real axis, swimlanes by project, and bars you can move. | `components/tasks/Board.tsx`, `components/tasks/TaskViews.tsx`, `components/tasks/WaitingOn.tsx` |
| `GanttAxis.tsx` | 133 | GanttAxis — the timeline's scale (G-1, GT-01/GT-02). | `components/tasks/GanttChart.tsx` |
| `GanttBar.tsx` | 224 | GanttBar — one task on the timeline, and the three gestures it answers (G-1, GT-04/GT-05/GT-06/GT-08). | `components/tasks/GanttChart.tsx` |
| `GanttChart.tsx` | 205 | GanttChart — the scrolling half of the timeline, and everything that shares its coordinate space (G-1, GT-02/GT-03/GT-07). | `components/tasks/Gantt.tsx` |
| `GanttMini.tsx` | 113 | GanttMini — the "this month" card in Waiting on's column (`<Gantt compact>`). | `components/tasks/Gantt.tsx` |
| `GanttUnscheduled.tsx` | 190 | GanttUnscheduled — the lane for tasks with no dates, and the drag that gives them one (G-1, GT-07). | `components/tasks/Gantt.tsx`, `components/tasks/GanttChart.tsx` |
| `RangeChip.tsx` | 45 | RangeChip — the first item of the slicer row, on every task view (F-1, TF-01/TF-02, ADR-44). | `components/tasks/SlicerRow.tsx` |
| `RangeDialog.tsx` | 101 | RangeDialog — the presets behind the range chip (F-1, TF-02, ADR-44). | `layout/dialogs.tsx` |
| `SlicerEditDialog.tsx` | 119 | SlicerEditDialog — the slicer chips are a list Josh edits (F-1, TF-06, ADR-44). | `layout/dialogs.tsx` |
| `SlicerRow.tsx` | 148 | SlicerRow — the one row of controls above every task view (F-1, TF-05, ADR-44). | `components/tasks/TaskViews.tsx` |
| `SubtaskMenu.tsx` | 102 | SubtaskMenu — the ⋮ on a subtask (T-2, TK-09). | `layout/dialogs.tsx` |
| `Subtasks.tsx` | 85 | Subtasks — the task detail's subtasks card (TK-08/09): "N of M done" hint, owner tags, an EA-dashed checkbox; "+ subtask" adds a titled one via `POST /tasks/{id}/subtasks`. | `components/tasks/TaskDetail.tsx` |
| `TaskDetail.tsx` | 152 | TaskDetail — the task detail dialog (TK-08/09/10/12), root-mounted via `app/_layout.tsx` keyed off `stores/taskCard.ts`'s `openTaskId` (BUGLOG_v2.md B-14: never render a Dialog inline in a scrolled section). | `layout/dialogs.tsx` |
| `TaskEdit.tsx` | 137 | TaskEdit — the row of controls under a task's title (T-1, ADR-42, TK-02..TK-04). | `components/tasks/TaskDetail.tsx` |
| `TaskRow.tsx` | 98 | TaskRow — one row in List or Done (TK-03/TK-04/TK-13): a dashed EA-owned checkbox or a solid one, an EA/J owner tag (Josh's rows carry none), title + meta (+ repeat rule, TK-13), a chevron opening the task detail. | `components/tasks/DoneSearch.tsx`, `components/tasks/TaskViews.tsx` |
| `TaskViews.tsx` | 79 | TaskViews — Tasks' column-1 section (TK-01/02): the List/Board/ Gantt/Done segmented control, the slicer row (F-1: on ALL FOUR views, not List only), the active-filter chip row under it, and the active segment's body. | `layout/registry.tsx` |
| `WaitingOn.tsx` | 55 | WaitingOn — Tasks' column-2 section (TK-11): rows like "Steve · villa contract · 9 days" with "Draft a nudge"; a mini Gantt card underneath (mock v11 `tasksTab()`'s `map.waiting`). | `layout/registry.tsx` |
| `WorkMark.tsx` | 57 | WorkMark — "an agent is on this right now" (T-5, WK-02/WK-03, ADR-42). | 4 files |
| `filterLabels.ts` | 42 | What a filter value is CALLED (F-1, TF-03, ADR-44). | `components/tasks/ActiveFilters.tsx`, `components/tasks/FilterDialog.tsx` |

### `components/today/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `AllDayStrip.tsx` | 50 | AllDayStrip — the all-day events covering one day of the calendar grid, in a strip above its hours (REMAP, option C at Checkpoint 3): an all-day event has no hours, and drawn in the time track it landed above the card. | `components/today/CalendarGrid.tsx` |
| `CalendarGrid.tsx` | 243 | CalendarGrid — Today's "All calendars" (CG-01..08): a segmented Today/ 3 days/Week/Month control over a time-grid or a month dot-grid, from `GET /calendar`. | `layout/registry.tsx` |
| `CalendarList.tsx` | 113 | CalendarList — Today's "Calendar" list card (TD-04): time, title, a prep line in accent ink, free gaps as muted lines; hint "today · 3 days · google". | `layout/registry.tsx` |
| `CloseDay.tsx` | 109 | CloseDay — Today's "Close the day" (TD-07): nine compact habit chips sharing stores/life.ts with Life's own Habits card (LF-02); a journal field that posts to `/journal` directly (empty submissions blocked). | `layout/registry.tsx` |
| `DecisionBodies.tsx` | 183 | The bodies a decision card can carry (S-7, SM-03). | `components/today/DecisionCard.tsx` |
| `DecisionCard.tsx` | 157 | DecisionCard — Needs you's single open card (ADR-13). | `components/today/NeedsYou.tsx` |
| `DecisionProposals.tsx` | 93 | DecisionProposals — the bodies of the two cards the EA raises about ITS OWN behaviour (W-1, ST-1). | `components/today/DecisionBodies.tsx` |
| `Glance.tsx` | 67 | Glance — Today's "At a glance" (TD-06): four cells (Habits, People, Money, Goals); the habits count reads stores/life.ts directly (LF-02: shares state with Life's own Habits card, no round-trip needed after a Close-the-day toggle); each cell switches to the Life tab. | `layout/registry.tsx` |
| `HistoryDialog.tsx` | 53 | HistoryDialog — DC-01's "history" link: every answered/later/expired decision, searchable by title (mock v11 `acts.history()` line 625). | `layout/dialogs.tsx` |
| `Insight.tsx` | 106 | Insight — Today's "From your EA" section (TD-03, RP-03): the open insight card (text, why-line, Block it / Leave it), collapsing to a one-line result once answered (mock v11 `today()` line 460), and under it the newest UNREAD reply to something Josh asked. | `layout/registry.tsx` |
| `NeedsYou.tsx` | 96 | NeedsYou — Today's "Needs you" section (DC-01, DC-10): exactly one decision card open (the first undecided, or the one tapped), the rest as waiting rows, an end line, and a "history" link opening the history dialog (mock v11 `today()` lines 451-457). | `layout/registry.tsx` |
| `ReviewDialog.tsx` | 78 | ReviewDialog — TD-08: the week that was (decisions, promises kept, time by focus bars), the week ahead, three things — from `GET /review`. | `layout/dialogs.tsx` |
| `ReviseDialog.tsx` | 58 | ReviseDialog — DC-05: on an email (quote) card, Revise opens a draft editor instead of answering immediately; Save writes the edit via `PUT /actions/{id}/draft` and then answers the card as revised (same toast/undo as every other verb). | `layout/dialogs.tsx` |
| `TeachSheet.tsx` | 63 | TeachSheet — DC-08, ST-04: one line, becomes a standing rule. | `layout/dialogs.tsx` |
| `WaitingRow.tsx` | 76 | WaitingRow — an undecided card that isn't the one currently open (mock v11 `wrow()`, design/handoff.md "Today" column 1). | `components/today/NeedsYou.tsx` |
| `YourTasks.tsx` | 51 | YourTasks — Today's "Your tasks" (TD-05): top three open tasks in focus; checkbox marks done via `PATCH /tasks/{id}` with an undo toast; hint "all" switches to the Tasks tab. | `layout/registry.tsx` |

### `data/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `ApiAdapter.ts` | 340 | ApiAdapter — the only DataProvider implementation (ADR-02). | 12 files |
| `DataProvider.ts` | 279 | DataProvider — the app ↔ backend contract, 1:1 with CONTRACT_v2.md §4. | 6 files |
| `capabilities.ts` | 43 | Capabilities (CONTRACT_v2.md §4.9 `GET /capabilities`, ADR-16). | `stores/settings.ts` |
| `config.swap.ts` | 35 | Swap-proof flavour of data/config.ts (BS-05). | — |
| `config.ts` | 119 | Backend config — THE one file that changes at go-live. | 14 files |
| `files.ts` | 132 | The files vocabulary (X-1, §4.17) — one declaration the archive's filters, the mock's handler and the tests all read. | 11 files |
| `labels.ts` | 135 | Data labels — silos and types on every record (spec §15.10, `DATA_LABELS.md`, contract §12.1). | 20 files |
| `parameters.ts` | 148 | The parameter registry (ADR-41, L-1) — six tunables, in one typed table. | 6 files |
| `pins.ts` | 52 | Certificate-pinning scaffold (spec §14.9 — SEC-08, contract §9): the SPKI pins arrive with the completed BACKEND_HANDSHAKE (30-day rotation overlap). | `data/n8n/client.ts`, `data/transport/http.ts` |
| `provider.ts` | 105 | Provider swap point (ADR-02). | 29 files |
| `routes.ts` | 329 | routes.ts — the one table (ADR-33, S-1): every endpoint, once. | 6 files |
| `taskFilters.ts` | 135 | The task filter shape, declared ONCE (TK-14, S-2, F-1). | 14 files |
| `types.ts` | 1553 | Wire shapes — 1:1 with CONTRACT_v2.md §3 (camelCase, ISO 8601 UTC, money as strings with `sensitivity: sens`). | 136 files |

### `data/mock/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `cards.ts` | 42 | cards.ts (F-04, P-11) — the shape every EA proposal card shares. | `data/mock/handlers/parameters.ts`, `data/mock/handlers/sections.ts`, `data/mock/handlers/settings.ts` |
| `db.ts` | 775 | In-memory mock database (ADR-02, CONTRACT_v2.md §7). | 25 files |
| `events.ts` | 37 | The mock server's outbound event stream (D-1, CONTRACT_v21.md §4.13). | 8 files |
| `extract.ts` | 64 | extract.ts (W-1, UP-08) — what the backend's screened extract step returns for a shared link, and the one rule about what may be done with it. | `data/mock/ingest.ts` |
| `ingest.ts` | 203 | ingest.ts (W-1, §4.23, ADR-64) — what happens to something sent in from outside the app. | `data/mock/handlers/brain.ts`, `data/mock/handlers/decisions.ts`, `data/mock/handlers/test.ts` |
| `labelRules.ts` | 131 | The label rules the SERVER owns (S-6, SM-08). | `data/mock/handlers/today.ts`, `data/mock/triage.ts` |
| `predicates.ts` | 120 | The task slicers and filter groups, as tables (S-2, prep for TF-06/TF-09). | `data/mock/handlers/tasks.ts` |
| `schemaValidate.ts` | 117 | The JSON-Schema subset check, in TypeScript, for the mock server (H-1e). | `data/mock/validateBody.ts` |
| `search.ts` | 257 | search.ts (K-1, §4.19, §7) — the mock's search index over the twelve kinds. | `data/mock/handlers/search.ts` |
| `server.ts` | 152 | The in-process mock server (ADR-02, CONTRACT_v2.md §7) — the executable half of the contract. | `data/transport/mock.ts` |
| `triage.ts` | 110 | triage.ts (R-1, §1.19, resolution #50) — what the default agent decides about a capture, and the EA's answer when the capture was a question. | `data/mock/handlers/brain.ts`, `data/mock/ingest.ts` |
| `util.ts` | 103 | Shared helpers for data/mock/handlers/*.ts (kept out of server.ts and every handler file to keep both under the row-4 200-line budget). | 17 files |
| `validateBody.ts` | 66 | The mock validates request bodies against `openapi.yaml` (H-1e, SH-10). | `data/mock/server.ts` |
| `voice.ts` | 266 | The scripted voice server (V-1, VP-03) — one implementation of `Socket`, playing the conversation mock v11's Talk sheet shows, so the whole of §4.11 can be driven with no provider, no key and no network. | `data/provider.ts`, `lib/testHook.ts` |

### `data/mock/handlers/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `agents.ts` | 167 | §4.8 Agents. | `data/mock/handlers/tasks.ts`, `data/mock/handlers/test.ts`, `data/mock/server.ts` |
| `brain.ts` | 267 | §4.6 Brain (REMAP memory, Librarian, EA). | `data/mock/server.ts` |
| `calendar.ts` | 82 | §4.4 Calendar. | `data/mock/handlers/today.ts`, `data/mock/server.ts` |
| `decisions.ts` | 244 | §4.3 Decisions (ADR-13). | 4 files |
| `files.ts` | 166 | §4.17 Files and deliverables (X-1) — the backend's INDEX of Dropbox. | `data/mock/server.ts` |
| `life.ts` | 415 | §4.7 Life. | `data/mock/server.ts` |
| `mirror.ts` | 52 | The Telegram mirror (D-1, TM-01..03) — answering a decision card from somewhere that is not this app. | `data/mock/server.ts`, `lib/testHook.ts` |
| `parameters.ts` | 139 | §4.14 — the parameter registry (ADR-41, L-1). | `data/mock/handlers/decisions.ts`, `data/mock/server.ts` |
| `search.ts` | 18 | §4.19 Global search (K-1). | `data/mock/server.ts` |
| `sections.ts` | 170 | §4.10 Sections — the config records the EA proposes and Josh edits. | `data/mock/handlers/decisions.ts`, `data/mock/server.ts` |
| `session.ts` | 130 | §4.1 Session, devices, lock. | `data/mock/handlers/test.ts`, `data/mock/server.ts`, `lib/testHook.ts` |
| `settings.ts` | 323 | §4.9 Settings and configuration. | `data/mock/handlers/decisions.ts`, `data/mock/ingest.ts`, `data/mock/server.ts` |
| `tasks.ts` | 355 | §4.5 Tasks (the Gantt reads `?view=gantt`, ADR-46). | `data/mock/server.ts` |
| `test.ts` | 143 | Rig routes (T-5) — mock-only, deliberately NOT in `data/routes.ts`, so they can never reach `openapi.yaml` (hard rule 5) and no `ApiAdapter` method can call one by accident. | `data/mock/server.ts`, `lib/testHook.ts` |
| `today.ts` | 176 | §4.2 Today: the composite, review, journal. | `data/mock/server.ts` |
| `usage.ts` | 77 | §4.16 Usage (T-4, ADR-43) — what the agents spent, and the one place the mock adds a cost up. | `data/mock/handlers/agents.ts`, `data/mock/server.ts` |

### `data/n8n/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `client.ts` | 179 | `callWebhook(key, body)` — the one way the app reaches n8n (ADR-76): a JSON POST to the proxy at `<N8N_BASE_URL>/<key>`, answered `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. | 8 files |
| `defaults.ts` | 215 | The configuration routes, answered on the device while n8n has no store for them (ADR-76): who is signed in, what this build can do, the layouts, focuses, parameters and section configs. | `data/n8n/adapters/records.ts`, `data/n8n/adapters/tasks.ts`, `data/n8n/registry.ts` |
| `empty.ts` | 104 | The contract's empty value for every GET response shape the n8n transport answers without a source yet (ADR-76) — a list with nothing in it, a composite with nothing counted — so a section shows its own empty state and never the mock's demo content. | `data/n8n/adapters/today.ts`, `data/transport/n8n.ts` |
| `focus.ts` | 30 | Who may see what, and what a focus narrows to, on the n8n build (ADR-76) — the rule the mock's `inFocus` applies (`data/mock/util.ts`), copied because `data/n8n/` may not import `data/mock/` (CT-03). | 8 files |
| `registry.ts` | 195 | The n8n dispatcher's route table (ADR-76): which of the app's routes are answered by a webhook, which are assembled from other routes, which are configuration, and which are honestly empty. | 12 files |
| `taskRules.ts` | 67 | The task list's rules on the n8n build — slicers, the date range and the filter groups — copied from `data/mock/predicates.ts`, the spec, because `data/n8n/` may not import `data/mock/` (CT-03). | `data/n8n/adapters/tasks.ts` |

### `data/n8n/adapters/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `actions.ts` | 236 | The Needs-you routes from the actions store, through the `actions` webhook (JSTACK-DASH-actions): the cards the EA writes there (`op: "put"`, never sent from the app), read and answered here with the mock's rules (`data/mock/handlers/decisions.ts`) and the contract's statuses. | `data/n8n/adapters/today.ts`, `data/n8n/registry.ts` |
| `brain.ts` | 194 | What Josh sends the EA and what the EA sends back, through the `brain` webhook (JSTACK-DASH-brain): captures, journal lines and Dictate-to-EA chat in; replies and insights out (`remap/WORKFLOWS-NEEDED.md` §2, "Brain store, the EA's side"). | `data/n8n/adapters/today.ts`, `data/n8n/registry.ts` |
| `calendar.ts` | 148 | `GET /calendar` from Google Calendar, through the `calendar` webhook (JSTACK-DASH-calendar-read) — the request built, and the reply guarded and mapped into the contract's `CalendarWindow`. | `data/n8n/adapters/today.ts`, `data/n8n/registry.ts` |
| `files.ts` | 95 | The file lists, through the `files` webhook (JSTACK-DASH-files-list): Dropbox under `/JSTACK`, metadata only — never a file's bytes, so `capabilities.fileStore` stays off and a file opens as its Dropbox link. | `data/n8n/registry.ts` |
| `records.ts` | 430 | The configuration and the Life records, through the `records` webhook (JSTACK-DASH-records): a versioned, append-only JSON store the app reads and writes key by key, with the mock's rules (`data/mock/handlers/settings.ts`, `parameters.ts`, `life.ts`, `sections.ts`) and the contract's statuses. | `data/n8n/adapters/actions.ts`, `data/n8n/adapters/today.ts`, `data/n8n/registry.ts` |
| `tasks.ts` | 243 | The Tasks routes from Twenty, through the `tasks` webhook (JSTACK-DASH-tasks-read): the whole list paged in, each record guarded and mapped into the contract's `Task`, and the mock's list rules (`data/mock/handlers/tasks.ts`) applied on the device — `GET /tasks`, `GET /tasks/{id}`, `GET /tasks/waiting` and the Board's `GET /tasks/columns` all answer from the one list. | 4 files |
| `tasksWrite.ts` | 123 | The task writes, through the `tasks-write` webhook (JSTACK-DASH-tasks-write): what Twenty's writer can hold — a task's title, its status and its due date — and a refusal for everything else. | `data/n8n/registry.ts` |
| `today.ts` | 71 | `GET /today` on the n8n build: the Today composite assembled, as the mock's `getToday` builds it (`data/mock/handlers/today.ts`), from the live sources — the calendar, the tasks, the Needs-you store and the Life records. | `data/n8n/registry.ts` |

### `data/transport/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `Transport.ts` | 43 | The one boundary between ApiAdapter and "how a request actually travels" (ADR-02). | 41 files |
| `http.ts` | 142 | The real transport (ADR-02): fetch, the auth header and the pinning guard (SEC-08). | `data/n8n/client.ts`, `data/provider.ts` |
| `mock.ts` | 21 | The in-process mock transport (ADR-02): routes straight into data/mock/server.ts's router — no network, no serialisation round trip, but the same request/response shape as httpTransport so ApiAdapter (and every test built against it) is oblivious to which one is live. | `data/provider.ts`, `lib/serverEvents.ts` |
| `n8n.ts` | 141 | The n8n transport (ADR-76): the third implementation of the one boundary, beside `httpTransport` and `mockTransport`, answering every route from Josh's n8n webhooks or honestly without them. | `data/provider.ts` |
| `outbox.ts` | 343 | `withOutbox(inner, queue, isOnline, isEmergency)` — the transport that does not lose a capture (O-1, OF-01..07). | 19 files |
| `reachability.ts` | 43 | `withReachability(inner, report)` — whether the server can be reached, told by the requests themselves (A-1, WP-A). | `data/provider.ts` |

### `eslint-rules/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `no-colour-literal.js` | 52 | _(no header comment)_ | — |
| `no-inline-font-size.js` | 56 | _(no header comment)_ | — |
| `no-numeric-and.js` | 63 | _(no header comment)_ | — |
| `no-window-dimensions.js` | 55 | _(no header comment)_ | — |
| `require-purpose-header.js` | 81 | _(no header comment)_ | — |

### `layout/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `SectionHeaderRight.tsx` | 63 | SectionHeaderRight (X-1) — the controls beside a configured section's heading. | `layout/SectionRenderer.tsx` |
| `SectionPreview.tsx` | 69 | SectionPreview (S-7) — the read-only preview a `kind: "section"` decision card carries (B-3, CB-05). | `components/today/DecisionBodies.tsx` |
| `SectionRenderer.tsx` | 228 | SectionRenderer (B-1, §4.10) — the one component that turns a `SectionConfig` record into a rendered section: Label, then blocks from `layout/catalogue.tsx`, in order. | `layout/SectionPreview.tsx`, `layout/registry.tsx` |
| `TabScreen.tsx` | 130 | `<TabScreen>` — header + focus chips (all tabs but Agents, FS-05) + `<Columns>` over `visibleSections()`. | 5 files |
| `bindKit.ts` | 29 | bindKit.ts (R-1) — the TYPES a published data binding is written against, split out of `layout/sources.ts` when that file reached its 250-line cap (hard rule 3: split before you exceed). | `layout/sources.ts`, `layout/sourcesBrain.ts` |
| `blocks.tsx` | 191 | The eight block components (B-1, §4.10) — the things a configured section can be made of, and nothing else. | `layout/catalogue.tsx` |
| `catalogue.tsx` | 95 | The block catalogue (B-1, §4.10) — the published contract for what a section config may contain. | `data/mock/handlers/sections.ts`, `layout/SectionRenderer.tsx`, `layout/validateSectionConfig.ts` |
| `dialogKit.tsx` | 198 | dialogKit.tsx (O-1) — the dialog registry's TYPES and its factory. | 18 files |
| `dialogs.tsx` | 250 | The dialog registry (S-3, SM-05). | 5 files |
| `find.ts` | 40 | find.ts (K-1) — which Find to open. | `components/chrome/Header.tsx`, `layout/dialogs.tsx`, `lib/boot.ts` |
| `lists.ts` | 108 | lists.ts (O-1, OP-07) — every list in the app, and how its rows open. | — |
| `openRef.ts` | 81 | openRef.ts (O-1, resolution #31) — open any record from a `"<kind>:<id>"`. | 5 files |
| `registry.tsx` | 206 | The section registry (ADR-01): every tab is data, an ordered list of section ids. | 4 files |
| `sources.ts` | 231 | The published data bindings for configured sections (B-1, §4.10). | 7 files |
| `sourcesBrain.ts` | 100 | sourcesBrain.ts (R-1) — Brain's published bindings. | `layout/sources.ts` |
| `sourcesVerbs.ts` | 40 | Section-level verbs (T-4) — the same closed-list rule as `BINDS` in `layout/sources.ts`, one level up. | `layout/sources.ts` |
| `tabRoutes.ts` | 41 | The tab table (F-40, F-71 — P-6): the five tabs declared ONCE — id, label, route path and icon. | 12 files |
| `validateSectionConfig.ts` | 208 | The section-config validator (B-1, §4.10) — one pure function, no imports from React or any store, so the app, the mock server and the Jest suite all run the same code (CB-02). | `data/mock/handlers/sections.ts`, `data/n8n/adapters/records.ts` |
| `zorder.ts` | 46 | The z-order table — the one place a layer number is written (ADR-65 rule 18, LV-05). | 10 files |

### `lib/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `authTokens.ts` | 98 | Token custody (spec §14.9 — SEC-05, contract §9): the refresh token lives in the Keychain (expo-secure-store, this-device-only); the access token lives in MEMORY with a 15-minute TTL and is never written to AsyncStorage/localStorage. | 4 files |
| `autoLock.ts` | 141 | Auto-lock (spec §14.9 — SEC-03; rewritten by L-1 under ADR-41). | 5 files |
| `boot.ts` | 159 | The app's boot sequence (S-3): everything `app/_layout.tsx` used to do in one long effect — the test hook, the two stores the shell itself reads, the keyboard and auto-lock listeners, and the desktop shortcut map. | `app/_layout.tsx` |
| `cardVerbs.ts` | 84 | cardVerbs.ts (A-4 round 9, A4R9-01/02) — what a decision card's Approve, Revise and Later DO, in one place. | 9 files |
| `clipboard.ts` | 30 | Copy to the clipboard, best effort (S-9). | `components/settings/Sync.tsx`, `components/today/DecisionBodies.tsx`, `stores/usage.ts` |
| `decisionCopy.ts` | 62 | decisionCopy.ts (Stage 5d P-4, F-14) — the words a decision verb produces. | `components/today/DecisionCard.tsx`, `components/today/WaitingRow.tsx`, `stores/today.ts` |
| `deltaLine.ts` | 32 | The "what changed while you were away" line (OF-09, CD-02). | `stores/today.ts` |
| `dialogFocus.ts` | 187 | lib/dialogFocus.ts (C-3) — what makes an open dialog reachable and nothing else: `role="dialog"` / `aria-modal`, focus moved onto it when it opens, a Tab/Shift+Tab trap over its own focusable set, and the focus it hands back to whatever had it when the dialog closes. | `components/chrome/DialogHost.tsx` |
| `docTitle.ts` | 17 | docTitle.ts (F-18, P-10) — the one writer of `document.title`. | `stores/mic.ts`, `stores/voice.ts` |
| `drag.ts` | 170 | The drag, as arithmetic (B-1, ADR-45; the Gantt shares it at G-1). | 4 files |
| `emergencyLock.ts` | 132 | The emergency lock's round trip (AG-12; v2.3 WPF-4) — what "Lock everything now" does when the server confirms it, refuses it, or cannot be reached. | 5 files |
| `emergencyWipe.ts` | 33 | What the emergency lock does to THIS device (AG-12, SEC-08; Josh's A-0 row 5). | `lib/emergencyLock.ts` |
| `encryptedStore.ts` | 293 | Encrypted persistence (spec §14.9 — SEC-06): AES-256-GCM around the app's only persistent store. | 8 files |
| `enumLabels.ts` | 97 | enumLabels.ts (Stage 5d P-5, F-56 + F-23) — the words for every wire enum a row prints, in one place. | 8 files |
| `ganttAxis.ts` | 327 | The Gantt's geometry, as arithmetic (G-1, ADR-46; `lib/drag.ts`'s sibling). | 6 files |
| `goalMeta.ts` | 102 | The one composer for a goal's status line (LG-1, LG-02; D-1/ADR-47, hard rules 16, 19 and 21). | 5 files |
| `habitStats.ts` | 234 | What the habit grids are drawn from (LH-1). | 6 files |
| `highRisk.ts` | 48 | Biometric re-assertion for high-risk approvals (spec §14.9 — SEC-07, contract §9): bill-handled, security apply, memory master. | 6 files |
| `holdToLock.ts` | 92 | The AG-11 press-and-hold timer, shared by the two "Hold to lock" controls (Agents' own Emergency card, and a second one in Settings › Appearance). | `components/agents/EmergencyLock.tsx`, `components/settings/Appearance.tsx` |
| `keyboard.ts` | 90 | Keyboard listeners (spec §14.2 — KB-01/02/03). | 5 files |
| `labelColumn.ts` | 53 | The waiting row's type column, sized to the widest type it must actually hold (R-18, rule 20: "a fixed column is sized to the widest word it must hold, measured"; UX-H, row C-5). | 5 files |
| `lastSeen.ts` | 85 | lastSeen (A-3, WP-A) — the last copy of the three tabs Josh plans from, kept on this device so a load that fails offline still has something to plan from. | 5 files |
| `loadError.ts` | 60 | recordLoad (A-2, WP-A) — a tab's load that fails is RECORDED, never thrown. | 8 files |
| `lockGate.ts` | 57 | The locked-session write gate (H-1 d2, CD-14). | `data/ApiAdapter.ts`, `data/transport/outbox.ts`, `stores/session.ts` |
| `mic.ts` | 585 | mic.ts (V-1, ADR-49) — the ONLY code in the app that opens a microphone. | 11 files |
| `money.ts` | 33 | One money formatter, so the same amount cannot read two ways on one screen. | 7 files |
| `needsYouSchedule.ts` | 127 | needsYouSchedule.ts (WPS-1, v2.3.2) — when Today raises Needs you. | `components/settings/Schedules.tsx`, `components/today/NeedsYou.tsx`, `lib/cardVerbs.ts` |
| `openFromUrl.ts` | 47 | openFromUrl.ts (R-1, RP-04) — a notification click opens the thing it was about. | `lib/boot.ts` |
| `optimistic.ts` | 121 | One shape for "change it now, ask the server, be honest if the answer is no" (T-1/T-2, TK-02..TK-09). | 30 files |
| `pressGate.ts` | 105 | The settle window (A4R11-01) — a press answers the control that was there, not the one that took its place. | 4 files |
| `push.ts` | 139 | Push subscription (U-1, PU-01..05, SE-02). | `components/settings/Notifications.tsx` |
| `pushToTalk.ts` | 81 | v2.3.2 WPR-2 — the orb's push-to-talk: one Brain session per hold. | `components/chrome/Orb.tsx` |
| `pwa.ts` | 24 | Service-worker registration (P-1). | `lib/boot.ts` |
| `queueStore.ts` | 301 | Where the outbox lives between a capture and a connection (O-1, OF-06, OF-10). | `data/provider.ts`, `data/transport/outbox.ts` |
| `recentFiles.ts` | 127 | recentFiles.ts (X-1, FL-05) — the file details this device keeps, so Find and the Files lists can answer without a connection. | `components/detail/FileDetail.tsx`, `stores/files.ts` |
| `richText.tsx` | 178 | Small, scoped inline-markup support for `MemoryProposal.text` (BR-06/07) — the only field in the app whose fixture data embeds `<b>...</b>` emphasis (e.g. | 9 files |
| `routingLine.ts` | 74 | routingLine.ts (R-1, RP-06) — a capture's one meta line, and its tags. | `components/brain/LatestIn.tsx`, `components/detail/BrainItemDetail.tsx` |
| `serverEvents.ts` | 119 | The server pushed; which stores should refetch? (D-1, ADR-36, TM-02.) One subscription, started once by `app/_layout.tsx`. | `lib/boot.ts` |
| `shareDraft.ts` | 43 | keptShare (A4R11-03) — a share's provenance lives exactly as long as its words do. | `stores/brain.ts` |
| `shortcuts.ts` | 87 | Desktop keyboard shortcuts (the brief's Desktop section; V2_DECISIONS.md "Deferred or refused brief items" — built minimal, not the full "week's cards in two minutes" deck, which is V2.1): 1–5 switch tabs, Esc closes the open dialog/sheet, Cmd/Ctrl+K opens Find, Cmd/Ctrl+Z undoes the latest ledger entry, A/R/L answer the open decision card (Approve/Revise/Later) when one is open — through the card's own verbs and only where its buttons are there to press (`lib/cardVerbs.ts`, A4R9-01/02). | `lib/boot.ts` |
| `syncInstall.ts` | 107 | syncInstall.ts (P-10, the `stores/sync.ts` margin) — the listeners that give the queue its chances to drain: the browser saying it is back, the app coming to the foreground, an unlock, and a timer that only runs while something is actually waiting. | `lib/boot.ts` |
| `syncStatus.ts` | 76 | syncStatus (SY-01, seam 9) — the one place that decides what the sync dot is saying, and the one place that words it. | `components/chrome/SyncDot.tsx` |
| `talkMic.ts` | 72 | The microphone half of a Talk conversation, lifted out of `stores/voice.ts` at A-6 when D-6's fix took that store past its 200-line cap (SP-04, and the standing rule: the row that pushes a store over the line SPLITS it rather than trimming it again). | `stores/voice.ts` |
| `talkSession.ts` | 75 | The session half of a Talk conversation — the EA's voice, and what the store mirrors from the session's events. | `stores/voice.ts` |
| `taskMeta.ts` | 185 | The one composer for a task's meta line (D-1, ADR-47, TD-04). | 13 files |
| `testBuild.prod.ts` | 10 | Production flavour of the test-build gateway (see testBuild.ts). | — |
| `testBuild.ts` | 13 | Test-build gateway — the ONLY door to test-only capability (SEC-01, TM-01). | `components/chrome/ErrorBoundary.tsx`, `lib/boot.ts`, `lib/pwa.ts` |
| `testHook.ts` | 484 | e2e state hook (web only): Playwright asserts on STORE STATE, never logs. | `lib/testBuild.ts` |
| `time.ts` | 428 | One time library, one basis: **the device's own time zone** (ADR-47, D-1). | 73 files |
| `timeGrid.ts` | 101 | The calendar time grid's geometry (S-8). | 4 files |
| `unlockCopy.ts` | 68 | The words for the unlock mechanism, in one place, because they differ by platform and are shown on four surfaces. | 5 files |
| `usage.ts` | 122 | The lines the app draws about what an agent run cost (T-4, ADR-43). | 6 files |
| `voice.ts` | 46 | The live voice stack (V-1, CONTRACT_v21.md §4.11, ADR-24). | 7 files |
| `wakeLock.ts` | 80 | wakeLock.ts (V-2; v2.3.1 WPJ-1) — keep the screen awake while a microphone is open, and in car mode. | `lib/mic.ts`, `stores/voice.ts` |
| `webData.ts` | 42 | data-* attributes for e2e hooks: react-native-web maps `dataSet` to data-* DOM attributes; native RN ignores it. | 25 files |
| `webInert.ts` | 41 | `inert` for everything behind the gate (B7-01). | `app/_layout.tsx` |
| `webScrollbars.ts` | 42 | The pack's own scrollbars, web only — README, Do and don't: "Scrollbars: 5px, thumb `rgba(122,119,111,.3)`, transparent track, thin on Firefox. | `lib/boot.ts` |
| `webauthnGate.ts` | 86 | Web gate (spec §14.9 — SEC-02): a REAL passkey/WebAuthn ceremony replaces v1's tap-to-simulate. | `components/chrome/Gate.tsx`, `lib/highRisk.ts` |

### `lib/voice/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `audio.ts` | 111 | The two things that only exist in a browser: the real socket, speech synthesis, and microphone capture (V-1). | `lib/voice.ts` |
| `protocol.ts` | 145 | The voice wire vocabulary (V-1, CONTRACT_v21.md §4.11, ADR-24). | 5 files |
| `session.ts` | 278 | The voice session's state machine (V-1, §4.11, ADR-24). | `lib/voice.ts` |
| `timers.ts` | 139 | The session's timers, and the reconnect ladder (V-1, R-06). | `lib/voice/session.ts` |

### `stores/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `agents.ts` | 186 | agents.ts (ADR-04) — summary, spend and caps, portals, agent issues, the feed, security checks, decision history (answered/expired ActionItems), and schedules. | 16 files |
| `brain.ts` | 199 | brain.ts (ADR-04) — the dump draft, latest-in, memory proposals, hit rate, rules and the Find answer. | 14 files |
| `device.ts` | 122 | device.ts (S-5, ADR-16) — what this DEVICE remembers, as opposed to what the account is set to. | 10 files |
| `dictate.ts` | 53 | dictate.ts (W-1) — the Dictate thread, the conversation `DictateDialog` holds with the EA. | `components/brain/DictateDialog.tsx` |
| `files.ts` | 154 | files.ts (X-1, §4.17) — what the app knows about files. | 7 files |
| `life.ts` | 159 | life.ts (ADR-04) — goals, habits and their logs, people, money, health, learning, and section configs. | 15 files |
| `lifeEdits.ts` | 129 | lifeEdits.ts (A-4 round 5) — the whole-set writes on Life, composed from the set the SERVER holds. | `components/detail/GoalDetail.tsx`, `components/life/GoalEditDialog.tsx`, `components/life/HabitEditDialog.tsx` |
| `mic.ts` | 187 | mic.ts (V-1, ADR-49) — what the microphone is doing, for everything that has to show it. | 14 files |
| `parameters.ts` | 111 | parameters.ts (L-1, ADR-41) — the six tunables, as the server holds them. | 12 files |
| `replies.ts` | 60 | replies.ts (R-1, §3) — the EA's answers to captures that were questions. | 8 files |
| `rules.ts` | 92 | rules.ts (ADR-04, ST-1) — the standing instructions Josh has given his EA. | 5 files |
| `search.ts` | 94 | search.ts (K-1, §4.19) — the global Find. | `components/brain/Find.tsx`, `components/chrome/FindDialog.tsx`, `components/chrome/FindRow.tsx` |
| `sections.ts` | 65 | §4.10 configured sections (B-2, B-3). | 6 files |
| `session.ts` | 198 | session.ts (ADR-04) — locked/emergency, online, clock offset, the modal/sheet stack, the toast, and the undo ledger. | 108 files |
| `settings.ts` | 194 | settings.ts (ADR-04) — notification groups × devices, quiet hours, autonomy, voice, focuses + the active one, layout per tab, capabilities. | 37 files |
| `sync.ts` | 199 | sync.ts (ADR-37, O-1) — what is waiting to reach the server, and what happened when it tried. | 16 files |
| `taskCard.ts` | 200 | taskCard.ts (Stage 5d P-2, F-13) — the OPEN task: which one is open, its fresh copy, the tick and the confirm it can raise, the undoable completion, accept, the EA's report, delegation, and a task made from a goal's card. | 21 files |
| `taskEdits.ts` | 152 | taskEdits.ts (T-2/T-3) — every optimistic edit to a task or one of its subtasks, in one place. | 6 files |
| `taskFilters.ts` | 132 | How the task list is narrowed (F-1, ADR-44) — a slice of `stores/tasks.ts`, not a store of its own. | `stores/tasks.ts` |
| `tasks.ts` | 142 | tasks.ts (ADR-04) — the LIST: the rows, the active view/slicer/filters/range (the `taskFilters` slice), the slicer set, waiting-on rows, the board's columns, the delegatee roster, the header's open count and the project names. | 23 files |
| `today.ts` | 200 | today.ts (ADR-04) — the Today composite, which decision card is open, option picks, the From-your-EA insight's local state, and the journal draft. | 24 files |
| `ui.ts` | 77 | ui.ts (E-1) — transient chrome state of the current viewport. | 9 files |
| `usage.ts` | 82 | usage.ts (ADR-04, ADR-43) — what the agents spent: the Agents › Usage section's month (`GET /usage`) and the open task card's runs (`GET /tasks/{id}/usage`). | `components/tasks/TaskDetail.tsx`, `layout/sources.ts`, `layout/sourcesVerbs.ts` |
| `voice.ts` | 199 | The live voice session, as app state (V-2, §4.11). | 6 files |

### `theme/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `ThemeProvider.tsx` | 68 | Theme mode reads stores/settings.ts (ADR-04), which persists it through lib/encryptedStore.ts (ADR-16: "theme mode and privacy blur are per- device local", never the server). | 81 files |
| `tokens.ts` | 348 | generated by tools/gen-tokens.mjs from design/tokens — do not edit (see design/DISCREPANCIES.md for the three values this script overrides) | 127 files |
| `ui.tsx` | 26 | UI primitives — the barrel (S-2, ADR-33). | 127 files |
| `useLayout.ts` | 41 | The one hook allowed to read the window width (ADR-07; enforced by eslint-rules/no-window-dimensions.js everywhere else). | 30 files |
| `useReducedMotion.ts` | 22 | prefers-reduced-motion (GL-06): orb breathing + screen animations disabled. | `components/chrome/LiveMicOrb.tsx`, `components/chrome/Orb.tsx` |

### `theme/ui/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `attach.tsx` | 221 | attach.tsx (X-1, UP-01) — putting a file on a capture, a task or a subtask. | `components/brain/Entry.tsx`, `components/tasks/Files.tsx` |
| `chips.tsx` | 238 | Chip-family primitives (S-2 split of theme/ui.tsx, ADR-33): Chip, Seg, HabitChip. | `theme/ui.tsx` |
| `controls.tsx` | 183 | Button controls (S-2 split of theme/ui.tsx, ADR-33): Btn, BtnPrimary, BtnSm, and the shared disabled-reason contract every button carries. | `theme/ui.tsx`, `theme/ui/fieldButton.tsx`, `theme/ui/iconButton.tsx` |
| `datetime.tsx` | 196 | `DateTimeField` — a start or an end, picked in place (T-1, ADR-42, TK-03). | `theme/ui.tsx` |
| `fieldButton.tsx` | 132 | `FieldButton` — the 30px icon button that lives in a `Field`'s `right` slot (the mic and the send arrow). | `theme/ui.tsx`, `theme/ui/attach.tsx` |
| `fieldEditor.ts` | 232 | fieldEditor.ts (E-1) — everything `Field` needs that is not its JSX. | `theme/ui/fields.tsx` |
| `fields.tsx` | 223 | Field primitives (S-2 split of theme/ui.tsx, ADR-33): Field, FieldButton. | `theme/ui.tsx` |
| `hover.ts` | 69 | The pack's hover state (CD-17, DS-01b) — and `misc.hoverLift`'s first consumer. | 6 files |
| `iconButton.tsx` | 93 | `IconBtn` (S-2b split of `theme/ui/controls.tsx`, ADR-33). | `theme/ui.tsx`, `theme/ui/attach.tsx` |
| `label.tsx` | 113 | `Label` (F-37, P-7 — out of `text.tsx`, which sat at 242/250): the section header — uppercase label, the H-1 disclosure, an optional count badge, an optional trailing hint, an optional right-side node. | `theme/ui.tsx`, `theme/ui/section.tsx` |
| `lists.tsx` | 183 | List-row primitives (S-2 split of theme/ui.tsx, ADR-33): Row, Track, Dot, plus Checkbox and Switch (moved from ./controls to keep that file under SM-03's 250-line cap — a list row's own checkbox is their most common home anyway). | `theme/ui.tsx` |
| `section.tsx` | 64 | Section — a heading and the thing it heads (H-1, CL-01..CL-03). | `theme/ui.tsx` |
| `surfaces.tsx` | 119 | Surface primitives (S-2 split of theme/ui.tsx, ADR-33): Card, ListCard, Inset, Ghost, and the frosted-blur helper they share. | `theme/ui.tsx`, `theme/ui/datetime.tsx` |
| `tag.tsx` | 60 | `Tag` (F-36, P-7 — out of `chips.tsx`, which had reached SM-03's cap with the skin as a nested ternary). | `theme/ui.tsx` |
| `text.tsx` | 162 | Text primitives (S-2 split of theme/ui.tsx, ADR-33): `Txt` (SM-04's general-purpose text role — a `kind` naming the size, a `tone` overriding that kind's colour, an optional `weight`; the kind tables themselves live in `./textKinds`, see that file for why) plus the named roles that predate it (TextLink, Meta, Expiry, CardTitle, Stat; Label moved to `./label` at P-7) — kept as their own components rather than folded in, since three of them (Label's uppercase+badge+hint layout, Expiry's own colour token, TextLink's link semantics) carry structure `Txt`'s flat kind/tone pair doesn't cover; where a role is a plain coloured/sized `<Text>`, it is now `Txt` underneath so the two can never drift apart. | 8 files |
| `textKinds.ts` | 179 | The `Txt` kind tables (S-2b split of `theme/ui/text.tsx`, ADR-33/SM-04). | `theme/ui/text.tsx` |
| `verbRow.tsx` | 30 | DialogVerbs — one verb row for every dialog (Josh's A-0 row 2, B3R2-08). | `theme/ui.tsx` |

### `tools/`

| file | lines | purpose | imported by |
|---|---|---|---|
| `audit-check.mjs` | 114 | `pnpm audit`, with a reviewed allow-list (C-1, SH-07). | — |
| `build-mock.mjs` | 253 | Packages the built web export into ONE self-contained .html file — the shareable interactive mock. | — |
| `build-web.mjs` | 187 | Web export wrapper — outputs OUTSIDE the Dropbox tree (~/.jstack-dist). | — |
| `capture-v2.mjs` | 1289 | `node tools/capture-v2.mjs` — the Stage 2 device pass (history/v2/BUILD_PLAN_v2.md row 21, QA-07). | — |
| `codemap-check.mjs` | 150 | The fast half of the CODEMAP guard — the walker, and nothing else (M-1). | — |
| `companions-check.mjs` | 58 | The release gate on CODEMAP.md's companion lists (ADR-35 liveness layer 3; Stage 4 A-0 review, R-01). | — |
| `conformance.mjs` | 431 | `tools/conformance.mjs <BASE_URL> [--write <dir>]` — does a real server actually behave like `openapi.yaml` says it does? (W-2, WM-04, WM-05.) The generated contract (W-1) is derived from the app's own source, so it is necessarily true of the MOCK. | — |
| `connect-check.mjs` | 51 | `node tools/connect-check.mjs <BASE_URL> [--writes]` — step 1 of "prove it works" (HANDOVER.md §1.7, D-2): the same sweep `tools/conformance.mjs` runs, and its writes only with `--writes` (WPF-9), with an evidence path of its own (`evidence/connect/<date>/`, so a rerun the same day is a fresh file, not a silently overwritten one — REMAP running this after every deploy is the whole point of the command) and ONE line at the end saying whether the base URL is good, on top of the full per-route transcript `conformance.mjs` itself already prints: node tools/connect-check.mjs http://localhost:8788 pnpm connect:check https://api.example.com/api/v1 Exit 0, `CONNECT OK`, if every check passed or was skipped for a stated reason. | — |
| `copy-pins.mjs` | 182 | _(no header comment)_ | — |
| `csp.mjs` | 43 | ONE content-security policy, read from `public/_headers` (SH-08, R-13). | — |
| `gen-app-icons.mjs` | 129 | The PWA icons (P-1, ADR-38) — 192 and 512, generated, no dependency. | — |
| `gen-backend-grep.mjs` | 42 | Canonical TODO(BACKEND: §4.n) marker list generator (AUDIT D-10/D-15; row 4 of the V2 build moved markers from bare §n to CONTRACT_v2.md's §4.n subsections). | — |
| `gen-codemap.mjs` | 389 | Generates the machine-known half of `CODEMAP.md` (M-1, ADR-35, CM-01..10). | — |
| `gen-habit-log.mjs` | 111 | Generates `data/mock/fixtures/habits-log.json` — 184 days of habit logs for the nine fixture habits, as a COMPACT DAY STRING per habit rather than ~1000 dated rows. | — |
| `gen-handover-html.mjs` | 384 | `REMAP_HANDOVER.html` — the handover as one page Josh can open (A-6). | — |
| `gen-icons.mjs` | 100 | _(no header comment)_ | — |
| `gen-openapi.mjs` | 315 | Generates `openapi.yaml` from the three things that already know the truth (W-1, WM-03): `data/routes.ts` (every endpoint, once), `data/types.ts` (the wire shapes those routes name in their `body`/`response` columns) and `data/mock/fixtures/*.json` (real records, for the examples). | — |
| `gen-parameters.mjs` | 107 | PARAMETERS.md generator (L-1, ADR-41, LK-02). | — |
| `gen-sbom.mjs` | 44 | SBOM (spec §14.9 — SEC-13): CycloneDX 1.5 JSON from the installed dependency tree (pnpm ls), written to evidence/sbom.cdx.json. | — |
| `gen-tokens.mjs` | 414 | _(no header comment)_ | — |
| `gen-wiring-html.mjs` | 253 | `WIRING.html` — the wiring map as a picture, one diagram per contract section (W-1, WM-02), generated from `wiring.json`. | — |
| `gen-wiring.mjs` | 271 | _(no header comment)_ | — |
| `install-hooks.mjs` | 42 | Points git at `.githooks/` so the pre-commit hook is installed by `pnpm install` (M-1, ADR-35 liveness layer 1). | — |
| `jest-summary-reporter.cjs` | 92 | Writes the suite's own totals to evidence/jest-summary.json (AUDIT D-33): QA_REPORT's board numbers are asserted against this file the same way HANDOVER's counts are asserted against mutation-pass.json — the count lives in an artifact the suite maintains, not in prose memory. | — |
| `log-scan.mjs` | 41 | Log scan (SEC-14): "No `sens` fixture value appears in console output or test logs during the board." The app's own `<Sens>` wrapper (money, journal, health figures — components/chrome/Sens.tsx) never touches console; the only way a sensitive value could reach console/test-log output is a stray `console.log`/`console.info`/`console.debug` call somewhere in app source (console.error/warning are already a zero-budget e2e assertion, GL-00's assertCleanConsole, on every test). | — |
| `orphan-callers.mjs` | 91 | _(no header comment)_ | — |
| `perf-baseline.mjs` | 258 | The performance baseline (F-1) — measured once, written down, and used to decide what F-2 is allowed to spend effort on. | — |
| `perf-interactions.mjs` | 318 | Perceived speed of the everyday interactions, measured on the PRODUCTION export at 393 and 1366 (Stage 5d hunt 14 of `18_CC_V22_SIMPLIFY_PROMPT.md`; Josh, 10 Sep). | — |
| `qa-rows.mjs` | 160 | _(no header comment)_ | — |
| `read-routes.mjs` | 61 | The one reader for `data/routes.ts` (W-1). | — |
| `run-e2e.mjs` | 203 | `pnpm test:e2e` — the two-invocation Playwright board, with a machine-readable record of what it proved (AUDIT round 5, Question 5). | — |
| `schema-validate.mjs` | 114 | A JSON Schema validator for the subset `tools/gen-openapi.mjs` emits (W-1). | — |
| `secret-scan.mjs` | 96 | Secret scan (spec §14.9 — SEC-13): gitleaks-class regex rules over the repo's tracked source (node_modules/dist excluded). | — |
| `serve-mock.mjs` | 92 | `node tools/serve-mock.mjs [--port <n>] [--test]` — the real in-process mock (`data/mock/server.ts`), served at `http://127.0.0.1:<port>/api/v1` (default 4181; never 4173, the web export's port, or 4180) so `tools/conformance.mjs` and `tools/connect-check.mjs` have a known-good server to run against without a real backend (D-1, D-2) — it runs inside a Jest worker (`jest-expo`'s own startup, not a bug), so give it around half a minute: `Running one project: unit` is Jest's own banner, printed first; the base URL line after it is the one that means the server is actually listening. | — |
| `serve-web.mjs` | 56 | Tiny static server for the Expo web export (dist/). | — |
| `source-fingerprint.mjs` | 84 | A content fingerprint of everything the web export is built from (B-03). | — |
| `sw-precache.mjs` | 76 | What the service worker must hold to open offline (PW-A, C-6). | — |
| `type-walker.mjs` | 519 | A very small TypeScript type-expression walker (W-1, WM-03). | — |
| `unused-exports.mjs` | 237 | Lists exports that nothing imports (S-6, CT-06). | — |
| `validate-openapi.mjs` | 122 | Checks `openapi.yaml` structurally, and against the route table (W-1, WM-03). | — |
| `vendor-fonts.mjs` | 110 | Copies the five faces the app uses out of the @expo-google-fonts packages into `public/fonts/`, where Expo's web export serves them as static files (S-4, SM-06/SEC-09). | — |
| `web-n8n.mjs` | 69 | `pnpm web:n8n` — runs the app on REMAP's n8n build (ADR-76) with its settings on the command, never in `.env.local`. | — |
| `workflow-yaml.mjs` | 162 | A YAML reader for GitHub workflow files, and nothing else (C-1). | — |
| `yaml.mjs` | 126 | The smallest YAML that `openapi.yaml` needs (W-1) — a writer and a reader for exactly the subset this repository emits, and nothing else. | — |
<!-- generated:end -->

---

## 3. The chains

Endpoint → store action → component → testIDs, one block per contract group, from
`wiring.json`.

<!-- generated:start section=3 sha=7b1099c date=2026-09-30 -->

### agents

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /agents` | `tasks.loadRoster` | — | — |
| `GET /agents/summary` | `agents.load`, `agents.loadDerived` | — | — |
| `GET /agents/spend` | `agents.load` | — | — |
| `PUT /agents/caps` | `agents.putCaps` | `EmergencyLock` | `agents-lock-section`, `caps-cancel`, `caps-dialog`, `caps-error-` +9 |
| `GET /portals` | `agents.load` | — | — |
| `GET /agents/issues` | `agents.load` | — | — |
| `GET /agents/issues/{id}` | — | — | — |
| `POST /agents/issues/{id}` | `agents.actIssue` | `Issues`, `Feed` | `agents-feed-section`, `agents-issues-section`, `feed-`, `feed-not-connected` +8 |
| `POST /agents/issues/{id}/undo` | `agents.actIssue` | `Issues`, `Feed` | `agents-feed-section`, `agents-issues-section`, `feed-`, `feed-not-connected` +8 |
| `GET /agents/feed` | `agents.load`, `agents.loadDerived` | — | — |
| `GET /security/checks` | `agents.load`, `agents.loadDerived` | — | — |
| `POST /security/checks/{id}/run` | `agents.runCheck` | — | — |
| `GET /agents/runs` | — | — | — |
| `GET /usage` | `usage.load` | — | — |

### brain

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `POST /brain/dump` | `brain.dump` | `Entry` | `brain-dictate`, `brain-entry`, `brain-entry-section`, `dump-attach` +7 |
| `GET /brain/latest` | `brain.load` | — | — |
| `PUT /brain/items/{id}` | `brain.saveItemEdit` | — | — |
| `GET /brain/items/{id}/versions` | `brain.openItemEditor` | — | — |
| `GET /brain/items/{id}` | — | — | — |
| `GET /brain/search` | `brain.find` | `Find` | `brain-find`, `find-answer`, `find-input`, `find-results` +3 |
| `GET /memory/history` | — | — | — |
| `GET /brain/replies` | `replies.load` | — | — |
| `PATCH /brain/replies/{id}` | `replies.markRead` | `Insight` | `insight`, `insight-block`, `insight-card`, `insight-dictate` +8 |
| `GET /chat/thread` | `dictate.loadChatThread` | — | — |
| `POST /chat` | `dictate.sendChat` | — | — |
| `GET /memory/proposals` | `brain.load` | — | — |
| `POST /memory/proposals/{id}` | `brain.resolveProposal` | `Memory` | `brain-memory-section`, `hitrate-fix`, `memory-all`, `memory-empty` +6 |
| `POST /memory/proposals/{id}/undo` | `brain.resolveProposal` | `Memory` | `brain-memory-section`, `hitrate-fix`, `memory-all`, `memory-empty` +6 |
| `GET /memory/hitrate` | `brain.load` | — | — |

### calendar

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /calendar` | `today.loadCalendar`, `today.loadThreeDay` | `CalendarGrid`, `CalendarList` | `cal-allday-`, `cal-allday-event-`, `cal-day-`, `cal-event-` +13 |
| `GET /events/{id}` | — | — | — |
| `PATCH /events/{id}` | — | — | — |
| `DELETE /events/{id}` | — | — | — |
| `POST /calendar/propose` | — | — | — |

### decisions

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /actions` | `agents.loadHistory`, `today.loadHistory` | `History` | `agents-history-section`, `history-row-`, `history-search` |
| `GET /actions/{id}` | — | — | — |
| `POST /actions/{id}` | `today.answer` | `NeedsYou` | `decision-card-`, `decision-later-`, `decision-menu-`, `decision-more-` +16 |
| `POST /actions/{id}/undo` | `today.answer` | `NeedsYou` | `decision-card-`, `decision-later-`, `decision-menu-`, `decision-more-` +16 |
| `POST /actions/{id}/reopen` | `agents.reopenAction` | — | — |
| `PUT /actions/{id}/draft` | `today.saveDraft` | — | — |
| `POST /insights/{id}` | `today.answerInsight` | `Insight` | `insight`, `insight-block`, `insight-card`, `insight-dictate` +8 |

### files

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /files` | `files.loadArchive`, `files.loadRecent` | — | — |
| `GET /files/{id}` | — | — | — |
| `POST /files` | `files.upload` | `Entry` | `brain-dictate`, `brain-entry`, `brain-entry-section`, `dump-attach` +7 |

### life

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /life` | `life.load` | — | — |
| `GET /goals` | `lifeEdits.archiveGoal`, `lifeEdits.saveGoals` | — | — |
| `PUT /goals` | `lifeEdits.putGoals` | — | — |
| `GET /goals/history` | — | — | — |
| `GET /goals/{id}` | — | — | — |
| `GET /habits` | `life.load`, `life.loadArchivedHabits`, `lifeEdits.saveHabits` | — | — |
| `PUT /habits` | `lifeEdits.saveHabits` | — | — |
| `POST /habits/{id}/log` | `life.logHabit` | `CloseDay`, `Habits` | `close-day`, `close-habit-`, `close-journal`, `habits-edit` +8 |
| `GET /habits/stats` | `life.loadHabitStats` | `Habits` | `habits-edit`, `habits-queued`, `habits-trends`, `life-habit-` +4 |
| `GET /people` | — | — | — |
| `POST /people/{id}/act` | `life.actPerson` | — | — |
| `GET /money` | — | — | — |
| `GET /health` | — | — | — |
| `GET /learning` | — | — | — |
| `GET /learning/{id}` | — | — | — |
| `GET /life/sections/{id}/config` | `life.loadSectionConfig` | — | — |
| `PUT /life/sections/{id}/config` | `life.saveSectionConfig` | — | — |
| `POST /life/sections/{id}/config/revert` | `life.revertSectionConfig` | — | — |

### search

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /search` | `search.run` | `Find` | `brain-find`, `find-answer`, `find-input`, `find-results` +3 |

### sections

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /sections/catalogue` | — | — | — |
| `GET /sections` | `sections.load` | — | — |
| `GET /sections/{id}` | — | — | — |
| `PUT /sections/{id}` | `sections.save` | — | — |
| `POST /sections/{id}/revert` | `sections.revert` | — | — |
| `DELETE /sections/{id}` | — | — | — |
| `POST /sections/propose` | `sections.propose` | — | — |

### session

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /auth/nonce` | — | — | — |
| `POST /auth/register-device` | — | — | — |
| `POST /auth/refresh` | — | — | — |
| `POST /auth/webauthn/{step}` | — | — | — |
| `GET /session` | `session.loadSession`, `settings.loadDevices` | — | — |
| `POST /devices/{id}/revoke` | `settings.revokeDevice` | — | — |
| `POST /lock` | `session.lock` | `EmergencyLock` | `agents-lock-section`, `caps-cancel`, `caps-dialog`, `caps-error-` +9 |
| `POST /recover` | `session.recover` | — | — |
| `POST /push/subscribe` | — | — | — |
| `DELETE /push/subscribe/{device}` | `settings.revokeDevice` | — | — |

### settings

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /settings/notifications` | `settings.load` | — | — |
| `PUT /settings/notifications/{id}` | `settings.putNotificationGroup` | — | — |
| `GET /settings/quiet-hours` | `settings.load` | — | — |
| `PUT /settings/quiet-hours` | `settings.putQuietHours` | — | — |
| `GET /schedules` | `agents.load`, `agents.loadSchedules` | — | — |
| `POST /schedules/{id}/run` | `agents.runSchedule` | — | — |
| `POST /schedules/{id}/pause` | `agents.pauseSchedule` | — | — |
| `POST /schedules/{id}/resume` | `agents.resumeSchedule` | — | — |
| `GET /settings/autonomy` | `settings.load` | — | — |
| `PUT /settings/autonomy` | `settings.putAutonomy` | — | — |
| `GET /settings/autonomy/rules` | `rules.load` | — | — |
| `PUT /settings/autonomy/rules` | `rules.put` | — | — |
| `POST /settings/autonomy/propose` | — | — | — |
| `GET /settings/voice` | `settings.load` | — | — |
| `PUT /settings/voice` | `settings.putVoice` | — | — |
| `GET /focuses` | `settings.load` | — | — |
| `PUT /focuses` | `settings.putFocuses` | — | — |
| `GET /layout/app` | `settings.load` | — | — |
| `PUT /layout/app` | `settings.putAppLayout` | — | — |
| `POST /layout/{tab}/revert` | `settings.revertLayout` | — | — |
| `POST /layout/{tab}/ea` | `settings.postLayoutEa` | — | — |
| `GET /layout/{tab}` | `settings.loadLayout` | — | — |
| `PUT /layout/{tab}` | `settings.putLayout` | — | — |
| `GET /parameters` | `parameters.load` | — | — |
| `POST /parameters/propose` | — | — | — |
| `PUT /parameters/{key}` | `parameters.setParameter` | — | — |
| `GET /sync/status` | — | — | — |
| `GET /capabilities` | `settings.load`, `sync.probe` | — | — |
| `POST /export` | `settings.exportAll` | — | — |
| `GET /labels/scheme` | — | — | — |
| `GET /labels/audit` | — | — | — |

### tasks

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /tasks/waiting` | `tasks.loadWaiting` | — | — |
| `GET /tasks/columns` | `tasks.loadColumns` | `TaskViews` | `active-filter-`, `active-filter-columns-`, `board`, `board-card-` +53 |
| `GET /tasks` | `tasks.load`, `tasks.loadOpenCount`, `tasks.loadProjects`, `usage.load` | — | — |
| `GET /tasks/{id}` | `taskCard.completeTask`, `taskCard.loadDetailTask`, `taskEdits.patchSubtask`, `taskEdits.patchTask` | `TaskViews`, `WaitingOn` | `active-filter-`, `active-filter-columns-`, `board`, `board-card-` +55 |
| `POST /tasks` | `taskCard.createTask` | — | — |
| `PATCH /tasks/{id}` | `taskEdits.patchTask` | `TaskViews`, `WaitingOn` | `active-filter-`, `active-filter-columns-`, `board`, `board-card-` +55 |
| `PUT /tasks/{id}` | `taskCard.completeTask` | — | — |
| `POST /tasks/{id}/subtasks` | `taskEdits.addSubtask`, `taskEdits.deleteSubtask` | — | — |
| `PATCH /tasks/{id}/subtasks/{sid}` | `taskEdits.patchSubtask` | — | — |
| `DELETE /tasks/{id}/subtasks/{sid}` | `taskEdits.deleteSubtask` | — | — |
| `POST /tasks/{id}/delegate` | `taskCard.delegate` | — | — |
| `POST /tasks/{id}/report` | `taskCard.submitReport` | — | — |
| `POST /tasks/{id}/complete` | `taskCard.completeTask` | — | — |
| `POST /tasks/{id}/accept` | `taskCard.acceptTask` | `TaskViews` | `active-filter-`, `active-filter-columns-`, `board`, `board-card-` +53 |
| `POST /tasks/{id}/nudge` | `tasks.nudge` | `WaitingOn` | `gantt`, `gantt-axis`, `gantt-bar-`, `gantt-day-` +19 |
| `GET /slicers` | — | — | — |
| `PUT /slicers` | — | — | — |
| `GET /tasks/{id}/usage` | `usage.loadTask` | — | — |
| `GET /tasks/{id}/files` | `files.loadTaskFiles` | — | — |
| `POST /undo` | — | — | — |
| `PUT /{noun}/{id}/labels` | — | — | — |

### today

| endpoint | store action | component | testIDs |
|---|---|---|---|
| `GET /today` | `today.load` | — | — |
| `GET /review` | `today.loadReview` | — | — |
| `POST /journal` | `today.submitJournal` | `CloseDay` | `close-day`, `close-habit-`, `close-journal`, `journal-mic` |

**34 orphan route(s)** — reachable in the contract, no client caller traced. `wiring.json` lists them.
<!-- generated:end -->

---

## 4. Invariants, and the guard that enforces each

An invariant with no guard is a wish. Every row below names a file that runs in the board; if
you change the invariant, change the guard in the same commit.

| invariant | guard | what fails if you break it |
|---|---|---|
| No component sets its own typography — size and family come from a `Txt` kind | `eslint-rules/no-inline-font-size.js` · `tests/unit/lint-guards.test.ts` | `pnpm lint` errors on the property, naming the file |
| No colour literal outside `theme/` and `design/` | `eslint-rules/no-colour-literal.js` · `tests/unit/lint-guards.test.ts` | `pnpm lint` errors |
| Only `theme/useLayout.ts` may read the window size | `eslint-rules/no-window-dimensions.js` | `pnpm lint` errors on the import |
| `{count && <X/>}` never renders a bare `0` | `eslint-rules/no-numeric-and.js` | `pnpm lint` errors (type-aware) |
| Raw text never renders outside a `<Text>` wrapper | `react-native/no-raw-text` · `tests/native/primitives.test.tsx` | lint errors; the native lane throws |
| No component or store over 250 lines, no tab file over 60, `app/_layout.tsx` under 100 | `tests/unit/sizes.test.ts` | the test names the file and its count |
| Nothing is exported that nothing imports | `tools/unused-exports.mjs` · `tests/unit/unused-exports.test.ts` | the tool exits 1 listing each |
| A component never fetches — a detail through `useDetail`, an archive through `SearchableListDialog`, and nothing else | `tests/unit/boundaries.test.ts` | the walk names the new importer, or the stale line |
| One date basis: no app source reads a local date field | `tests/unit/date-basis.test.ts` · `tests/unit/time.test.ts` (TZ=America/New_York) · `e2e/core/timezone.spec.ts` | the grep test lists the file; the timezone spec diverges by a whole day |
| Every generated design token has a consumer | `tests/unit/tokens.test.ts` (DS-01b) | the allow-list check fails |
| Every dialog is one registry entry, and stacking order is array order | `tests/unit/dialogs.test.ts` | ordering assertions fail by position |
| Every `openModal`/`openSheet` names a dialog that exists | `tests/unit/dialogs.test.ts` | the source walk lists the bad call |
| The vendored fonts are byte-identical to their packages | `tests/unit/fonts.test.ts` | the byte comparison fails |
| The test rig never reaches a production build | `tools/build-mock.mjs`'s marker refusal · `.github/workflows/board.yml`'s SEC-01 grep | the mock build throws; the board step fails |
| Docs' counts match the real board | `tests/unit/handover.test.ts` (QA-02) | the count guard names doc and number |
| `history/v2/BRAIN_PROPOSAL.md`'s approval and its `history/v22/demo/v22/brain-proposal-*` captures both exist (BN-04) | `tests/unit/brainProposalApplied.test.ts` (C-7d) | the file-existence assertion names the missing capture |
| Every source file opens with a purpose comment | `eslint-rules/require-purpose-header.js` | `pnpm lint` errors on the first line |
| `CODEMAP.md` names only things that exist, and is not stale | `tests/unit/codemap.test.ts` · `.githooks/pre-commit` | the walker names the broken path; the commit is refused |
| A locked session writes nothing — not through the adapter, and not by replaying the outbox | `tests/unit/hardening.test.ts` (CD-14) · `tests/unit/stores/sync.test.ts` (R-05) | the adapter throws `LockedError`; the queue's length is unchanged and the server holds no new record |
| No user-visible copy names the unlock mechanism — the word is the platform's, decided once in `lib/unlockCopy.ts`, and a control's accessible name contains the label it shows (WCAG 2.5.3) | `tests/unit/security.test.ts` (B-251) · `tests/native/screens.test.tsx` · `e2e/matrix/theme.spec.ts` | the source sweep names the file and the line; the native lane fails on the pair; the browser sweep names the control, what it says and what it hears |
| The packaged mock never asks for a service worker — it is one file, and the worker script is not beside it | `tests/unit/pwa.test.ts` (B-262) | the shim's guard is missing from the built mock, and every open logs three fetch failures in the console |
| No capture is dropped in silence: an outbox entry is sent, kept for later, or listed with the server's reason | `tests/unit/outbox.test.ts` (OF-07, R-05) | the entry is gone from the queue AND from the conflicts list |
| Only the five catalogue verbs become buttons — a bound row's verb is server data, and an unknown action renders no control | `tests/native/sections.test.tsx` (SH-06, R-12) | a button appears for a `zap` |
| The page's meta CSP is derived from `public/_headers`, never a second string | `tests/unit/pwa.test.ts` (SH-08, R-13) · `e2e/core/hardening.spec.ts` | the derived meta and the served policy differ by more than `frame-ancestors` |

### Every other test file, and what it protects

The table above is INVARIANTS — rules the app must never break, each with the guard that
refuses it. The files below are not that: they are tests of behaviour, one line each, so a
reader can go from a filename to what it is about without opening it. `pnpm test` runs all of
them; `tools/gen-codemap.mjs` lists any that this section does not name.

| test | what it protects |
|---|---|
| `tests/unit/ganttAxis.test.ts` | The Gantt's geometry as arithmetic: a day is `DAY_WIDTH` pixels, week bands start Monday, the today line is fractional rather than snapped, a bar covers whole days, and a move or resize keeps its wall-clock time across a DST boundary (GT-01, GT-02, GT-04, GT-05, GT-07) |
| `tests/native/collapse.test.tsx` | The disclosure is a real button with an expanded state, and a collapsed section keeps its heading and badge (CL-01, CL-02) |
| `tests/native/errorBoundary.test.tsx` | A screen that throws shows a recovery card, not a white screen (NR-03/NR-04) |
| `tests/native/gateMockSignIn.test.tsx` | On a page that cannot run a passkey — no `PublicKeyCredential`, not a secure context, or a ceremony the browser refuses — the gate offers the mock's own sign-in and it opens Today; a build pointed at a server never offers it (WPN-1) |
| `tests/native/people-verb-error.test.tsx` | A rejected verb shows an honest toast, never the success line — the await is real (CD-10) |
| `tests/native/push-copy.test.tsx` | With no push service the Notifications card says "push needs the backend" and offers no switch (PU-01's words, R-07) |
| `tests/native/primitives.test.tsx` | Every `theme/ui` primitive mounts on iOS with no raw text outside a `<Text>` |
| `tests/native/screens.test.tsx` | Every tab, dialog and sheet mounts on iOS, walked for the same defect |
| `tests/native/sections.test.tsx` | The eight block types and the four configured sections render on iOS (CB-01, CB-04) |
| `tests/unit/autoLock.test.ts` | Two device classes and one timer: a phone locks when it is put down, a desktop locks on the clock with the timer counting through the hidden time (LK-01) |
| `tests/unit/audit-check.test.ts` | The audit gate can SEE an advisory — it could not, for eleven rows (B-37) |
| `tests/unit/bundle-budget.test.ts` | The built entry stays within 10% of the recorded baseline, measured on the PROD dist |
| `tests/unit/capabilities.test.ts` | A capability the server does not send falls back to off, never to on |
| `tests/unit/conformance.test.ts` | The conformance runner passes a correct server and fails a wrong one, naming the field |
| `tests/unit/completion.test.ts` | The server refuses to complete a task with open subtasks unless it was asked to, closes them at ONE instant with ONE activity entry, and the undo reverses the task and every subtask it closed (TK-10..TK-12) |
| `tests/unit/contract.test.ts` | Every `TODO(BACKEND: §n)` marker matches a route, and the evidence file matches a fresh scan |
| `tests/unit/controls.test.ts` | `history/v2/CONTROLS_v2.md` and the source agree in both directions (QA-01) |
| `tests/unit/controls-v21.test.ts` | `history/v21/CONTROLS_v21.md` names only controls that exist and that the full reference also carries |
| `tests/unit/day2.test.ts` | The second fixture day applies its diffs and emits the server events it should |
| `tests/unit/fixture-dates.test.ts` | Every fixture date token resolves; none reaches the app as `{{TODAY+3}}` |
| `tests/unit/fixture-weekdays.test.ts` | A fixture that names a weekday means it, whatever day the demo is opened (CD-18) |
| `tests/unit/fixtures.test.ts` | The mock's fixtures parse, and every id a handler looks up exists |
| `tests/unit/hardening.test.ts` | Locked writes are refused; EA-authored text renders through `Txt`/`RichText` only |
| `tests/unit/hooks.test.ts` | The pre-commit hook runs in a temp clone and refuses a broken reference (CM-07) |
| `tests/unit/captureRig.test.ts` | The capture rig refuses an off-pass `--instant` that would write into `history/v22/demo/v22`, whatever the path is spelled like (QA-07) |
| `tests/unit/hover.test.ts` | Desktop hover applies the pack's rule, and only where a control is actually a button |
| `tests/unit/shortcuts.test.ts` | Escape reaches an open dialog from inside a text field (the caps dialog's amount box), letters stay blocked while typing regardless, and Escape still fires off a text field whether or not anything is open (C-2) |
| `tests/unit/dialogFocus.test.ts` | An open dialog's root node gets `role="dialog"`/`aria-modal`, focus moves to its first focusable control (or itself with none), Tab/Shift+Tab wraps inside its own focusable set, and closing it restores focus to whatever had it (C-3) |
| `tests/unit/offlineVerbs.test.tsx` | Revise's Save, the Teach sheet's Save, a proposal's Configure Save and Decision history's reopen are each disabled offline with the "needs a connection" toast on press, and write nothing (A4R10-04, C-4) |
| `tests/unit/memoryHistory.test.ts` | Accepting or editing a memory proposal appends a `MemoryHistoryEntry` (newest first), naming the decision, who, and — for an edit — the value it replaced (MH-A, C-6) |
| `tests/unit/ingestionThreatModel.test.ts` | `SECURITY.md`'s ingestion threat model and `CONTRACT.md`'s Q24 name the injection threat, the tool-less extract step and the three REMAP screening options — the sections the report claims exist actually do (UP-10, C-7) |
| `tests/unit/enterSends.test.ts` | The field editor's `enterSends`: Enter sends and prevents the newline, Shift+Enter does not, touch gets no `onKeyPress`, a field with no `onSend` is unaffected (MC-05, C-7) |
| `tests/unit/orbOverlay.test.tsx` | The floating mic orb renders nothing while any overlay (a modal, Talk, the task card) is open — it cannot start a session over one already running (MC-10, C-7) |
| `tests/unit/searchableAll.test.ts` | Every "All"/history dialog renders through the shared `SearchableListDialog`/`SearchableList`, and no other component hand-rolls a search field over its own row list (OP-08, C-7) |
| `tests/unit/bnCaptureCarried.test.ts` | Every V2/V2.1 `BR`/`TM`/`OF` acceptance id still passes in its own QA report or is explicitly retired/consolidated in the doc that carries it (BN-02, C-7) |
| `tests/unit/learningShape.test.ts` | `LearningItem` carries `kind`/`url`/`body`, and `GET /learning` · `GET /learning/{id}` are in the route table (LL-01, C-7) |
| `tests/unit/icons.test.ts` | Every icon name a component asks for exists in the generated set |
| `tests/unit/identity.test.ts` | The silo gate filters every list read; a labelled record the session may not see does not come back |
| `tests/unit/labels.test.ts` | Label inheritance and `strictestSilo` — a child never widens its parent's silo |
| `tests/unit/labelColumn.test.ts` | The waiting row's type column follows its widest type, with the pack's 48 as the floor |
| `tests/unit/lockGate.test.ts` | Every mutating route in the table is refused while the session is locked — the client gate and the server's 401, with the queue intact |
| `tests/unit/taskEdit.test.ts` | A task's window cannot run backwards and its title cannot be emptied — the server refuses both by field — and an edit made offline keeps the value it showed rather than being reloaded away (TK-02..TK-05) |
| `tests/unit/delegation.test.ts` | Delegating writes every field the marker reads — owner, delegatedAt, delegated and work, in one call — and a subtask can be ticked, renamed, re-delegated and deleted, with the undo restoring the SAME subtask rather than a lookalike (TK-06..TK-09) |
| `tests/unit/parameters.test.ts` | The six tunables: the table's `usedBy` names files that really read the key, the server enforces the range it publishes, and an EA proposal changes nothing until the card is approved (LK-02..LK-04) |
| `tests/unit/predicates.test.ts` | Every task slicer and filter group has an implementation, checked against the typed union rather than the table itself |
| `tests/unit/usage.test.ts` | `Usage` is the ONE cost record: a run’s cost, a task’s delegation cost and the day’s spend are all sums of its rows, and no price table or token-to-cost arithmetic exists anywhere in `lib/`, `stores/` or `components/` (US-01..US-05) |
| `tests/unit/work.test.ts` | The agent working marker: `work` is on the wire and on exactly one fixture task, each state has its own line (running says since when, blocked names the step, done says nothing), and `POST /__test__/work` flips it on the SERVER and emits the `tasks` event the surfaces follow (WK-01..WK-04) |
| `tests/unit/taskRange.test.ts` | The date range every task view shares: `default` means the next `tasks.rangeDays` days on List/Board/Gantt and ALL TIME on Done, an explicit preset means the same thing everywhere, the chip label is composed from the same window the server filters by, and `serializeFilters` carries the range and the columns (TF-01, TF-02, TF-09) |
| `tests/unit/slicers.test.ts` | The slicers are a stored list the server evaluates: `PUT /slicers` takes the whole set, refuses to lose a `fixed` one or to store a predicate kind nobody implements, and the chosen slicer narrows List, Board, Gantt and Done identically (TF-06, TF-08) |
| `tests/unit/drag.test.ts` | The board drag as pointer arithmetic: a 3px wobble is a tap and a 4px move is a drag, measured from where the finger went down; a drop outside every column reports none rather than the nearest; targets are read once at the start so a lane reflowing under the finger cannot change the answer (BD-04) |
| `tests/unit/openapi.test.ts` | `openapi.yaml` regenerates identically and validates, and every route is present |
| `tests/unit/outbox.test.ts` | Queue, order, dedupe, conflict and the persistence adapter (OF-01..OF-07) |
| `tests/unit/push.test.ts` | Every push state, the real web-push body shape, and the no-worker case that used to hang (B-30) |
| `tests/unit/pwa.test.ts` | Manifest, service worker, `_headers` and `vercel.json` — two hosts, one policy |
| `tests/unit/qa-citations.test.ts` | Every evidence path `history/v2/QA_REPORT_v2.md` cites exists |
| `tests/unit/registry.test.ts` | The feed gate, fixed columns, and the merge of configured sections after static ones (CB-03) |
| `tests/unit/routes.test.ts` | Every row has a verb, a handler that resolves and a pattern that matches its own template |
| `tests/unit/rules.test.ts` | The EA's standing instructions, and the card that proposes one: V2.1's four rules are proven present in the new list BY THEIR OWN TEXT, because a migration that dropped what somebody had taught would look exactly like one that worked; each rule says when it applies and what the EA does, which the old list could not; V2.1's four routes are proven GONE from the table and their path answers 404, because a retired route left in the table is a route somebody will call; the set refuses a body that is not a list, a rule with nothing to say, and a scope or mode it has never heard of — the last naming WHICH rule as well as which field, which is CD-13's precision; a removal really removes, unlike a habit's archive; and the proposal card carries the rule it would write with its evidence, with Approve appending exactly that text switched on, Never writing nothing but recording the refusal, and Later leaving it proposed |
| `tests/unit/saturated-fill.test.ts` | No text on a saturated alert fill, with each exemption named and reasoned |
| `tests/unit/sections.test.ts` | The section validator's fifteen rejections, the catalogue, and the §4.10 endpoints |
| `tests/unit/security.test.ts` | The blocked verbs stay blocked; no send, pay, book or revoke reaches an adapter |
| `tests/unit/server.test.ts` | The mock's router, the rank-and-cap, focus filtering and the lock gate |
| `tests/unit/mic.test.ts` | One microphone owner: every exit path releases every track, the mime type is probed rather than assumed, the auto-stop notice composes from the parameter, and no other file in the app opens a capture device |
| `tests/unit/opens.test.ts` | Everything listed opens: every file rendering a row is in the registry with either what it opens or a reason it does not, every bound rows block is classified, and the scan is proven against a planted list |
| `tests/unit/search.test.ts` | Global search through its own route: the silo gate refuses a record the session's user may not see and the same query finds it for someone who may; the focus scopes by silo rather than by a focus string; the cap limits the total while each group keeps its count; the sensitivity filter is the server's; and the highlight is the server's ranges, with a stale range dropped rather than sliced |
| `tests/unit/replies.test.ts` | The reply route is published both ways; the mock's triage decides a question by its punctuation before any verb in it, fails closed to a provisional filing that says so, and labels a capture with the same content rules every other record uses; and a Latest in row reads as one line and three tones of tag |
| `tests/unit/caps.test.ts` | What counts as a spending cap and what the refusal says: the accepted values, an empty field, symbols and decimals (the dollar sign is PRINTED beside the field now, so typing one is the natural mistake), and the five-digit boundary asserted from both sides so the number in the sentence is the number in the check. Every refusal is pinned as its literal sentence rather than as "something was returned" — a refusal nobody can read is the defect, not the refusal |
| `tests/unit/holdToLock.test.ts` | The press-and-hold that arms the emergency lock, through the hook: the hint at every step with the completion asserted at the FULL duration and one millisecond short of it; an early release proven to have really cleared the timer rather than merely stopped watching it; the release after a COMPLETED hold returning to rest, which is the defect this row fixed — the control read "Locking…" for good on the one control whose completion revokes every session; the confirm dialog's cancel as a separate path from the finger coming off; two full rounds, because a stuck control is one you cannot use twice; and a second press mid-hold arming only one lock. Plus AG-06's grep half, which had an acceptance ID and no test: the sweep is shown to FIND both controls before it is asked to find nothing else, and it asks about the emergency hold's DURATION rather than a constant's name, which caught two Gantt touch-drag holds that share the name and are a different gesture |
| `tests/unit/habitArchive.test.ts` | Archiving a habit and getting it back: the habit leaves `GET /habits` and the Life composite TOGETHER, so the pair cannot disagree; the log count before and after archiving is identical and the stats afterwards are the SAME numbers rather than merely some numbers; `archivedAt` is stamped on the write that archives and is not moved by a later save that leaves it archived; `?includeArchived=` is proven to be what lists them by the plain call not listing them; a restore returns the habit with the stats it had before it was ever archived and clears the stamp; the days-of-history the restore line promises is proven to be a number the stats produce; and the route REFUSES a list with a habit dropped from it, naming which one — the promise Josh asked for, kept by the route rather than by a dialog remembering to |
| `tests/unit/habitStats.test.ts` | The habit stats through their own route, and the geometry the grids are drawn from: the fixture is 184 marks per habit of exactly three kinds and today's column is the four the other specs pin; a month is a CALENDAR month at the anchor rather than the last thirty days, and two different anchors give two different answers, so the parameter is proven READ rather than merely present; `possible` never counts a day that has not happened; an anchor with nothing logged is an empty month rather than an error; the current and longest runs are pinned as literals computed by hand from the fixture's day strings rather than recomputed with the algorithm under test, and a week window and an all-time window report the same streak because a streak is not a window fact; an unfinished today does not break a run; and the summary is proven to SUM the habits rather than read a total the response no longer carries |
| `tests/unit/goalMeta.test.ts` | The one composer for a goal's status line: every member of the status enum has a phrase and `active` — the member that names a filter state rather than how a goal is going — never reaches a row as itself; the tone is derived from the status rather than carried beside it; the line is status · progress · due in that order; the KPI says what the value is OUT OF rather than only what it is; and the target date goes through `formatDate`, so no ISO instant and no invented midnight reaches the screen |
| `tests/unit/syncStatus.test.ts` | The one selector behind the sync dot, as a table, because the interesting part is the PRECEDENCE between overlapping facts: attention outranks a queue that is already draining, since waiting is exactly what will not fix a capture the server refused; offline with an empty queue is pending rather than ok, because ok would be the app claiming agreement with a server it has not spoken to; the count outranks the other two causes of pending, so "2 captures waiting" is what a person is told when both are true; and no phrase prints the wire word `pending`, which names the state to the code and says nothing about which of its three causes you are in |
| `tests/unit/controls-v22.test.ts` | The V2.2 delta control document, guarded the three ways a delta file goes quietly wrong: it names a control that no longer exists, it is wrong about which file that control lives in, or it attributes one to a row that was never in the plan. Its `kind` column is checked in BOTH directions against `history/v2/CONTROLS_v2.md` — a `control` the complete reference does not document is as wrong as a `surface` it does — because 291 rows is far past what anybody keeps right by looking. It deliberately does not check that every new control is listed, which is `tests/unit/controls.test.ts`'s job against the complete reference |
| `tests/unit/goals.test.ts` | The goal set through its own routes: `GET /goals` answers with the active ones and the archived one is proven present on `/goals/history` rather than merely absent; `/goals/history` resolves ahead of `/goals/{id}` instead of being read as a goal called "history"; the detail resolves its task and deliverable ids in the order the goal names them; a `PUT` refuses a body that is not a list and a goal with no title, each paired with the same body accepted once corrected; Done, Drop and a REMOVAL from the list all archive with a history entry and a brain item naming the goal, and none of them deletes a record; and the silo gate refuses a goal the session's user may not see while the same request finds it for someone who may |
| `tests/unit/files.test.ts` | The files table through its own routes: a task's files answer with every subtask's too and name which one; `q` matches the extracted text as well as the name; the silo gate refuses a file the session's user may not see while the same query finds it for someone who may, and `GET /files/{id}` answers 404 rather than 403 so the refusal does not confirm the file exists; an upload lands in the JSTACK Dropbox folder and is refused over the ceiling with the limit in words; and nothing composes a Dropbox URL out of a task field any more |
| `tests/unit/share.test.ts` | Share-in through its own routes: a shared link is its own source and files provisionally with a card, while a share the rules classify files without one; the screened extract step saves the content, names where it came from and counts it once; a page that ASKS to be obeyed is saved and not obeyed — no rule, no memory proposal, no verb, and the filing is the app's own — with the positive half asserted too so the negatives cannot pass against an extractor that returned nothing; teach writes a scoped standing rule and the next share from that host files silently and says which rule did it, while a different host still asks; a file landing in the Dropbox inbox becomes a capture, an attachment and a triage line together; and the handover's Shortcut recipe names only routes that exist, on the fragment rather than a query string |
| `tests/unit/recentFiles.test.ts` | What the device cache holds and what it must never hold: the bytes are read back off the store and asserted to carry no `url` or `urlExpiresAt` and no trace of a signed link's secret, while keeping the metadata, the preview and the Dropbox path; a field added to `Attachment` later is dropped rather than silently persisted; the value is encrypted at rest; and the expiry is `files.recentDays`, applied on read and written back rather than filtered on the way out |
| `tests/unit/transport.test.ts` | `httpTransport` builds the request the adapter meant, and surfaces a `ContractError` |
| `tests/unit/n8nRoutes.test.ts` | ADR-76: every GET the n8n transport answers validates against its `openapi.yaml` response schema (or is an honest 404/501), every write with no key answers 501 without a call, the registry has exactly one row per GET, and no answer carries the fixtures' personal content |
| `tests/unit/n8nClient.test.ts` | ADR-76: `callWebhook` POSTs JSON to `<base>/<key>` with no auth header, maps a DASH refusal to the contract's status (VALIDATION_ERROR → 422), retries once on a network failure or 5xx and never on a 4xx, times out as a network failure, and shares one request per key and body for 30 s — never for a write |
| `tests/unit/n8nAllowList.test.ts` | ADR-76: the registry's webhook keys and the dev proxy's `ALLOW` are one set, no key or proxy path is a workflow that sends or returns file bytes, and no app source names a webhook path |
| `tests/unit/n8nCalendar.test.ts` | Phase 3: `GET /calendar` from the `calendar` webhook — each view's window is `rangeFor`'s (literal instants for both board zones, turning over at the device's midnight), the redacted real replies map to a valid `CalendarWindow`, an all-day event runs midnight to midnight with Google's exclusive end, a missing end is half an hour, the mock's start-in-window, gaps and focus rules hold, and any other reply is the section's 502 |
| `tests/unit/allDay.test.ts` | Option C: the one all-day test (the time grid's `isAllDay`: local midnight to a later local midnight; a timed hour, eleven to midnight, midnight to noon and a zero-length midnight are not) and `eventsCovering` (a two-day event on both its days and neither neighbour, an overnight event on both, a zero-length one on its instant's day) — instants from each board zone's offset |
| `tests/native/calendarAllDay.test.tsx` | Option C, rendered: in Week a two-day all-day event sits in the strip on both its days (the empty Saturday keeps the strip's height so the hours stay level) and never in a track, a timed event stays in its track, no all-day event means no strip, and the Calendar card says "all day", never "0:00" |
| `tests/unit/writeRefusals.test.ts` | REMAP (the hand test of 30 Sep): every write refused with `501` — a tap's write resolves, says "Couldn't · not connected yet" and leaves its store as it was (a Board drag into Done, accept, delegate, nudge, a habit, the Agents verbs, the card verbs; the settings saves answer `false`); an awaited one rejects with the 501 having put back what it changed (Dictate's line off the thread, the journal and dump drafts back); every fire-and-forget call of an awaited one carries its catch; every write route is driven or named with why nothing calls it |
| `tests/unit/n8nTasksWrite.test.ts` | Phase 6 · `tasks-write` (ADR-86): a title, a due day (local noon, per board zone), open/in progress/done and the completion are written in the writer's words and answered as the list maps a task, valid; the undo of a completion puts a waiting task back to Twenty's own status; a Board stage, a Gantt drag, a priority, waiting and a goal link are refused `422 { field, reason }` with nothing sent; a new task gets its own offlineId and a repeat is the first; 404/422/502 are the writer's; a refusal on the device reports nothing, a real write says online; the list is read again after a write |
| `tests/unit/n8nRecords.test.ts` | Phase 6 · `records` (ADR-87): the store's real replies read as sent (absent, present, stale, a bad key); every settings route answers the build's default until saved, then the record; a save sends the version it read and a record saved meanwhile is 409; the namespace prefixes every key; the mock's refusals (a rule, a pinned section, a parameter's range, a locked group, a goal's silo, a habit removed); goals dropped with a history line; a day's log as a date-first key and the week's stats and streaks from it; Today's glance and close-the-day and Life from the same records; a section's edit and revert; an email card's revised draft |
| `tests/unit/n8nFiles.test.ts` | Phase 6 · `files` (ADR-89): every page of Dropbox's /JSTACK listing, newest first, each a valid Attachment held in Dropbox (kind from the name, Josh's in an Inbox folder, a task's in the folder named for it); the app's own file filter on the device; /JSTACK not made yet is an empty list; one file by id, else 404 |
| `tests/native/notConnected.test.tsx` | N8N-2 (ADR-90), rendered: Runs and spend, Agent issues, the feed, the checks and Brain › Memory say "Not connected yet" and none of their claims ("Nothing failing", "100%", "The Librarian runs again", "test questions"); the rail's health line draws nothing without a summary; a connected empty section keeps its own words |
| `tests/unit/n8nBrain.test.ts` | ADR-91: a capture, a journal line and a Dictate line go by Josh with the offlineId and show as not yet filed, no routing made up; a capture with no words is refused; Latest in, the thread and the open replies as the store holds them, the EA's routing and labels on what it filed; read is a reply dismissed; Today's insight the newest open one with a block; Block it makes the event through calendar-edit then answers, Leave it answers, a refused block answers nothing |
| `tests/native/orbComingSoon.test.tsx` | ADR-92: with voice off once settings load, the floating mic says "Coming soon"; with voice on it is push-to-talk |
| `tests/unit/n8nActions.test.ts` | Phase 6 · `actions`: Needs you from the actions store's real replies — the open list valid, by rank, five at most after the focus; history answered-only, newest first, `?q=` on the title, each card's last history entry the store's answer; a card the contract cannot draw left out and named once, by id a 502; each verb sends only its fields, Approve reads the card first and an email card's approve is 501 with nothing answered; the reload after an answer asks again; a second answer, a late undo and nothing-to-undo are 409, a bad verb 422, an unknown card 404; an email card's approve answered, then drafted to its recipient (ADR-88), refused when it names no one, taken back when the draft fails; reopen 501; Today's Needs you is `GET /actions`'s answer through one call |
| `tests/unit/n8nLocked.test.ts` | ADR-83: on n8n, while the gate is shut every call waits and nothing reaches the proxy — webhook reads, local answers and keyless writes alike — while the unlocking routes and the emergency lock go through; on unlock each held call is answered and each workflow runs once; through the provider the session's own lock holds Today, `unlock()` releases it and a relock holds the next; the mock still answers under the gate |
| `tests/unit/n8nToday.test.ts` | Phase 5: `GET /today` from the live sources — a valid TodayComposite whose calendar is exactly `GET /calendar`'s today answer, whose tasks are the first three not done in Twenty's order, with no cards, lines or delta (even when asked), the glance and the close at nothing; a failed source fails the composite; one cold load of Today, the grid and the Tasks tab runs each workflow once, counted at the fetch |
| `tests/unit/n8nTasks.test.ts` | Phase 4: the Tasks routes from Twenty — the redacted replies are valid TaskList/Task/WaitingList/ColumnList answers, the cursor is followed and capped at ten pages with one warning, every status maps (a non-empty waitingOn on a task not done is waiting; status decides done-ness over bucket; an unknown status is open with a warning), owner is josh, the priority and area switches each off and on, due is the local day of dueAt, no completion time, the Board mirrors bucket, and the mock's focus, slicer, range, filter, search and order rules hold |
| `tests/unit/n8nReachability.test.ts` | ADR-78: on n8n a local answer and a `501` leave the session's `online` as it was and queue nothing, `GET /usage` is the Usage section's error, and a real webhook call reports offline on a network failure and online on any answer, a refusal included |
| `tests/unit/n8nConfig.test.ts` | ADR-76: `EXPO_PUBLIC_DATA_SOURCE` defaults to the mock, `n8n` turns `USE_API_ADAPTER` on, and on n8n the provider routes through the n8n transport — no fixtures, a keyless write refused with 501, a voice socket that closes |
| `tests/unit/useLayout.test.ts` | The three breakpoints, and that nothing else reads the window size |
| `tests/unit/voice.test.ts` | The voice state machine: silence ends nothing, an end phrase asks, a drop reconnects |
| `tests/unit/voice-ui.test.ts` | No voice session runs with neither the screen nor the banner visible |
| `tests/unit/buglogRows.test.ts` | Every `history/v22/BUGLOG_v22.md` row from B-49 on names the test that was red before the fix, and every test it names exists |
| `tests/unit/useDetail.test.ts` | The one detail fetch (P-3): the record on success, MISSING on failure, and a response that lands after the id moved on is dropped — the live flag six copies carried by hand |
| `tests/unit/richText.test.ts` | The query highlight a Brain detail draws over a capture's text (OP-01): every case-insensitive occurrence is a hit, a blank query lights nothing, and the runs rejoin to exactly the text — `highlightRuns` had no test while it lived as a private function inside the component (P-1, B-73) |
| `tests/unit/enumLabels.test.ts` | One home for wire-enum labels (P-5, LV-08, rule 21): every map in the enum-labels module covers its union — spelled out as literals, not derived from the map — and no component keeps a copy, a fallback or a raw member on screen |
| `tests/unit/chrome.test.ts` | The chrome written once (P-8): the health line, the floating banner shell, the overlay recipe with its close button and the privacy shield each live in one component, the callers keep their own testIDs and wrappers, and no surface repeats the recipe |
| `tests/unit/qaReport22.test.ts` | `QA_REPORT_v22.md` §1 has one row per V2.2 acceptance ID, four literal statuses, a citation that exists and quotes the ID, and no early completion statement |
| `tests/unit/wiring.test.ts` | `wiring.json` and `WIRING.md` regenerate exactly from the route table |
| `tests/unit/wiringOrphans.test.ts` | The zero-caller list, split into component-called, rig-only and genuinely uncalled, held against `evidence/wiring-orphans.json`; no uncalled route was added by V2.2 |
| `tests/unit/workflows.test.ts` | Every `run:` in a workflow names a script that exists |
| `tests/unit/writePaths.test.ts` | The two exempt classes closed as classes (A-4 round 6): every undo takes back exactly what its own write wrote — the answer's recorded effect, the press's own snapshot, inside its window — and every offline-queued capture is handled as queued by the store that sent it; the path-by-path enumeration is BUGLOG A-156 |
| `tests/unit/consolidation.test.ts` | The consolidated REMAP set (A-5, ADR-60): the four files exist; every section of the three contracts and every route of the table is in the consolidated contract; the decisions run 01 to 65 with the superseded ones naming their successor; every carried defect has a gap line saying whose it is; every versioned original carries its banner; the environment inventory names every variable the code reads; the phone runbook quotes only the app's own strings and names only passing IDs |
| `tests/native/queueStore.test.ts` | The Expo build's outbox queue keeps every write: two captures queued at once are both kept, and a remove and a put at once each do exactly their own write (A-4 round 7) |
| `tests/unit/zorder.test.ts` | One z-order table; no literal `zIndex` number is written anywhere else |
| `tests/unit/stores/agents.test.ts` | Agents' store: spend, caps, issues and the emergency lock's own state |
| `tests/unit/stores/brain.test.ts` | Brain's store: dump, chat, proposals and the memory hit rate |
| `tests/unit/stores/device.test.ts` | What this device remembers — theme mode and privacy blur — persists and hydrates back, and an unreadable value falls back to auto |
| `tests/unit/stores/life.test.ts` | Life's store: habits' optimistic toggle, people's verbs, the section configs |
| `tests/unit/stores/session.test.ts` | Session: lock, tokens, toasts, undo, online state and server events |
| `tests/unit/stores/settings.test.ts` | Settings: notification groups, quiet hours and the Needs you schedule they carry, autonomy, focuses, layout |
| `tests/unit/stores/tasks.test.ts` | The task LIST: load fills it and the waiting rows carry a task id |
| `tests/unit/stores/taskCard.test.ts` | The open card (P-2): `findTask`'s order — the card's copy, then the list, then the tick that raised the confirm (B-26) — completion with its undo from whichever copy the app holds, and a task created from a goal's card that the card can then open (LG-03) |
| `tests/unit/stores/today.test.ts` | Today: the composite, answering a card, and the undo ledger |
| `tests/unit/micAwake.test.ts` | While a microphone is open the browser holds one screen wake lock, taken at the press and given back on every way a session ends; car mode's hold outlives the microphone's (WPJ-1) |
| `tests/native/micAwake.test.ts` | On a phone the one owner holds `expo-keep-awake` under its own tag for each session, and every way a session ends deactivates it (WPJ-1); the device locking or the app switching away ends the session the way a pause does (WPJ-3) |
| `tests/native/micNative.test.ts` | Native dictation goes through the one microphone owner: start opens one recogniser, stop and a lock end it, a refused permission falls back to typing, and Talk on a phone sends words rather than audio (v2.3 B-4; the module is mocked, so hearing a sentence is the device check) |
| `tests/unit/reachability.test.ts` | Whether the server can be reached, told by the requests themselves (A-1, v2.3): over HTTP with no window event target, which is what React Native gives, a fetch that fails at the network layer takes the session offline and the next capture queues without trying the dead connection; any answer brings it back, a 503 as surely as a 200, while an error that is not the network's says nothing; and offline with a capture waiting, the 30-second retry probes GET /capabilities and replays on the same tick, but stays quiet with nothing queued |
| `tests/unit/lastSeen.test.ts` | What the device keeps for planning offline (A-3, v2.3): a load that fails offline shows the last Today composite, the Tasks list for the filter it was loaded under and Brain's recent items, each under "last updated … · offline", while a failure on a live connection shows no old copy; a record marked sensitive is kept like any other, and the copy is ciphertext at rest (WPI-1, v2.3.1); only the three planning tabs are kept; back-to-back loads write at most once each; and the emergency wipe removes every copy, including one a write already under way would have put back |
| `tests/native/encryptedStore.test.ts` | One key for the native encrypted store (A-6, v2.3): two writes at the first use of the store mint one key between them and both read back — two used to mint two, and the first value could not be opened again — and after a wipe the next write mints afresh rather than sealing with the key the wipe deleted |
| `tests/unit/needsYouSchedule.test.ts` | When Needs you is raised (WPS-1, v2.3.2): inside a window nothing waits; outside every window, and in quiet hours when the schedule respects them, the cards wait for the next window's start; a window can run past midnight; paused, no schedule, or a schedule that can never open holds nothing; the windows read and write as Settings shows them; the mock keeps the schedule in quiet hours' record and answers a schedule the contract does not allow with a 422; `openapi.yaml` carries the field; the keys answer no card while it waits |
| `tests/native/secureStore.test.ts` | A phone whose runtime cannot seal (WPI-2, v2.3.1), over a fresh launch of the app's modules: with no `crypto.getRandomValues` boot throws nothing and says unavailable, the native queue is held in memory and says so, no write through the encrypted store is tried, a Files load keeps what it fetched, a capture still goes live and an offline one is held; a `getRandomValues` that throws is caught by boot's round trip; with it present, ok and the persistent native queue |
| `tests/unit/orbPushToTalk.test.tsx` | The floating orb (WPR-1, WPR-2, v2.3.2): a hold opens a Brain session and the release files what it heard as voice, a tap or a silent hold files nothing; half-transparent at rest, opaque and lifted while held, a press target 12 px beyond the circle, and no band on the tab page |
| `tests/unit/keyboardZoom.test.tsx` | The keyboard shares the screen on the web (WPR-4, v2.3.2): every text input is the one `Field` renders, at 16 px or more; the visual viewport's band moves the tab bar and the orb above the keyboard, and both stand down over the expanded editor; Enter, or a blur once its grace has passed, scrolls the page back to the top |
| `tests/native/dictateOrb.test.tsx` | Dictate to EA's microphone (WPR-3, v2.3.2): the floating orb's control at Talk's size, centred in the sheet's foot below a field that keeps only its arrow; a hold starts the dictation, the words land in the field and the release stops it, nothing reaching the thread; every tab keeps the floating orb |
| Every request abandons itself — 15s ordinary, 60s an upload — rather than waiting forever; the timeout surfaces as the network failure the outbox already recognises | `tests/unit/transport.test.ts` (D-4) | a hung server hangs the caller forever instead of queueing or erroring |
| Every request's `credentials` is explicit — `"same-origin"` unless `EXPO_PUBLIC_API_CREDENTIALS=include` says otherwise | `tests/unit/transport.test.ts` (D-5) | the httpOnly refresh cookie rides where it should not, or nowhere it should |
| Pinning fails closed — a host in `SPKI_PINS` with no verifier registered refuses the connection rather than looking checked | `tests/unit/security.test.ts` (D-6, SEC-08) | a pinned host with no verifier connects anyway, unverified |
| `tests/unit/serveMock.test.ts` | `pnpm serve:mock` (D-1) and `pnpm connect:check` (D-2): spawns the real commands, waits for the base URL `serve-mock` prints, gets a valid `Capabilities` shape from `/capabilities`, sees `/__test__/*` refused by default and served with `--test`, checks `connect-check`'s OK/FAILED verdict line and its evidence write, then kills the whole process tree |
| `tests/unit/serveMockRig.test.ts` | The server `pnpm serve:mock` hosts — the same `handle()` `tests/unit/conformance.test.ts` drives, over real `node:http` this time; skips itself under plain `pnpm test` and only runs for real under `JSTACK_SERVE_MOCK_RIG=1`, set by `tools/serve-mock.mjs` |
| `tests/unit/webauthn.test.ts` | D-3 (ADR-67): the mock's passkey-ceremony session handler validates against the typed `WebauthnResult` through the same validator `tools/conformance.mjs` uses — the "options" step's real WebAuthn creation options, the "verify" step's confirmation — never the untyped `{ ok: true }` both steps used to answer alike |
| One date basis (ADR-47): instants read in the device's zone, and no file but `lib/time.ts` touches a `Date` getter | `tests/unit/date-basis.test.ts` · `tests/unit/time.test.ts` (TZ=America/New_York) · `e2e/core/timezone.spec.ts` | the grep test lists the file; the timezone spec diverges by a whole day |

---

## 5. How to add one of these

Each checklist names files. If a step's file does not exist, the recipe is wrong — fix the
recipe, not your memory of it.

**A detail dialog (`./components/detail/`).**
1. Write the component in `components/detail/<Thing>Detail.tsx`, taking `{ id, onClose }`. Fetch
   through `useDetail(id, (a, id) => a.getThing(id))` — it holds the record and MISSING, and drops
   a response that lands after the dialog closed. Render the `missing` line: a detail that
   renders nothing when the record has gone reads as a broken dialog. Nothing here imports
   `@/data/provider` — `tests/unit/boundaries.test.ts` refuses it.
2. Register it in `layout/detailDialogs`-style form in `layout/dialogs.tsx` with
   `props: (id) => ({ id }), requiresPayload: true`, `kind: "modal"` (resolution #52).
3. Add the kind to `REF_DIALOGS` in `layout/openRef.ts` if anything points at it as a
   `"<kind>:<id>"` ref (Find's results, a Reply's sources).
4. Add the name to `COVERED` in `tests/native/screens.test.tsx` and mount it there.
5. Add the row's own testIDs to `history/v2/CONTROLS_v2.md`, and the opener to `layout/lists.ts`.

**An endpoint.** Steps 5–8 were added at A-6 from the cold-start gate's report
(`evidence/cold-start-2026-09-12.md`): a stranger followed this recipe end to end and the four
guards below are the ones it did not name, each of which fails AFTER the recipe says you are done.
1. Add the row to `data/routes.ts` (name, method, path template, marker, handler, `body?`, `response`, group).
2. Add the method to `data/ApiAdapter.ts` — one line through `this.req()`, keeping the `// TODO(BACKEND: §4.n)` marker.
3. Add the handler to `data/mock/handlers/<group>.ts`, exported under the name the table gives.
4. Add the shape to `data/types.ts` and name it in `CONTRACT.md` §3, with the route itself in
   `CONTRACT.md` §4.n — see the next recipe, because the row will not compile until the shape
   exists. `CONTRACT.md` is the current contract; `history/v2/CONTRACT_v2.md`, `history/v21/CONTRACT_v21.md` and
   `history/v22/CONTRACT_v22.md` are history kept beside it and are never edited (ADR-60).
5. **Give it a caller.** `tests/unit/wiringOrphans.test.ts` (LV-02) fails if a route added after
   tag `v2.1` has no store action calling it — `wiring.json`'s `orphans` means "no STORE ACTION
   calls this". Wire it into the store that owns its family (the next recipe), or the board goes
   red with the route listed as uncalled.
6. **Name it in `tests/unit/contract.test.ts`'s `DECLARED_NOWHERE`, with a reason.** Any route
   absent from the §6 tables of `history/v2/CONTRACT_v2.md`, `history/v21/CONTRACT_v21.md` and `history/v22/CONTRACT_v22.md` — true
   by construction for a new one —
   trips CT-01 until it is listed there. The list is meant to evolve; an entry that stops being
   needed is itself a red test.
7. `pnpm codemap` — `wiring.json`, `WIRING.md`, `WIRING.html`, `openapi.yaml`, `PARAMETERS.md` and
   this file regenerate.
8. **Rebuild the packaged mock**: `node tools/build-mock.mjs` (after a prod export to a scratch
   dir, as the mock is built from one). It is deliberately NOT in `pnpm codemap` — it builds an
   export and takes about ninety seconds, which the pre-commit hook cannot afford — so QA-06
   (`tests/unit/pwa.test.ts`) goes red on a mock whose embedded source fingerprint is older than
   your edit.
9. The route and marker COUNTS are pinned as literals in `tests/unit/handover.test.ts` because
   they are what `AUDIT_v22.md` signed off. A route added after that sign-off bumps them, and
   moving those literals is a deliberate re-baseline that belongs to a numbered row — not a
   side effect of adding an endpoint.

**A wire shape, and the OpenAPI it generates.** The `body` and `response` columns are
`keyof Shapes`, so a route can only name a shape that exists — a typo is a `pnpm check` error,
not something `tools/gen-openapi.mjs` discovers later.
1. Declare the type in `data/types.ts`. A list response is a shape too: `export type RuleList = Rule[]`.
   A route that answers with no body at all names `NoContent`.
2. Add one line to the `Shapes` registry at the bottom of that file (`Name: Name;`) — `tests/unit/openapi.test.ts`
   fails if the registry and the file's exported types disagree.
3. Name it in the route row's `response` (and `body`, for a write).
4. `pnpm codemap`. `tools/type-walker.mjs` walks the declaration into JSON Schema and
   `tools/gen-openapi.mjs` writes the path item, with an example taken from the fixture the
   handler reads — an example is only used if it VALIDATES against the schema, so a fixture that
   has drifted from its type falls back to a synthesised one rather than publishing a wrong one.
5. `node tools/validate-openapi.mjs` if you want the check on its own; the board runs it.

The walker reads what §3 uses and nothing more: objects, optionals, arrays, tuples, unions of
literals, intersections, references, indexed access, and exactly three utilities — `Partial`,
`Omit` and `Record`. Anything else THROWS with the shape named. That is deliberate: a type it
could not read becoming `{}` would validate against anything and put a lie in the document a
backend developer builds from.

**A parameter** (L-1, ADR-41). Six exist; they are the numbers and booleans Josh can change
and the EA can ask to change. Everything below the first step is generated or table-driven, so
a parameter is genuinely one edit:
1. A row in `data/parameters.ts` — `key`, `label`, `help`, `unit`, `default`, `min`/`max` for a
   number, optional `choices` for the values worth one tap, `usedBy`, `changeable`. Add the key
   to `ParameterKey` in `data/types.ts`; `pnpm check` fails until the row exists (the table is
   `as const satisfies`, so the exhaustiveness check is real rather than self-comparing).
2. Read it with `currentParameter("your.key")` from `stores/parameters.ts` — never a constant,
   never a second default — and add that file to the row's `usedBy`.
   `tests/unit/parameters.test.ts` opens every file named there and fails if the key is absent.
   While nothing reads it yet, leave `usedBy` empty and name the row in `plannedFor`.
3. `pnpm codemap` regenerates `PARAMETERS.md`; `tests/unit/codemap.test.ts` fails if you forget.
   The Settings › Security control and the handler's range check are both derived from the row —
   there is nothing to add in `components/settings/Security.tsx` or
   `data/mock/handlers/parameters.ts`.

**A store action.** Add it to the `stores/<domain>.ts` interface and implementation; call
`getAdapter()`, never `fetch`. A component must never call the adapter directly.

**A dialog.** One entry in `layout/dialogs.tsx` — `{ name, kind, source, component }` — plus
the component. Position in the array is stacking order: anything openable from inside another
dialog goes after it. Nothing changes in `app/_layout.tsx`.

**A section brick.** Two different things share the word "section", and picking the wrong one
is the mistake this recipe exists to prevent. A **static** section is a component named by
`layout/registry.tsx` — build it when the thing needs real logic. A **configured** section is
a `SectionConfig` record rendered by `layout/SectionRenderer.tsx` — build it when the thing is
a list, some bars, chips or a paragraph, which is most of them.

*A new block type* (the rare case; there are eight and they cover the V2 tabs):
1. The component in `layout/blocks.tsx`, over `theme/ui` primitives only — no store import,
   no raw `fontSize`, no surface of its own (the GROUP owns that, see `SURFACE`), links
   through the `onLink` prop rather than a store call.
2. Its entry in `BLOCK_COMPONENTS` and `SURFACE` in `layout/catalogue.tsx`, and in
   `LITERAL_BLOCKS` if its content may be written inline rather than bound.
3. Its key list in `BLOCK_KEYS` in `layout/validateSectionConfig.ts`, its content key in
   `CONTENT_KEY`, and the per-item rules in `validateBlock`.
4. A case in `tests/native/sections.test.tsx` (the coverage guard at the foot of that describe
   fails until you add it) and a rejection case in `tests/unit/sections.test.ts`.

*A new data binding* (the common case): one entry in `BINDS` in `layout/sources.ts` — an
endpoint from `ENDPOINTS`, the block type it feeds, and a hook that reads the store owning
that endpoint. The selector returns a stored reference; the shape mapping happens in a
`useMemo` after it, never inside the selector (B-19). `GET /sections/catalogue` picks it up
with no other edit.

*A new configured section*: a record in `data/mock/fixtures/sections.json`, validated by
`tests/unit/sections.test.ts`'s first case. `testID`s are derived, never authored —
`{tab}-{id}-section`, `{id}-configure`, `{idPrefix}-{rowId}` — so choose `id` and `idPrefix`
to match whatever the specs already say.

*A section the EA proposes* (B-3): `POST /sections/propose` with a config and a reason —
both required, both validated, and the reason cannot be blank. It stores the config
`state: "proposed"` (invisible to `GET /sections`) and returns a decision card carrying it.
Approving is what makes the section; Never retires the id for good and the server refuses to
be asked again. Nothing on any tab changes in between. See ADR-40 before altering any of
that: each rule is there because the alternative is the EA editing your app.

**A voice behaviour.** `lib/voice.ts` is the barrel; `stores/voice.ts` owns the one session the
app may have and what the UI reads; `data/mock/voice.ts` is the scripted SERVER. Which file
changes tells you what kind of change it is: a new message type is a contract change (§4.11 and
`VoiceMessage` first), a new state or rule is the session plus a case in
`tests/unit/voice.test.ts` against the fake socket, a new control is `TalkScreen` plus
`e2e/core/talk.spec.ts`. Before changing anything about pauses, read ADR-24: silence never ends
a turn or a session, and every timer in these files exists to hold that rule rather than to
enforce a limit.

**Something under `./lib/voice/`.** S-1 split the 515-line original into four, and which one you
want follows from what kind of thing it is:

| It is… | It goes in | and it must |
|---|---|---|
| a wire type, or a pure predicate over what was said | `lib/voice/protocol.ts` | stay free of sockets, timers and state, so the mock and the store can both import it without a cycle |
| a handle that has to be armed and cleared | `lib/voice/timers.ts` | be `unref`'d (B-17), and join `clearActive()` if an end, an error and a drop all have to clear it |
| a state transition, or a reply to a server message | `lib/voice/session.ts` | keep the file under 250 lines — it is the one that grows |
| a call into a browser API | `lib/voice/audio.ts` | be injectable, so the session stays testable without a browser |

Re-export it from `lib/voice.ts` if anything outside the family needs it: every importer names
the barrel, which is what let the split happen without touching a single test.

**A setting.** `stores/settings.ts` + the surface under `components/settings/`, and the
matching handler in `data/mock/handlers/settings.ts`.

**A fixture.** `data/mock/fixtures/*.json`, using the date tokens (`{{TODAY+n}}`,
`{{NOW+n;HH:MM}}`, `{{DATE+n}}`, `{{DATESHORT+n}}`) — never a literal date, or the fixture
tells two different stories on two different days.

**A capability flag.** `data/capabilities.ts` + the mock's capabilities block; the rig flips it
with `__JSTACK__.setCapability`.

**A conformance check against a real server.** `node tools/conformance.mjs <BASE_URL>` sweeps
every `GET` in the table and validates each response against `openapi.yaml`, then performs the
safe writes. `--write <dir>` leaves `conformance-<date>.json` behind as evidence. Only SAFE
writes belong in it (SEC-15: nothing that sends, pays, books or revokes; nothing a person
would see), identifiers come from what the server itself named rather than being invented, and
anything it cannot check reports itself skipped with the reason.

**A webhook on the n8n build (REMAP, ADR-76).** One webhook at a time, and never a workflow that
sends, pays, books, revokes or returns file bytes.
1. The key goes in three places that must agree: `WEBHOOK_KEYS` in `data/n8n/registry.ts`, `ALLOW`
   in `remap/dev-proxy.mjs`, and the nginx config. `tests/unit/n8nAllowList.test.ts` holds the
   first two to one set.
2. Call it through the proxy and save a redacted sample, plus an empty one, in
   `tests/fixtures/n8n/` — `remap/redact-samples.mjs` redacts them and refuses to write on a leak.
3. Write the adapter in `data/n8n/adapters/` (`data/n8n/adapters/calendar.ts` is the first):
   `body()` builds the request exactly as the route's mock handler reads its query, and `toContract()` guards the raw reply and maps it into
   the `data/types.ts` shape — dates through `lib/time.ts`, enums mapped member by member.
4. Test the adapter against both samples, validating its output against `openapi.yaml`
   (`tests/unit/n8nContract.ts` loads the schemas and the samples).
5. Give the route's row in `data/n8n/registry.ts` its adapter (a read) or add it to `WRITES` (a
   write); `tests/unit/n8nRoutes.test.ts` then sweeps it with the rest.

**A UI primitive.** The family file under `theme/ui/`, then export it from `theme/ui.tsx`.

**Where a new file goes.** The recipes above name the files they touch; this is the map from a
directory to what belongs in it, so a file lands in the right place before anyone has to move
it. Each of these is a family `tools/gen-codemap.mjs` checks section 5 for by name.

| directory | what belongs here |
|---|---|
| `./app/` | Expo Router route files only. The root layout mounts the providers, the gate, the dialog host and the toast host — nothing else. Under 100 lines, by guard |
| `./app/(tabs)/` | One file per tab, and each is `<TabScreen tab="..." />` plus header props. Under 60 lines, by guard: a tab with logic in it means a section is missing |
| `./components/chrome/` | Everything that is not a tab's content: header, rail, tab bar, dialogs' hosts and shells, the toast, the watermark, the gate, the orb |
| `./components/today/` | Today's sections and its decision card. `components/today/DecisionBodies.tsx` holds the four card bodies |
| `./components/tasks/` | Tasks' views (list, board, gantt, done), the task detail and the delegation surfaces |
| `./components/brain/` | The dump entry, chat, memory, rules and the Talk screen |
| `./components/life/` | Only the sections that are still COMPONENTS (Goals, Habits) plus the dialogs. The other four are config records — see the section-brick recipe |
| `./components/agents/` | Stats, spend, issues, checks, history, portals and the emergency lock |
| `./components/settings/` | One file per settings card, each reading and writing through `stores/settings.ts` |
| `./layout/` | The registry, the tab screen, the dialog registry, and §4.10's renderer, blocks, catalogue and data sources |
| `./stores/` | One zustand store per domain, under 200 lines by guard. A store calls the adapter; a component never does |
| `./lib/` | Framework-free helpers with one job each: time, auth tokens, the outbox queue, push, voice, the lock gate, the test hook |
| `./data/` | The route table, the shapes, the adapter, the provider and the capabilities fallback — the contract's app-side half |
| `./data/transport/` | The transport interface and its implementations — http, mock and n8n (ADR-76) — and the outbox and reachability layers that wrap them |
| `./data/n8n/` | REMAP's n8n build (ADR-76): the route registry, the one webhook client, the configuration defaults, the contract's empty values, and the owner's silo and focus rule |
| `./data/n8n/adapters/` | One adapter per webhook: the request its route's mock handler would read, and the guard and map from the raw reply to the contract's shape |
| `./data/mock/` | The in-process SERVER: the db, its fixtures, the router and the shared handler helpers |
| `./data/mock/handlers/` | One file per contract section, exported under the names `data/routes.ts` gives |
| `./theme/` | Generated tokens, the provider, the layout hook and the reduced-motion hook |
| `./theme/ui/` | The primitives, by family, behind the `theme/ui.tsx` barrel. Add a primitive to its family file, then export it from the barrel |
| `./eslint-rules/` | One rule per file, each with a planted-fixture test and a `// guards:` line naming the invariant |
| `./tools/` | Dependency-free Node. Generators, checkers and the evidence tools. No new dependency, ever |

---

## 6. Gotchas that cost time

Each is a real defect this build hit, with the guard that now catches it. The companion list
in section 11 names every bug row not yet distilled here.

- **`position: "absolute"` only spans the nearest positioned ancestor.** A dialog rendered
  inside a scrolled `ScrollView` covers that content's box, not the viewport. Every overlay
  mounts at the root through `DialogHost`. (B-14)
- **DOM order is stacking order.** There is no z-index on the overlays. A dialog openable from
  inside another must come after it in `layout/dialogs.tsx`. (B-15)
- **react-native-web puts its own font stack on a class**, which beats an `html, body` rule.
  Every text primitive names its own `fontFamily`, or the app renders in the OS UI font. (B-08)
- **Two date bases is one too many.** Local getters and UTC getters disagree for ten hours a
  day. Everything goes through `lib/time.ts`. (B-09, R15-01)
- **"Everything" includes the FIXTURES.** `fixtureAnchor()` used UTC today while `db.now()` is
  Brisbane-shifted, so for the last ten hours of every UTC day the fixtures were seeded for
  yesterday and Today rendered empty — no calendar rows, an 0/9 habit glance. Found only
  because the full e2e board happened to run at 14:12 UTC. A test that computes a date has a
  second clock in it; read the server's. (B-22, v2.1)
- **A store initialiser runs at module load**, before any test clock offset can be installed.
  Anything date-derived resolves at read time. (B-09, CD-09)
- **A guard must be seen to fail.** Several in this build reported green over exactly the thing
  they were written to catch; `history/v2/CHANGES_v2.md` lists fifteen. Plant the defect, watch it go red,
  revert. (B-09, B-12)
- **A scan is only as wide as its directory list.** `unused-exports` omitted `e2e/` — a
  blind spot in the tool whose job is blind spots. (B-12)
- **Collapsing a control under a pointer eats the tap.** Blur-driven layout changes need a
  grace period or the click never lands. (B-06)
- **Expo Router only reads `app/+html.tsx` for `output: "static"`.** With `output: "single"` it
  is never opened, and a file that looks like configuration but is never read is worse than no
  file. (B-08)
- **A generator is not reproducible until its directory listings are sorted.** `readdir` is
  alphabetical on NTFS and hash order on ext4, so a map that regenerated identically on the
  laptop drifted on the runner. Sort every listing and every derived list with a byte
  comparator, emit POSIX separators, and read no clock but the stamped commit's own date.
  (B-14, v2.1)
- **A check that compares a generated stamp to the commit carrying it is off by one.** The
  pre-commit hook stamps the PARENT — the commit being built has no sha yet — so any freshness
  test that treats the stamp as "when the map was written" reads stale the moment it lands, on
  every platform. Compare commits, and anchor on the map's own commit. (B-14, v2.1)
- **A gate that only ever runs before the commit is not a gate.** CM-01 and CM-02 passed at the
  keyboard and failed in the board because the local run happened between the hook and the
  commit. Run the board on the pushed commit and believe it over the laptop. (B-14, v2.1)
- **A test that reads a value from the same function that wrote it cannot find a contract
  defect.** Sixty-odd handler tests passed over three shapes that disagreed with
  `data/types.ts`; what found them was validating a response against a schema derived from a
  different file. `tools/conformance.mjs` is that check. (B-16, v2.1)
- **An absent optional is absent, not null.** `checkId?: string` with `"checkId": null` in the
  fixture type-errors any client generated from `openapi.yaml`, and no test in the app noticed
  because the handler reads it for truthiness. (B-16, v2.1)
- **`execFileSync` deadlocks a server living in the same process.** A Jest test that spawns a
  tool synchronously blocks the event loop that has to answer it; every request times out and
  the suite dies with no clue where. Spawn asynchronously, and give the client a timeout so a
  silent server is a named failure. (B-16, v2.1)
- **A unit test must never make an outbound network call.** Not for speed: `fetch` has no
  default timeout and Jest's per-test timeout does not fire on a pending socket, so the failure
  mode is a ten-minute HANG in CI that looks exactly like work in progress. Stub `fetch`, or
  bind `127.0.0.1`. (B-17, v2.1)
- **`process.exit()` after printing a report truncates the report.** When stdout is a pipe —
  `execFile`, CI — a write past the buffer finishes asynchronously, and exiting tears the
  process down mid-flush. On Windows it surfaces as exit 3221226505 with the output looking
  correct, so the tool appears to crash after doing its job. Set `process.exitCode` and let
  Node drain. Read what a process PRINTED before believing what it RETURNED. (B-27, v2.1)
- **A surface belongs to a GROUP, not to a block.** When each block component drew its own
  `Card`, a `text` block could not be inside the `bars` block's card — so Money's due line
  moved onto the ground in the refactor that was promised to change nothing, and every
  automated sweep passed because the line still rendered, still read correctly and still had
  the right colour. It was in the wrong box. (B-34, v2.1)
- **A promise that models an EVENT is not a query.** `navigator.serviceWorker.ready` means
  "wake me when a worker is active", not "is one registered" — with nothing registered it
  never settles. Awaiting it to answer a question hangs: a device revoke waited on it and
  silently did nothing, in test builds always and in production on a first load. Ask
  `getRegistration()`. (B-30, v2.1)
- **The declared body and the sent body are two different claims.** `data/routes.ts` said
  `PUT /focuses` takes an array; the adapter has always sent `{ focuses }`. Nothing compared
  them until H-1 made the mock validate requests against `openapi.yaml`. Two rows have now
  found this (B-24, B-29) — when you add a route, send one real request through it. (B-29, v2.1)
- **A gate that has never gone red has not been proven.** `tools/audit-check.mjs` parsed
  pnpm's pretty-printed JSON line by line, found nothing, ever, and printed
  "audit clean: 0 advisory(ies)" over three real advisories on every board since it was
  built. Twice in one stage the number in a tool's own output was the evidence its check was
  broken (B-27's exit code, B-37's zero) — read what a tool PRINTS, not whether it passed.
  (B-37, v2.1)
- **A test written against a constant moves with the constant.** "thirteen blocks" built
  `LIMITS.blocks + 1`, so raising the cap to 13 left it green — hard rule 11's own failure
  mode, in a test written by the same build that wrote the rule. Assert the literal.
  (B-38, v2.1)
- **Evidence has bugs too.** `tools/capture-v2.mjs` grew the viewport to the page height and shot
  `fullPage`, which stretched every dialog to 2300px and let the page ghost through it — so a
  reviewer read "a modal with no container" off a correct app and ranked it the defect that
  must not ship. Check whether you are looking at a defect in the APP or in the FRAME before
  you fix it. (B-35, v2.1)
- **A spec that counts by testID prefix is counting a NAMESPACE.** `[data-testid^="learning-"]`
  matches a section's rows and anything else that lands in that prefix — a footer, a badge, a
  future control. Derived testIDs (`layout/SectionRenderer.tsx`) make it easy to add one by
  accident, so a section's chrome must not share a prefix with its rows. (B-28, v2.1)

- **A gate that stops a pointer has not locked anything.** The lock screen was a painted
  overlay: Tab walked focus behind it and Enter wrote a task through the adapter, and the test
  titled "nothing behind it is reachable" measured the gate's bounding box. Everything behind
  the gate is `inert` (`lib/webInert.ts`), the adapter refuses every write while locked
  (`lib/lockGate.ts`), and LK-01 asserts the COMPLEMENT — no focusable element anywhere
  outside the gate — because a walk only finds what it happens to reach, and the one control
  that writes from behind the gate (the undo toast) did not exist in a cold app. (B7-01, B8-01)
- **A report is a claim about a tree, and trees move.** `history/v2/QA_REPORT_v2.md` went on PASSing
  rows over evidence that no longer existed, quoted round counts three commits stale, and
  carried a resume point nobody could follow. Every evidence path a report cites must exist
  (`tests/unit/qa-citations.test.ts`), every count it quotes is read from the artifact it
  describes (`tests/unit/handover.test.ts`, including the pass/fail/skip breakdown beside a
  total, not just the total), and a frame count is never written down at all. (B7-02, B7-03,
  B8-02, B8-03, B9-03, B9-04, B10-01)
- **A rule enforced by looking is enforced only where somebody looked.** A saturated alert
  fill stood for a whole stage in the one dialog no capture pass had photographed, after the
  row that "fixed" that class found two of three. Every state a reviewer has to judge is a
  declared frame in `tools/capture-v2.mjs`, and the fill rule is a source-level guard
  (`tests/unit/saturated-fill.test.ts`) that reads the VALUE a style resolves to — a ternary, a
  spread, a destructured token — not the line, because a guard that reads lines missed all of
  those and went red on the legal outlined form. (B9-01, B10-02)
- **The mock is built from the production dist, and refuses the other.** `tools/build-mock.mjs`
  defaulted to `~/.jstack-dist` — the TEST build — with its own header saying to build it that
  way, and every committed mock had been correct by luck. It reads `~/.jstack-dist-prod` and
  throws on a bundle carrying `__JSTACK__`. The mock's own dead unlock path went with it. (B7-05,
  B7-06, B7-08)
- **A control's label is a promise its handler has to keep — and so is its row in the controls
  document.** One `history/v2/CONTROLS_v2.md` entry still described a behaviour that had been a defect
  when it was true. `tests/unit/controls.test.ts` (QA-01) reads the handler behind every
  control in that document, in both directions, so neither the label nor the row can drift
  from the code. (B9-02, B-71)
- **`` inside a quoted string is a backspace, not a word boundary.** Two security greps
  passed unconditionally on a 0x08 byte, and four more sat in the paragraphs describing the
  first two. Write patterns as regex literals; `tests/unit/security.test.ts` scans the delivery
  documents for the byte. (B-79, B10-03)

- **The queue is a write too.** The lock gate refused every ADAPTER write, and the outbox
  replayed UNDER the adapter on every reconnect and focus — so a locked phone that found a
  connection sent its queue around the gate, and because the server answers 401 while locked
  and the old replay deleted an entry on any non-409 4xx, an auto-lock on the train followed
  by a tunnel exit purged every capture with no record. `stores/sync.ts` holds the queue while
  locked and replays on unlock; `replay()` keeps an entry on 401/403/5xx and LISTS a refusal
  with the reason. When you add a second path to the server, ask which gate it goes under.
  (R-05, v2.1 A-0)

- **A state that lasts zero milliseconds is not a state.** `speaking` was set and unset in the
  same tick, so "the mic is deaf while the EA speaks" was true of the state machine and false
  of the microphone, and the test that asserted the state SEQUENCE could not tell. A state
  that exists to cover an asynchronous effect must last until the effect reports done — under a
  cap, because a browser synthesiser may never report — and a retry loop needs a ladder and a
  ceiling, because a dead server is not a reason to open sockets all night. (R-06, v2.1 A-0)

- **A policy written twice is two policies.** The `<meta>` CSP was composed from its own
  string in `tools/build-web.mjs` while `public/_headers` held the served one, and they
  drifted — no `worker-src` in the meta, `form-action` different — with a test that compared
  the headers to `vercel.json` and never to the meta. `tools/csp.mjs` derives the meta from the
  headers file, less the directives a meta cannot carry. (R-13, v2.1 A-0)

### The rest of the bug rows, considered

The gotchas above are the rows that changed a RULE — a convention, a guard, or how something
must be done from then on. `tools/gen-codemap.mjs` lists every bug row this section does not
name, so that a fix nobody distilled cannot quietly stay undistilled. Here is the rest of the
list, and why each group is not above.

**Fixed and specific, no rule to draw** — a wrong lookup, a missed call, a value that was not
cloned, a state that was not reset. Real defects, fixed at the root, with the reasoning in the
bug log; nothing about them generalises past the file they were in.
`B-01`, `B-03`, `B-04`, `B-07`, `B-10`, `B-13`, `B-18`, `B-19`, `B-20`, `B-21`, `B-23`,
`B-25`, `B-26`, `B-31`, `B-32`, `B-33`, `B-39`, `B-40`, `B-51`, `B-52`, `B-53`, `B-54`,
`B-55`, `B-56`, `B-57`, `B-58`, `B-59`, `B-60`, `B-61`, `B-62`, `B-63`, `B-64`, `B-65`.

**The V2 design pass** — the ux-reviewer's rounds on the V2 captures, where the fix was a
token, a component or a layout rule and the "lesson" is the design pack itself, which is
already the source of truth this map points at.
`B-41`, `B-42`, `B-43`, `B-44`, `B-45`, `B-46`, `B-47`, `B-48`, `B-49`, `B-50`, `B-66`,
`B-67`, `B-68`, `B-69`, `B-70`, `B-71`, `B-72`, `B-73`, `B-74`, `B-75`, `B-76`, `B-77`,
`B-78`, `B-79`, `B-80`, `B-81`, `B-82`, `B-83`, `B-84`, `B-85`, `B-86`, `B-87`, `B-88`,
`B-89`, `B-90`, `B-91`, `B-92`, `B-93`, `B-94`, `B-95`, `B-96`, `B-97`, `B-98`, `B-99`,
`B-100`, `B-101`, `B-102`.

**Rules that live somewhere better than a gotcha list** — each of these DID change a rule, and
the rule is written where it is enforced rather than repeated here: an eslint rule's own
header, a size limit in `tests/unit/sizes.test.ts`, an ADR.
`B-02` (ARIA through `accessibilityState` — see `theme/ui/`'s primitives), `B-05` (the
`no-raw-text` skip list — see `eslint.config.js`), `B-11` (page padding — `theme/tokens.ts`),
`B-36` (reduced motion — `theme/useReducedMotion.ts`).

---
- **Never amend a commit on this tree.** The pre-commit hook stamps the maps with HEAD, which for
  an amend is the commit being REPLACED, so the committed map names a sha only your object store
  has and CM-02 goes red on the runner. Redo a row with `git reset --soft HEAD~1`. (B-74, Stage 5d)
- **A close-out chain gates the commit on every run's exit code.** A `;` between the full Jest and
  `git commit` let a red CM-04 reach a row commit and origin. `&&`, never `;`. (B-98)
- **Section 4's guards column is read as GUARDS.** A backticked source path in a guards-table
  description is "a guard that is not a test" to CM-04; name a module in words there. (B-98)
- **A testID's row in `history/v22/CONTROLS_v22.md` follows the id to its file.** Moving `Label` (and its
  disclosure) to `theme/ui/label.tsx` moved the row, and `tests/unit/controls-v22.test.ts` held the commit
  for it. (B-101)
- **The saturated-fill allow-list quotes ONE line per file, and an entry that matches nothing is
  red.** When a signal-coloured dot moves files its entry moves with it, and the ternary stays
  inline in `backgroundColor:` — a `const color = … c.alert …` is an alias the sweep forbids. (B-105)
- **A write sets its slice from its own response, and re-reads only the aggregates it changes.**
  Seven GETs after a settings toggle were invisible on the mock and seven round trips on HTTP; the
  first cut re-read the summary alone and `e2e/core/agents.spec.ts` AG-06 caught the stale checks — an
  issue's `run` runs its linked check and the feed records it. (B-109)
- **One predicate for a filter the server and an offline cache both apply.** The cache had lost
  `range`, so an offline archive ignored one chip. `data/files.ts` `matchesFileFilter`. (B-113)
- **DS-01b reads a spread as a member access.** `...base` matches the token guard's `\.base\b`, so
  a parameter named `base` makes the allow-listed `motion.base` look consumed. (P-11)
- **QA-06 fingerprints `data/` too.** A one-word rename in a mock file after the mock was built is
  a red full run; rebuild the mock after the LAST source edit, whatever it was. (P-11)
- **A finding's count is a hint, not a fact.** Six tab declarations were seven, seven ternaries were
  eight, twelve pack sites were thirteen — grep before writing a count into a guard or an edit
  script's `count:`. (B-86, B-90, B-92)
- **B-130 · a toast has no clock of its own.** `useSessionStore.getState().showToast(msg)` only sets state; `components/chrome/Toast.tsx`'s `ToastHost` hides whatever it shows after `TOAST_MS` unless it carries an undo countdown. Raise from anywhere; never add a timer at the call site. Guard: `tests/native/screens.test.tsx` (the B-130 case).

## 7. The decision index

<!-- generated:start section=7 sha=7b1099c date=2026-09-30 -->

`DECISIONS.md` — ADR-01..75, each with its status; the versioned decision files hold the full reasoning.

- **ADR-01 · Section registry and one `Columns` layout** — Every tab is an ordered list of section ids in `layout/registry.tsx`; a section's column is fixed by the registry; Arrange reorders within it; three breakpoints (768, 1180) (stands; extended by ADR-20 (configured sections))
- **ADR-02 · One data path: `ApiAdapter` over a transport, mock as an in-process server** — One `DataProvider` implementation; `Transport` is mock or http; the mock server holds the contract semantics; stores reload after every mutation (stands; its "no OpenAPI" rejection superseded by ADR-19)
- **ADR-03 · Tokens generated from the pack, not copied** — `tools/gen-tokens.mjs` reads `design/tokens/*.css` into `theme/tokens.ts`; lint refuses colour literals outside `theme/` (stands)
- **ADR-04 · Seven stores by domain, undo ledger and notification groups first-class** — session, today, tasks, brain, life, agents, settings; the ledger holds the ten-second undo (stands; ADR-36 and ADR-37 add `lib/serverEvents.ts` and `stores/sync.ts` beside them)
- **ADR-05 · Tests that pay rent** — Acceptance IDs define done; eight Playwright projects; core specs on two, matrix on all; Jest at the seams; screenshot regression retired for a reviewed device pass (stands)
- **ADR-06 · Delete, do not hide** — News, the Security tab, Direct lines, the Habits tab, Test mode, the bug reporter, Gantt drag and the backend starter deleted; capability-gated surfaces built (stands; Gantt drag returned in ADR-46)
- **ADR-07 · Responsive in one hook** — `theme/useLayout.ts` is the only reader of the window size (stands)
- **ADR-08 · Handover artefacts** — The V2 reading order and evidence set (**superseded by ADR-60** (the consolidated set: `HANDOVER.md`, `CONTRACT.md`, this file, `KNOWN_GAPS.md`))
- **ADR-09 · Icons generated from Material Symbols Rounded as SVG paths** — `tools/gen-icons.mjs`; no icon font, no Google Fonts origin (stands)
- **ADR-10 · Fonts through Expo Google Fonts packages** — Instrument Sans and Source Serif 4, self-hosted (amended by V2.1 row S-4: fonts are static web assets in `public/fonts/`)
- **ADR-11 · Design pack vendored, discrepancies logged** — `jstack-app/design/` with `DISCREPANCIES.md` (stands)
- **ADR-12 · Gantt is read-only in V2; drag goes to Twenty** — Bars from `GET /tasks/gantt`; tap opens the task (**superseded by ADR-46**: drag and resize returned, and `GET /tasks?view=gantt` replaced the route)
- **ADR-13 · Decision cards: one record shape, five verbs, server-held undo** — `POST /actions/{id} { verb }`; undo within ten seconds, `409` after; Telegram answers the same record (stands)
- **ADR-14 · Voice: browser speech now, streaming later, one honest capability line** — Talk shows the honest line without `liveVoice` (**superseded by ADR-24** (a real two-way client behind `liveVoice`) and ADR-49 (one microphone owner, `lib/mic.ts`))
- **ADR-15 · Lock, recovery and sessions kept from v1.2, extended** — Passkey gate, auto-lock, emergency lock, recovery, high-risk assertions (stands; amended by ADR-41 (touch devices lock on hide, desktop after a parameter))
- **ADR-16 · Arrange, focus filters, settings and layout live on the server as config records** — `GET/PUT /layout/{tab}` with history; `/focuses`; `/settings/*`; theme and blur per device (stands)
- **ADR-17 · Stage split and unattended rules** — V2's stages and instance rules (historical; **superseded by ADR-34, then ADR-61**)
- **ADR-18 · Rebuild the UI layer; keep the seams** — V2's row 1 removed v1.2's UI; `lib/`, `data/`, the tools and the rig survived (historical)
- **ADR-19 · Wiring map, OpenAPI and a conformance runner, all generated** — `tools/gen-wiring.mjs`, `tools/gen-openapi.mjs`, `tools/conformance.mjs`, each with a drift test (stands)
- **ADR-20 · Section catalogue: config bricks the EA composes** — Eight block types; `SectionConfig`; `POST /sections/propose` becomes a decision card (stands; refined by ADR-39 and ADR-40)
- **ADR-21 · Offline capture: an outbox in the transport, replay on reconnect, decisions online-only** — Capture routes carry `offlineId`; `202 { queued }`; a `409` is listed under Settings › Sync (stands; the allow-list is `offline: true` in `data/routes.ts`)
- **ADR-22 · Host-agnostic deploy, CI publishes the build, PWA ships tested on localhost** — Vercel and Cloudflare configs; release workflow on `v*` tags; manifest and service worker (stands)
- **ADR-23 · Security hardening and identity before sharing** — CSP and headers, CI security jobs, dependabot, `GET /session` identity, the demo watermark, refresh rotation with reuse detection (stands)
- **ADR-24 · Voice protocol defined; a real two-way client behind `liveVoice`** — `WS /voice` messages; silence never ends a turn or session; hold/resume; end phrases; presence; `TalkScreen` full screen (stands; amended by ADR-50 (Close and End, replies read aloud, brief replies))
- **ADR-25 · Push subscriptions end to end on the client** — Web Push with the VAPID key from `/capabilities`; the service worker opens the tab and card in the payload (stands)
- **ADR-26 · Second user and silo readiness** — Every mock read filters by the session's silos; `asUser("joce")` in the rig; identity is the backend's (stands)
- **ADR-27 · Repo readiness** — PR template, CODEOWNERS, dependabot, CONTRIBUTING; branch protection as the last row (amended: branch protection not needed (Josh, 7 Sep); the pre-push hook is the gate)
- **ADR-28 · Phone performance: measure, then a first speed pass with a budget test** — `evidence/perf-baseline.json`; lazy tabs and the blur override refused on evidence (stands; the recorded-number gate became a same-run A/B against a reference build (V2.2 row C-1))
- **ADR-29 · Time zone and locale, stated and enforced** — ISO 8601 with offset; server strings in Brisbane; `lib/time.ts` at a fixed +10:00 (**superseded by ADR-47**: the device's zone, instants only on the wire)
- **ADR-30 · Telegram mirror in the mock** — `POST /__mirror__/telegram` answers a card `via: "telegram"` and emits a server event (stands)
- **ADR-31 · A second fixture day** — `reset("day2")` (stands)
- **ADR-32 · `history/v2/JOSH_QA.md` intake** — Every line becomes a row with its own check (stands)
- **ADR-33 · Simplification** — `theme/ui/` split; one `data/routes.ts`; rows S-1..S-7 (**superseded by ADR-59** (two simplification passes in V2.2); the one route table stands)
- **ADR-34 · Stages and models for V2.1** — Sonnet stages 3a–3c, an Opus audit (historical; **superseded by ADR-61**)
- **ADR-35 · `CODEMAP.md`: a living map, generated where it can be, guarded where hand-written** — Ten sections; four liveness layers; the pre-commit hook (stands)
- **ADR-36 · The server-event subscription lives in `lib/serverEvents.ts`, not the session store** — The store was at its cap; wiring is not state (stands)
- **ADR-37 · The outbox gets its own store, `stores/sync.ts`** — Queue, conflicts, last sync, replay; `online` stays on the session store (stands; ADR-57 derives the sync dot from it)
- **ADR-38 · The PWA head, manifest and icons are emitted by `tools/build-web.mjs`, not `app/+html.tsx`** — `+html.tsx` is unread under `output: "single"` (stands)
- **ADR-39 · A section config picks its data from a published list; it never describes it** — A block names a bind from `layout/sources.ts`; the validator is a whitelist that refuses unknown keys (stands)
- **ADR-40 · A proposal is not a section, and approving is what creates one** — `state: "proposed"` is invisible; Revise keeps the card open; Never is permanent, server-enforced; undo restores both halves (stands)
- **ADR-41 · The inactivity lock is a tunable parameter, ten minutes, and the EA can propose a change** — Touch devices lock when hidden; every device locks after `lock.afterMinutes` (a `Parameter`, 1–60); the EA changes it only through a decision card (stands)
- **ADR-42 · The task card completes** — Dates, priority and owner edited in place; whole-task delegation; a subtask menu; one completion rule with an undo; timestamps on every change (stands)
- **ADR-43 · Usage accounting on tasks and subtasks** — `Usage` rows per run priced server-side into `costAud`; shown on the card and in Agents › Usage with a CSV copy (stands)
- **ADR-44 · One filter model for List, Board, Gantt and Done** — A date range, owners you can tell apart, visible active chips, an editable slicer row, one Clear, shared across the four views (stands)
- **ADR-45 · The board mirrors Twenty's columns** — `GET /tasks/columns`; cards move by drag or by "Move to…"; agent cards look like agent cards (stands)
- **ADR-46 · The Gantt gets a real axis, the shared filters, and drag to move and resize** — Day ticks, week bands, the today line at its true place; drag and resize write `PATCH /tasks/{id}` (stands; supersedes ADR-12)
- **ADR-47 · Time on screen: one human format, in the device's time zone, never raw** — `lib/time.ts` formats every time in the device zone; nothing else touches a `Date` getter (a grep guard); the server sends instants only (stands; supersedes ADR-29)
- **ADR-48 · Files and deliverables: an archive that searches** — `Attachment` records; the task card's Files; an archive with search (amended by ADR-64: Dropbox is the store of record and the section is "Files")
- **ADR-49 · The microphone has one owner, visible states, an auto-stop, and a release on every exit** — `lib/mic.ts` is the only code that opens a microphone; `off → requesting → listening → transcribing → done \| error`; at most one session app-wide (stands)
- **ADR-50 · Talk with EA and Dictate to EA: always an exit, both sides in text, replies read aloud** — Talk has Close and End; "Chat" became "Dictate to EA" with the mic (stands)
- **ADR-51 · Where an answer comes back** — Replies in Brain, the newest on Today, a push group "Replies from your EA" when the app is closed (stands)
- **ADR-52 · Everything listed opens** — Every row that represents a record opens a detail dialog through `layout/dialogs.tsx`; a guard walks every list (stands)
- **ADR-53 · Global search** — `GET /search` across twelve kinds, scoped by silo and clearance server-side; a Find surface on every width (stands)
- **ADR-54 · Life: goals edited and remembered, habits with real history, learning that opens** — Goals as a set with archive and history; habits archive, never delete; week, month, year and all-time views (stands)
- **ADR-55 · Agents: caps with units, history and issues that open and search, usage in view** — Caps in whole AUD per month; history and issue rows open their details (stands)
- **ADR-56 · Settings: readable channel names, autonomy as rules Josh and the EA edit, voice options** — "Rules for my EA" (`AutonomyRule`) in Settings › Autonomy; the EA proposes through a card; Brain has no Rules section (stands)
- **ADR-57 · A sync dot at the rail's bottom and in the phone header** — `ok · pending · attention`, derived by a pure selector (`lib/syncStatus.ts`) from the sync store (stands)
- **ADR-58 · Text entry on phones and PC** — No focus zoom (`maximum-scale=1`); the editor above the keyboard; a focus ring that leaves the caret alone (stands)
- **ADR-59 · Simplification twice** — The planner's review of V2.1 before the build (S rows); a Fable review after the features and before the audit (Stage 5d, `history/v22/SIMPLIFICATION_v22.md`) (historical (both passes ran); supersedes ADR-33)
- **ADR-60 · REMAP-ready: the handover pack, a cold-start gate, and no surprises** — This consolidated set, the versioned originals bannered, and a fresh instance that runs the app from `HANDOVER.md` alone (stands; supersedes ADR-08)
- **ADR-61 · Stages, models and instances for V2.2** — Stages 5a–5c on Opus, 5d and 6 on Fable (Opus on fallback); instances swap at row boundaries through signal files (historical; supersedes ADR-34)
- **ADR-62 · Brain layout sign-off before it is built** — `history/v2/BRAIN_PROPOSAL.md` approved by Josh before the recomposition row (historical (approved; the layout is built))
- **ADR-63 · Collapsible section headings everywhere, state remembered per device** — A disclosure triangle on every section label; the state is device-local, never on the server (stands)
- **ADR-64 · Files in, from anywhere** — Attach on capture and tasks; share to JSTACK through `/capture` and the Dropbox inbox; everything in Dropbox; shared content is data, never instructions (stands; amends ADR-48)
- **ADR-65 · Every V2.1 audit finding becomes a rule, a check or an ID before V2.2 builds** — Hard rules 14–25, hunts 11–13, the qa-auditor's recurrence steps 38–46 and the LV-01..LV-10 self-check (historical (applied))
- **ADR-66 · Offline, the three planning tabs keep their last copy, and nothing else does** — The last Today composite, the Tasks list for the filter it was loaded under and Brain's recent items, encrypted through `lib/encryptedStore.ts`, stripped of any record marked `sens` or `sensitive`, replaced by each successful load, shown only when a load fails offline under "last updated … · offline", and wiped with the device (`lib/lastSeen.ts`); not Life's money or health, Agents, Settings or search, because the owner asked to plan and capture on a plane, not to carry the database (amended by ADR-70: since v2.3.1 those records are kept too, encrypted at rest) (amended by ADR-70 (the cache keeps sensitive records too))
- **ADR-67 · Type the passkey ceremony's wire shapes now** — `WebauthnBody`/`WebauthnResult` narrowed from `Record<string, unknown>` to the WebAuthn standard's JSON-serialised shapes, `{step}` enumed as `WebauthnStep` (D-3, WP-D) — a contract narrowing is cheapest before any server exists to have quietly trusted the untyped one (stands)
- **ADR-68 · Native dictation wired behind the one microphone owner** — On a phone `expo-speech-recognition` backs `lib/mic.ts`'s one owner — the same states and Stop, the lock ending it, a refused permission falling back to typing, recognition on the device only (WPB-4, WPB-11, WPF-14); hearing it on a phone is Josh's check (stands)
- **ADR-69 · Talk after a lock is paused, and resumed by hand** — A lock during Talk releases the microphone and Talk reads "Paused — locked" with its transcript kept; the microphone reopens only when Resume is pressed, because a lock is an exit path for the microphone (WPB-3, A4R11-06) (stands; Josh confirms the copy)
- **ADR-70 · Amends ADR-66: the last-seen cache keeps every record, sensitive included** — Josh, 15 Sep: "Last-seen cache keeps everything, sensitive included." The stripping of `sens`/`sensitive` records before the cache writes no longer holds; `lib/lastSeen.ts` and the `HANDOVER.md`/`SECURITY.md` cache lines are WP-I's to change (code: WP-I) (stands)
- **ADR-71 · Teach feeds V3's memory-curation agent** — Josh, 15 Sep: "Teach to form part of JStack V3 multi agent as memory refinement will be an agent task. Teach feeds that agent better info from me based on what it finds as conflicts/gaps/improvements." A rule taught from a card or Settings (§4.22) stays what it is today; the memory-refinement destination — a V3 agent (working name "librarian") reading Teach's conflicts, gaps and improvements — is new work, not V2.3's (stands)
- **ADR-72 · Money and Health move to the V5 stage** — Josh, 15 Sep: "Money & health move to JStack V5 stage." Supersedes the 14 Sep "later" wording in `V23_REQUIREMENTS.md` §2 with a numbered stage (stands)
- **ADR-73 · The emergency lock: local when unreachable, full on confirmation; a wipe never touches the memory or information store** — Josh, 15 Sep: "Local lock when unreachable, full lock on confirmation. Wipe never changes the memory or information storage database, only agents, interfaces and caches." Matches what `SECURITY.md` already built (ADR entry added for the record); the device clears tokens, keys, the outbox queue, caches and preferences, the server revokes sessions and pauses agents, and no wipe ever touches a record (stands)
- **ADR-74 · Rules and memory history is append-only** — Josh, 15 Sep: "Append only. Memory will evolve over time, history matters." Confirms `CONTRACT.md` §1.5 for rules specifically: a removal from `PUT /settings/autonomy/rules` is a new entry, never a deletion of the one it replaces (stands)
- **ADR-75 · P-1 clarified: JSTACK's lock and the device's lock** — Josh, 15 Sep: "When you say 'Lock', do you mean phone or app lock? When talk / dictation is on — the app and phone/ipad/app should ensure the device remains open and screen on. If I lock the device, voice locks too." Two locks, one rule for the microphone. JSTACK's own lock — the inactivity timer, hold-to-lock, the emergency lock — pauses Talk as "Paused — locked", and only Resume reopens the microphone (ADR-69). The device's lock, or the app switched away, ends voice the same way: the words kept, Talk reading "Paused", Resume by hand. While a microphone is open the screen stays on, and JSTACK's inactivity lock waits, since a person speaking is not idle (WPJ-1, WPJ-2, WPJ-3) (stands)
<!-- generated:end -->

---

## 8. The test map

<!-- generated:start section=8 sha=7b1099c date=2026-09-30 -->

### Specs

| spec | titles | acceptance IDs named |
|---|---|---|
| `e2e/core/agents.spec.ts` | 27 | ADR-43, AG-01, AG-02, AG-03, AG-04, AG-05, AG-06, AG-07, AG-08, AG-09, AG-10, SEC-07, SEC-10, US-03, US-04 |
| `e2e/core/arrange.spec.ts` | 10 | AR-01, AR-02, AR-03, AR-04, AR-05, AR-06, CB-03, CT-05, GL-08, RL-05 |
| `e2e/core/board.spec.ts` | 27 | ADR-45, BD-01, BD-02, BD-03, BD-04, BD-05, BD-06, TK-10 |
| `e2e/core/brain.spec.ts` | 31 | ADR-49, BR-01, BR-03, BR-04, BR-05, FS-02, GL-08, MC-02, MC-03, MC-08, NC-01, PU-04, QA-01, RL-05, RP-01, RP-02, RP-03, RP-04, RP-05, RP-06, SEC-12, TS-04 |
| `e2e/core/calendar.spec.ts` | 18 | ADR-47, CG-01, CG-02, CG-03, CG-04, CG-05, CG-06, CG-07, CG-08 |
| `e2e/core/collapse.spec.ts` | 15 | CL-01, CL-02, CL-03, CL-04, GL-02, GL-05, JQ-06, RL-05, RL-11 |
| `e2e/core/day2.spec.ts` | 6 | OF-09 |
| `e2e/core/decisions.spec.ts` | 50 | ADR-41, CD-05, CD-18, DC-01, DC-02, DC-03, DC-04, DC-05, DC-06, DC-07, DC-08, DC-09, DC-10, FS-02, ST-04, TD-03, UN-01, UN-02, UN-03, UN-04 |
| `e2e/core/files.spec.ts` | 22 | ADR-64, FL-01, FL-02, FL-03, FL-04, FL-06, OF-06, UP-01, UP-02, UP-03 |
| `e2e/core/find.spec.ts` | 18 | GS-02, GS-03, GS-04, GS-05, GS-06, GS-07, MC-06 |
| `e2e/core/focus.spec.ts` | 5 | FS-01, FS-03, FS-05 |
| `e2e/core/gantt.spec.ts` | 25 | ADR-12, ADR-46, GT-01, GT-02, GT-03, GT-04, GT-05, GT-06, GT-07, GT-08 |
| `e2e/core/hardening.spec.ts` | 9 | ADR-09, GL-00, SH-01, SH-06, SH-07, SH-08, SH-09, SH-10 |
| `e2e/core/identity.spec.ts` | 16 | ID-01, ID-02, ID-04, MU-01, MU-02, MU-03 |
| `e2e/core/keyboard.spec.ts` | 2 | — |
| `e2e/core/life.spec.ts` | 63 | ADR-39, FS-02, LF-01, LF-02, LF-03, LF-04, LF-05, LF-06, LF-07, LF-08, LF-09, LF-10, LG-01, LG-02, LG-03, LG-04, LG-05, LH-02, LH-03, LH-04, LH-05, LH-06, LH-07, LL-03, TD-06, UN-03 |
| `e2e/core/lock.spec.ts` | 27 | ADR-41, AG-04, AG-11, AG-12, LK-01, LK-02, LK-03, LK-04, LK-05, SEC-02, SEC-03, SEC-11 |
| `e2e/core/memory.spec.ts` | 8 | BR-06, BR-07, BR-08, BR-09, BR-10, BR-11, BR-12, ST-02, ST-04 |
| `e2e/core/mirror.spec.ts` | 5 | TM-01, TM-02, TM-03 |
| `e2e/core/mockfile.spec.ts` | 4 | CD-12, QA-06 |
| `e2e/core/offline.spec.ts` | 16 | GL-04, OF-01, OF-02, OF-03, OF-05, OF-06, OF-07, OF-08, SY-02, SY-04, TD-02 |
| `e2e/core/opens.spec.ts` | 12 | ADR-52, LF-08, OP-01, OP-02, OP-03, OP-04, OP-05, OP-06, OP-07, RP-06 |
| `e2e/core/push.spec.ts` | 10 | PU-01, PU-02, PU-03, PU-04, PU-05 |
| `e2e/core/pwa.spec.ts` | 8 | CD-11, PW-01, PW-02, PW-03, SEC-01, SEC-09 |
| `e2e/core/sections.spec.ts` | 11 | CB-05, CB-06, CB-07, CB-08, CB-10, NC-01 |
| `e2e/core/settings.spec.ts` | 37 | FS-04, GL-04, GL-08, LK-04, LK-06, RL-06, SE-01, SE-02, SE-03, SE-04, SE-05, SE-06, SE-07, SE-08, SE-09, SEC-09, ST-01, ST-02, ST-03, ST-05, ST-06, ST-07, VP-14 |
| `e2e/core/share.spec.ts` | 13 | LK-03, SEC-11, UP-04, UP-05, UP-06, UP-09 |
| `e2e/core/shell.spec.ts` | 14 | GL-01, GL-02, GL-03, GL-06, GL-07, GL-08, LK-01, NR-02, NR-03, RL-05, SEC-02 |
| `e2e/core/talk.spec.ts` | 29 | ADR-50, MC-02, MC-07, TS-01, TS-02, TS-03, TS-04, TS-05, TS-06, TS-07, VP-04, VP-05, VP-07, VP-08, VP-09, VP-11, VP-12 |
| `e2e/core/task-detail.spec.ts` | 47 | ADR-42, ADR-43, DC-08, FL-06, JQ-01, JQ-02, OF-07, TK-02, TK-03, TK-04, TK-05, TK-06, TK-07, TK-08, TK-09, TK-10, TK-11, TK-12, TK-13, US-01, US-02 |
| `e2e/core/tasks.spec.ts` | 53 | ADR-42, ADR-44, ADR-46, BD-01, FS-02, GT-04, JQ-03, JQ-04, TF-01, TF-02, TF-03, TF-04, TF-05, TF-06, TF-07, TF-08, TK-01, TK-02, TK-03, TK-04, TK-05, TK-06, TK-07, TK-10, TK-11, TK-12, TK-13, TK-14, WK-02, WK-03 |
| `e2e/core/textentry.spec.ts` | 22 | TE-01, TE-02, TE-03, TE-04, TE-05, TE-06, UX-01, UX-02, UX-03 |
| `e2e/core/timezone.spec.ts` | 2 | ADR-29, ADR-47, TD-05, TD-06, TZ-03, TZ-04 |
| `e2e/core/today.spec.ts` | 19 | DS-02, DS-05, LF-02, NC-01, QA-01, SE-09, TD-01, TD-02, TD-04, TD-05, TD-06, TD-07, TD-08 |
| `e2e/core/voice.spec.ts` | 19 | ADR-49, LV-05, MC-01, MC-02, MC-03, MC-04, MC-06, MC-08, VO-01, VO-04, VO-05 |
| `e2e/matrix/brain-life.spec.ts` | 6 | BR-05, LF-10 |
| `e2e/matrix/layout.spec.ts` | 10 | RL-01, RL-02, RL-04, RL-05, RL-06, RL-07, SE-09, TS-01 |
| `e2e/matrix/settings.spec.ts` | 2 | SE-09 |
| `e2e/matrix/tasks.spec.ts` | 5 | BD-01, RL-04, TK-01, TK-05 |
| `e2e/matrix/theme.spec.ts` | 23 | AA-03, AAA-01, AAA-03, ADR-47, GL-03, GL-05, GL-07, ID-02, LH-08, LK-01, LV-07, MC-02, QB-04, RL-08, RL-11, SY-03, TD-05 |
| `e2e/matrix/today.spec.ts` | 3 | CG-07, RL-07 |

### Unit tests

| test | acceptance IDs named |
|---|---|
| `tests/native/calendarAllDay.test.tsx` | — |
| `tests/native/collapse.test.tsx` | CL-01, CL-02, CL-03, GL-00, GL-05 |
| `tests/native/dictateOrb.test.tsx` | — |
| `tests/native/encryptedStore.test.ts` | WPA-16 |
| `tests/native/errorBoundary.test.tsx` | ADR-06, ADR-18, GL-00, NR-03, NR-04, SEC-14 |
| `tests/native/gateMockSignIn.test.tsx` | — |
| `tests/native/micAwake.test.ts` | — |
| `tests/native/micNative.test.ts` | MC-01, MC-07, MC-08, WPF-14 |
| `tests/native/notConnected.test.tsx` | — |
| `tests/native/orbComingSoon.test.tsx` | — |
| `tests/native/people-verb-error.test.tsx` | CD-10 |
| `tests/native/primitives.test.tsx` | CD-17, GL-05, NR-04, NR-05, TE-05, UX-01 |
| `tests/native/push-copy.test.tsx` | GL-00, PU-01 |
| `tests/native/queueStore.test.ts` | WPA-15 |
| `tests/native/screens.test.tsx` | AA-05, ADR-47, BR-05, CB-04, CD-04, CD-18, GL-00, GL-07, JQ-06, LF-06, LL-03, MC-07, NR-04, OF-08, OP-06, TD-02, TE-03, VP-11 |
| `tests/native/sections.test.tsx` | CB-01, CB-02, CB-04, NR-04, SH-06 |
| `tests/native/secureStore.test.ts` | — |
| `tests/unit/allDay.test.ts` | — |
| `tests/unit/audit-check.test.ts` | SH-02, SH-07 |
| `tests/unit/autoLock.test.ts` | ADR-41, LK-01, MC-07 |
| `tests/unit/bnCaptureCarried.test.ts` | ADR-06, BN-02, BR-05, BR-11 |
| `tests/unit/boundaries.test.ts` | CT-03 |
| `tests/unit/brainProposalApplied.test.ts` | BN-04 |
| `tests/unit/buglogRows.test.ts` | LV-01 |
| `tests/unit/bundle-budget.test.ts` | PF-01, PF-04 |
| `tests/unit/capabilities.test.ts` | CT-05, SE-08 |
| `tests/unit/caps.test.ts` | AG-01 |
| `tests/unit/captureRig.test.ts` | QA-07 |
| `tests/unit/chrome.test.ts` | — |
| `tests/unit/codemap.test.ts` | CM-01, CM-02, CM-03, CM-04, CM-05, CM-06, CM-07, GL-00, LK-02 |
| `tests/unit/collapse.test.ts` | CL-01, CL-02, CL-03, JQ-06 |
| `tests/unit/completion.test.ts` | ADR-42, TK-10, TK-11, TK-12, TK-13 |
| `tests/unit/conformance.test.ts` | WM-04, WM-05 |
| `tests/unit/consolidation.test.ts` | ADR-01, ADR-60, CD-10, RM-01, RM-02, RM-03, RM-06, RM-07, RM-08, RM-09, RM-10, RM-11 |
| `tests/unit/contract.test.ts` | AA-02, ADR-02, ADR-14, CT-01, CT-02, CT-03, LK-06, SE-08, SEC-01, SEC-15 |
| `tests/unit/controls-v21.test.ts` | — |
| `tests/unit/controls-v22.test.ts` | — |
| `tests/unit/controls.test.ts` | QA-01 |
| `tests/unit/date-basis.test.ts` | ADR-47, TD-05 |
| `tests/unit/day2.test.ts` | SEC-15, TK-12, TM-01, TM-03 |
| `tests/unit/delegation.test.ts` | ADR-42, TK-06, TK-08, TK-09 |
| `tests/unit/dialogFocus.test.ts` | GS-02 |
| `tests/unit/dialogs.test.ts` | GS-03, JQ-01, JQ-02, RL-06, SM-05 |
| `tests/unit/drag.test.ts` | ADR-45, BD-04, GT-06, GT-07, GT-08 |
| `tests/unit/enterSends.test.ts` | MC-05, TE-06 |
| `tests/unit/enumLabels.test.ts` | LV-08 |
| `tests/unit/files.test.ts` | FL-01, FL-04, FL-05, FL-06, LV-08, MU-02, UP-02 |
| `tests/unit/fixture-dates.test.ts` | ADR-47, TZ-04 |
| `tests/unit/fixture-weekdays.test.ts` | CD-03, CD-18, GL-07, LV-06 |
| `tests/unit/fixtures.test.ts` | CT-06, JQ-04, LV-06, SEC-15 |
| `tests/unit/fonts.test.ts` | DS-03, SEC-09, SM-06 |
| `tests/unit/ganttAxis.test.ts` | ADR-46, GT-01, GT-02, GT-04, GT-05, GT-07 |
| `tests/unit/goalMeta.test.ts` | LG-02, TD-05 |
| `tests/unit/goals.test.ts` | LG-01, LG-02, LG-04, MU-02, MU-04 |
| `tests/unit/habitArchive.test.ts` | LH-06, LH-07 |
| `tests/unit/habitStats.test.ts` | LH-01, LH-02, LH-03, LH-04 |
| `tests/unit/handover.test.ts` | ADR-32, CD-09, CD-11, CT-01, JQ-01, JQ-02, JQ-06, LV-09, OF-09, PW-02, QA-02, QA-07, RL-05, RM-01, RM-02, RM-06, SH-02, SH-04, SH-05 |
| `tests/unit/hardening.test.ts` | AG-12, CD-04, CD-14, SEC-02, SEC-05, SH-06, SH-09, SH-10, WPA-14 |
| `tests/unit/holdToLock.test.ts` | AG-04, AG-06 |
| `tests/unit/hooks.test.ts` | ADR-35, CM-07, CM-09, CM-10, QA-08, RR-05, WPF-10 |
| `tests/unit/hover.test.ts` | CD-17 |
| `tests/unit/icons.test.ts` | DS-04 |
| `tests/unit/identity.test.ts` | ID-01, ID-03, ID-04, ID-05, MU-01, MU-02, MU-03, MU-04 |
| `tests/unit/ingestionThreatModel.test.ts` | UP-10 |
| `tests/unit/keyboardZoom.test.tsx` | UX-02 |
| `tests/unit/labelColumn.test.ts` | CD-05 |
| `tests/unit/labels.test.ts` | PL-02, SM-08 |
| `tests/unit/lastSeen.test.ts` | WPA-14 |
| `tests/unit/learningShape.test.ts` | LL-01, LL-03 |
| `tests/unit/lint-guards.test.ts` | ADR-33, ADR-35, CD-11, CD-12, CM-08, DS-02, NR-07, QA-03, SM-04 |
| `tests/unit/lockGate.test.ts` | LV-03 |
| `tests/unit/memoryHistory.test.ts` | — |
| `tests/unit/mic.test.ts` | ADR-49, MC-01, MC-06, MC-07, MC-08, MC-09, TD-05 |
| `tests/unit/micAwake.test.ts` | MC-01, VP-07 |
| `tests/unit/n8nActions.test.ts` | — |
| `tests/unit/n8nAllowList.test.ts` | ADR-76 |
| `tests/unit/n8nBrain.test.ts` | — |
| `tests/unit/n8nCalendar.test.ts` | ADR-47, ADR-76, ADR-80, ADR-82 |
| `tests/unit/n8nClient.test.ts` | ADR-76 |
| `tests/unit/n8nConfig.test.ts` | ADR-76, CD-14 |
| `tests/unit/n8nFiles.test.ts` | — |
| `tests/unit/n8nLocked.test.ts` | ADR-83 |
| `tests/unit/n8nReachability.test.ts` | ADR-78, ADR-83 |
| `tests/unit/n8nRecords.test.ts` | ADR-87 |
| `tests/unit/n8nRoutes.test.ts` | ADR-76, ADR-78 |
| `tests/unit/n8nTasks.test.ts` | — |
| `tests/unit/n8nTasksWrite.test.ts` | — |
| `tests/unit/n8nToday.test.ts` | — |
| `tests/unit/needsYouSchedule.test.ts` | TD-01 |
| `tests/unit/offlineVerbs.test.tsx` | — |
| `tests/unit/openapi.test.ts` | WM-02, WM-03, WM-06 |
| `tests/unit/opens.test.ts` | ADR-52, FL-03, LG-02, OP-06, OP-07, RP-02 |
| `tests/unit/orbOverlay.test.tsx` | MC-01, MC-07, MC-10 |
| `tests/unit/orbPushToTalk.test.tsx` | — |
| `tests/unit/outbox.test.ts` | OF-01, OF-02, OF-04, OF-06, OF-07, OF-10, WPA-14, WPA-15, WPA-16, WPA-17 |
| `tests/unit/parameters.test.ts` | ADR-41, LK-02, LK-03, LK-04, LK-05 |
| `tests/unit/predicates.test.ts` | SP-01, TF-01, TF-06, TF-09, TK-14 |
| `tests/unit/push.test.ts` | LK-06, PU-01, PU-02, PU-03, PU-04, PU-05, SE-02 |
| `tests/unit/pwa.test.ts` | ADR-38, CD-11, PW-01, PW-02, PW-03, PW-04, PW-05, QA-06, SEC-01, SEC-09, SH-01, TE-01, UP-04 |
| `tests/unit/qa-citations.test.ts` | AA-06, FS-05, PF-05, QA-02, TD-01, TD-02 |
| `tests/unit/qaReport22.test.ts` | ADR-65, LL-01, LV-01, LV-02, LV-10, OP-07, QA-02, QA-03, UP-01 |
| `tests/unit/reachability.test.ts` | — |
| `tests/unit/recentFiles.test.ts` | FL-05, SEC-06, WPA-16 |
| `tests/unit/registry.test.ts` | ADR-01, AR-01, AR-02, AR-07, BN-01, CB-03, LF-07 |
| `tests/unit/replies.test.ts` | RP-01, RP-06 |
| `tests/unit/richText.test.ts` | CD-04, OP-01, SH-06 |
| `tests/unit/routes.test.ts` | ADR-33, SM-01 |
| `tests/unit/rules.test.ts` | CD-13, ST-02, ST-03, ST-04 |
| `tests/unit/saturated-fill.test.ts` | CD-13, OF-08 |
| `tests/unit/search.test.ts` | ADR-52, GS-01, GS-02, GS-03, GS-04, GS-06, GS-07, OP-07 |
| `tests/unit/searchableAll.test.ts` | OP-08 |
| `tests/unit/sections.test.ts` | CB-01, CB-02, CB-04, CB-05, CB-06, CB-07, CB-08, CB-09, CB-10 |
| `tests/unit/security.test.ts` | AA-02, SEC-02, SEC-05, SEC-06, SEC-08, SEC-15 |
| `tests/unit/serveMock.test.ts` | — |
| `tests/unit/serveMockRig.test.ts` | WM-04 |
| `tests/unit/server.test.ts` | AR-05, AR-06, CT-07, LK-04, WPF-11 |
| `tests/unit/share.test.ts` | UP-04, UP-05, UP-06, UP-07, UP-08, UP-09, WPF-11 |
| `tests/unit/shortcuts.test.ts` | — |
| `tests/unit/sizes.test.ts` | CD-05, SM-02, SM-03, SM-05 |
| `tests/unit/slicers.test.ts` | ADR-44, TF-01, TF-06, TF-08 |
| `tests/unit/stores/agents.test.ts` | — |
| `tests/unit/stores/brain.test.ts` | CL-03, OF-05 |
| `tests/unit/stores/device.test.ts` | WPA-16 |
| `tests/unit/stores/life.test.ts` | — |
| `tests/unit/stores/session.test.ts` | UN-01, UN-04 |
| `tests/unit/stores/settings.test.ts` | — |
| `tests/unit/stores/sync.test.ts` | CD-02, CD-14, OF-07, OF-09, SY-01, WPA-15, WPA-17 |
| `tests/unit/stores/taskCard.test.ts` | LG-03 |
| `tests/unit/stores/tasks.test.ts` | — |
| `tests/unit/stores/today.test.ts` | CD-18, DC-02, DC-05, DC-06, DC-08, DC-09, DC-10, FS-02, LK-04, ST-04, UN-01 |
| `tests/unit/syncStatus.test.ts` | SY-01 |
| `tests/unit/taskEdit.test.ts` | ADR-42, JQ-03, TK-01, TK-02, TK-03, TK-04, TK-05, TK-08, TK-12, TK-13 |
| `tests/unit/taskRange.test.ts` | ADR-44, ADR-45, JQ-05, TF-01, TF-02, TF-07, TF-09 |
| `tests/unit/time.test.ts` | ADR-47, CD-09, CG-02, SM-07, TD-01, TD-02, TD-03, TD-05, TD-07, TZ-01, TZ-02, TZ-03 |
| `tests/unit/tokens.test.ts` | ADR-03, DS-01, DS-02, DS-03 |
| `tests/unit/transport.test.ts` | CT-04 |
| `tests/unit/unused-exports.test.ts` | CT-06 |
| `tests/unit/usage.test.ts` | ADR-43, ADR-47, CB-02, TD-05, US-01, US-02, US-03, US-04, US-05 |
| `tests/unit/useDetail.test.ts` | — |
| `tests/unit/useLayout.test.ts` | DS-06, RL-01 |
| `tests/unit/voice-ui.test.ts` | ADR-49, MC-01, VP-12 |
| `tests/unit/voice.test.ts` | ADR-24, ADR-49, MC-07, MC-09, VP-01, VP-02, VP-03, VP-06, VP-07, VP-08, VP-09, VP-10, VP-13, VP-14 |
| `tests/unit/webauthn.test.ts` | ADR-67 |
| `tests/unit/wiring.test.ts` | WM-01 |
| `tests/unit/wiringOrphans.test.ts` | CM-02, LV-02 |
| `tests/unit/work.test.ts` | ADR-42, WK-01, WK-02, WK-03, WK-04 |
| `tests/unit/workflows.test.ts` | CD-01, CI-01, CI-02, CI-03, CM-02, LV-04, PF-04, PW-06, RR-01, RR-02, RR-03, RR-04, SEC-15, SH-03, SH-04, SH-05 |
| `tests/unit/writePaths.test.ts` | — |
| `tests/unit/writeRefusals.test.ts` | — |
| `tests/unit/zorder.test.ts` | LV-05 |

### Lint rules

| rule | guards |
|---|---|
| `no-colour-literal.js` | — |
| `no-inline-font-size.js` | — |
| `no-numeric-and.js` | — |
| `no-window-dimensions.js` | — |
| `require-purpose-header.js` | every source file opens with a purpose comment (CODEMAP section 2) |
<!-- generated:end -->

---

## 9. Glossary

- **focus** — a saved filter over everything (Work, Family…). `activeFocus` in settings; every list read passes it.
- **silo** — who may see a record: `personal:josh`, `personal:joce`, `work`, `family1`, `family2`. Strictest wins. See `data/labels.ts`.
- **card** — one thing the EA needs a decision on, in Today's Needs-you list. Has a `kind` (opts, quote, bill, section) and a verb set.
- **verb** — what Josh does to a card: approve, revise, later, never, teach. Never send/pay/book/revoke in this build.
- **brick** — one block in a configured section: a `Block` from the catalogue in `layout/catalogue.tsx`, rendered by `layout/SectionRenderer.tsx`. Money, People, Learning and Health are config records made of them; Goals and Habits are still components.
- **feed flag** — a capability switch saying a data source is connected; surfaces render a ghost card when it is off.
- **transport** — the layer under the adapter that actually moves bytes: mock, HTTP, or HTTP wrapped in the outbox.
- **outbox** — the offline queue. A capture made offline returns `202 queued` and replays on reconnect.
- **server event** — a push from the server that a composite changed, so the client reloads rather than polls.
- **the rig** — `window.__JSTACK__`, present only in test builds, through which Playwright moves the clock, flips capabilities and inspects stores.

---

## 10. Where not to look

- **`evidence/v1.2/`** — artefacts of the v1.2 build. `evidence/v1.2/contrast-report.json` measures the *retired green palette*; read out of context it describes colours this app does not use.
- **`history/v1/jstack-mock-v11.html`** — the design mock the V2 build was built from. Useful as a reference for intent, not as a description of what exists. `jstack-mock-v15.html` is the current build packaged as one file.
- **The backend starter** — outside this repo. `history/v2/HANDOVER_v2.md` describes what the developer implements; nothing in it is running.
- **`history/v2/BUILD_PLAN_v2.md` / `history/v1/11_CC_V2_EXEC_PROMPT.md`** — the V2 build's own instructions. Superseded by the V2.1 set for anything current, though V2's hard rules still stand where V2.1 does not change them.
- **Anything under `e2e/.artifacts/` or `evidence/.e2e-raw/`** — Playwright's own scratch output: gitignored, **created at run time**, and absent from a fresh clone until the suite has run once. The walker skips gitignored paths for exactly this reason, so the map is allowed to name where the traces land without the reference counting as broken.

---

## 11. Companion lists

Generated. These are what keeps sections 4, 5 and 6 from rotting: each lists what exists in
the codebase that the hand-written judgement has not caught up with. A release requires them
empty — Stage 3c's `P-1` adds the release workflow and that gate with it. Until then they are
advisory, and Stage 4 curates them.

<!-- generated:start section=11 sha=7b1099c date=2026-09-30 -->

### New since section 6 was curated

None. ✅

### Guards section 4 does not name

None. ✅

### File families with no recipe in section 5

None. ✅
<!-- generated:end -->
