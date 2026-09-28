/**
 * The settle window (A4R11-01) — a press answers the control that was there,
 * not the one that took its place.
 *
 * A verb's write reloads its list, the answered row leaves within a frame, and
 * the next row slides into its screen position (and, for Needs you, into the
 * open card's slot). A second press — a double-click, a double-tap, or the
 * ordinary "did that register?" press half a second later — then lands on a
 * row the person has not read: round 11 drove it on the shipped build at 393
 * and 1366, approving a bill, accepting a memory proposal and running the
 * security suite. And the undo does not save them, because `pushUndo` keeps
 * ONE entry: the toast on the screen offers to take back the SECOND write.
 *
 * So a press has to be aimed. Two rules, one for each way a control is
 * reached:
 *
 *  - POINTER: a press inside `SETTLE_MS` of the last one, at its point
 *    (within `SETTLE_PX`), on a DIFFERENT control is refused — and so is the
 *    next press there until `SETTLE_MS` has passed since that change, or a
 *    triple-click would simply answer the third row. A press after the window
 *    is somebody who looked and then pressed, and it lands. Pressing the same
 *    control twice where nothing has changed is untouched: a plus button, a
 *    stepper, a tab pressed twice are all somebody meaning it.
 *  - THE KEYS: A, R and L answer the open card, and answering one promotes
 *    the next into that slot (`resetOpenId`). A second card verb inside the
 *    window, on a different card, is refused for the same reason.
 *
 * Refused SILENTLY, and that is deliberate: the first write's toast is on the
 * screen carrying its Undo, and a toast about the refusal would push it off —
 * taking away the undo for the write the person did mean. Nothing happens,
 * the row they can now read stays where it is, and a press after the window
 * does what it says.
 *
 * The window is longer than the press that provoked it: round 11's DP-j
 * measured 600 ms still answering the next card.
 */

/** how long a control must hold its place before a press on it counts */
const SETTLE_MS = 800;
/** how near two presses are "the same point", in px — a finger that stayed put */
const SETTLE_PX = 24;

/** what a press hands us: react-native-web fills `pageX`/`pageY` from the DOM
 * event, and a synthetic press (a test, a native tap with no coordinates)
 * carries neither — those are never refused, since nothing says they landed
 * where the last one did. */
export type PressPoint = { nativeEvent?: { pageX?: number; pageY?: number } };

/** where the last press landed, when it landed, and when the control at that
 * point was last caught changing under a press — `null` while nothing has,
 * which is the ordinary case of a button pressed twice. */
type Landing = { at: number; x: number; y: number; id: string; changedAt: number | null };

let lastPointer: Landing | null = null;
let lastKeyCard: { at: number; id: string } | null = null;

/** test seam — forget where the last press landed */
export function __resetPressGate(): void {
  lastPointer = null;
  lastKeyCard = null;
}

/**
 * True when this press is the person's own aim. `id` is the control's testID,
 * else its accessible name: what changes when the row beneath a finger does.
 */
export function pressLands(id: string | undefined, e?: PressPoint): boolean {
  const x = e?.nativeEvent?.pageX;
  const y = e?.nativeEvent?.pageY;
  const at = Date.now();
  if (x == null || y == null) return true;
  const here = id ?? "";
  const last = lastPointer;
  const samePoint = last != null && Math.abs(x - last.x) <= SETTLE_PX && Math.abs(y - last.y) <= SETTLE_PX;
  if (!samePoint) {
    lastPointer = { at, x, y, id: here, changedAt: null };
    return true;
  }
  // A BURST is what makes a press unaimed: a second press inside the window,
  // at the point of the first, on something else. Pressing the control that
  // is there AFTER the window — a person who looked, then pressed — is not a
  // burst, and lands.
  const burst = at - last.at < SETTLE_MS;
  if (here !== last.id) {
    lastPointer = { at, x, y, id: here, changedAt: burst ? at : null };
    return !burst;
  }
  // the same control as last time. It lands unless we have just caught the
  // place changing: a triple-click must not simply answer the third row.
  const settling = last.changedAt != null && at - last.changedAt < SETTLE_MS;
  lastPointer = { at, x, y, id: here, changedAt: last.changedAt };
  return !settling;
}

/**
 * True when a card verb from the keyboard is for the card the person was
 * reading. The slot is the open card itself, so A then L inside the window is
 * refused as readily as A twice.
 */
export function keyVerbLands(cardId: string): boolean {
  const at = Date.now();
  const last = lastKeyCard;
  lastKeyCard = { at, id: cardId };
  return !(last != null && at - last.at < SETTLE_MS && last.id !== cardId);
}
