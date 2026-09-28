# The Gantt's Sunday — eight frames off the pass

Taken at A-6, 13 September 2026, because ux round 4 pointed out that the change it was
sent to judge **cannot appear in the device pass at all**. The pass runs on one fixed
instant so it is pixel-reproducible (S6-37), and that instant is Thursday 10 September
16:20. `lib/ganttAxis.ts`'s `absorbNarrowEnds` only fires when a clipped end band is
under `MIN_CAPTION_WIDTH`, and with the window opening on a Thursday the lead band is
four days — 112px, comfortably captioned. The path is a no-op on all 24 `tasks-gantt`
frames of the pass. Round 4 said so plainly: *"that cost ships unreviewed unless one
Sunday-clock frame is taken."*

These are that frame, at all four widths and both schemes:

```
node tools/capture-v2.mjs --flavour test --day 1 --only tasks-gantt \
  --instant "2026-09-13T16:20:00+10:00" --out evidence/gantt-sunday
```

`--instant` and `--out` were added to the rig for this, and they are refused separately:
an off-pass instant may not write into `demo/v22`, because the pass's whole claim is that
every frame in it was taken at the same moment.

## What they show

13 September 2026 is a **Sunday**, so the window's first day is the last day of its week
and the lead band is clipped to one day — 28px, where the caption needs 35. That is the
defect the certifying board caught as S6-04 (`BUGLOG_v22.md` B-266): the caption wrapped
to two lines, hung 13px out of its 16px band, and the now-rule crossed it.

On these frames, at 1366 light:

- the first week caption reads **`13 Sep`, on one line**, at x 0 of the plot — the
  window's first day at the window's first pixel, which is S6-04's claim;
- the next caption is **`21 Sep`**, not 14 Sep. This is the **cost**, and it is the thing
  round 4 asked to have looked at: the lead band absorbed the following week, so it spans
  13–20 Sep and the Monday hairline at 14 September is not drawn. The first caption
  interval is eight days where every later one is seven;
- the **now-rule starts below both caption rows** and crosses neither.

## The judgement

The cost reads as acceptable. A week band is a band of the plot, not a calendar the
reader counts on; the day ticks still mark every day, the weekend shading still marks
every Saturday and Sunday, and each caption still sits on the day it names. What a reader
loses is one boundary mark at the very edge of the window, in exchange for a caption they
can read. A caption that is wrong about its own pixel — or that hangs through the row
below it — is the worse failure, and it is the one S6-04 and S6-04b were written against.

This is a builder's reading of a frame, not a reviewer's. It is here so that the path is
**looked at** rather than reasoned about, and so the next round has the frame to judge.
