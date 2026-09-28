/**
 * BD-04 — the drag, driven as pointer arithmetic rather than as a browser
 * (B-1, ADR-45).
 *
 * `lib/drag.ts` is in-house because a drag library is a dependency for one
 * gesture, and this build has one design system rather than three for exactly
 * that reason. What it has to get right is not the animation — it is the
 * THRESHOLD: a 3px wobble on the way to a tap must open the card, and a 5px
 * move must pick it up, or the board becomes a screen where tapping a card
 * sometimes moves it.
 *
 * So the tests are pointer sequences, not renders. `e2e/core/board.spec.ts`
 * drives the real thing with `mouse.down/move×3/up`; this pins the arithmetic
 * that decides what a sequence MEANS, at a granularity a browser test cannot
 * reach without becoming a flake.
 */
import { DRAG_THRESHOLD, createDrag, type DropTarget } from "@/lib/drag";

const targets: DropTarget[] = [
  { id: "now", x: 0, y: 0, width: 200, height: 400 },
  { id: "next", x: 200, y: 0, width: 200, height: 400 },
  { id: "done", x: 400, y: 0, width: 200, height: 400 },
];

type Log = { started: string[]; moved: { x: number; y: number }[]; dropped: { id: string; target: string | null }[]; tapped: string[] };

function harness(holdMs?: number) {
  const log: Log = { started: [], moved: [], dropped: [], tapped: [] };
  const drag = createDrag({
    targets: () => targets,
    onStart: (id) => log.started.push(id),
    onMove: (p) => log.moved.push(p),
    onDrop: (id, target) => log.dropped.push({ id, target }),
    onTap: (id) => log.tapped.push(id),
    ...(holdMs != null ? { holdMs } : {}),
  });
  return { drag, log };
}

describe("BD-04 · a tap is not a drag", () => {
  it("a press and release with no movement is a tap", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    drag.up({ x: 50, y: 50 });
    expect(log.tapped).toEqual(["t1"]);
    expect(log.started).toEqual([]);
    expect(log.dropped).toEqual([]);
  });

  it("a 3px wobble is still a tap — a finger is not a mouse", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    // exactly 3px, which is what the pack's own sentence promises. It used to
    // be (52, 52) — 2.83px — so the case passed while leaving the pixel the
    // sentence names untested.
    drag.move({ x: 53, y: 50 });
    drag.up({ x: 53, y: 50 });
    expect(log.tapped).toEqual(["t1"]);
    expect(log.started).toEqual([]);
  });

  it("the boundary itself: 3.9px taps, 4px picks up", () => {
    // `>=` is the whole difference between the two sentences in the header,
    // and a threshold tested at 3 and 5 leaves the pixel it actually turns on
    // to a comment. Off by one here is a board that either eats taps or
    // refuses short drags.
    const under = harness();
    under.drag.down("t1", { x: 50, y: 50 });
    under.drag.move({ x: 53.9, y: 50 });
    under.drag.up({ x: 53.9, y: 50 });
    expect(under.log.tapped).toEqual(["t1"]);
    expect(under.log.started).toEqual([]);

    const at = harness();
    at.drag.down("t1", { x: 50, y: 50 });
    at.drag.move({ x: 50 + DRAG_THRESHOLD, y: 50 });
    at.drag.up({ x: 250, y: 60 });
    expect(at.log.started).toEqual(["t1"]);
    expect(at.log.tapped).toEqual([]);
    expect(at.log.dropped).toEqual([{ id: "t1", target: "next" }]);
  });

  it("a 5px move picks it up, and only announces the start ONCE", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 55, y: 50 });
    drag.move({ x: 120, y: 60 });
    drag.move({ x: 250, y: 60 });
    expect(log.started).toEqual(["t1"]);
    expect(log.moved).toHaveLength(3);
  });

  it("the threshold is measured from where the finger went DOWN, not from the last move", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    // three 2px steps: never a 4px step, but 6px from the start
    drag.move({ x: 52, y: 50 });
    drag.move({ x: 54, y: 50 });
    drag.move({ x: 56, y: 50 });
    expect(log.started).toEqual(["t1"]);
    expect(DRAG_THRESHOLD).toBe(4);
  });
});

describe("BD-04 · where it lands", () => {
  it("a drop inside another column reports that column", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 250, y: 60 });
    drag.up({ x: 250, y: 60 });
    expect(log.dropped).toEqual([{ id: "t1", target: "next" }]);
    expect(log.tapped).toEqual([]);
  });

  it("a drop outside every column reports none, rather than the nearest", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 900, y: 900 });
    drag.up({ x: 900, y: 900 });
    // a card dropped on nothing goes back where it came from; guessing a
    // column from a drop somebody aimed at the page would move a task by
    // accident, which is the one thing a drag must never do
    expect(log.dropped).toEqual([{ id: "t1", target: null }]);
  });

  it("a drop back on its own column still reports it — the caller decides that is a no-op", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 90, y: 200 });
    drag.up({ x: 90, y: 200 });
    expect(log.dropped).toEqual([{ id: "t1", target: "now" }]);
  });

  it("the boundary belongs to the column on its left edge, not to both", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 200, y: 10 });
    drag.up({ x: 200, y: 10 });
    expect(log.dropped).toEqual([{ id: "t1", target: "next" }]);
  });
});

