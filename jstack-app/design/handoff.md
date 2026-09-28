# Handoff · JSTACK V2 front door

For developers and coding agents implementing the V2 app (Expo web first, iPhone via Safari, iPad, desktop PC).

## About the design files
`JSTACK V2.dc.html` is a design reference written in HTML. It shows the intended look and behaviour on fixture data. It is not production code. Recreate it in the app's own stack using the tokens and component spec in this pack. Where this document is silent, open the reference build and measure.

Fidelity: high. Colours, type, spacing and interactions are final. Match them exactly. Values are in `tokens/*.css` and `tokens.json`.

## Shell

- Root: ground colour, body font 12.5/1.4, flex row.
- Under 768px: no rail. Main column with 20px side padding, `calc(env(safe-area-inset-top,0px) + 22px)` on top, 120px bottom padding. Scrollbars are 5px, thumb `rgba(122,119,111,.3)`, transparent track. Floating tab bar (5 tabs) inset 14px, height 60. Mic orb fixed right 20, bottom 88.
- 768px and up: 200px rail, sticky, full height, 22 × 12 padding. Items: icon 18 + label 12.5, padding 8 × 10, radius 8, gap 2. Active item: card fill, card border, accent-ink, icon filled. Hairline, then Find and Settings. Health line at the bottom: 6px ok dot + "all healthy · $4.20" in 11px muted. Main padding 24 / 32 / 80, max width 1500.
- Header (every tab): title (Source Serif 4, 500, 32 desktop / 26 phone, lh 1) and subtitle (12.5 muted) on one baseline, gap 10. Today adds a delta line beneath (11.5 muted) ending in a "review the week" link. Right: three 32px icon buttons at radius 10, card surface: Arrange (grid_view) and Help are desktop only; Theme is always shown. On phone the row is Settings + Theme only, and the health line moves to its own 11px line under the header.
- Focus chips under the header on Today, Tasks, Brain, Life: Everything, Personal, Family, Work, then a 30px `tune` button. Selected = accent-soft fill, accent-ink, 500.
- Columns: `1.3fr 1fr .95fr` at 1180+, `1.3fr 1fr` at 768+, single below. Gap 18. `align-items: start`. At two columns the third column moves directly under the first (`grid-column:1;grid-row:2`) and the second column spans both rows (`grid-row:1 / span 2`), so no dead row appears between sections. Each column is a flex column with gap 8.
- Section label: 11.5 uppercase .08em accent-ink, padding 0 2, with optional right hint (11 muted) and optional count badge (16px pill, marker fill, white 10px). Labels after the first in a column get margin-top 8.

## Today

Column 1 · Needs you, From your EA
- Label "Needs you" with badge = open decision count; hint "history".
- Exactly one decision card open (the first undecided, or the one the user tapped). Others render as waiting rows in the same order.
- Decision card (see spec below). Three fixtures: Clash (1-3-1 options), Email draft (quote), Bill staged (payee / BSB / ref with copy links).
- Waiting row: type label fixed 48px (uppercase 11.5 accent-ink), title (ellipsis, tap opens), expiry short form (10.5 accent-ink), small primary verb (6 × 10, 11.5/500). Tapping the verb answers without opening.
- End line (11 muted): "That's all until 4pm. Two more return then." When none remain: "Nothing needs you. Two more return at 4pm."
- From your EA sits directly under the end line (label with margin-top 8): insight row on the card surface, text 12.5 + why-line 10.5 Muted, small primary "Block it", "Leave it" in Muted. After a choice it collapses to a one-line result in 11 Muted.

Column 2 · All calendars, Calendar
- All calendars card: segmented Today / 3 days / Week / Month; a range line with chevron_left / chevron_right; then a time grid. Window 6:00 to 20:00 at 24px per hour (336px tall), 24px hour gutter on the left labelled every two hours at 9px Muted. Each day is a column: 9.5px caps label (today prefixed "TODAY ·" in Accent ink), then a relative track with radius 8, 1px Hairline border (today 2px Accent-ink top), and a repeating 1px Hairline line every two hours. Events are absolutely positioned by start time and duration: radius 5, 3px left rule, 10px title (nowrap, ellipsis) over 9px Muted time (time only when the block is at least 36px, i.e. 1.5 hours), Accent-soft fill for the owner's own events and Hairline fill for family or shared, dashed Accent-ink outline when the EA protects the block. A 1px Accent-ink line marks now on today. Week view uses seven columns, 9px text, no times. Month view is a 7 × 5 grid of day numbers with up to two dots. Legend: Personal (Accent), Work (Accent ink), Family · shared (Muted), EA protects (dashed), Now (line). The empty space is the point: do not compress it.
- Calendar card, list style: time (10.5 muted, 34px wide), event (12.5), optional prep line in accent-ink 10.5; free gaps as a single 10.5 muted line. Hint "today · 3 days · google".

