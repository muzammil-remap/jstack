# ux-review-b3.md — B-3 (Stage 3c) DELTA review, round 1

Date: 7 September 2026 · reviewer: ux-reviewer · scope: the five screens B-3 touched
Truth order applied: brief v2 > mock v11 > design pack 1.3 > older. `design/DISCREPANCIES.md`
row 16 (Life's closing line moved under the columns) treated as a **resolved winner, not a defect**.

This file is the B-3 delta only. The earlier V2 rounds live in `ux-review.md`, which is untouched.

Baseline for "did it move?": the frames committed at `HEAD` (`f5417e8`, STATE after B-2) are the
**pre-refactor** captures — `git log` shows `demo/v2/life-*.png` last written at `c22bed9`, and
neither B-1 (`166b6c7`) nor B-2 (`b8eaf16`) touched `demo/`. So working-tree vs HEAD is exactly
"generic renderer vs the components it replaced", which is the comparison the brief asked for.
Every "moved by N px" claim below is a pixel measurement against those HEAD frames.

---

## Frames reviewed (38)

| file | screen | width | scheme | verdict |
|---|---|---|---|---|
| decision-section-393-light.png | Today · section decision card | 393 | light | defects (05, 08, 09, 14, 15) |
| decision-section-393-dark.png | Today · section decision card | 393 | dark | defects (02, 08, 09) |
| decision-section-1024-light.png | Today · section decision card | 1024 | light | defects (04, 05, 08, 09) |
| decision-section-1024-dark.png | Today · section decision card | 1024 | dark | defects (02, 04, 05, 08) |
| decision-section-1366-light.png | Today · section decision card | 1366 | light | defects (04, 05, 08, 09) |
| decision-section-1366-dark.png | Today · section decision card | 1366 | dark | defects (02, 04, 05, 08) |
| decision-section-1920-light.png | Today · section decision card | 1920 | light | defects (04, 05, 08, 09) |
| decision-section-1920-dark.png | Today · section decision card | 1920 | dark | defects (02, 04, 05, 08) |
| life-config-393-light.png | Configure this section | 393 | light | defects (01, 06, 07, 10) |
| life-config-393-dark.png | Configure this section | 393 | dark | defects (01, 06, 07, 10) |
| life-config-1024-light.png | Configure this section | 1024 | light | defects (01, 04, 06, 07, 10, 13) |
| life-config-1024-dark.png | Configure this section | 1024 | dark | defects (01, 04, 06, 07, 10, 13) |
| life-config-1366-light.png | Configure this section | 1366 | light | defects (01, 04, 06, 07, 10) |
| life-config-1366-dark.png | Configure this section | 1366 | dark | defects (04, 06, 07, 10) |
| life-config-1920-light.png | Configure this section | 1920 | light | defects (01, 04, 06, 07, 10) |
| life-config-1920-dark.png | Configure this section | 1920 | dark | defects (04, 06, 07, 10) |
| life-393-light.png | Life | 393 | light | defects (03, 11) |
| life-393-dark.png | Life | 393 | dark | defects (03, 11) |
| life-1024-light.png | Life | 1024 | light | defects (03, 04, 11) |
| life-1024-dark.png | Life | 1024 | dark | defects (03, 04, 11) |
| life-1366-light.png | Life | 1366 | light | defects (03, 04, 11) |
| life-1366-dark.png | Life | 1366 | dark | defects (03, 04, 11) |
| life-1920-light.png | Life | 1920 | light | defects (03, 04, 11) |
| life-1920-dark.png | Life | 1920 | dark | defects (03, 04, 11) |
| arrange-1024-light.png | Arrange | 1024 | light | defects (04, 12, 13) |
| arrange-1024-dark.png | Arrange | 1024 | dark | defects (04, 12, 13) |
| arrange-1366-light.png | Arrange | 1366 | light | defects (04, 12, 13) |
| arrange-1366-dark.png | Arrange | 1366 | dark | defects (04, 12, 13) |
| arrange-1920-light.png | Arrange | 1920 | light | defects (04, 12, 13) |
| arrange-1920-dark.png | Arrange | 1920 | dark | defects (04, 12, 13) |
| today-393-light.png | Today (context) | 393 | light | clean |
| today-393-dark.png | Today (context) | 393 | dark | clean |
| today-1024-light.png | Today (context) | 1024 | light | defect (04) |
| today-1024-dark.png | Today (context) | 1024 | dark | defect (04) |
| today-1366-light.png | Today (context) | 1366 | light | defect (04) |
| today-1366-dark.png | Today (context) | 1366 | dark | defect (04) |
| today-1920-light.png | Today (context) | 1920 | light | defect (04) |
| today-1920-dark.png | Today (context) | 1920 | dark | defect (04) |

`arrange-393-*` does not exist. That is **correct, not a missing frame**: `handoff.md` Shell says
"Arrange (grid_view) and Help are desktop only … On phone the row is Settings + Theme only", so
Arrange has no phone entry point. 150 frames = 18 screens × 8 + Arrange × 6. Nothing is missing.

---

## Defects, ranked

### B3R1-01 — the "Configure this section" dialog does not use the app's sheet surface. At 393 it has no container at all.
**Frames:** `life-config-393-light.png`, `life-config-393-dark.png`, `life-config-1024-light.png`,
`life-config-1366-light.png`, `life-config-1920-light.png` (light worst; dark hides most of it).

Measured, at x=200 straight down `life-config-393-light.png`: **every** row from y=10 to y=2300
reads 215–221. There is no sheet edge, no radius, no inset, no fill step — the dialog's text is
painted directly onto the scrim, full-bleed, for the whole 2362px page. `settings-393-light.png`
at the same column is the control: scrim 220 to y≈355, then a **251** sheet from y≈360 to y≈1900,
with a 12px inset and a visible border at x=12 and x=380. The config dialog has none of that.

On desktop a container does exist but at the wrong value. `life-config-1366-light.png` scanned
across y=470: 220–221 unbroken from x=235 to the sheet edge at x=1133. `settings-1366-light.png`
on the same line: border at x=252, then **251** solid to x=1108. So the dialog's fill is 30 levels
darker than the app's sheet and roughly `.58` white over the scrim where the sheet is `.72` — and
the page reads through it. At 1024 you can read "Free until 9:00", "Andy · V2 kickoff" and the
calendar rows *through* the dialog; at 1366 a habit chip from the page behind shows up **inside the
Title input** next to the word "Reading".

Pack line broken — `handoff.md` Settings: "Scrim rgba(28,26,22,.3) + blur 4, sheet max-width 900,
**Bar surface**, radius 10, padding 18 / 20 / 22". And README Surfaces: "Bar (phone tab bar,
listening bar): Bar colour, blur 24px, radius 10".

Fix: give the dialog the same surface component the Settings sheet uses — Bar fill, blur 24,
radius 10, and the 12px (phone) / 32px (desktop) page inset — instead of drawing content on the
scrim. This is the same class of defect the build already fixed once, as `1518176 fix(v2): the
emergency dialog's missing container (R19-01)`; that fix did not reach this dialog.

**Confidence it is a defect, not a choice: very high.** No reading of the pack produces a modal
with no container on phone.

---

### B3R1-02 — in dark, the section preview's inner card renders ~2.5× too bright, and its meta text falls to 1.65:1.
**Frames:** `decision-section-393-dark.png`, `-1024-dark`, `-1366-dark`, `-1920-dark` (identical at
every width).

Sampled interiors on `decision-section-393-dark.png`:

| surface | measured |
|---|---|
| ground | (19, 18, 15) |
| decision card | (39, 39, 36) — border (61, 60, 57) |
| the Inset | (47, 48, 49) … (52, 54, 55) |
| **the preview's inner card** | **(100, 105, 108)** — border (115, 120, 122) |
| a real Life card, `life-393-dark.png` | (43, 42, 39) — border (63, 62, 60) |

`rgba(255,255,255,.08)` over the inset should land near 64. It lands at 100 — an effective alpha of
about **.25**, three times the token. Light is fine (242 interior = `.58` white over the inset,
exactly right), so this is dark-specific.

The consequence is a contrast failure, not just a taste one. On that surface:
- row meta ("summary ready · resurfaces in the review", "notes filed · Learning"), Muted at 10.5:
  **1.65:1** and **1.67:1**.
- row title, Ink at 12.5: **4.58:1**.

Pack line broken — README Accessibility: "Text contrast: Ink on Ground 11:1, **Muted on Card
4.6:1**". 1.65:1 is below even the 3:1 large-text floor; those two lines are effectively unreadable.
Also README Surfaces: "the card-to-ground step is deliberately **small**: one visible layer, no
float" — in dark this is the brightest surface on the screen, brighter than the Approve button.

Fix: find where the preview's block card resolves its dark fill and make it the same token every
other card uses. It is the loudest single thing on the dark section frames.

**Confidence: very high** (numbers, not judgment).

---

### B3R1-03 — Money's footer line escaped the Money card. Unsanctioned; the refactor was supposed to be invisible.
**Frames:** `life-393-light/dark`, `life-1024-*`, `life-1366-*`, `life-1920-*` — all eight.

Measured on `life-1366-light.png`, old (HEAD) vs new:

| | HEAD (components) | now (config renderer) |
|---|---|---|
| Money card bottom border | y = 498 | y = **464** |
| RACQ footer ink | y 461–471 + 475–482 (two lines) | y 474–484 (one line) |
| RACQ footer left ink x | **690** (card border 676 + 14 padding → inside the card) | **677** (flush with the card's outer border → outside it) |

So the line that used to sit on the Money card's own surface now sits on the ground below it,
aligned to the card's outer edge rather than to the "Home / Family / Bali / Subs" labels. Same at
393 (very visible — the card visibly ends above the line), 1024 and 1920.

Pack line broken — `handoff.md` Life, column 2: "Money card: 4 rows `label 44px · track · amount
10.5 muted`; over-budget track and amount in alert; **footer line with RACQ due in accent-ink**" —
the footer is part of the card. `DISCREPANCIES.md` row 16 sanctions the move of Life's **tab**
closing line only; it says nothing about Money, and the brief for this stage says the rendered
output "was meant to be indistinguishable from before".

What appears to have happened: the generic renderer emits `label → card → footer` for every
section, which is how Learning's footer already rendered (HEAD: `life-1366-light.png`, footer ink
at x=1023 = column 3's outer edge). Money's bespoke component put its footer inside the card, and
the generic path lost that.

Not a defect, checked and cleared: the accent ink survived. Darkest RACQ pixel is (77, 97, 114),
b−r = +37, identical in HEAD and now — same value as the `configure` link, unlike the Muted
`$2,480` at b−r = −10. I looked at this expecting a colour regression and there isn't one.

Fix: let a section's footer render inside its card when the section has one (or give Money's block
an in-card footer slot), so the pre-refactor rendering is restored.

**Confidence it changed: certain (measured). Confidence it is a defect rather than an accepted
consequence: high** — the handoff puts the footer in the card and nothing has ruled otherwise.

---

### B3R1-04 — "Demo · fixture data · nothing sends" is printed on top of the rail health line, on every desktop frame, both schemes.
**Frames:** all 24 desktop frames in scope (`decision-section`, `life-config`, `life`, `arrange`,
`today` × 1024/1366/1920 × light/dark).

At the bottom of the rail, "● needs attention · $0.42" and "Demo · fixture data · nothing sends"
overlap by roughly 8px vertically. Both lines are unreadable through the overlap. The HEAD frames
have the health line alone and clean, so this arrived with the regeneration.

It also paints **above the modal scrim** — on `life-config-1024-dark.png` the whole rail is dimmed
by the scrim but the watermark is not, so it floats over the dialog's backdrop.

At 393 the watermark sits on its own line above the tab bar and is fine.

Pack line broken — `handoff.md` Shell: "Health line at the bottom: 6px ok dot + 'all healthy ·
$4.20' in 11px muted." A watermark stacked on it is a plain collision, the class the checklist's
rule 5 and the automated overlap sweeps exist to catch.

Fix: give the watermark its own line (or move it out of the rail's bottom slot) and put it under
the scrim's stacking context.

**Confidence: very high.** It is possible the watermark is capture-harness chrome rather than app
UI — either way the delivered evidence frames are compromised.

---

### B3R1-05 — inside the preview, the caption is glued to the inner card: 3–4px above it, 10px below.
**Frames:** `decision-section-1024-*`, `-1366-*`, `-1920-*` (worst); `-393-*` (milder).

Vertical rhythm inside the Inset, measured on `decision-section-1366-light.png`:

- inset top 214 → "READING" ink 226 = **12**
- "READING" ink 233 → inner card top 245 = **12**
- inner card bottom 343 → caption ink 346 = **3**
- caption ink 355 → inset bottom 365 = **10**

At 1920 the same gap is 4px (card bottom 343, caption ink 347). At 393 it is 8px, because the inner
card renders shorter there. The rhythm is inverted: the caption sits tight against the thing above
it and loose from the floor below it, so "goes on life, column 3 · reads /learning" reads as a
**row of the preview card that has fallen out of it** — it is the same 10.5 Muted style as the row
meta lines directly above.

Pack line broken — README Spacing: "4px base. Used values: 2, 3, 5, 6, 8, 9, 10, 12, 14, 16, 18, 24,
32. Between cards in a column: 8." A 3px gap is not on the scale, and the 3/10 pairing is not a
rhythm.

Fix: 8–9px above the caption, matching (or exceeding) the space below it. Better still, distinguish
it from row meta — it describes the preview, it is not part of it.

**Confidence: high.**

---

### B3R1-06 — in the config dialog the Title label and its field sit at opposite ends of the sheet.
**Frames:** all eight `life-config-*`.

At 1366 the sheet is 900 wide; "Title" is flush left at x≈249 and the input's left edge is at
x≈957 — about **700px of nothing** between a label and the field it names. At 1920 the gap is
larger again. At 393 the input is 159px wide, right-aligned, with ~177px of empty row after the
word "Title".

Nothing in the pack sanctions this. It is the single most "amateur" thing in the five screens and
it is the exact read Josh called out on the v1.1 iPad frames — controls flung to opposite edges of
a row with dead space between.

Pack line broken — README Do and don't: "Don't: … centred layouts on desktop", and Components,
Settings sheet: "Rows are 8px vertical, hairline between … Sections never overlap their cards:
label, 8px gap, card" — the sheet's row grammar is label-then-content, not label-then-void-then-
content. Compare `settings-*` where every row's control sits in a fixed right-hand column of known
width and reads as one row.

Fix: either stack (label above field, field full width) or hold the field to a sane width adjacent
to the label. It also needs the field's own fill so B3R1-01's ghosting cannot land inside it.

**Confidence: high.**

---

### B3R1-07 — the block list does not read as "what this section is made of". It reads as helper text for the Title field.
**Frames:** all eight `life-config-*`.

The Reading section's one block renders as a bare line — "rows · What you're reading and watching"
— directly under the Title row, at the same left indent as the word "Title", in body type, with no
label above it, no row structure, no hairline, and nothing separating it from the "Version 1 · last
changed by your EA" line beneath. On first read it is the Title field's hint, not a block.

The brief for this dialog is "one line per block naming what it is and where its data comes from".
The naming half is there ("What you're reading and watching") but the *identity* half is the raw
block type, `rows` — developer vocabulary in a surface whose voice is "a capable assistant speaking
to one person … plain words" (README Content). And there is nothing telling the owner these lines
are the section's parts.

Pack line broken — README Components, Settings sheet: "section label above each card"; and the
Section label spec, "11.5px tracked caps in Accent ink". A list of blocks is a section of this
sheet and should carry one.

Fix: a `BLOCKS` section label, the block lines as actual rows (hairline-separated, the 44px fixed
label column the app already uses elsewhere), and a plain-word name for the block type.

**Confidence it is a defect: high.** It cannot be verified against a multi-block section — only
Reading was captured — so a second frame from a section with three or four blocks would be worth
having before the fix is judged done.

---

### B3R1-08 — the preview is a card inside an inset inside a card. It reads as a live section, not a picture of one.
**Frames:** all eight `decision-section-*`. This is the question the brief asked first, so here is
the direct answer: **at 393 it just holds; in dark at any width it does not.**

The stack is three surfaces deep and the innermost is the brightest:

- light 393: decision card 247 → Inset 225 → inner card **242**
- dark 393: decision card 39 → Inset 47 → inner card **100**

In light the inner card sits *below* the outer card's value, so it recedes and the preview reads
acceptably as an inset picture. In dark it is +61 against its own ground and the preview stops
being a picture — it is the brightest slab on the screen, and the eye lands there before it lands
on Approve. Fixing B3R1-02 removes most of this, but the structural point stands on its own:

Pack line broken — README Surfaces: "**Inset** (quote, option row): Accent soft, radius 8, no
border." The inset is specified for flat content — a quote, an option row — not as a frame around
another card. And: "The card-to-ground step is deliberately small: one visible layer, **no float**."

Fix: render the preview's blocks flat inside the Inset (rows on the accent-soft ground, hairlines
between) rather than re-instantiating the section's Card. That keeps the "same block components"
promise for content while making the preview read as a picture.

**Confidence: medium-high in light (a craft judgment I would defend), very high in dark (where the
measurement in B3R1-02 makes it unarguable).**

---

### B3R1-09 — "READING" restates "SECTION" in the identical style 40px away, and restates the title's own word.
**Frames:** all eight `decision-section-*`; clearest at 1920.

In a 65px vertical span the card reads:

```
SECTION                      nothing changes until you approve it     ← 11.5 tracked caps, Accent ink
New section: Reading                                                  ← Source Serif 4 500, 15
  READING                                                             ← 11.5 tracked caps, Accent ink
```

Two labels in the same token, doing different jobs (one names the card's type, one names the
previewed section), and the second repeats a word the title said one line earlier. Nothing tells
the reader which label belongs to which frame.

Pack line broken — README Components, Section label: it is a **column** label ("11.5px tracked caps
in Accent ink"). Reusing it inside a card body for a nested object collapses the distinction
between "this card is of type Section" and "this preview is of the Reading section".

Fix: drop the preview's label (the card title already says "Reading"), or demote it to Muted small
so the card's own type label keeps the Accent-ink caps role alone.

**Confidence: medium-high.** It follows from the preview reusing real section components, so it may
have been accepted as the cost of reuse; I do not think it should be.

---

### B3R1-10 — "Revert to the EA's" ends on a dangling possessive.
**Frames:** all eight `life-config-*`.

The secondary button reads "Revert to the EA's" — the EA's *what*? It reads as clipped text, and a
reviewer's first instinct is to check whether the label is truncated. It is not; that is the whole
string.

Two lesser things in the same row: the primary "Save" is visibly **narrower** than the secondary
next to it (66px vs 175px at 1366), which inverts the emphasis the pack asks for ("primary (flex
1.3) · Revise · Later"); and the pair sits hard against the bottom of the sheet.

Pack line broken — README Content: "Voice: a capable assistant speaking to one person. Short
sentences. **Plain words.**"

Fix: "Revert to the EA's version" — or, matching the fixed verb vocabulary, just "Revert". And give
the primary at least the secondary's width.

**Confidence: high** on the copy; **medium** on the button widths (a dialog's verb row is not
specified in the pack, only the decision card's).

---

### B3R1-11 — the Health ghost card gained 6px of height, shifting everything below it down 6px.
**Frames:** all eight `life-*`.

Measured on `life-1366-light.png`, HEAD vs now:

| | HEAD | now |
|---|---|---|
| HEALTH label ink | 112–123 | 112–123 (unchanged) |
| ghost top dashed border | 132 | 132 (unchanged) |
| ghost first text line ink | 144 | **147** (+3) |
| ghost bottom dashed border | 196 | **202** (+6) |
| LEARNING label ink | 205–220 | **211–226** (+6) |
| Learning card top | 229 | **235** (+6) |

Same at 393 (ghost bottom 979 → 985, LEARNING 992 → 998; the page grew 1257 → 1263). Horizontal
padding moved with it: ghost text left ink 30 → 33, and the ghost's copy re-wraps
("…results, scripts and / a brief…" became "…results, scripts / and a brief…").

So the ghost's inner padding went from ~10 to ~13.

I am reporting this because the brief said nothing was supposed to move, and it did. But **the new
value is the right one**: README Surfaces says "Card: … **Padding 12**", so the bespoke Health
ghost was the deviation and the generic renderer corrected it. Its outer box, width, dash colour
and radius are unchanged, and the dashes are intact in both light and dark.

Fix: probably none — accept it and note it. If exact parity with HEAD is required, the ghost block
needs the old 10px padding restored, which would be restoring a deviation.

**Confidence it changed: certain. Confidence it is a defect: low** — I would leave it.

---

### B3R1-12 — the Arrange frames do not show the change B-3 made to Arrange.
**Frames:** `arrange-1024-*`, `arrange-1366-*`, `arrange-1920-*` — all six.

Every Arrange frame is captured as **"Arrange · Today"**, listing Today's sections (Needs you, From
your EA, All calendars, Calendar, Your tasks, At a glance, Close the day) and then the App group
(Focus row, Tasks, Brain, Life, Agents). Configured sections live on **Life**. The claim under
review — "Arrange now lists configured sections alongside component ones" — cannot be seen in any
frame.

Confirmed by pixels, not just by reading the title: `arrange-1366-light.png` differs from HEAD by
1,880 pixels, all of them in the rail wordmark band (y 24–62) and the rail-bottom band (y 943–953,
i.e. B3R1-04's watermark). **The Arrange row list is byte-identical to the pre-refactor build.**

Fix: capture `arrange` from the Life tab (or add `arrange-life-*` to the frame set) so round 2 has
something to review.

**Confidence it is an evidence gap: certain. Confidence the underlying feature is broken: none —
I cannot tell, which is the point.**

---

### B3R1-13 — Arrange's sheet has the same under-opaque surface as the config dialog (pre-existing).
**Frames:** all six `arrange-*`.

`arrange-1366-light.png` sampled inside its sheet at (700, 300): **221**. `settings-1366-light.png`
at the same point: **251**. The Today page reads through the Arrange sheet clearly — at 1366 the
calendar list rows, the At-a-glance card, the habit chips and the decision card's text are all
legible through it.

Same root cause as B3R1-01. Listed separately because Arrange is **unchanged from HEAD** — this
is not a B-3 regression, and fixing B3R1-01 at the shared surface should fix it for free.

Also observed and **cleared** on these frames, after measuring rather than trusting my eye:
- the first row's ↑ *is* disabled (glyph (178,176,171) vs (126,123,116) on enabled rows), and the
  last row's ↓ likewise. I thought it wasn't; it is.
- the switches are accent-soft track + accent-ink knob, which is `DISCREPANCIES.md` row 8's winner.
  Correct, not a saturated fill.

**Confidence: high** on the measurement; low priority because it is out of this delta.

---

### B3R1-14 — the section card's top-right slot carries no expiry, only a restatement of the silence rule.
**Frames:** all eight `decision-section-*`.

The label row's right slot reads "nothing changes until you approve it". The why-line two rows
below reads "… · your EA · **silence leaves the tab as it is** · undo 10s". Those are the same
statement in different words, and the slot the pack reserves for the expiry has no time in it.
Every other decision card in the set says "expires Thursday 5pm · then proposes 1".

Pack line broken — README Content: "Expiry is stated as a time and a consequence: `expires Wed 5pm
· then proposes 1`", and Principles 7: "Every card states the source, the **expiry** and what
happens on silence."

**Confidence: medium.** A section proposal may genuinely never expire, in which case the honest
thing is what is there — but then the slot duplicates the why-line and one of the two should go.
Flagging so it is a decision rather than an oversight.

---

### B3R1-15 — copy: "goes on life, column 3" lowercases a tab name.
**Frames:** all eight `decision-section-*`.

Everywhere else the app writes **Life** (rail item, tab bar, Arrange's App group). README Content:
"Sentence case everywhere except section labels (tracked caps) and **proper nouns**."

**Confidence: medium-low.** Trivial, but it is in the one new card state and costs a word to fix.

---

## Checked and found fine — no defect

Recording these so round 2 does not re-open them.

- **Life's columns.** `life-1024-*`: two columns, column 3 (Health, Learning) stacked directly
  under column 1 (Goals, Habits), column 2 (People, Money) spanning both rows, **no empty row**.
  Matches README Layout exactly. 1366/1920 are rail + three columns.
- **The Life refactor is otherwise pixel-clean.** Goals and Habits (still components) are identical
  to HEAD. People's four rows and Money's four bars — track widths, fill widths, over-budget alert
  on Family, label column, amounts — are **pixel-identical** to HEAD at every width and both
  schemes. The only two deltas in the whole tab are B3R1-03 and B3R1-11.
- **The footer move (DISCREPANCIES row 16) is correct and, to answer the question directly, better
  at 1366 and 1920.** It now sits at the page's left content edge (x=233 at 1366, x=228 at 1920)
  under all the columns, where a sentence about the tab belongs, instead of being wedged under
  column 3 and wrapped to two lines. One caveat, not a defect: at 1920 it hangs 86px below the
  bottom of column 1 and 20px below column 2's last line, so it floats rather than closing the
  page. If a later row touches it, tying it to a consistent offset from the tallest column would
  finish the thought.
- **Light/dark parity.** All 38 frames: light and dark page sizes are identical to the pixel — no
  reflow, no column-count change, nothing appearing or disappearing. Dark grounds are warm
  (19,18,15), not black.
- **Card height family.** At 393 the open decision card measures 272px (Clash, `today-393-light`),
  277px (Bill, `decision-bill-393-light`) and 309px (Section). The section card is the tallest but
  by 12–14%, not enough to call it out on its own. Answering the brief's second question: the card
  is **not too tall**; the preview's problem is loudness (B3R1-02, B3R1-08) and internal rhythm
  (B3R1-05), not height. Once the preview stops out-glowing everything, the verbs read as the point.
- **The verb row.** Approve · Revise · Later · ··· fit on one line at 393 with no wrap, no
  ellipsis, no two-line label. Approve carries the accent-soft fill and accent-ink text; the other
  two are outlined; the ··· is a 36px outlined icon button. All per spec.
- **`SECTION` fits the waiting-row label column.** The word measures 50px at 11.5 tracked caps and
  the app's label column is 60px (title ink starts at x=302, labels at x=242 on
  `today-1366-light`). No clipping risk. Worth noting though: **no frame shows a SECTION card as a
  waiting row.** `today-*` carries {CLASH, EMAIL, BILL, CLASH, REPORT} and `decision-section-*`
  carries {SECTION, CLASH, EMAIL, BILL, CLASH} — the section proposal substitutes for the report
  rather than joining the queue, so its collapsed state is unphotographed.
- **The RACQ line's accent ink.** Preserved exactly: (77,97,114), b−r = +37, in both HEAD and now.
- **The Health ghost's dashes.** Same colour, same radius, same outer box, present in dark.
- **`arrange-393-*` absent.** Correct — Arrange is a desktop-only control per `handoff.md`.

## One I could not settle from the pixels

At **1024** the config dialog and the Arrange sheet are centred in the **document**, not the
viewport: `life-config-1024-light.png` page height 1487, sheet at y 603–884 — exactly
(1487−281)/2; `arrange-1024-light.png` page height 1450, sheet at y 332–1117 — exactly
(1450−785)/2. `settings-1024-light.png` starts at y=81. On a real 1024×768 window a dialog whose
top is at y=603 would be almost entirely below the fold.

I cannot tell from a full-page capture whether this is real or an artifact of how the harness
expands the viewport before shooting — both explanations fit the numbers. **Naming it because I am
unsure, not because I am confident.** Worth thirty seconds in a real 1024×768 window.

---

UX REVIEW: DEFECTS FOUND

---
---

# Round 2

Date: 7 September 2026 · reviewer: ux-reviewer · scope: the same five screens plus `arrange-life`
Truth order applied: brief v2 > mock v11 > design pack 1.3 > older. `demo/v2` was fully re-captured
since round 1 (156 files, 20 screens: 18 × 8 + `arrange` × 6 + `arrange-life` × 6 — the arithmetic
closes, nothing is missing, and `arrange-393` / `arrange-life-393` are correctly absent because
`handoff.md` Shell makes Arrange desktop-only).

Baseline for "did it move?" is still `HEAD` (`f5417e8`, STATE after B-2), which is untouched, so
every "vs HEAD" number below is a pixel measurement against the pre-refactor frames.

**The capture fix is real and it changes the review.** Overlay frames now come back at viewport
size — `life-config` 393×852 / 1024×768 / 1366×900 / 1920×1080, same for `arrange` and
`arrange-life` — instead of a stretched 2300px page. Two consequences, running in opposite
directions:

1. Round 1's **B3R1-01 and B3R1-13 were wrong**, and so was the way I measured them. I compared
   the dialog's *sheet* surface against `settings-*`'s *card* interiors (251) and concluded the
   dialog was 30 levels under-opaque. Sampled properly, at 1366 light: scrim **173** for both,
   Settings' own sheet surface **220** at (700,100) / (400,655) / (250,860), the config dialog
   **218–221** at four points. They are the same surface. At 393 all three of Settings, Emergency
   lock and Configure this section are full-bleed with the page ghosting through the header band —
   that is the app's phone-dialog treatment, not a missing container. I got this wrong and I am
   saying so plainly.
2. The corrected capture **exposes a defect the stretched one hid**: at a real 1024×768 the
   Arrange sheet does not fit, and its last rows and its entire verb row render outside it. See
   B3R2-01. That is the fix earning its keep.

---

## Frames reviewed (44)

| file | screen | width | scheme | verdict |
|---|---|---|---|---|
| decision-section-393-light.png | Today · section card | 393 | light | defects (05, 06, 07) |
| decision-section-393-dark.png | Today · section card | 393 | dark | defects (05, 06, 07) |
| decision-section-1024-light.png | Today · section card | 1024 | light | defects (05, 06, 07) |
| decision-section-1024-dark.png | Today · section card | 1024 | dark | defects (05, 06, 07) |
| decision-section-1366-light.png | Today · section card | 1366 | light | defects (05, 06, 07) |
| decision-section-1366-dark.png | Today · section card | 1366 | dark | defects (05, 06, 07) |
| decision-section-1920-light.png | Today · section card | 1920 | light | defects (05, 06, 07) |
| decision-section-1920-dark.png | Today · section card | 1920 | dark | defects (05, 06, 07) |
| life-config-393-light.png | Configure this section | 393 | light | defect (04) |
| life-config-393-dark.png | Configure this section | 393 | dark | defect (04) |
| life-config-1024-light.png | Configure this section | 1024 | light | defects (04, 09) |
| life-config-1024-dark.png | Configure this section | 1024 | dark | defects (04, 09) |
| life-config-1366-light.png | Configure this section | 1366 | light | defects (04, 08) |
| life-config-1366-dark.png | Configure this section | 1366 | dark | defects (04, 08) |
| life-config-1920-light.png | Configure this section | 1920 | light | defects (04, 08, 09) |
| life-config-1920-dark.png | Configure this section | 1920 | dark | defects (04, 08, 09) |
| life-393-light.png | Life | 393 | light | defect (03) |
| life-393-dark.png | Life | 393 | dark | defect (03) |
| life-1024-light.png | Life | 1024 | light | defect (03) |
| life-1024-dark.png | Life | 1024 | dark | defect (03) |
| life-1366-light.png | Life | 1366 | light | defect (03) |
| life-1366-dark.png | Life | 1366 | dark | defect (03) |
| life-1920-light.png | Life | 1920 | light | defect (03) |
| life-1920-dark.png | Life | 1920 | dark | defect (03) |
| arrange-1024-light.png | Arrange · Today | 1024 | light | **defect (01)**, 08, 09 |
| arrange-1024-dark.png | Arrange · Today | 1024 | dark | **defect (01)**, 08, 09 |
| arrange-1366-light.png | Arrange · Today | 1366 | light | defect (08) |
| arrange-1366-dark.png | Arrange · Today | 1366 | dark | defect (08) |
| arrange-1920-light.png | Arrange · Today | 1920 | light | defects (08, 09) |
| arrange-1920-dark.png | Arrange · Today | 1920 | dark | defects (08, 09) |
| arrange-life-1024-light.png | Arrange · Life | 1024 | light | **defect (01)**, 08, 09 |
| arrange-life-1024-dark.png | Arrange · Life | 1024 | dark | **defect (01)**, 08, 09 |
| arrange-life-1366-light.png | Arrange · Life | 1366 | light | defect (08) |
| arrange-life-1366-dark.png | Arrange · Life | 1366 | dark | defect (08) |
| arrange-life-1920-light.png | Arrange · Life | 1920 | light | defects (08, 09) |
| arrange-life-1920-dark.png | Arrange · Life | 1920 | dark | defects (08, 09) |
| today-393-light.png | Today | 393 | light | clean |
| today-393-dark.png | Today | 393 | dark | clean |
| today-1024-light.png | Today | 1024 | light | defect (02) |
| today-1024-dark.png | Today | 1024 | dark | defect (02) |
| today-1366-light.png | Today | 1366 | light | defect (02) |
| today-1366-dark.png | Today | 1366 | dark | defect (02) |
| today-1920-light.png | Today | 1920 | light | defect (02) |
| today-1920-dark.png | Today | 1920 | dark | defect (02) |

Light/dark page sizes are identical to the pixel on all 22 pairs — no reflow, no column-count
change, nothing appearing or disappearing.

---

## Round-1 defects — status

### B3R1-01 — dialog surface / no container at 393 · **WAS NOT A DEFECT**

Measured against the right control this round (see the note above): the dialog's sheet is the
app's sheet, at 1366 to the level (**220** vs Settings' **220**, both over a **173** scrim), and at
393 it is the same full-bleed treatment Settings and Emergency lock use. The dialogs are also now
correctly centred in the **viewport** — `life-config-1024` sheet y 212–556 in a 768 viewport, 1366
y 278–622 in 900, 1920 y 368–712 in 1080 — so the "centred in the document" worry at the end of
round 1 is likewise **WAS NOT A DEFECT**: it was the harness, exactly as diagnosed.

The one true half of B3R1-01 survives, narrowed: the page is still legible **inside the Title
input**, because the input has no fill of its own. Re-filed as **B3R2-04**.

### B3R1-02 — dark preview card 2.5× too bright, meta at 1.65:1 · **FIXED**

The inner card is gone. `decision-section-1366-dark` scanned at x=620: card **(43,42,39)**, then a
single unbroken Inset **(60,62,63)** from y=214 to y=361 with one 1px hairline at y=277. The token
predicts `rgba(154,174,192,.16)` over (43,42,39) = (61,63,64) — exact. Light is (227,229,229)
against a predicted (227,229,229) — also exact. Row meta on that surface now renders at **2.99:1**
where it was 1.65:1. Residual raised as B3R2-05.

### B3R1-03 — Money's footer escaped its card · **FIXED**

`life-1366-light` vs HEAD: the RACQ line sits inside the Money card again, and the Money card's
bottom border does not appear in the diff at all — i.e. it is at the same y in both. The whole Life
tab diffs against HEAD in only four places: column 3 (B3R2-03 plus B3R1-11's accepted padding), the
tab footer's sanctioned move (DISCREPANCIES row 16), the rail-bottom band, and text that changed
because the fixture is date-relative ("birthday Saturday"→"Wednesday", "due 14 Sep"→"15 Sep", "due
20 Sep"→"21 Sep"). **People, Goals and Habits are transition-for-transition identical to HEAD.**
Money's four bars are at identical x extents; the only change is the fill colour, (110,127,143) →
**(102,121,138)**, which is exactly `#66798A`, the pack's Accent — the refactor moved it *onto* the
token. Recorded, not a defect.

### B3R1-04 — watermark over the rail's health line · **PARTLY FIXED**

The 40px lift works on `life-*`, `decision-section-*`, `life-config-*` and `arrange-life-*`: at
1366 the two bands are now 841–850 and 876–885 (`life`), 903–912 and 938–947 (`decision-section`).
It does **not** work on `today-*`. All six desktop `today` frames, both schemes, still print the two
lines on top of each other — one merged ink band at 938–952 (1366), 1426–1440 (1024), 1056–1070
(1920). A 4× crop is unambiguous: "needs attention · $0.42" and "Demo · fixture data · nothing
sends" are superimposed and both illegible. `arrange-*` shows the same un-lifted position (881–890
against `arrange-life`'s 841–850), where it lands on the scrim-dimmed health line. And the
watermark still paints **above** the modal scrim on every overlay frame — on `life-config-1366-*`
and `arrange-life-1366-*` it is the only ink in the rail band, because the health line is dimmed
and it is not. Carried forward as **B3R2-02**.

### B3R1-05 — caption glued to the thing above it · **FIXED**

`decision-section-1366-light`: row-2 meta ink ends 321, caption ink starts **342** (was 3px), and
caption ink ends 351 with the inset floor at 361 (**10**). Loose above, tight to its own padding
below — the rhythm is the right way round now. A residual reading problem remains (B3R2-06).

### B3R1-06 — Title label and field at opposite ends of the sheet · **FIXED**

Label above, field full width, at every width and both schemes.

### B3R1-07 — the block list read as helper text · **FIXED**

"WHAT IT SHOWS" in 11.5 tracked caps Accent ink, then an opaque ListCard (**251** light,
**(56,55,51)** dark) with the block described in words: "A list · What you're reading and
watching". The `rows` token is gone. Round 1's caveat stands and could not be closed: only the
single-block Reading section is captured, so multi-row behaviour is still unphotographed.

### B3R1-08 — a card in an inset in a card · **FIXED**

Three surfaces became two. The preview is flat rows on the accent-soft inset with one hairline
between them, and it now reads as a picture of a section rather than a live one. In dark it is no
longer the brightest slab on the screen; the eye lands on Approve. This was the brief's first
question and the answer is now yes.

### B3R1-09 — "READING" restating "SECTION" · **FIXED**

The preview's own Label is gone. One tracked-caps Accent-ink label per card.

### B3R1-10 — "Revert to the EA's" · **WAS NOT A DEFECT** (see "the three you left", below)

### B3R1-11 — the Health ghost's padding · **WAS NOT A DEFECT** (I said leave it; leaving it was right)

But the ghost's **outer** top margin has moved since round 1, which is new — B3R2-03.

### B3R1-12 — the Arrange frames didn't show the change · **FIXED**

`arrange-life-*` exists at all three desktop widths and both schemes, and it answers the question:
Goals, Habits (components) and People, Money, Health, Learning (config records) render as six rows
of one list, **indistinguishable** — same row height, same ↑/↓ pair, same switch, no badge, no tag,
nothing marking which two are code and which four are records. The first row's ↑ and the last
row's ↓ are correctly disabled. That is what the row claimed, and it is now visible.

### B3R1-13 — Arrange's sheet under-opaque · **WAS NOT A DEFECT**

Same mis-measurement as B3R1-01. `arrange-1366-light` inside the sheet is 220–221 against a 173
scrim — the app's sheet. The real Arrange defect is B3R2-01, which round 1 could not see.

### B3R1-14 — no expiry in the top-right slot · **FIXED, with an evidence gap**

The card now reads "expires Thursday · then it goes away". Two notes: the string carries no time of
day where every other expiry on the same screen does (B3R2-07); and **the waiting-row short form is
still unphotographed** — the `shortExpiry` split I was asked to check cannot be checked, because no
frame in `demo/v2` shows a SECTION card as a waiting row. `today-*` carries {CLASH, EMAIL, BILL,
CLASH, REPORT} and `decision-section-*` carries {SECTION, CLASH, EMAIL, BILL, CLASH} — in both
fixtures the section proposal substitutes for the report instead of joining the queue. The four
rows that *are* photographed are healthy at every width: fixed label column, title present and
ellipsised, expiry and verb intact, nothing squeezed to zero. But I cannot verify the row the fix
was written for. This is the same gap round 1 named; a `today` fixture with six items would close
it.

### B3R1-15 — "goes on life" lowercased a tab name · **FIXED**

"goes on Life, column 3 · reads /learning".

---

## New defects, ranked

### B3R2-01 — at 1024 the Arrange sheet overflows the viewport: its last rows and its whole verb row render *outside* the sheet, on the scrim.

**Frames:** `arrange-1024-light/dark`, `arrange-life-1024-light/dark` (four).

`arrange-1024-light`: the sheet occupies y 57–712 (measured at x=512 against the 170.7 scrim). The
"Life" row's hairline and label are cut in half by the sheet's own rounded bottom border, and the
"Agents" row — label and switch — sits entirely below it, printed over the scrimmed Today page,
with a calendar card legible behind the word "Agents". "Revert to yesterday" and "Done" render at y
747–767, 35px below the sheet's floor, on bare scrim. `arrange-life-1024-*` is the same with one
row less spill: sheet ends at 712, the Agents switch straddles the border, the verb row is outside.

1366 (sheet 68–832) and 1920 (154–925) fit; 1024's 768px viewport does not, and nothing scrolls —
`settings-1024-light`'s sheet is 31–737 and scrolls internally, so the app already owns the pattern
this sheet is missing.

Pack line broken — README Surfaces: "Card: … radius 10 … The card-to-ground step is deliberately
small: **one visible layer**"; `handoff.md` Settings: "scrim … + one frosted **sheet** … click the
scrim or close to dismiss". A dialog whose primary verb is painted on the scrim outside the dialog
is not one layer, and "Done" does not look clickable where it is. It is also the plainest breach of
checklist rule 5 (clipping) and rule 7 (1024 must read as a tablet).

Fix: give the Arrange sheet a max-height (viewport minus page padding) with the row list scrolling
inside it and the verb row pinned, as the Settings sheet already does.

**Confidence: very high.** Very likely pre-existing rather than a B-3 regression — B-3 did not
touch the sheet's layout, and round 1 proved the row list byte-identical to HEAD — but it is
present in the delivered frames and it is the worst thing in the set.

---

### B3R2-02 — B3R1-04 is not fixed on `today`: the watermark is still printed on top of the rail's health line.

**Frames:** `today-1024/1366/1920 × light/dark` (six). Also un-lifted, though not visibly
colliding, on `arrange-1024/1366/1920 × light/dark`.

Numbers in the B3R1-04 entry above. On `decision-section-1366` — the *same* tab, the *same* 962px
page height, the same viewport — the watermark sits at 903–912 and the health line at 938–947, so
whatever the lift is keyed to, it is neither the page nor the tab, and `today` misses it.

Pack line broken — `handoff.md` Shell: "Health line at the bottom: 6px ok dot + 'all healthy ·
$4.20' in 11px muted." Two texts occupying the same 15px band is a collision, not a health line.

Fix: make the watermark resolve to the same position on `today` as on `decision-section`; and give
it a stacking context under the scrim so it dims with the rest of the rail when a dialog is open.

**Confidence: very high.**

---

### B3R2-03 — Health's section gained 8px of top margin. Its label now sits nearly twice as far from its card as every other section on the page.

**Frames:** all eight `life-*`. **New since round 1** — round 1 measured the ghost's top border
unchanged at 132 and said so explicitly.

`life-1366-light`, HEALTH label ink 113–120:

| | HEAD | round 1 | now |
|---|---|---|---|
| ghost top dashed border | 132 | 132 | **140** |
| label-ink-bottom → ghost top | 12 | 12 | **20** |
| ghost bottom border | 196 | 202 | **210** |
| LEARNING label ink | 208–216 | 211–226 | **222–230** |
| Learning card top | 229 | 235 | **243** |

The other sections on the same page are unchanged at 11–13: GOALS 121→132, PEOPLE 121→132, LEARNING
230→243. So HEALTH alone is 7–8px looser, and it is visible — side by side against HEAD the label
unmistakably floats away from its ghost. Confirmed at every width: ghost top 1024 478→**486**, 1920
132→**140**, 393 915→**923**, +8 in each. Page heights grew with it (393 1257→1271, 1024 768→775).

Pack line broken — README Spacing: "Between a section label and its card: **8**." One section
cannot use a different value from the five beside it.

Fix: whatever the surfaces-out-of-blocks move added above the ghost's group, take it back off. The
ghost's own 12px inner padding (B3R1-11) is correct and should stay.

**Confidence it changed: certain (measured at four widths). Confidence it is a defect: high** —
this is precisely the "did anything move?" that the refactor was supposed to answer no to.

---

### B3R2-04 — the config dialog's Title input has no fill, so the page behind it is legible inside it.

**Frames:** all eight `life-config-*`. The surviving half of B3R1-01.

`life-config-1366-dark`, four samples: sheet body (39,37,34), sheet header (40,38,35), **Title field
interior (40,38,34) and (40,38,35)** — identical to the sheet, i.e. no fill — against the blocks
ListCard at **(56,55,51)**. Light tells the same story: field 215–221 (varying, because page content
is showing through it), ListCard a flat 251. At 1366 a card edge and a filled rectangle from the
page read straight through the field beside the word "Reading"; at 1920 the field's right third is
visibly a different colour from its left; at 393 ghost text sits next to the value.

The app's `Field` is transparent everywhere (Today's "How was today?" journal box measures 247 —
identical to the card it sits on), which is invisible on an opaque card and conspicuous on a
translucent sheet. Two rows apart in the same dialog, one control is opaque and the other is a
window.

Pack line broken — README Surfaces: "Card: Card colour, blur 20px, 1px Card-border"; and Components,
Settings sheet: "section label above each **card**" — the sheet's content sits on surfaces, not on
the scrim.

Fix: give the field the Card fill (the blocks ListCard two rows below already has it), or wrap the
form rows in one card the way the Emergency lock dialog wraps its four rows.

**Confidence: high.**

---

### B3R2-05 — the preview puts three lines of 10.5 Muted on an Inset, the one surface the pack rules out for it.

**Frames:** all eight `decision-section-*`.

Rendered peak-ink contrast, `decision-section-1366`:

| line | on | light | dark |
|---|---|---|---|
| row meta ("summary ready · resurfaces in the review") | Inset | **2.95:1** | **2.99:1** |
| caption ("goes on Life, column 3 · reads /learning") | Inset | **3.06:1** | **3.06:1** |
| why-line, same size and colour, same card | Card | 3.56:1 | 4.02:1 |

Pack line broken — README Accessibility: "**Keep meta text at 10.5 only in Muted on Card or
Ground.**" Also "Muted on Card 4.6:1", which nothing in the app quite reaches as rendered — so read
this as the relative finding it is: the accent-soft ground makes the app's smallest type 15–25%
worse than it is anywhere else, on the card whose whole job is to be read before it is approved.

To be fair to the fix: dark went from **1.65:1** to 2.99:1, a large improvement, and flattening the
preview was the right call. This is the price of it, and it should be a decision rather than an
accident.

Fix: lift the two row-meta lines to Ink on the inset, or render the preview's rows on a Card surface
*instead of* an inset rather than inside one.

**Confidence: high on the numbers, medium on the severity** — it is a real accessibility line, and
it is also the smallest, least load-bearing text on the card.

---

### B3R2-06 — the preview's caption is styled exactly like row meta and sits inside the preview, so it reads as a third row that lost its title.

**Frames:** all eight `decision-section-*`.

Inside the inset, in this order: "Garry Tan · new rules for founders" (12.5 Ink) / "notes filed ·
Learning" (10.5 Muted) / 21px / "goes on Life, column 3 · reads /learning" (10.5 Muted). Same size,
same colour, same left indent, no rule between, and the 21px break is the same size as the break
between the hairline and the row title above it. The caption describes *where the section will go*;
the two lines above it are the section's *contents*. Nothing distinguishes them.

Pack line broken — README Principles 4: "Small type, **clear hierarchy**. Three levels: title, body,
meta"; and Components, Inset: "(quote, option row)" — one voice per inset.

Fix: move the caption out of the inset (it is a statement about the preview, not part of it), or
give it a hairline above and a different colour.

**Confidence: medium.** This is the "better still" half of round 1's B3R1-05 that was not taken. The
measured rhythm defect is genuinely fixed; this is a reading judgment. I would defend it, but I
would not block on it alone.

---

### B3R2-07 — "expires Thursday" is the only expiry in the app without a time.

**Frames:** all eight `decision-section-*`.

The same column, three rows below, reads "expires Thursday 5pm", "expires Fri 5pm", "expires Sat
7am", "expires 19 Sep". The section card reads "expires Thursday".

Pack line broken — README Content: "Expiry is stated as **a time** and a consequence: `expires Wed
5pm · then proposes 1`."

Fix: "expires Thursday 5pm · then it goes away", which also gives `shortExpiry` the same shape as
every other row's.

**Confidence: medium-high.** Trivial to fix, and it is in the string this round introduced.

---

### B3R2-08 — three dialogs, three different verb-row grammars.

**Frames:** `life-config-*` (eight), `arrange-*` and `arrange-life-*` (twelve); `emergency-confirm-*`
as the control.

- Emergency lock: primary first, and **wider** than the secondary ("Lock everything now" · "Cancel").
- Configure this section: primary first, and **2.6× narrower** — Save x 249–294 (46px), Revert to the
  EA's x 302–420 (119px) at 1366.
- Arrange: primary **last** and narrower — "Revert to yesterday" (133px) then "Done" (55px).

A person cannot learn where the affirmative button is, or what it looks like.

Pack line broken — README Components and the decision card's verb row: "primary (flex 1.3, Accent
soft fill, Accent ink text) · Revise (outlined) · Later (outlined)". The pack governs only the
decision card's row, which is why round 1 rated the width half "medium" — but it states the intent,
and the app contradicts it twice in three dialogs.

Fix: one rule — primary first, at least the secondary's width — applied to all three.

**Confidence: medium.** The pack does not specify dialog verb rows, so this is a consistency
argument rather than a conformance one, and two of the three dialogs are outside the B-3 delta.

---

### B3R2-09 — the config and Arrange sheets use a different width rule from Settings, and exceed the pack's max at 1920.

**Frames:** `life-config-1024/1920-*`, `arrange-1024/1920-*`, `arrange-life-1024/1920-*`.

Measured sheet widths: Settings **900** at 1024, 1366 and 1920 (x 62–961, 233–1132, 510–1409).
Config/Arrange: **676** at 1024, **902** at 1366, **1000** at 1920 — i.e. `min(66%, 1000)`, not
`min(100%, 900)`. So the same kind of sheet is 224px narrower than Settings on a tablet and 100px
wider than the pack's ceiling on a 1920 monitor.

Pack line broken — `handoff.md` Settings: "scrim … **sheet max-width 900**".

**Confidence: high on the measurement, low on the priority.** Pre-existing and shared with Arrange.
Worth one line either way — a fix, or a `DISCREPANCIES.md` row saying the two sheet families are
deliberate.

---

## The three you left — my view

**B3R1-10, "Revert to the EA's" and Save's width — you were right, and it needs a row.**
I checked the provenance rather than re-asserting round 1. The string is mock v11's own
(`jstack-mock-v11.html` line 612: `Revert to the EA’s`) and 02_ACCEPTANCE_TESTS_v2.md's LF-09
wording. Under ADR-11's truth order (brief > mock v11 > pack), the mock beats my README-Content
reading, exactly as it did for `<b>` in memory proposals (DISCREPANCIES row 6) and the 40 × 24
switch (row 8). **I withdraw it as a defect.** Not restyling a shared dialog at the close of a ★ row
was the right call. What it still needs is the same treatment those two got: a `DISCREPANCIES.md`
row recording that the mock won on the copy, so the auditor and the next reviewer do not re-find it.
Silence is the only part of this I would change. The width half I have re-filed at lower severity as
B3R2-08, because it is a three-dialog consistency problem, not this row's.

**B3R1-11, the Health ghost's padding — you were right to leave it.**
The ghost's inner padding is now 12 (border-to-ink 16, less the ~4px line-box lead), which is README
Surfaces' "Padding 12". The bespoke component was the deviation; the generic renderer corrected it.
Leave it. What did *not* stay put is the ghost's outer margin, and that is B3R2-03 — a different
measurement and a genuine regression, so do not read this "you were right" as covering it.

**The 1920 Life footer — you were right, and my round-1 note overstated it.**
Re-measured on the corrected frames: at 1920 the footer ink sits at y 501 against Money's card
bottom at 487, i.e. **14px below the tallest column**; at 1366 it is 514 against 499, **15px**. It is
attached to the page, not floating. My "hangs 86px below column 1" was true but measured from the
wrong column — the footer's job is to close the page, and it does. No change needed.

---

## Checked and found fine — no defect

- **The Life refactor's blast radius is clean.** Goals, Habits and People are transition-identical to
  HEAD at every width; Money's four bars are at identical x extents with the fill moved onto the
  exact `#66798A` token; Learning's two rows and hairline are unchanged. The only two column-3
  deltas are B3R2-03 and the accepted B3R1-11.
- **Columns.** `life-1024-*` and `decision-section-1024-*`: two columns, column 3 stacked directly
  under column 1, column 2 spanning both rows, no empty row. 1366/1920 are rail + three columns; at
  1920 Life's column 3 ends at x=1733 = 200 rail + 32 padding + 1500, so max-width 1500 left-aligned
  is honoured.
- **The section card is not too tall, and its verb row is intact.** Approve · Revise · Later · ··· on
  one line at 393, no wrap, no ellipsis, no two-line label; Approve accent-soft with accent-ink text,
  the other two outlined, ··· a 36px outlined icon button.
- **The preview is a faithful picture.** Its two rows match the Life tab's Learning card row for row,
  including the hairline — the "same block components" promise survived the flattening.
- **Dialog furniture.** All overlays centred in the viewport at every width; 32px close button
  top-right; hairline under the title; scrim 173 (light) / 25 (dark), identical to Settings'.
- **`arrange-life` row controls.** First row's ↑ and last row's ↓ are disabled; switches are
  accent-soft track + accent-ink knob, which is DISCREPANCIES row 8's winner.
- **Waiting rows on `today-*`.** The fixed 48px label column holds with REPORT in it; titles present
  and ellipsised per `handoff.md`; expiry and verb intact at 393. Nothing squeezed.
- **Dark grounds** are warm (19,18,15) / (24,23,20), painted edge to edge including under the tab bar
  and behind the safe area at 393.
- **Frame inventory.** 156 files = 18 screens × 8 + arrange × 6 + arrange-life × 6. Nothing missing,
  nothing blank, nothing showing the gate.

---

UX REVIEW: DEFECTS FOUND
