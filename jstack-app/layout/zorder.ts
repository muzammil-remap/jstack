/**
 * The z-order table — the one place a layer number is written (ADR-65 rule 18,
 * LV-05).
 *
 * V2.1 fixed the same class of bug six times (R-15, R-16, R-26, R-27, R-31,
 * R-36): floating chrome covering content or a control, because each call site
 * picked a number that was right against the layers its author happened to be
 * thinking about. A number is not the problem; a number with no neighbours is.
 *
 * Read this as a stack, bottom to top:
 *
 *   screen         90   a screen-kind surface (Talk) over the tab content
 *   dialog/sheet  100   the overlay pair — deliberately equal, so the one that
 *                       opens last is on top, which is what a user expects
 *   toast         105   above an open overlay, below the gate: a toast must be
 *                       readable over a sheet but must never sit on the lock
 *   gate          110   the lock. Nothing the app renders goes above it…
 *   watermark     150   …except the demo watermark, which is outside the gated
 *                       subtree on purpose so it marks the locked screen too
 *                       (ID-02). Demo chrome only; the live app has none.
 *   privacyShield 200   the blur cover when the app is backgrounded. It is the
 *                       top of the stack because it exists to cover the app,
 *                       and covering everything except the watermark would
 *                       leak exactly what it is there to hide.
 *
 * Adding a layer means adding a row here and to `Z_ORDER`, never a literal at
 * a call site: `tests/unit/zorder.test.ts` greps for that and will fail.
 * Clearances (`TOAST_BOTTOM`, `WATERMARK_CLEARANCE`) live with their own
 * components — this file is only the order.
 */
export const Z = {
  screen: 90,
  dialog: 100,
  sheet: 100,
  toast: 105,
  gate: 110,
  watermark: 150,
  privacyShield: 200,
} as const;

/** not exported: `Z_ORDER` is the only thing that needs the name, and CT-06
 * refuses an export nothing imports */
type ZLayer = keyof typeof Z;

/** the stack bottom to top; the test asserts the values ascend in this order */
export const Z_ORDER: readonly ZLayer[] = ["screen", "dialog", "sheet", "toast", "gate", "watermark", "privacyShield"] as const;
