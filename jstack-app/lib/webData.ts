/**
 * data-* attributes for e2e hooks: react-native-web maps `dataSet` to
 * data-* DOM attributes; native RN ignores it. Typed as a spreadable object
 * because core RN prop types don't declare dataSet.
 */
import { Platform, type ViewStyle } from "react-native";

export function webData(data: Record<string, string>): Record<string, unknown> {
  return { dataSet: data };
}

/**
 * `hitSlop` for NATIVE, plus a `data-hitslop` marker for the sweeps.
 *
 * AUDIT_v2.md AA-02 established what this file's previous comment got wrong.
 * It used to claim "RNW's pressability honours hitSlop (touches within the slop
 * outside the DOM box register), so visual box + 2×slop is the true hit area".
 * That is false: on react-native-web `hitSlop` is only honoured by the legacy
 * `Touchable` components, not by `Pressable` or by a `<Text onPress>`. The
 * auditor hit-tested every `[data-hitslop]` element at w393 with
 * `elementFromPoint` and **not one responded a single pixel outside its box** —
 * while the GL-05 sweep credited `2 × data-hitslop` toward the 36px floor and
 * reported `your-tasks-all`, an 11 × 14 tap target, as 39 × 42.
 *
 * So the marker is now only a marker. A control that needs a bigger tap target
 * on the web has to actually have one: see `webHitArea`.
 */
export function touchSlop(n: number, data: Record<string, string> = {}): Record<string, unknown> {
  return { hitSlop: n, dataSet: { ...data, hitslop: String(n) } };
}

/**
 * A REAL hit area on the web — padding to grow the box, negative margin of the
 * same size to put the surrounding layout back where it was. The element's own
 * `getBoundingClientRect` grows, so `elementFromPoint` hits it out to the new
 * edge and the sweep measures the truth rather than being told it.
 *
 * Native returns nothing: there `hitSlop` works, and padding would move things.
 */
export function webHitArea(n: number): ViewStyle {
  return Platform.OS === "web" ? { paddingVertical: n, paddingHorizontal: n, marginVertical: -n, marginHorizontal: -n } : {};
}
