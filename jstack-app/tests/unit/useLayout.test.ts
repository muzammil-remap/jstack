/**
 * DS-06/RL-01..04 (Jest half) — theme/useLayout.ts's width → {phone, rail,
 * columns} table, straight from BUILD_PLAN_v2.md row 3: 393 → phone, no
 * rail, 1 column; 768 → rail, 2; 1024 → 2; 1180 → 3; 1366 → 3; 1920 → 3.
 * Exercises `layoutFor` directly (the pure table `useLayout` wraps) rather
 * than mocking react-native's useWindowDimensions/Dimensions.
 */
import { layoutFor } from "@/theme/useLayout";

describe("DS-06/RL-01..04 useLayout width table", () => {
  it.each([
    [393, true, false, 1],
    [768, false, true, 2],
    [1024, false, true, 2],
    [1180, false, true, 3],
    [1366, false, true, 3],
    [1920, false, true, 3],
  ])("width %d -> phone=%s rail=%s columns=%d", (width, phone, rail, columns) => {
    const layout = layoutFor(width as number);
    expect(layout.phone).toBe(phone);
    expect(layout.rail).toBe(rail);
    expect(layout.columns).toBe(columns);
    expect(layout.width).toBe(width);
  });
});
