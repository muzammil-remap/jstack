/**
 * The demo watermark's words, in a file with no React and no react-native
 * import (I-1, ID-02).
 *
 * It lives apart from `DemoWatermark.tsx` for one reason: `e2e/core/*.spec.ts`
 * runs under Playwright's own TypeScript loader, which has no Metro and no
 * Babel, so importing a `.tsx` that pulls in `react-native` fails at load with
 * a syntax error in a file the spec never meant to execute. The spec needs the
 * STRING, not the component.
 *
 * Duplicating the literal into the spec instead would have worked and been
 * worse: two copies of a sentence, and nothing to notice when one changed.
 */
export const DEMO_WATERMARK_TEXT = "Demo · fixture data · nothing sends";

/**
 * What a surface that covers the phone's tab bar keeps free at its foot for
 * the mark (ux-review R2-02). With the bar covered the mark drops to
 * `space[3]` (8) from the bottom, and its 11px line in a `space[1]`-padded
 * chip is ~20px tall, so 32 (= `space[10]`) leaves a clear step above it.
 * `TalkScreen`, `Dialog`, `Sheet` and `SettingsSheet` pad or inset by it;
 * `DemoWatermark.tsx` is the other half of the rule. A literal rather than a
 * token import so this file stays free of everything — the e2e spec imports
 * it.
 */
export const WATERMARK_CLEARANCE = 32;