Column 3 · Your tasks, At a glance, Close the day (moves under column 1 at two columns)
- Tasks card: 15px checkbox (radius 5, 1.5px muted), title, meta 10.5. Hint "all" → Tasks tab.
- At a glance: four cells, 10.5 muted label over 14px ink value; each taps to Life.
- Close the day: nine habit chips (min-height 34, radius 8, 11.5px label with a 14px check mark; toggle), then a journal field (hairline border, radius 8, "How was today?" with mic and keyboard icons).

## Tasks
- Segmented control List / Board / Gantt / Done (hairline fill, 3px padding, radius 9; selected card fill + segment shadow). Slicer chips This week / Waiting / Delegated / Agent / Recurring + Filter (tune).
- Task list card spans two columns at 1180+. Row: checkbox (dashed accent-ink border for EA-owned), owner tag (EA or J, 9.5/500 accent-soft), title, meta, chevron_right. Done = accent-ink fill, strikethrough, muted.
- Column 3: Waiting on (2 rows with "Draft a nudge"), Gantt card (label + 8px track, accent fill; EA bars are accent-soft with a dashed accent border).
- Footer line: "Tasks live in Twenty · open in Twenty".

## Brain
- Column 1: Mind dump box (card, min-height 64, placeholder 12.5 muted, mic (accent-soft) and arrow_upward (outlined) 30px buttons). Two buttons side by side: Talk with EA (primary) / Chat (outlined), each with a 10.5 muted sub-line. Find field (card, search icon, placeholder). Latest in card: three rows, routing chips as accent-ink text with → arrows.
- Column 2: Memory label with badge = proposals left; rows with `ok` (small primary) and `edit` (small outlined). When empty: "All caught up. The Librarian runs again at 2:00." Hit-rate row: "27 of 30 test questions right last week" + `fix` link.
- Column 3: Rules for my EA · 4, numbered rows (number 10.5 muted, 14px column), `edit` link each. Footer: "Teach on any card adds a rule here. A weekly report shows which helped or misled."

## Life
- Column 1: Goals card (3 rows, name in 500 + goal, status meta; "behind" in accent-ink). Habits card (nine labelled habit chips, wrapping).
- Column 2: People card (name 500, item, meta, small verb: Draft a note / Draft / Done / Nudge). Money card: 4 rows `label 44px · track · amount 10.5 muted`; over-budget track and amount in alert; footer line with RACQ due in accent-ink.
- Column 3: Health ghost (dashed hairline, muted text). Learning card (2 rows). Footer: "Each section is a template the EA configures; you edit or revert."

## Agents
- No focus chips. Stat row: `repeat(auto-fit, minmax(130px,1fr))`, four cards: 22px serif number over 10.5 label; "needs eyes" has a 7px alert dot.
- Column 1: Spend card (56px conic ring, accent 30.5%, bar-colour 42px centre with "$61"), text, caps as outlined 10.5 chips, "edit caps" link. Portals grid 4 × 2, tiles 11.5 name over 10 muted. Decision history (2 rows with `reopen`).
- Column 2: Needs eyes · badge count. One row per failing or not-run check: 7px alert dot, title, why-line, small primary verb (Renew, Run now). This list is the only place issues surface; nothing stays in a log. Then Last 24 hours: 7px dot (ok / muted / alert), time in muted then text, meta.
- Column 3: Security checks card, one row per continuous check: dot (ok / alert), name, status 10.5 right-aligned (muted when ok, accent-ink with "needs eyes" when not). Fixed set: watchdog heartbeat, blocked-action tests, injection tests, canaries, secrets scan, backup and restore drill, sessions and tokens. Hint links to Settings › Schedules. Then Emergency: card with 1px alert border, text, "Hold to lock" outlined in alert (press-and-hold, 1.2s, then confirm).