describe("BD-04 · a drag that never finishes", () => {
  it("cancel drops nothing and taps nothing", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 250, y: 60 });
    drag.cancel();
    expect(log.dropped).toEqual([]);
    expect(log.tapped).toEqual([]);
  });

  it("a move with no press before it is ignored rather than throwing", () => {
    const { drag, log } = harness();
    drag.move({ x: 250, y: 60 });
    drag.up({ x: 250, y: 60 });
    expect(log).toMatchObject({ started: [], moved: [], dropped: [], tapped: [] });
  });

  it("a second press starts a new gesture rather than continuing the last", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 250, y: 60 });
    drag.up({ x: 250, y: 60 });
    drag.down("t2", { x: 50, y: 50 });
    drag.up({ x: 50, y: 50 });
    expect(log.dropped).toEqual([{ id: "t1", target: "next" }]);
    expect(log.tapped).toEqual(["t2"]);
  });
});

describe("BD-04 · what the caller draws with", () => {
  it("the moving position is reported so a ghost can follow the pointer", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 250, y: 60 });
    expect(log.moved.at(-1)).toEqual({ x: 250, y: 60 });
  });

  it("targets are read at the START of a gesture, so a lane that reflows mid-drag cannot move the answer", () => {
    let frames = targets;
    const seen: (string | null)[] = [];
    const drag = createDrag({
      targets: () => frames,
      onStart: () => {},
      onMove: () => {},
      onDrop: (_id, target) => seen.push(target),
      onTap: () => {},
    });
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 250, y: 60 });
    // the board re-lays out under the finger — this is what an unbounded read
    // would let happen: the same drop resolving to a different column
    frames = [{ id: "elsewhere", x: 200, y: 0, width: 200, height: 400 }];
    drag.up({ x: 250, y: 60 });
    expect(seen).toEqual(["next"]);
  });
});

/**
 * S6-35 (ux round, Stage 6) — the lane under the pointer, WHILE the card is
 * in the air.
 *
 * `onDrop` says where a card landed; nothing said where it was ABOUT to land,
 * so the board's whole drag state was a 15% dim on everything except the card
 * (the pack's Pressed value, used for a mode). The board needs to know which
 * lane the pointer is over as it moves, so it can dress that lane as the drop
 * it will take. Reported on CHANGE only — a callback per pixel would re-render
 * the board per pixel — from the same targets `onDrop` resolves against, so
 * the lane that lights up and the lane that takes the card are one answer.
 */
describe("S6-35 · the lane under the pointer is named while the card is in the air", () => {
  function overHarness() {
    const over: (string | null)[] = [];
    const drag = createDrag({
      targets: () => targets,
      onStart: () => {},
      onMove: () => {},
      onOver: (target) => over.push(target),
      onDrop: () => {},
      onTap: () => {},
    });
    return { drag, over };
  }

  it("names the lane the pointer enters, once per change, and null when it leaves every lane", () => {
    const { drag, over } = overHarness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 60, y: 50 }); // picked up, still over its own lane
    drag.move({ x: 250, y: 60 }); // into next
    drag.move({ x: 260, y: 70 }); // still next — no second report
    drag.move({ x: 450, y: 60 }); // into done
    drag.move({ x: 900, y: 900 }); // off every lane
    expect(over).toEqual(["now", "next", "done", null]);
  });

  it("says nothing before the card is picked up — a wobble on the way to a tap is over no drop", () => {
    const { drag, over } = overHarness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 52, y: 51 });
    expect(over).toEqual([]);
    drag.up({ x: 52, y: 51 });
    expect(over).toEqual([]);
  });

  it("the drop resolves to the lane last reported over — one answer, not two", () => {
    const dropped: (string | null)[] = [];
    const over: (string | null)[] = [];
    const drag = createDrag({
      targets: () => targets,
      onStart: () => {},
      onMove: () => {},
      onOver: (target) => over.push(target),
      onDrop: (_id, target) => dropped.push(target),
      onTap: () => {},
    });
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 250, y: 60 });
    drag.up({ x: 250, y: 60 });
    expect(over.at(-1)).toBe("next");
    expect(dropped).toEqual(["next"]);
  });

  it("the board's callers that pass no onOver are unchanged", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 250, y: 60 });
    drag.up({ x: 250, y: 60 });
    expect(log.dropped).toEqual([{ id: "t1", target: "next" }]);
  });
});

/**
 * GT-08 (G-1) — the long press, which the Gantt needs and the board does not.
 *
 * The board's lanes do not scroll sideways, so on the board a finger that moves
 * is always a drag. The Gantt's axis DOES: a 90-day range is 2,520px on a
 * 393px phone, so the same horizontal swipe means "scroll the timeline" and
 * "reschedule this task", and the only thing that can separate them is whether
 * the finger waited first.
 *
 * The clock is passed IN rather than read here, so this file stays what its
 * header says it is — arithmetic with no timers in it — and so these cases can
 * test a 599ms press without taking 599ms to do it.
 *
 * `holdMs` is optional and the board passes none: every case above this block
 * runs the same code path it always did.
 */
