# DISCREPANCIES.md — design pack vs mock vs prose, and which won

Seeded at row 0 from `V2_DECISIONS.md` "Inputs checked before planning". The build appends a row whenever the mock, the pack prose and the tokens disagree during later rows, recording which won (design truth order: brief v2 > mock v11 > design pack 1.3 tokens/reference > `03_BACKEND_CONTRACT.md` v1.2 > older).

| # | Area | Discrepancy | Resolution |
|---|---|---|---|
| 1 | `tokens.json` vs `tokens/*.css` | `tokens.json` holds stale v1.0 values (ground `#E9E7E0`, card `.72`, card border `.85`, bar `.82`, shadow `0 14px 36px`, stat 22px). `tokens/colors.css` and `typography.css` hold 1.3 values (ground `#EDEBE5`, card `.58`, border `.7`, bar `.72`, shadow `0 8px 22px`, stat 18px), matching the mock and reference build. | CSS wins (ADR-03). `tokens.json` is not read by `gen-tokens.mjs` except for its `iconName` block. |
| 2 | `layout.css` phone page padding | `--js-page-pad-phone: 16px 16px 120px` (1.0) vs README/handoff/mock `calc(env(safe-area-inset-top,0px) + 22px) 20px 120px` (1.3). | Mock and reference win. `gen-tokens.mjs` overrides this one value with a comment: `pagePadPhone = { top: 22 + safeAreaTop, sides: 20, bottom: 120 }`. |
| 3 | `layout.css` habit height | `--js-size-habit: 36px`, `-compact: 34px` vs mock 34/32. | Reference wins: 34 on Life, 32 compact on Today. |
| 4 | Handoff prose "Needs eyes" | Renamed "Agent issues" in 1.2. | Stat card label reads "agent issues"; Agents subtitle reads "N need you". |
| 5 | Pack "Load from Google Fonts" vs SEC-09 (no third-party origins) | Pack prose suggests a Google Fonts `<link>`. | SEC-09 stands: fonts self-hosted through `@expo-google-fonts/*` packages (ADR-10). |
| 6 | Pack weight allow-list vs mock `<b>` in memory proposals | README Type, Rules lists the places weight 500 is allowed — card title, primary verb, selected chip, a person's name in People, the answered verb in history — and "a changed value inside a memory proposal" is not among them. But mock v11's own fixture data embeds `<b>...</b>` around exactly that value (`$4,500`, `Work · jstack`, `Personal`), and the mock renders it at the browser's default bold. | Mock wins on the emphasis, pack wins on the weight (ADR-11's truth order: brief > mock v11 > pack). `lib/richText.tsx` renders the span at **500**, never bold — gentler than the mock, and never above the pack's own maximum. Raised by the Stage 2 ux-reviewer as D19 and ruled here rather than silently kept (BUGLOG_v2.md A-41). |
| 7 | Gantt has no specified date axis | `handoff.md` lists the Gantt view under "Not in the reference build", and the mock's only Gantt is the sidebar's mini card (`.gantt{grid-template-columns:96px 1fr}`) — label plus track, no dates. The full-width view inherits that and so prints six bars against six grey tracks with no way to read what any of them means. | Pack silent, so README Principles 7 ("Show the work") governs: the full view gains a minimal axis — window start, "today", window end, and a 1px accent-ink now-rule, the calendar grid's own language. The `compact` sidebar card keeps the mock's shape exactly. Raised as ux-review D24, which said plainly it was unsure of the intended design; logged here so a later round can overrule it (BUGLOG_v2.md A-41). |
| 8 | Switch geometry and colours: pack prose vs mock | README Components and `handoff.md` both say `26 × 15 track, 11px knob; on = Accent track with a white knob, off = Hairline track with a Muted knob`. Mock v11's own CSS is `.sw{width:40px;height:24px;background:var(--hairline)} .sw.on{background:var(--accent-soft)} .sw::after{width:18px;height:18px;background:var(--bar)} .sw.on::after{background:var(--accent-ink)}` — 40 × 24 with an 18px knob, an Accent-**soft** on-track and an Accent-**ink** on-knob. | Mock wins (ADR-11 truth order: brief > mock v11 > pack), and the app already matches it exactly. Raised by the Stage 2 ux-reviewer as R2-01 measuring the shipped build against the pack prose; recorded here rather than left as a silent 40 × 24. The reviewer's *other* half of R2-01 was a real defect and was fixed: the Notifications grid's device columns were exactly 40px wide, so four 40px switches butted together and read as one grey bar at 393 — the column is 46 now. |
| 9 | Voice Style and Speed: value buttons vs segmented control | `handoff.md` says "Voice (Style and Speed as bordered value buttons with `expand_more`)", and mock v11 renders `<button class="btn sm">Warm · AU ⌄</button>` — a value button. The app renders both as the same `<Seg>` used by Theme and Autonomy. | Pack and mock lose, deliberately. The mock's value button is a STUB (`data-act="ext"`, no picker behind it), so conforming to it would mean either a control that opens nothing — a label-honesty defect under QA's own rules — or inventing a picker the pack never specifies. The segmented control shows every option at once, is consistent with the two controls directly above it in the same sheet, and is already covered by SE-05's tests. Raised as ux-review R2-09, which called it "a conformance miss, not a craft failure" and offered this row as one of its two sanctioned outcomes. |
| 10 | Section-label trailing slot: descriptive hint vs action link | README Components describes one trailing element on a section label — "Right-hand hint on the same line: 11, Muted, sentence case, no tracking" — but the app has two kinds: a descriptive HINT ("2 of 3 done", "the empty space is the point") and an action LINK ("history", "all", "edit caps", "configure", "search", "fix"). The pack's wording covers only the first. | Both, distinguished by what they do. `Label`'s `hint` slot stays Muted and hugs the label, for text that only describes; `right` is Accent ink flush at the column edge, for anything with an `onPress` — README Principles 3, "Colour means you can act", and Colour, which lists links under Accent ink. Two action links were using `hint` and so read as Muted descriptions: the word "all" appeared twice at 11px on one screen doing the same job in two colours and two places (ux-review R6-03, fixed in B-77). Recorded so the eleven stay consistent and nobody restores the hugging version as a "fix". |
| 11 | Stat and glance grids: `auto-fit` vs a fixed basis | The mock and `handoff.md` both size these with `repeat(auto-fit, minmax(130px,1fr))`, which at 1366+ gives four cards across at ~140px. The app uses a fixed `flexBasis: 47%`, so Agents' stat row renders two across at ~290px — the same width as the Portals tiles beneath it. | The fixed basis stays. `auto-fit` is what produced ux-review D9: at a phone width it wrapped 3 + 1 and stretched the orphan ("Goals · 1" alone on row 2 at three times the width of the cards above it), which is exactly the "amateur" read Josh called out on the v1.1 frames. A rule that fills whole rows at every width beats one that reads correctly at 1366 and badly at 393. Raised again by the reviewer in round 8, which declined to call it a defect and asked for this row instead — the mock loses on merit, and the reason is recorded so nobody restores `auto-fit` as a "fix". |
| 12 | Bill card: "a `copy` link per row" vs two of three | README Components, the decision card's bill variant: "three-row grid `payee / BSB / ref` with a **`copy` link per row**". The app renders one on BSB and one on ref, and none on the payee. | The pack loses, deliberately. A bill card exists to hand the owner the strings they paste into a banking app: the account/BSB and the reference. "RACQ Insurance" is a name you read — a copy link on it offers an action with no use, which is the same label-honesty standard rows 9 and 11 are decided on. The build had gone further and shipped only ONE link with the absence asserted in a test, which the audit caught as B4-03 and which was corrected toward the pack, not away from it (02_ACCEPTANCE_TESTS_v2.md §4, A-52). Recorded here as well as in §4 because this is where a designer looks, and because the reviewer asked for it in round 10. |
| 13 | The type scale vs the sizes the app actually renders | The pack's scale has seven steps (26/32 title, 18 stat, 15 card title, 12.5 body, 12 chip, 11.5 label, 11 small, 10.5 meta, 10 tab/badge). S-2b turned `jstack/no-inline-font-size` on, which means a component can no longer set a size at all — every size has to be a named `Txt` kind — and that exposed eleven roles the scale does not name: the rail wordmark (12 at weight 600), the locked screen's wordmark and heading (34), a sheet title (18 with no stat weight or line-height), quoted EA prose (12 at a 1.45 line-height), Glance's cell value (14 = body + 1.5), the toast's undo countdown and a calendar event title (10), and `CalendarGrid`'s axis and day labels (9.5) and hour marks (9). | Every one keeps the exact value it rendered before the migration, homed as a kind in `theme/ui/textKinds.ts` with a comment naming its consumer — S-2b is a refactor, and a refactor that quietly moved a size to the nearest scale step would be a restyle nobody asked for. Four of them are genuinely off-scale and worth a designer's eye: **34** (the scale stops at 32), **14**, **9.5** and **9** (the scale bottoms out at 10.5, which the calendar grid cannot use without colliding — it is the densest surface in the app). The other seven are pack values that simply had no kind. If the pack later names sizes for these roles, `textKinds.ts` is the only file that changes. |
| 14 | Today's delta line: pack Muted vs shipped Accent-adjacent | README/handoff and mock v11 (`.delta{color:var(--muted)}`) put the header's delta line in Muted at 11.5. The app renders it at `c.textExpiry`, measured by the round-15 ux-reviewer at +40 blue-minus-red where Muted sits at −9, and at `kind="meta"` (10.5) rather than 11.5. | **Fixed at Stage 4 (ux-review R1-07, BUGLOG R-20): the override is gone and the line is Muted; the link keeps accent ink; the size (10.5 `meta` against the pack 11.5) stays as row 13 records.** Was, until then: open, recorded rather than fixed. It predates S-2b — the typography migration preserved the colour it found — so it is not that stage's regression, and changing a header colour at the close of Stage 3a with no row asking for it is the kind of unreviewed restyle S-2b was careful not to make. The cost is real and worth naming: "Review the week" is the only tappable phrase on that line, and it is now the same hue as the twelve words before it, distinguished only by a weight the pack's own allow-list does not grant links. Belongs to whichever row next touches `components/chrome/Header.tsx`. |
| 15 | Settings sheet title 20px vs the pack's 26 | `SettingsSheet.tsx` uses `Txt kind="heading"`, which `theme/ui/textKinds.ts` defines as 20 — the literal both overlays have always used. The pack's scale jumps 18 → 26. | **Open, recorded.** Row 13 above covers the eleven roles S-2b homed, each keeping its exact prior value; this one predates all of it and was inherited unchanged. Named here so it is a decision rather than an oversight — raised by the round-15 ux-reviewer. |

