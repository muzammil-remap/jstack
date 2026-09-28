/**
 * The AG-11 press-and-hold timer, shared by the two "Hold to lock" controls
 * (Agents' own Emergency card, and a second one in Settings › Appearance).
 * 1.2s hold → `onComplete`; an early release resets the hint.
 *
 * WHAT AG-1 FIXED, and it was one bug wearing two faces. `complete()` nulled
 * the timer before setting the hint, and `cancelHold` only reset the hint while
 * a timer was still pending — so the release that follows every SUCCESSFUL hold
 * found nothing to cancel and the control was left reading "Locking…" for good.
 * Cancelling the confirm dialog left it there too, because nothing told the
 * hook the dialog had gone. A control that says it is locking when it is not is
 * the worst lie available to the one control that revokes every session.
 *
 * So there are two ways back to rest and they are different events: `cancelHold`
 * is the FINGER coming off, and `reset` is the DIALOG going away. Both are
 * unconditional now — a reset that only fires when a timer is pending is a
 * reset that cannot fix the state a completed timer left behind.
 *
 * `armed` is how the second one is wired without this file importing a store:
 * the caller passes whether the confirm dialog is open, and the hook resets
 * when that goes from true to false. Watching it HERE rather than in each
 * consumer is the point — two `useEffect`s in two components is two chances to
 * get the transition wrong, and one of them would be the one nobody opens.
 */
import { useEffect, useRef, useState } from "react";

/** the hold, in milliseconds. Exported so a test asserts the DURATION rather
 * than only the sequence (R-06: `speaking` lasted zero milliseconds and the
 * sequence test was green). */
export const HOLD_MS = 1200;

/** What the control says when nothing is happening. One declaration:
 * `Appearance.tsx` compared the hint to a hand-typed copy of this sentence to
 * decide whether to show its own subtitle, and a second copy of a string is a
 * comparison that stops matching the day either one moves (rule 16). */
export const RESTING_HINT = "Press and hold for 1.2 seconds.";

export function useHoldToLock(onComplete: () => void, armed = false) {
  const [hint, setHint] = useState(RESTING_HINT);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasArmed = useRef(false);

  const start = () => {
    // a second press while one is running must not arm two locks — a stray
    // pointer event on THIS control is not a thing to be relaxed about
    if (timer.current != null) return;
    setHint("Keep holding…");
    timer.current = setTimeout(() => {
      timer.current = null;
      setHint("Locking…");
      onComplete();
    }, HOLD_MS);
  };

  /** the finger came off — before the hold finished, or after it did */
  const cancelHold = () => {
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setHint(RESTING_HINT);
  };

  /** the confirm dialog went away. Not the same event as a release: the finger
   * may still be down while the dialog is open, and the dialog can close
   * without the pointer moving at all. */
  const reset = () => {
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setHint(RESTING_HINT);
  };

  // the confirm dialog closing — cancelled, or completed and gone — puts the
  // control back to rest. `wasArmed` so a first render with `armed: false`
  // does not count as a close.
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      return;
    }
    if (!wasArmed.current) return;
    wasArmed.current = false;
    reset();
    // `reset` is stable in behaviour but re-made each render; depending on it
    // would run this on every render rather than on the transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  return { hint, start, cancelHold, reset };
}
