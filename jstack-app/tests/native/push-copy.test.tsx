/**
 * PU-01 (the copy half) — "absent → the Notifications sheet shows 'push
 * needs the backend' and no prompt". `tests/unit/push.test.ts` proves the
 * STATE is `unavailable`; this mounts the card with no `pushPublicKey` and
 * reads the sentence the person actually sees, because the acceptance row
 * quotes words and the screen said different ones for a whole stage
 * (A-0 review, R-07).
 */
import React from "react";
import { act, render } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { Notifications } from "@/components/settings/Notifications";
import { useSettingsStore } from "@/stores/settings";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>{children}</ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** a browser that CAN do push — so the only reason left is the missing key.
 * On the native preset there is no `serviceWorker` and no `Notification`, and
 * the card honestly says "this browser cannot do push notifications" before
 * it ever reads the key; that is a different sentence for a different state. */
type Globals = { navigator?: unknown; Notification?: unknown };
const g = globalThis as Globals;

describe("PU-01 · the words when the backend has no push service", () => {
  beforeEach(() => {
    g.navigator = { serviceWorker: { getRegistration: async () => undefined, ready: new Promise(() => {}) } };
    g.Notification = { permission: "default", requestPermission: async () => "granted" };
  });
  afterEach(() => {
    delete g.navigator;
    delete g.Notification;
  });

  it("says push needs the backend, and offers no switch", async () => {
    const before = useSettingsStore.getState().capabilities;
    useSettingsStore.setState({ capabilities: { ...before, pushPublicKey: undefined } as typeof before, notificationGroups: [] });
    const utils = render(
      <Providers>
        <Notifications />
      </Providers>,
    );
    try {
      // `pushState()` answers on microtasks; they run inside this act, so the
      // console budget (GL-00) stays at zero
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(utils.getByTestId("push-state").props.children).toContain("push needs the backend");
      expect(utils.queryByTestId("push-switch")).toBeNull();
    } finally {
      // unmount BEFORE restoring the store: a store write with the card still
      // mounted is a re-render outside act, and that is a console.error
      utils.unmount();
      useSettingsStore.setState({ capabilities: before });
    }
  });
});
