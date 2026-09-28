/**
 * Copy to the clipboard, best effort (S-9).
 *
 * Two verbatim copies of this existed — one in `components/today/DecisionBodies.tsx`, one
 * inside `components/settings/Sync.tsx`'s component body — each with a comment saying it was
 * the same as the other. T-4's CSV copy would have been the third.
 *
 * No new dependency (hard rule 4): the web Clipboard API where there is one, and nothing
 * where there is not. Native has no clipboard in this build, and a permission can be denied
 * on web, so the write is genuinely allowed to do nothing.
 *
 * The TOAST is the caller's, not this function's, and that is the one thing the move changed.
 * Both copies toasted "Copied" unconditionally — including when nothing had been copied,
 * which is the app telling a person something untrue about their own clipboard. It is left as
 * the callers' decision rather than quietly fixed here, because "did it copy" now has an
 * answer they can use: this returns whether the write actually happened.
 */
import { Platform } from "react-native";

export async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS !== "web" || typeof navigator === "undefined" || navigator.clipboard == null) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // a denied permission is a real answer, not an error worth throwing: the
    // text is still on screen and the caller decides what to say about it
    return false;
  }
}
