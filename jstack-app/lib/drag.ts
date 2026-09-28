/**
 * The drag, as arithmetic (B-1, ADR-45; the Gantt shares it at G-1).
 *
 * In-house because a drag library is a dependency for one gesture, and the
 * rule against new dependencies is why this build has one design system rather
 * than three. What it actually needs is small: decide whether a pointer
 * sequence was a tap or a drag, report where the pointer is so the caller can
 * draw a ghost, and say which drop target the finger was over when it let go.
 *
 * **No React and no react-native in this file.** The component wires its
 * responder events to `down`/`move`/`up`/`cancel`; everything that decides what
 * a sequence MEANS is here, where a test can drive it as pointer arithmetic
 * (`tests/unit/drag.test.ts`) rather than through a browser. A threshold tested
 * only in a browser is a threshold tested at one pixel ratio.
 *
 * The THRESHOLD is the whole safety property. A board where tapping a card
 * sometimes moves it is worse than a board with no drag at all, so a 3px wobble
 * on the way to a tap opens the card and a 4px move picks it up — measured from
 * where the finger went DOWN, never from the last frame, because three 2px
 * steps are a drag and no single step of them is.
 *
 * Targets are read ONCE, at the moment a drag starts. A board that reflows
 * under the finger (a lane growing as a card leaves it) must not be able to
 * change which column a drop resolves to: the answer belongs to the layout the
 * person was looking at when they aimed.
 */

/** not exported: both consumers speak in `DropTarget`s and callbacks, and CT-06
 * refuses an export nothing imports. It reaches the Gantt structurally, as the
 * type of `onDrop`'s third argument. */
type Point = { x: number; y: number };

/** a measured column frame, in the same coordinate space the pointer reports */
export type DropTarget = { id: string; x: number; y: number; width: number; height: number };

/** the pack's own tap tolerance. 4px is what separates a finger held still
 * from a finger that meant to move: under it, every board tap would sometimes
 * be a move; over it, a short deliberate drag would open the card instead. */
export const DRAG_THRESHOLD = 4;

type Handlers = {
  /** measured at the START of each gesture, never during it */
  targets: () => DropTarget[];
  onStart: (id: string) => void;
  onMove: (at: Point) => void;
  /**
   * Which target the pointer is over WHILE the card is in the air (ux round
   * S6-35) — the lane the drop would land in, so the caller can dress it as
   * that. Reported on CHANGE only, never per pixel: a board re-rendered on
   * every move is a board that stutters. `null` when the pointer has left
   * every target. Resolved against the same targets `onDrop` uses, so the
   * lane that lights up and the lane that takes the card are one answer.
   * Nothing is reported before the card is picked up: a wobble on the way to
   * a tap is over no drop. Optional, because the Gantt's callers draw the
   * subject itself and have no target to dress.
   */
  onOver?: (target: string | null) => void;
  /** `target` is null when the finger let go over nothing — the caller puts
   * the card back rather than guessing the nearest column, because a drag that
   * guesses moves a task by accident. `at` is where it let go: the board only
   * needs the target's name, but the Gantt's axis is continuous and the answer
   * there is which DAY, which only the point can say (GT-07). */
  onDrop: (id: string, target: string | null, at: Point) => void;
  onTap: (id: string) => void;
  /**
   * How long a finger must rest before it may pick anything up (GT-08).
   *
   * Absent on the board, and that is not an oversight: the board's lanes do not
   * scroll sideways, so a finger that moves there can only mean "move this
   * card". The Gantt's axis DOES scroll — a 90-day range is 2,520px on a 393px
   * phone — so the identical swipe means both "scroll the timeline" and
   * "reschedule this task", and the only thing that can separate them is
   * whether the finger waited first.
   */
  holdMs?: number;
};

type Gesture = {
  id: string;
  from: Point;
  at: number;
  targets: DropTarget[];
  dragging: boolean;
  /** set when a move arrived before `holdMs` elapsed: the surface underneath
   * took the gesture, and it can never become a drag afterwards. */
  scrolling: boolean;
  /** the target last reported through `onOver`, so a move inside the same
   * lane says nothing (S6-35) */
  over: string | null;
};

type Drag = {
  down: (id: string, at: Point, t?: number) => void;
  move: (at: Point, t?: number) => void;
  up: (at: Point) => void;
  cancel: () => void;
};

/** a point is inside a frame on its left and top edges and outside on its
 * right and bottom, so two touching columns cannot both claim one pixel. */
function hit(targets: DropTarget[], at: Point): string | null {
  for (const t of targets) {
    if (at.x >= t.x && at.x < t.x + t.width && at.y >= t.y && at.y < t.y + t.height) return t.id;
  }
  return null;
}

export function createDrag(handlers: Handlers): Drag {
  let gesture: Gesture | null = null;

  return {
    // the clock is passed IN, so this file stays what its header says it is —
    // arithmetic with no timers — and a 599ms press can be tested without
    // taking 599ms to test it
    down: (id, at, t = Date.now()) => {
      gesture = { id, from: at, at: t, targets: handlers.targets(), dragging: false, scrolling: false, over: null };
    },

    move: (at, t = Date.now()) => {
      // a move with no press before it is not part of anything — RNW can send
      // one after a cancel, and throwing on it would take the screen down
      if (gesture == null) return;
      // the surface already has this gesture; nothing it does now is ours
      if (gesture.scrolling) return;
      if (!gesture.dragging && Math.hypot(at.x - gesture.from.x, at.y - gesture.from.y) >= DRAG_THRESHOLD) {
        // GT-08: moved before the hold elapsed, so the finger meant the axis.
        // Decided ONCE, here, and remembered — a gesture that becomes a drag
        // half-way through drops the bar somewhere nobody aimed.
        if (handlers.holdMs != null && t - gesture.at < handlers.holdMs) {
          gesture.scrolling = true;
          return;
        }
        gesture.dragging = true;
        handlers.onStart(gesture.id);
      }
      handlers.onMove(at);
      // S6-35: the lane under the pointer, said once per change and only once
      // the card is actually in the air
      if (gesture.dragging && handlers.onOver != null) {
        const over = hit(gesture.targets, at);
        if (over !== gesture.over) {
          gesture.over = over;
          handlers.onOver(over);
        }
      }
    },

    up: (at) => {
      if (gesture == null) return;
      const { id, dragging, scrolling, targets } = gesture;
      gesture = null;
      // a scroll ends where it ends: not a drop, and NOT a tap either. Opening
      // whatever task the finger started on at the end of every timeline swipe
      // would make the Gantt unusable on a phone.
      if (scrolling) return;
      if (!dragging) {
        handlers.onTap(id);
        return;
      }
      handlers.onDrop(id, hit(targets, at), at);
    },

    cancel: () => {
      // nothing dropped and nothing tapped: a cancelled gesture did not happen,
      // and reporting it as either would move a card the person let go of by
      // scrolling
      gesture = null;
    },
  };
}
