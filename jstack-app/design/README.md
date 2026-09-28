# JSTACK design guide

Version 1.3 · 4 September 2026 · owner Josh Old
Applies to the JSTACK app (web, iPhone via Safari, iPad, desktop PC). Source of truth for look, layout and copy.

Reference build: `../JSTACK V2.dc.html` (open it, resize the window, toggle the theme). When this guide and the build disagree, the build wins; file a fix for the guide.

## What JSTACK is

One place to see life and work, decide what only the owner can decide, and check and teach the agents that run the rest. Five tabs: Today, Tasks, Brain, Life, Agents. A focus switcher (Everything, Personal, Family, Work) scopes every tab.

The owner has ADHD and uses the app across a phone, an iPad and a 34-inch monitor. Everything below follows from that.

## Principles

1. One thing at a time. The first decision is open; the rest wait as single rows. Answering one opens the next.
2. Say when the list ends. "That's all until 4pm." Blank space after it is correct, not a gap to fill.
3. Colour means you can act. The steel accent marks verbs, labels, the recommended option and the current tab. Nothing decorative gets colour.
4. Small type, clear hierarchy. Body 12.5px. Three levels: title, body, meta. Weight 500 for the one thing that matters; never bold everywhere.
5. Calm surfaces. Frosted cards on a warm stone ground. Tight 10px corners. One soft shadow. No gradients you can see.
6. Personable, not soft. Warm neutrals, a serif for headings, plain words. No flowers, no black-and-white severity.
7. Show the work. Every card states the source, the expiry and what happens on silence. Every tap has a ten-second undo.

## Content

Voice: a capable assistant speaking to one person. Short sentences. Plain words. Present tense. Say what happened and what happens next.

- Second person, direct: "Needs you", "Your tasks", "Go with 1".
- No exclamation marks, no emoji, no filler ("Great news!", "Just a heads-up").
- Numbers over adjectives: "3 of 5 today", not "a few items".
- Sentence case everywhere except section labels (tracked caps) and proper nouns.
- Verbs are the five fixed words: Approve · Revise · Later · Never · Teach. The primary may be specific: "Go with 1", "Open NAB", "Block it".
- Meta lines use a middle dot with spaces: `JSTACK · today · high`.
- Provenance reads as a sentence fragment: `both calendars · Alex, 7:02am · silence proposes 1`.
- Expiry is stated as a time and a consequence: `expires Wed 5pm · then proposes 1`.
- End-of-list lines are calm statements: "That's all until 4pm. Two more return then." / "Nothing needs you. Two more return at 4pm."
- Times: 24-hour in lists (`15:00`), spoken form in prose (`2:00pm`). Dates: `4 September`, `19 Sep` in tight spaces.
- Currency: `$1,184.20`, `$61 of $200`.

## Colour

Warm stone neutrals, tinted charcoal ink, one steel-blue accent. Semantic colours are the only other hues. Values in `tokens/colors.css`; JSON in `tokens.json`.

Light
- Ground `#EDEBE5`
- Card `rgba(255,255,255,.58)` + blur 20px, border `rgba(255,255,255,.7)`
- Bar (tab bar, listening bar) `rgba(255,255,255,.72)` + blur 24px
- Hairline `rgba(43,42,38,.08)`
- Ink `#2B2A26` · Muted `#7A776F`
- Accent `#66798A` · Accent soft `rgba(102,121,138,.14)` · Accent ink `#4A5E70`
- Marker `#4F7FA8` (count badges, mic while listening; the only saturated colour)
- OK `#4F8A6B` · Alert `#B0553F`
- Selected-ink `#2B2A26` on `#F4F3EE` (undo toast only)

Dark (warm tinted, not black)
- Ground `#191815`
- Card `rgba(255,255,255,.08)`, border `rgba(255,255,255,.1)`; bar `rgba(40,38,34,.9)`
- Hairline `rgba(255,255,255,.08)`
- Ink `#ECE9E2` · Muted `#93908A`
- Accent `#9AAEC0` · Accent soft `rgba(154,174,192,.16)` · Accent ink `#B7C8D8`
- Marker `#7FA9CF` · OK `#7DBF9C` · Alert `#D9785E`

Where colour goes
- Accent ink: section labels, primary-verb text, links, expiry text, recommended option number, active tab, provenance links.
- Accent soft: primary-verb fill, selected focus chip, recommended option row, owner tags (EA, J), rail active pill background comes from Card not accent.
- Marker: count badge next to a section label; mic orb while listening. Nowhere else.
- OK: the health dot, good runs in the agent feed.
- Alert: needs-eyes items, over-budget bars, the emergency lock. Never for expiry.
- Everything else is Ink, Muted, Card, Hairline.