## Decision card spec
- Card surface, padding 12, column gap 9.
- Row 1: type label (uppercase 11.5 accent-ink) left; expiry + consequence right in accent-ink, sentence case.
- Row 2: title, Source Serif 4 500 15/1.3.
- Options (Clash): three rows, gap 2, padding 7 × 9, radius 8. Number 10.5 (accent-ink when recommended, else muted), text 12.5, why 10.5 muted. Recommended row = accent-soft fill. Tapping a row moves the recommendation; the primary verb reads "Go with N".
- Quote (Email): inset (accent-soft, radius 8, padding 8 × 10), 12/1.45 muted.
- Bill: grid `44px 1fr auto`, label 10.5 muted, value 12.5, `copy` link 10.5 accent-ink.
- Why-line: 10.5 muted; sources as accent-ink links; ends "silence proposes 1 · undo 10s" (or the card's silence rule).
- Verbs: primary (flex 1.3) · Revise · Later (outlined, flex 1) · ··· (36px outlined icon button). ··· toggles a second row: Never · Teach, outlined, muted text.

## Behaviour
- Answering any verb: card leaves, next undecided card opens, undo toast appears for 10s: "<result> · Undo (n)". Undo restores and reopens that card.
- Verb results (toast text): go → card-specific ("Approved · Reply to Andy, in Gmail Drafts", "Went with option 1 · Dev call", "Opened NAB · RACQ bill"); revise → "Sent back to revise · <title>"; later → "Later · returns Mon 8am · <title>"; never → "Never · rule offered · <title>"; teach → "Teach · one line to the EA · <title>".
- Tapping a waiting row title opens it (closes the current one). Tapping its verb answers it.
- Mic: idle orb → tap → listening. Phone: the tab bar content is replaced by live mic (42px marker fill, pulse), transcript (12.5, ellipsis), "listening · tap the mic to stop · files to Brain", cancel. Desktop: a 360 × 60 bar bottom right with the same content. Tap the mic or cancel to stop.
- Theme: follows system; the header toggle overrides for the session. Persist per device. Set the page background (html and body) to the theme ground as well as the app root, so a dark load never flashes light and overscroll gutters match.
- Focus chips filter every tab (fixture data does not change in the reference).
- Habits, checkboxes, proposals toggle locally and update counts (Habits n/9 on Today and Life share state).
- Resize: layout switches at 768 and 1180 live.

## State
`tab`, `theme` (auto | light | dark), `focus`, `width`, `decided{id→verb}`, `openId`, `menu` (which card shows Never/Teach), `pick` (1..3), `insight` (null | block | leave), `habits{name→bool}`, `listening`, `undo{id,text,until}`, `view`, `slicer`, `proposals{id→ok|edit}`, `taskDone{id→bool}`.

## Data the backend feeds (from the brief)
Action records with options, recommendation, why, expiry, then-what and state history; delegation and run logs; focus labels; calendar with free gaps; push per device; memory proposals and rules; people and Life templates; schedules and heartbeat; emergency lock. Every card carries a source URL and a receipt (cost, model, sources).

## Settings
Opened from the rail (desktop) or the header settings button (phone). Scrim rgba(28,26,22,.3) + blur 4, sheet max-width 900, Bar surface, radius 10, padding 18 / 20 / 22, gap 14; page padding 32 desktop, 12 phone; click the scrim or close to dismiss.
- Header: "Settings" in Source Serif 4 400 at 26, sub-line "One account · 3 devices · changes save as you make them", 32px close button.
- Notifications: full width. Grid `minmax(0,1fr) repeat(4,42px)`; header row iPh / iPad / PC / TG in 9.5px caps Muted. Nine groups, each name + 10.5 meta and four switches (26 × 15 track, 11px knob; on = Accent track with a white knob, off = Hairline track with a Muted knob). Footer line about quiet hours.
- Then a two-column grid (one column under 1180), in order: Appearance and account (Theme segmented Auto / Light / Dark, Devices, Export everything, Emergency lock with an alert-outlined "Hold to lock")  · Schedules and heartbeat (7 rows: name, meta, cadence in Accent ink, pause/resume text link, "run" small primary) · Autonomy (6 card types × Ask me / Propose / Auto segmented) · Voice (Style and Speed as bordered value buttons with expand_more, "Read the brief at 6:30" switch) · Focus filters (4 rows with edit).
- Rows are 8px vertical, hairline between, no hairline on the last row. Sections never overlap their cards: label, 8px gap, card.

## Not in the reference build
Find, Arrange, task and event side panels, Board and Gantt views, Review, passkey screen, board mode. Build them on the same tokens and patterns; run `review/DESIGN_REVIEW.md` before merging.
