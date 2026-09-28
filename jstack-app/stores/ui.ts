/**
 * ui.ts (E-1) — transient chrome state of the current viewport.
 *
 * Nothing here is persisted and nothing here is the account's: it is what the
 * window is doing right now. Three facts live in it.
 *
 * **The keyboard band.** `keyboardInset` moved here from `stores/session.ts`,
 * which was at its 200-line cap with `editorExpanded` still to place. It did
 * not move alone: E-1 adds `keyboardOffsetTop`, and the inset and the offset
 * are one fact — where the visible band is — read together by `Field` to size
 * and place the expanded editor. Splitting them across two stores would have
 * been the second copy that drifts (hard rule 16), so the whole band moved
 * rather than half of it staying behind. `lib/keyboard.ts` writes both from
 * `visualViewport` on web and from RN `Keyboard` events on native (ADR-04),
 * and `lib/testHook.ts` writes them for the rig, which cannot raise a real
 * soft keyboard.
 *
 * **The toast band.** `toastInset` (S6-13, the ux round of Stage 6): the height
 * of the band a showing toast occupies above the viewport's bottom edge — its
 * offset, its measured box and one step — and 0 when none is up. `ToastHost`
 * writes it from its own `onLayout`; the tab page and the settings sheet END
 * above it, the way they end above the keyboard, so nothing lives under a
 * toast at any scroll position (the frame rule: "no floating element over
 * content or a control with a toast up"). Padding inside the scroll content
 * would clear only the end of the scroll, not a frame at scroll 0.
 *
 * **`editorExpanded`.** TE-03: while a `Field` is the expanded editor, the
 * demo watermark and the mock banner get out of the way. The watermark is a
 * React component and reads this flag; the mock banner is injected HTML in a
 * built artefact that knows nothing about React, so the flag is also mirrored
 * onto `document.body` as `data-editor-expanded` for a listener that
 * `tools/build-mock.mjs` injects.
 *
 * The mirror lives in the setter rather than in an effect somewhere. Every
 * `Field` in the app shares one of these flags, an effect would need a host
 * component to mount it in (and `app/_layout.tsx` has one line of headroom),
 * and a setter that writes both is one declaration of "the editor is open"
 * instead of two that can disagree.
 */
import { create } from "zustand";

type UiState = {
  /** height of the soft keyboard, in px; 0 when it is down */
  keyboardInset: number;
  /** the visual viewport's offset from the top of the layout viewport */
  keyboardOffsetTop: number;
  /** TE-03: a `Field` is currently the expanded editor */
  editorExpanded: boolean;
  /** S6-13: the band a showing toast occupies above the bottom edge; 0 when none */
  toastInset: number;
  setKeyboardInset: (px: number) => void;
  setKeyboardOffsetTop: (px: number) => void;
  setEditorExpanded: (expanded: boolean) => void;
  setToastInset: (px: number) => void;
};

/** Mirror onto the document so non-React chrome can react to it (TE-03). */
function markBody(expanded: boolean): void {
  const body = (globalThis as { document?: { body?: { dataset?: Record<string, string | undefined> } } }).document?.body;
  if (body?.dataset == null) return;
  if (expanded) body.dataset.editorExpanded = "true";
  else delete body.dataset.editorExpanded;
}

export const useUiStore = create<UiState>((set) => ({
  keyboardInset: 0,
  keyboardOffsetTop: 0,
  editorExpanded: false,
  toastInset: 0,
  setKeyboardInset: (keyboardInset) => set({ keyboardInset }),
  setKeyboardOffsetTop: (keyboardOffsetTop) => set({ keyboardOffsetTop }),
  setEditorExpanded: (editorExpanded) => {
    markBody(editorExpanded);
    set({ editorExpanded });
  },
  setToastInset: (toastInset) => set((s) => (s.toastInset === toastInset ? {} : { toastInset })),
}));