Never: the v1.2 greens, gradients above 3.5% alpha, per-category colours (habits, calendars, budgets all use Accent), red or amber for expiry, pure black or white surfaces.

## Type

Two families. Load from Google Fonts (`tokens/fonts.css`).

- Body: Instrument Sans. 400 default, 500 emphasis, 600 wordmark only.
- Headings: Source Serif 4, weight 500, upright. No italics anywhere.
- Icons: Material Symbols Rounded, weight 300.

Scale (px / line-height)
- Page title: 32 / 1 desktop, 26 / 1 phone. Source Serif 4 400, letter-spacing -0.01em.
- Page subtitle: 12.5, Muted, on the same baseline as the title.
- Section heading in a sheet (Settings): 26 / 1, Source Serif 4 400.
- Stat number: 18 / 1.15, Source Serif 4 500, with its label at 11.5 Muted.
- Card title: 15 / 1.3, Source Serif 4 500.
- Body: 12.5 / 1.4, Instrument Sans 400.
- Button and chip: 12.5 / 500 (chips 12 / 400, selected 500).
- Section label: 11.5 / 1, uppercase, letter-spacing .08em, Accent ink. Right-hand hint on the same line: 11, Muted, sentence case, no tracking.
- Small: 11 (row hints, "history", "all").
- Meta: 10.5 / 1.4, Muted (sources, times, why-lines).
- Tab label: 10 (phone), 12.5 (rail).
- Badge: 10 white on Marker.

Rules: body never below 10.5px. Weight 500 for a card title, a primary verb, a selected chip, a person's name in People, the answered verb in history. Nothing is 600 except the JSTACK wordmark. No letter-spacing on anything but section labels and the wordmark.

## Surfaces, shape, depth

- Card: Card colour, blur 20px, 1px Card-border, radius 10, shadow `0 8px 22px rgba(60,55,45,.07), 0 1px 3px rgba(60,55,45,.04)` (dark: `0 12px 30px rgba(0,0,0,.45)`). The card-to-ground step is deliberately small: one visible layer, no float. Padding 12. Rows inside separated by 1px Hairline, 9px vertical padding, horizontal padding 12 on the card and 0 on the row.
- Bar (phone tab bar, listening bar): Bar colour, blur 24px, radius 10, same shadow, inset 14px from the screen edges, height 60.
- Inset (quote, option row): Accent soft, radius 8, no border.
- Ghost (a section without a feed): 1px dashed Hairline, radius 10, Muted text.
- Radii: 10 cards, bars, icon buttons · 8 buttons, chips, rows-as-buttons, insets · 5 tags and checkboxes · 50% habits, mic, dots.
- Borders: hairlines only. No 2px borders except none.
- Blur is for frosted surfaces only. Never blur text or images.
- Ground: flat. If a glow is used it stays under 3.5% alpha in one corner.

## Spacing

4px base. Used values: 2, 3, 5, 6, 8, 9, 10, 12, 14, 16, 18, 24, 32.
- Between cards in a column: 8. Between a section label and its card: 8. Between sections: 8 + margin-top 8 on the next label (16 visual).
- Between columns: 18. Between header blocks: 12.
- Between chips or verbs: 6.
- Page padding: 24 top, 32 sides, 80 bottom (desktop); `calc(env(safe-area-inset-top,0px) + 22px)` top, 20 sides, 120 bottom (phone, clears the bar).
- Rail: 200 wide, 12 padding, items 8 × 10, gap 2.

## Layout

- Under 768: one column, floating tab bar, mic orb above it on the right.
- 768 to 1179: rail (200) + two columns.
- 1180 and up: rail + three columns `1.3fr 1fr .95fr`. Content max-width 1500; left-aligned after that.
- Columns flow top to bottom. Column 1 is always the thing that needs the owner. At two columns, column 3 sits directly under column 1 and column 2 spans both rows: sections stack tight, never separated by an empty row. Never lay a single section across columns.
- Header: title and date on one baseline; the delta line sits under the whole row, full width (Today only). Top right: Arrange, Help and Theme on desktop; Settings and Theme on phone. The health line sits at the bottom of the rail on desktop and on its own 11px line under the header on phone.
- Focus chips sit under the header on every tab except Agents.
- Leave the bottom of a column empty when the content ends. Do not stretch cards to match heights.

## Components

Details and CSS in `tokens/components.css`. Names are the class names.