| 16 | Life's closing line: inside the last card vs under the columns | Mock v11 puts "Each section is a template the EA configures; you edit or revert" at the foot of the Learning card, because Learning happens to be the last section in the mock's third column. The app now renders it under the columns as the tab's own footer. | Position changes, wording does not. B-2 turned People, Money, Learning and Health into config records, and as a section's own footer the line took the derived id `learning-footer` — joining the rows it sits above and turning LF-08's row count from 2 into 3 (BUGLOG_v21.md B-28). It is a statement about the TAB, not about Learning, so it moved to `TabScreen`'s `footer` prop and kept the `life-footer` id it always had. At 393 the visual difference is a few pixels of margin; at 1366 the line now spans the page instead of the third column, which is where a sentence about the whole tab belongs. |
| 17 | Talk with EA: a sheet in the mock, a full screen in the app | Mock v11 renders Talk as a sheet over the Brain tab — a title bar, an orb and the word "Listening…", with the tab bar still showing underneath. The app makes it a `screen`-kind surface that replaces the tab bar and the rail while a session runs. | The mock loses, and it loses because it was never a conversation. Its Talk sheet is a static picture: no transcript, no reply, no way to end. V-2 builds the thing it was a picture OF, and a conversation is not something you have in the corner of a tab — the transcript needs the height, the controls need to be reachable without looking (64px in car mode), and a tab bar under a live microphone invites a tap that abandons it. `layout/dialogs.tsx`'s `screen` kind exists for exactly this and Talk is its only member; a second full-screen surface is a design decision, not a registry entry, and `tests/unit/dialogs.test.ts` asserts the count. The banner is the other half of the same decision: leaving the screen does not leave the conversation, so `TalkBanner` follows you to every tab and the rail's health line reads "in conversation". |
| 18 | The state line: a timer, or words | Neither the pack nor the mock says what a live voice surface shows while it waits — the mock has one static "Listening…" and no other state. The obvious build is a timer: elapsed seconds, or a countdown to the end of the turn. | Words, and no numbers at all: `listening`, `thinking…`, `speaking`, `held · take your time`. ADR-24's whole position is that silence must not be pressure, and a number ticking up while someone looks for a word is the interface telling them to hurry — the exact behaviour the rule exists to prevent. `e2e/core/talk.spec.ts` asserts the held line contains no digit, so this cannot be "improved" back into a countdown by accident. |