describe("GT-08 · on touch, a bar is picked up by waiting", () => {
  const HOLD = 600;

  it("a move before the hold has elapsed does NOT pick it up — that gesture is a scroll", () => {
    const { drag, log } = harness(HOLD);
    drag.down("t1", { x: 10, y: 10 }, 1000);
    drag.move({ x: 60, y: 10 }, 1400); // 400ms in, well past 4px
    expect(log.started).toEqual([]);
  });

  it("a move after the hold picks it up", () => {
    const { drag, log } = harness(HOLD);
    drag.down("t1", { x: 10, y: 10 }, 1000);
    drag.move({ x: 60, y: 10 }, 1700); // 700ms in
    expect(log.started).toEqual(["t1"]);
  });

  it("the boundary: 599ms scrolls, 600ms picks up", () => {
    const early = harness(HOLD);
    early.drag.down("t1", { x: 10, y: 10 }, 0);
    early.drag.move({ x: 60, y: 10 }, 599);
    expect(early.log.started).toEqual([]);

    const late = harness(HOLD);
    late.drag.down("t1", { x: 10, y: 10 }, 0);
    late.drag.move({ x: 60, y: 10 }, 600);
    expect(late.log.started).toEqual(["t1"]);
  });

  it("having scrolled, it does not become a drag later in the same gesture", () => {
    // the finger already took the timeline with it; picking the bar up
    // half-way through would drop it somewhere the person never aimed
    const { drag, log } = harness(HOLD);
    drag.down("t1", { x: 10, y: 10 }, 0);
    drag.move({ x: 60, y: 10 }, 100);
    drag.move({ x: 120, y: 10 }, 900);
    expect(log.started).toEqual([]);
    drag.up({ x: 120, y: 10 });
    expect(log.dropped).toEqual([]);
    // and it is not a TAP either. A scroll that opened whatever task the
    // finger started on would make the timeline unusable on a phone — the
    // gesture belonged to the axis, and it ends there.
    expect(log.tapped).toEqual([]);
  });

  it("a long press with no movement is still a TAP, not a drag that went nowhere", () => {
    // holding on a bar and letting go is how a person reads a tooltip or
    // changes their mind; it must still open the card (GT-06)
    const { drag, log } = harness(HOLD);
    drag.down("t1", { x: 10, y: 10 }, 0);
    drag.up({ x: 10, y: 10 });
    expect(log.tapped).toEqual(["t1"]);
    expect(log.dropped).toEqual([]);
  });

  it("the threshold still applies after the hold — a 3px wobble while holding is not a move", () => {
    const { drag, log } = harness(HOLD);
    drag.down("t1", { x: 10, y: 10 }, 0);
    drag.move({ x: 12, y: 12 }, 800); // 2.8px
    expect(log.started).toEqual([]);
    drag.up({ x: 12, y: 12 });
    expect(log.tapped).toEqual(["t1"]);
  });

  it("with no holdMs the board's behaviour is exactly what it was: move 4px, pick up", () => {
    const { drag, log } = harness();
    drag.down("t1", { x: 10, y: 10 });
    drag.move({ x: 20, y: 10 });
    expect(log.started).toEqual(["t1"]);
  });
});

/**
 * GT-07 (G-1) — where the finger let go, not just what it let go over.
 *
 * The board only ever needed the target's NAME: a column is a column wherever
 * in it you drop a card. The Gantt needs the POINT, because the thing under the
 * finger is a continuous axis and the answer is which day — so `onDrop` carries
 * the release point as well as the target it resolved to.
 *
 * A third argument is additive: the board's `(id, target) => …` is assignable
 * unchanged, which is why this is a widening rather than a new callback.
 */
describe("GT-07 · the drop reports its point", () => {
  it("hands the release point to onDrop, alongside the target", () => {
    const seen: { target: string | null; at: { x: number; y: number } }[] = [];
    const drag = createDrag({
      targets: () => targets,
      onStart: () => {},
      onMove: () => {},
      onDrop: (_id, target, at) => seen.push({ target, at }),
      onTap: () => {},
    });
    drag.down("t1", { x: 50, y: 50 });
    drag.move({ x: 250, y: 60 });
    drag.up({ x: 263, y: 71 });
    expect(seen).toEqual([{ target: "next", at: { x: 263, y: 71 } }]);
  });

  it("reports the point even when the drop resolved to no target", () => {
    // the Gantt's axis is not a DropTarget at all in the mini case, and a
    // caller that maps pixels to days still needs the pixel
    const seen: { target: string | null; at: { x: number; y: number } }[] = [];
    const drag = createDrag({
      targets: () => [],
      onStart: () => {},
      onMove: () => {},
      onDrop: (_id, target, at) => seen.push({ target, at }),
      onTap: () => {},
    });
    drag.down("t1", { x: 0, y: 0 });
    drag.move({ x: 90, y: 5 });
    drag.up({ x: 96, y: 7 });
    expect(seen).toEqual([{ target: null, at: { x: 96, y: 7 } }]);
  });
});