Decision card `.js-card.js-decision`
- Label row: type in section-label style left; expiry and then-what in Accent ink, sentence case, right.
- Title: card title style.
- Options (1-3-1): three rows, number in 10.5px, recommended row filled Accent soft with number in Accent ink; others transparent with number Muted. Tapping a row moves the recommendation and the primary verb label ("Go with 2").
- Why-line: meta style. Sources are links in Accent ink. Ends with the silence rule and "undo 10s".
- Verb row: primary (flex 1.3, Accent soft fill, Accent ink text) · Revise (outlined) · Later (outlined) · ··· 36px icon button. ··· reveals Never and Teach as a second row of outlined buttons.
- Email variant: quote block in Inset style. Bill variant: three-row grid `payee / BSB / ref` with a `copy` link per row.

Waiting row `.js-row`
- Card surface, 9 × 10 × 9 × 12 padding, flex, gap 10. Type label at 48px fixed width so titles align. Title truncates with ellipsis. Expiry short form in Accent ink. Verb as a small primary (6 × 10, 11.5/500). Tapping the title opens the card.

Section label `.js-label`
- 11.5px tracked caps in Accent ink, padding 0 2. Count badge: 16px tall pill, Marker fill, white 10px. Right-hand hint in 11px Muted.

Focus chip `.js-chip`
- 6 × 12, radius 8, 12px. Unselected: Card fill, Card border, Muted text. Selected: Accent soft fill, Accent ink text, 500. Trailing 30px `tune` icon button.

Buttons
- Primary `.js-btn-primary`: Accent soft fill, Accent ink text, 12.5/500, padding 9, radius 8. Never a saturated fill, never white text.
- Outlined `.js-btn`: 1px Hairline, Ink text, same metrics.
- Icon button `.js-iconbtn`: 32 or 36 square, radius 8 or 10, Card fill with Card border (header) or Hairline border (in cards), Muted glyph 17 or 18.
- Small `.js-btn-sm`: 6 × 10, 11.5/500 (row verbs, ok/edit, Draft a nudge).
- Text link: Accent ink, no underline, cursor pointer.

Segmented control `.js-seg` (Tasks views): Hairline fill, 3px padding, radius 9; selected segment Card fill, Ink, 500, shadow `0 1px 3px rgba(60,55,45,.14)`.

Rail `.js-rail`: wordmark 12/600 tracked .16em; items icon 18 + label 12.5; active item Card fill with Card border, Accent ink, icon filled. Find and Settings below a hairline. Health line at the bottom.

Phone tab bar `.js-tabbar`: five equal cells, icon 21 over 10px label, active in Accent ink with icon FILL 1.

Mic
- Idle: 44px circle, Card surface, Accent ink glyph, opacity .8. Phone: fixed right 20, bottom 88. Desktop: fixed right 24, bottom 24.
- Listening: 42px circle, Marker fill, white filled glyph, pulse ring 1.4s. The bar switches to transcript + "listening · tap the mic to stop" + cancel. On desktop a 360px bar appears bottom right.

Undo toast `.js-toast`: Selected-ink fill, 12px text, radius 10, fixed bottom centre (90 on phone, 24 desktop). "Undo" with an 18px ring showing seconds left. Ten seconds, then gone.

Checkbox: 15px, radius 5, 1.5px Muted border; done fills Accent ink. EA-owned tasks use a dashed Accent ink border.

Habit chip: min-height 34, padding 0 11 0 9, radius 8, 11.5px label (up to about 18 characters), 14px round mark on the left. Done: Accent-soft fill, no border, Accent-ink text at 500, mark filled Accent ink with a white check. Not done: transparent fill, 1px Hairline border, Muted text, 1.5px Muted ring. Chips wrap in a 6px-gap row; never circles with abbreviations.

Progress bar: 8px tall, Hairline track, Accent fill. Over budget: Alert at .8.

Spend ring: 56px conic, Accent for spent, Hairline for the rest, Bar-colour centre.

Stat card: 22px serif number over 10.5 Muted label, padding 10 × 12.

Portal tile: Card surface, radius 8, 11.5 name over 10 Muted purpose, centred.

Calendar grid: 24px per hour, 6:00 to 20:00, hour lines every two hours. Events sit at their real time; unbooked time stays visibly empty. Categories are tonal, not hued: Personal = Accent, Work = Accent ink, Family or shared = Muted, all on Accent-soft (own) or Hairline (shared) fills. Now is a 1px Accent-ink line.

Settings sheet: scrim + one frosted sheet, section label above each card, rows 8px tall with hairlines, switches 26 × 15 (on = Accent track, white knob). Never place a section label over a card.

## Icons

Material Symbols Rounded, weight 300, FILL 0; FILL 1 only for the active tab. Sizes: 21 phone tab, 18 rail and card ···, 17 header buttons, 16 inline, 14 in chips.