## 19 · The phone blur override (PF-03) — not taken

**Pack:** cards blur 20, bars 24, at every width. **PF-03 (V2.1 plan):** under 768 the card
blur drops to a reduced value and list-card rows carry no backdrop filter, for scroll
performance. **Measured (B-25/B-26):** scroll p95 at 393 on the production build is 21.9 ms
with the pack's blur — there is no problem to fix, and removing blur would trade a visible
design decision for an invisible non-improvement. **Winner:** the pack. `theme/tokens.ts`
keeps `blur.card = 20` and `blur.bar = 24` at every width; `QA_REPORT_v21.md` marks PF-03
DEVIATION with this row and B-26 as the reason. Re-measure before re-opening.

## 20 · The waiting row's type column: 48 → 60 (Stage 4, ux-review R1-05)

**Pack:** handoff Today, "Waiting row: type label fixed 48px". **App:** V2.1's SECTION — the
widest type the catalogue can put in a waiting row — broke to "SECTIO / N" at 48, at every
width in both schemes (ux-review R1-05). **Winner:** the app, by necessity. `tools/gen-tokens.mjs`
overrides `sizes.labelCol` to 60 (the third value it overrides; the pack file keeps its 48),
and `e2e/core/sections.spec.ts` CB-05 asserts the label is one unbroken line. BILL, CLASH,
EMAIL and TASK gain 12px of column they do not use.

