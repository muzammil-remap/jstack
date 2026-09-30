/**
 * N8N-2, option (b): a section whose source is not connected says "Not connected yet" — never the
 * empty value as a fact: not "Nothing failing" (Agent issues), not "Runs today 0 · 100%", not "All
 * caught up. The Librarian runs again at 2:00" or "0 of 0 test questions" (Brain › Memory), and the
 * rail's health line says nothing rather than "all healthy · $0.00".
 *
 * The stores are set as `load()` leaves them when those reads answer `501` (their unit cases prove
 * that); a connected section with nothing in it keeps its own empty words.
 */
import React from "react";
import { act, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { Issues } from "@/components/agents/Issues";
import { Stats } from "@/components/agents/Stats";
import { Feed } from "@/components/agents/Feed";
import { Checks } from "@/components/agents/Checks";
import { Memory } from "@/components/brain/Memory";
import { HealthLine } from "@/components/chrome/HealthLine";
import { useAgentsStore } from "@/stores/agents";
import { useBrainStore } from "@/stores/brain";

/** mounted, then its effects let run inside act — as `calendarAllDay.test.tsx` does */
async function mount(node: React.ReactElement) {
  const utils = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 1440, height: 1000 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>{node}</ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>,
  );
  await act(async () => {
    for (let i = 0; i < 24; i++) await Promise.resolve();
  });
  return utils;
}

describe("N8N-2 · a section with no source says so", () => {
  beforeEach(() => {
    useAgentsStore.setState({ summary: null, spend: null, issues: [], feed: [], checks: [], notConnected: { summary: true, spend: true, issues: true, feed: true, checks: true } });
    useBrainStore.setState({ proposals: [], hitRate: null, memoryNotConnected: true });
  });

  it("Agent issues, Runs and spend, the feed and the checks: \"Not connected yet\", and none of their claims", async () => {
    const view = await mount(
      <>
        <Stats />
        <Issues />
        <Feed />
        <Checks />
      </>,
    );
    for (const id of ["stats-not-connected", "issues-not-connected", "feed-not-connected", "checks-not-connected"]) expect(view.getByTestId(id)).toHaveTextContent("Not connected yet");
    expect(view.queryByText(/Nothing failing/)).toBeNull();
    expect(view.queryByTestId("stat-success")).toBeNull();
  });

  it("Brain › Memory: \"Not connected yet\", never \"All caught up\" or a hit rate", async () => {
    const view = await mount(<Memory />);
    expect(view.getByTestId("memory-not-connected")).toHaveTextContent("Not connected yet");
    expect(view.queryByText(/Librarian runs again/)).toBeNull();
    expect(view.queryByText(/test questions/)).toBeNull();
  });

  it("the rail's health line says nothing without a summary — never \"all healthy · $0.00\"", async () => {
    const view = await mount(<HealthLine testID="rail-health" style={{}} />);
    expect(view.queryByText(/all healthy/)).toBeNull();
    expect(view.queryByTestId("rail-health")).toBeNull();
  });

  it("a CONNECTED section with nothing in it keeps its own empty words", async () => {
    useAgentsStore.setState({ notConnected: {} });
    useBrainStore.setState({ memoryNotConnected: false });
    expect((await mount(<Issues />)).getByText(/Nothing failing/)).toBeTruthy();
    expect((await mount(<Memory />)).getByText(/Librarian runs again/)).toBeTruthy();
  });
});