Fixed set: Today `wb_sunny` · Tasks `task_alt` · Brain `neurology` · Life `explore` · Agents `hub` · Find `search` · Settings `settings` · Arrange `grid_view` · Help `help` · Theme `dark_mode` / `light_mode` · Filter `tune` · More `more_horiz` · Open `chevron_right` · Send `arrow_upward` · Voice `mic` · Type `keyboard`.

No emoji. No unicode glyphs as icons. No hand-drawn SVG. Add a new icon only from this set's library, at weight 300.

## Motion

- Default transition 160ms ease-out on colour, opacity and transform.
- Card open or close: height and opacity, 200ms ease-out.
- Answered card: fades and the next rises, 200ms.
- Mic pulse while listening: ring expands 0 to 14px and fades, 1.4s ease-out, repeats.
- Undo ring: counts seconds down; no spinner.
- Honour `prefers-reduced-motion`: keep opacity changes, drop transforms and the pulse.
- Nothing animates on load. Nothing bounces.

## States

- Hover (pointer devices): surface lightens one step (Card alpha +.08) or text goes from Muted to Ink. No colour change on the accent.
- Pressed: opacity .85, 80ms. No shrink.
- Focus: 2px Accent ring, offset 2, radius matching the element.
- Disabled: opacity .45, no pointer.
- Selected: see chips and rail.
- Empty: a single Muted sentence that says what happens next. No illustration.
- Loading: skeleton rows in Hairline, same heights as content. No spinners.

## Accessibility

- Text contrast: Ink on Ground 11:1, Muted on Card 4.6:1, Accent ink on Accent soft 5.2:1 (light). Keep meta text at 10.5 only in Muted on Card or Ground.
- Tap targets 36px minimum on phone; row verbs are 28px tall but sit inside a 44px row that is also tappable.
- Every icon-only control has a `title` and an accessible label.
- Theme follows the system; the toggle overrides for the session.
- Voice is the primary input on phone; every voice action has a keyboard path.

## Do and don't

Scrollbars: 5px, thumb `rgba(122,119,111,.3)`, transparent track, thin on Firefox. Never a styled or visible track.

Do: one open decision · fixed 48px label column in rows · accent only where a tap does something · serif upright at 500 · leave the end of a column empty · say the expiry and the consequence.

Don't: bold body text · saturated button fills · colour per category · italics · gradients · pure black or white · emoji · rounded pills for chips (radius is 8) · a third font · centred layouts on desktop · stretch cards to equal heights.

## Version history

- 1.0 · 4 Sep 2026 · first release from the reference build.
- 1.3 · 4 Sep 2026 · From your EA moved under Needs you in column 1. Habit circles became labelled chips. Phone header trimmed to Settings + Theme with the health line below it, safe-area top padding, 20px sides, faint 5px scrollbars. Settings opens with Appearance and account. Calendar became a time grid. At two columns the third column stacks under the first.
- 1.2 · 4 Sep 2026 · Ground lifted to #EDEBE5, card alpha to .58, softer shadow (less card-to-ground contrast). Page title weight 400. Stat numbers 18 with 11.5 labels. "Needs eyes" renamed "Agent issues". Added the calendar grid (Today / 3 days / Week / Month) on Today and the Settings sheet.
- 1.1 · 4 Sep 2026 · Agents tab gains Needs eyes (failing or not-run checks with a verb) and Security checks (heartbeat, blocked-action tests, injection tests, canaries, secrets scan, restore drill, sessions and tokens). Decision history moved under Portals. No token, type or colour changes.

## Files

- `tokens/colors.css` · light and dark custom properties
- `tokens/typography.css` · families, scale, weights
- `tokens/layout.css` · spacing, radius, shadow, blur, motion, breakpoints
- `tokens/fonts.css` · Google Fonts imports (no binaries shipped)
- `tokens/components.css` · reference classes for every component above
- `tokens.json` · the same tokens as W3C design-tokens JSON, for Tailwind, Expo or Style Dictionary
- `guidelines/*.html` · specimen cards (colour, type, surfaces, components)
- `review/DESIGN_REVIEW.md` and `review/rules.json` · how an agent checks a change against this guide
- `handoff/README.md` · screen-by-screen spec of the reference build for developers
- `SKILL.md` · drop into Claude Code or any agent skills folder
- `../JSTACK V2.dc.html` · the reference build; `../JSTACK V2 · iPhone.dc.html` and `../JSTACK V2 · Desktop.dc.html` open it at 393 × 852 and 1440 × 900
- `../notes/decisions.md` · the decision log from the direction rounds