## 21 · Board lanes stretch to the strip (Stage 4, ux-review R1-04) — reference wins

**Pack:** README Layout, "Leave the bottom of a column empty when the content ends. Do not
stretch cards to match heights." **Mock v11:** `.board{display:grid;grid-auto-flow:column;
grid-auto-columns:minmax(200px,1fr)}` — grid items stretch to their row by default, so the four
lane surfaces are equal-height in the reference as well. **Winner:** the reference. The README
line is about cards and tab columns; a lane is the surface the cards sit on, and a strip of
ragged lane heights was never drawn. Recorded in `CARRIED_DEFECTS_v21.md` UX-A for Josh;
`alignItems: "flex-start"` on the strip is the one-line change if he rules the other way. (Same
review, R1-03: the lanes now take the mock's `minmax(200px, 1fr)` width instead of growing to
their longest title — that one was a defect, and is fixed.)

## 22 · The phone toast sits 32px above the pack's 90 while the demo watermark renders (Stage 4, ux-review R3-01)

**Pack:** README Components, the toast is "fixed bottom centre: 90 on phone, 24 desktop".
**App:** the demo watermark (I-1, not in the pack) lives in the band above the phone's tab bar,
at 84. Round 2 found the toast printing over it; round 2's fix moved the mark up by a constant
and round 3 found the mark's ground chip painting out whatever content it landed on (R3-01).
**Winner:** the mark stays put and the toast steps over it — `TOAST_BOTTOM.phone` plus
`WATERMARK_CLEARANCE` (32), so 122 — only while the mark renders (the mock transport). On a real
backend there is no mark and the toast is at the pack's 90; desktop is untouched. Guarded by
`tests/native/screens.test.tsx` R3-01 and `e2e/core/identity.spec.ts` ID-02.

## 23 · The page refuses to scale, so Android loses pinch-zoom (Stage 5b, E-1, TE-01)

**Pack:** nothing in the pack sets a viewport meta; the type scale sets body at 12.5.
**App:** Josh, on the iPhone: focusing a field zooms the page. iOS Safari zooms whenever the
focused input's font is under 16px, so the two ways out were a 16px input — one control off the
type scale on every screen, to work around a browser — or telling the page it may not scale.
E-1 takes the second: `maximum-scale=1` in the head that `tools/build-web.mjs` emits.
**Winner:** the type scale. The cost is Android: Chrome honours `maximum-scale` for pinch, so
page pinch-zoom goes on Android while iOS Safari, which has ignored it for pinch since iOS 10,
keeps both the pinch and the fix. Josh's devices are an iPhone and an iPad, so the loss falls
where he is not. Browser zoom, the OS accessibility zoom and the app's own type settings are
all untouched. Revisit if Android becomes a target: the alternative is a 16px input on touch
widths only, which trades the scale back for the pinch. Guarded by `tests/unit/pwa.test.ts`
TE-01, which asserts the string on the source of the tool that emits the head.

**v2.3.2 (WPR-4, 16 Sep):** the head alone did not hold on Josh's iPhone — the mock he tried that morning still zoomed
onto Brain's field and Find, and stayed zoomed after Enter — so the app now takes both ways out: `maximum-scale=1`
stays, and every text input renders at 16px or more on the web (`theme/ui/fields.tsx`), one control off the type scale
by design. Guarded by `tests/unit/keyboardZoom.test.tsx` and `e2e/core/keyboard.spec.ts`.

## 24 · Brain's column 1 holds only fixed-height controls (N-1, measured; NOT resolved)

`BRAIN_PROPOSAL.md`, approved by Josh on 7 Sep, puts **Latest in in column 2**. `handoff.md`
§Brain puts it in **column 1**. N-1 applied the approved proposal, and the ux round then
measured what that costs.

At 1366 column 1 is the widest slot (`1.3fr`, 425px) and carries **237px** of content — the
capture card and Find, both fixed-height input controls — then 749px of nothing. Column 3 is
312px wide and carries **890px**. By ink area the widest column holds 36% of what the narrowest
one does. At 1920 roughly half the 1499 × 980 content rectangle is one connected empty L. The
single-column tail did improve — moving Memory to column 3 took 1366 from 928px to 340px (31%),
1024 from 793 to 457, 1920 from 825 to 309 — so the move worked; it exposed this instead.

The cause is the ASSIGNMENT, not the grid: a column holding only input controls has a height
fixed at ~237px however much data the tab holds, so the widest slot can never fill. Moving
Latest in back to column 1 is one line in the registry and returns the tab to `handoff.md`.

**Left as it is, deliberately.** The proposal is the arrangement Josh approved and read; a
builder rearranging it on a measurement would be undoing a decision he made, and the reviewer's
recommendation and the approved spec disagree here rather than agreeing as they did at X-1
(where the measurements independently arrived at the proposal's own column 3 for Files). This
is Josh's call or the planner's, not the row's. Recorded here with the numbers so it is a
decision somebody takes rather than a thing nobody noticed.

## 25 · Talk with EA and Dictate to EA sit outside the capture card (N-1)

`BRAIN_PROPOSAL.md` row 2 places the pair "in the capture card"; `handoff.md` places them
under it, which is what ships and what the reviewer judged as reading correctly. The pair is a
different job from capture — talk rather than get-it-out-of-your-head — and a card that holds a
field, three icon buttons and two full-width buttons stops reading as one thing. No fix; the
proposal's wording is the looser of the two and the shipped arrangement is the pack's.

## 26 · The Life habit strip cannot get longer without leaving its column (LH-1, ux LH1-06 → LH2-01)

Round 1 measured the seven-day strip at the same **203px at 393 and at 1920** and asked for it
to lengthen with the screen: the card's extra width was going into the gap between the habit's
name and its cells — 95px at 393, 200px at 1366, **330px at 1920**, nine rows deep — so the
density FELL as the screen grew, which is the inverse of the dense grid Josh's first reference
image shows.

It was made 7 / 14 / 28 days by screen width. Round 2 measured what that costs: at 1366 the
cells ran to x1088 against a card ending at **x656 — 432px outside it**, overprinting the Money
label to "MON", putting its chevron between two habit squares, and hiding three habits behind
the Money card. At 1920, 268px outside.

**The strip is back to seven and the finding is NOT closed.** The cause is not the number: the
Habits card sits in one of three columns and is ~380px wide at every width above the phone, so
seven 24px cells and a name are what fits. A longer strip means giving Habits more than one
column — which is `layouts.json` and the registry, not a constant in a component, and it trades
against every other Life section for the same space.

**Options, none taken here.** (a) Leave it: seven days is a week, and the month grid one tap
away is where a longer view belongs. (b) Give Habits a two-column span on Life at 1180+, which
is a layout change with its own review. (c) Drop the name to its own line above the strip on
wide screens, which buys ~70px and reads as a different card. Josh's or the planner's call.

## 27 · Do dense data blocks inside a card take the card's row hairline? (LH-1, ux LH1-09, widened at round 2)

The pack: *"Rows inside separated by 1px Hairline, 9px vertical padding, horizontal padding 12
on the card and 0 on the row."* Every other card in Life's column obeys it. Three things this
row added do not: the Habits card's nine habit rows, the month card's weekday header against
its grid, and the all-time card's bar rows against the meta line beneath them.

The reviewer raised it at low severity on the Habits card and widened it at round 2 once the
Trends cards existed, on the grounds that it is now one question with three instances rather
than a single card's oversight.

**Not decided here, deliberately.** A hairline between rows of a data grid is a different
proposition from a hairline between rows of a list: the grid's own cells are already a lattice,
and adding a rule between them may read as a table border — which the pack does not otherwise
use. Applying it unilaterally to three surfaces on a ux note would be a builder making an
app-wide typographic decision inside a feature row. Recorded for Stage 6 with the three
instances named so it is one decision rather than three arguments.

## 28 · Notifications at 393 is 830px in a 723px viewport, and the cure is worse (ST-1, ux ST1-06)

`ST-01` asks, in as many words, for "at 393 each group is a labelled row with four named switches"
— because the alternative is four unlabelled toggles in a row and no way to tell which one is the
iPad's, on the panel where getting it wrong means a notification arriving somewhere Josh is not.

Measured at 393: group pitch **77px**, ten groups plus the push row, card **≈830px** against a
scroll viewport of **723px** (y 84→807). The first card of six is taller than the window it lives
in. At 1024 it is 577px of a 703px sheet (**91%**), 77% at 1366, 63% at 1920. It reads long because
of REPETITION rather than height: the four device names print forty times.

**The obvious fix was measured and withdrawn by the reviewer who proposed it.** One header row over
bare switches at a 46px pitch would take the card to ≈560px — but `Telegram` is **44px of glyph**
and a 46px column leaves about 42, so it would truncate the very word ST-01 was written to stop
being abbreviated. Recorded here because a fix that is wrong for a measurable reason is worth more
written down than forgotten.

**Two remedies that do not undo ST-01, neither taken here.** (a) Keep the labelled rows for the two
or three groups people actually change and put the rest behind a "Show all ten". (b) Give
Notifications its own sub-screen under 768, the same shape as Settings › Sync. Both are layout
decisions with their own review; Josh's or the planner's call.

## 29 · At the Voice offset, the settings sheet's left column is empty (ST-1, ux ST1-13)

At the scroll position where Voice sits, the three-column sheet's **entire left column has zero
ink** — 0 of 320,250px at 1366, 0 of 379,800px at 1920, about 47% of the dialog, with the Today
page ghosting through it.

ST-1 added roughly 475px to the right column (the Rules card) and nothing to the left. The cause is
the ASSIGNMENT rather than the grid, exactly as row 24 records for Brain: Appearance and Schedules
are short, and everything else is stacked in one column, so the left one runs out long before the
right one does. It was true before this row and this row made it further true.

**Not fixed here.** Rebalancing which panel sits in which column is a settings-layout decision that
changes where every card on the sheet is, and doing it inside a feature row on a ux note would be a
builder rearranging a screen on a measurement — the same argument row 24 makes. Recorded with the
numbers so somebody takes it rather than nobody noticing.

## 30 · The pack has no amber, and SY-03 needs one (SY-1)

`02_ACCEPTANCE_TESTS_v22.md` SY-03 asks for three sync states in three colours: "ok = ok token,
pending = the new `warn` token (amber); attention = alert". `design/tokens/colors.css` has
**two** signal colours — `--js-ok` and `--js-alert` — and nothing between them. Resolution #1
answers it in as many words ("a new `warn` token (amber); `tools/gen-tokens.mjs` + a
`DISCREPANCIES.md` row — the pack has no amber, Josh asked for green, amber or red"), so this row
records what was added and how it was chosen rather than that a choice was made.

**Added to the pack's own CSS, not to the generated file.** `theme/tokens.ts` is generated from
`design/tokens/colors.css` and `tokens.test.ts` regenerates it into a temp path and diffs, so a
hand-edited token would have been reverted by the next `pnpm codemap` and caught by DS-01. The
values are `--js-warn: #96702E` (light) and `#D2B067` (dark).

