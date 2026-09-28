/**
 * `inert` for everything behind the gate (B7-01).
 *
 * The lock screen was a painted overlay, not a lock. `FaceIDGate` renders an
 * opaque, viewport-filling View at z110, which stops a POINTER and does
 * nothing whatever about the keyboard: with `session.locked` true, Tab
 * pressed 45 times walked focus into Today's task list, Enter flipped a task
 * from open to done, and Enter on `rail-settings` opened the Settings sheet —
 * live account content, over the gate — with both writes persisting through
 * the adapter. LK-01 says "nothing behind it is reachable" and the test that
 * carried that title measured the gate's bounding box, which is the seventh
 * time in this build a guard has reported green over exactly the thing it was
 * written to catch (qa-auditor round 7).
 *
 * `inert` is the one primitive that closes every route at once — focus, tab
 * order, click, text selection and the accessibility tree — and the platform
 * moves focus out of the subtree for us when the app locks while a field
 * inside it has focus. It renders no pixel, which is why no frame in
 * `demo/v2/` shows the defect and none will show the fix.
 *
 * Web only. On native the gate's absolute View already captures touches and
 * there is no tab order to walk.
 */
import { Platform } from "react-native";

/** Set or clear `inert` (and its aria twin) on a React Native Web host node. */
export function setInert(node: unknown, on: boolean): void {
  if (Platform.OS !== "web") return;
  const el = node as { setAttribute?: (k: string, v: string) => void; removeAttribute?: (k: string) => void } | null;
  if (el == null || typeof el.setAttribute !== "function" || typeof el.removeAttribute !== "function") return;
  if (on) {
    el.setAttribute("inert", "");
    // Safari shipped `inert` in 15.5; aria-hidden is the belt to its braces
    // for a screen reader on anything older, and costs nothing where inert
    // already implies it.
    el.setAttribute("aria-hidden", "true");
  } else {
    el.removeAttribute("inert");
    el.removeAttribute("aria-hidden");
  }
}
