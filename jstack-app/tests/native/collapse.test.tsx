/**
 * CL-01/CL-02 — the disclosure is a real control, and the heading never leaves.
 *
 * The rendered half of H-1. A collapsed section that hid its own heading would
 * be indistinguishable from a section Arrange had hidden, and the badge is the
 * reason to collapse rather than hide in the first place: "Agent issues 3"
 * collapsed is a person deciding not to look at three things they know about.
 */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { Meta, Section } from "@/theme/ui";
import * as encryptedStore from "@/lib/encryptedStore";
import { useDeviceStore } from "@/stores/device";

/**
 * `ThemeProvider` hydrates the device store in an effect, so a bare `render`
 * lands a state update outside `act` and GL-00's zero console budget fails the
 * case before it asserts anything. The same flush `screens.test.tsx` uses.
 */
async function draw(node: React.ReactElement) {
  const utils = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <GestureHandlerRootView>
        <ThemeProvider>{node}</ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>,
  );
  await act(async () => {
    for (let i = 0; i < 24; i++) await Promise.resolve();
  });
  return utils;
}

/** a FUNCTION, not a shared element: every case gets its own tree, so one
 * cases press cannot be read by the next through a reused node. */
const section = () => (
  <Section testID="probe-section" sectionId="probe" title="Agent issues" badge={3}>
    <Meta testID="probe-body">the body</Meta>
  </Section>
);

/**
 * BOTH halves, and the second one is the interesting one. `ThemeProvider`
 * hydrates on mount, so a case that collapsed something left it PERSISTED and
 * the next case drew a section that was already collapsed — its press then read
 * as expanding. That is CL-03 working exactly as specified, caught here because
 * a suite that passes alone and fails together is telling you something true.
 */
beforeEach(async () => {
  await encryptedStore.encryptedSet("jstack.collapsed", "");
  useDeviceStore.setState({ collapsed: {} });
});

describe("CL-01 · every heading has a disclosure, and everything starts open", () => {
  it("the triangle is a button that announces its expanded state", async () => {
    const utils = await draw(section());
    const control = utils.getByTestId("disclose-probe");
    expect(control.props.accessibilityRole).toBe("button");
    // the field, not the whole object: React Native fills the siblings
    // (busy, checked, disabled…) with undefined on re-render
    expect(control.props.accessibilityState.expanded).toBe(true);
    // 36px of target around a 16px glyph. This case said 32 — CL-01's number —
    // until GL-05's phone sweep failed on it: the app's own floor for every
    // interactive element is 36, and a spec sentence does not get to be the
    // exception (A-14). 36 satisfies CL-01's "at least this big" too.
    expect(control.props.style).toEqual(expect.objectContaining({ width: 36, height: 36 }));
  });

  it("the body is there on first run", async () => {
    const utils = await draw(section());
    expect(utils.queryByTestId("probe-body")).not.toBeNull();
  });

  it("a heading with no sectionId has no disclosure — a control that lies is worse than none", async () => {
    const utils = await draw(
      <Section testID="fixed-section" sectionId="fixed" collapsible={false} title="Cannot collapse">
        <Meta testID="fixed-body">the body</Meta>
      </Section>,
    );
    expect(utils.queryByTestId("disclose-fixed")).toBeNull();
    expect(utils.queryByTestId("fixed-body")).not.toBeNull();
  });
});

describe("CL-02 · collapsing keeps the heading and the badge", () => {
  it("tapping hides the body, and tapping again brings it back", async () => {
    const utils = await draw(section());
    await act(async () => {
      fireEvent.press(utils.getByTestId("disclose-probe"));
    });
    expect(utils.queryByTestId("probe-body")).toBeNull();
    await act(async () => {
      fireEvent.press(utils.getByTestId("disclose-probe"));
    });
    expect(utils.queryByTestId("probe-body")).not.toBeNull();
  });

  it("the name and the count survive collapsing — that is the whole point", async () => {
    const utils = await draw(section());
    await act(async () => {
      fireEvent.press(utils.getByTestId("disclose-probe"));
    });
    expect(utils.queryByText("Agent issues")).not.toBeNull();
    expect(utils.queryByText("3")).not.toBeNull();
  });

  it("the announced state and the label follow the collapse", async () => {
    const utils = await draw(section());
    await act(async () => {
      await act(async () => {
        fireEvent.press(utils.getByTestId("disclose-probe"));
      });
    });
    const control = utils.getByTestId("disclose-probe");
    expect(control.props.accessibilityState.expanded).toBe(false);
    expect(control.props.accessibilityLabel).toBe("Expand Agent issues");
  });

  it("the store is what changed, so the state is the device's and not this tree's", async () => {
    const utils = await draw(section());
    await act(async () => {
      fireEvent.press(utils.getByTestId("disclose-probe"));
    });
    expect(useDeviceStore.getState().collapsed).toEqual({ probe: true });
  });
});