**Chosen by measurement, in the pack's own key.** Both are desaturated ochres rather than a
signal amber, because every colour beside them is: against the bar each theme paints, light
measures **4.29:1** (`ok` is 3.86, `alert` 4.74 — it sits between them) and dark **7.39:1** (`ok`
7.14, `alert` 4.95). SY-03's floor is 3:1 and `e2e/matrix/theme.spec.ts` measures all three on the
RENDERED dot in both schemes, which is the gate that keeps this honest.

**What is not decided here.** Whether `warn` belongs anywhere ELSE. Three surfaces could argue
for it today — an over-budget bar before it is over, a task due tonight, an agent that has
answered slowly — and every one of them is a design decision about what the app is willing to
worry a person about, not a token question. It is used by the sync dot and by nothing else, and
the next row that wants it should say why in its own commit.

## 31 · The desktop mic bar is full width, not the pack's 360 × 60 bottom right (A-3, ux S6-18)

**Pack:** README Components, Mic: "On desktop a 360px bar appears bottom right"; `handoff.md`:
"Desktop: a 360 × 60 bar bottom right with the same content." **App:** `MicBanner` (and
`TalkBanner`, the same `BottomBanner`) runs the full width of the content area at the foot of
every tab. Until this row it was 1149 × 34, inset 8, square-ish — neither the pack's bar nor a
deliberate new one, which is what the reviewer measured (S6-18 a).

