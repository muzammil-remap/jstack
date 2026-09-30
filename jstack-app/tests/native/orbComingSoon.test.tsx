/**
 * REMAP: voice is not in the n8n build — `capabilities.liveVoice` is off once settings load (Talk
 * with EA already says so on its own screen) — so the floating mic says "Coming soon" instead of
 * listening. Where voice is on, or before settings have loaded (the mock's own tests), the orb is
 * push-to-talk as it always was.
 */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { Orb } from "@/components/chrome/Orb";
import { localCapabilitiesFallback } from "@/data/capabilities";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";

async function mount() {
  const utils = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 1440, height: 1000 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <Orb />
        </ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>,
  );
  await act(async () => {
    for (let i = 0; i < 24; i++) await Promise.resolve();
  });
  return utils;
}

beforeEach(() => useSessionStore.setState({ toast: null }));

it("voice off, settings loaded: a press says \"Coming soon\" and nothing listens", async () => {
  useSettingsStore.setState({ loaded: true, capabilities: { ...localCapabilitiesFallback(), liveVoice: false } });
  const view = await mount();
  await act(async () => {
    fireEvent(view.getByTestId("mic-orb"), "pressIn");
  });
  expect(useSessionStore.getState().toast?.message).toBe("Coming soon");
});

it("voice on: the press is push-to-talk, and says nothing of the kind", async () => {
  useSettingsStore.setState({ loaded: true, capabilities: { ...localCapabilitiesFallback(), liveVoice: true } });
  const view = await mount();
  await act(async () => {
    fireEvent(view.getByTestId("mic-orb"), "pressIn");
    fireEvent(view.getByTestId("mic-orb"), "pressOut");
  });
  expect(useSessionStore.getState().toast?.message ?? null).not.toBe("Coming soon");
});