**Winner:** full width, deliberately, with the pack's own Bar metrics. `JOSH_QA_v22.md` item 11,
verbatim: *"the mic stays on (good), but there is no visual warning that I haven't turned it
off..? Needs to be noticeable. Mic staying on and I don't know how to turn it off – this must
never happen."* The V2.1 indicator WAS the pack's corner bar — "the only indicator was a bar in
the corner of a desktop window" (`e2e/core/voice.spec.ts`, ADR-49) — and it is the one he did not
notice. A 360px bar in the bottom-right corner of a 1920 monitor is the thing this row exists to
replace, so the bar keeps the width and takes the rest of the pack's Bar: 60 tall, inset 14, radius
10, the Bar surface with its blur and shadow (README Components, "Bar (phone tab bar, listening
bar) … inset 14px from the screen edges, height 60"). On a phone it is inset 14 like the tab bar
it sits 8 above, at its content height rather than a second 60 — two stacked bars would be a fifth
of the screen in chrome — and the pack's own phone answer (the bar REPLACES the tab bar) was
rejected at V-1 for taking away the way out. `BottomBanner.tsx` carries the numbers; the toast
steps over the bar while it is up (`Toast.tsx`), and the demo watermark yields the phone's band to
it (`DemoWatermark.tsx`, S6-02). Guarded by `e2e/core/voice.spec.ts` (S6-02 / S6-18).

## 32 · The `sensitive` tag wears Alert, which README Colour reserves for issues, over-budget bars and the lock (A-3, ux S6-15)

README Colour, "Where colour goes": Alert is for "needs-eyes items, over-budget bars, the emergency
lock. Never for expiry." A sensitivity label is a property of a record, and V2.1's N1-07 and V2.2's
S6-15 both read the tag's Alert border and text as a breach of that list — and S6-15 found the tone
half of N1-07 on no list at all. It stays: `02_ACCEPTANCE_TESTS_v22.md` RP-06 ("sensitivity in the
alert tint") and `V22_DECISIONS.md` R-1 specify the tint, `tests/unit/replies.test.ts` and
`e2e/core/brain.spec.ts` pin `tone: "alert"`, and the reason is the decision's own — a sensitive
record has to be seen before it is shared, which is what needs-eyes means. Unlocking it is a §4 change
to RP-06, Josh's call. Recorded here so the pack and the tree disagree in one place;
`CARRIED_DEFECTS_v22.md` §2 carries the reviewer's measurement.
