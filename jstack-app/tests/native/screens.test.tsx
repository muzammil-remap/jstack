/**
 * NR-04, the clause `primitives.test.tsx` does not cover — AUDIT_v2.md A-04.
 *
 * NR-04 reads: "Every **tab, dialog, sheet** and primitive mounts under
 * `jest-expo/ios` **with the real stores**; every string sits inside `<Text>`
 * (tree walk)." The primitives file covers the last word of that: 35
 * `theme/ui.tsx` primitives rendered in isolation, importing nothing from
 * `components/`, `app/` or `stores/`. So of what the row names — 0 of 5 tabs,
 * 0 of the dialogs and sheets, 0 real stores — and it read PASS.
 *
 * This file mounts the five real tab screens and the dialogs and sheets, with
 * the real zustand stores over the in-process mock server, and walks each
 * rendered tree with the same probe-derived `TEXT_TYPE` walker. That is the bug
 * class the lane exists for: react-native-web silently swallows a raw string
 * rendered outside a `<Text>`, and iOS does not — it throws, or renders
 * nothing at all. Every e2e test in this repo runs on web, so web is exactly
 * where that bug is invisible.
 *
 * The walker is imported from `./walker` rather than copied, so the two lanes
 * cannot drift apart.
 */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { collectViolations, probeTextType, type RTChild } from "./walker";

import TodayScreen from "@/app/(tabs)/index";
import TasksScreen from "@/app/(tabs)/tasks";
import BrainScreen from "@/app/(tabs)/brain";
import LifeScreen from "@/app/(tabs)/life";
import { SectionRenderer } from "@/layout/SectionRenderer";
import sectionsFixture from "@/data/mock/fixtures/sections.json";
import type { SectionConfig } from "@/data/types";
import AgentsScreen from "@/app/(tabs)/agents";

import { Dialog } from "@/components/chrome/Dialog";
import { Sheet } from "@/components/chrome/Sheet";
import { Help } from "@/components/chrome/Help";
import { ExternalLinkDialog } from "@/components/chrome/ExternalLinkDialog";
import { SettingsSheet } from "@/components/settings/SettingsSheet";
import { ArrangeDialog } from "@/components/chrome/ArrangeDialog";
import { TeachSheet } from "@/components/today/TeachSheet";
import { ReviseDialog } from "@/components/today/ReviseDialog";
import { HistoryDialog } from "@/components/today/HistoryDialog";
import { ReviewDialog } from "@/components/today/ReviewDialog";
import { TalkScreen } from "@/components/brain/TalkScreen";
import { TalkBanner } from "@/components/chrome/TalkBanner";
import { DictateDialog } from "@/components/brain/DictateDialog";
import { MemoryHistoryDialog } from "@/components/brain/MemoryHistoryDialog";
import { ReplyDetail } from "@/components/detail/ReplyDetail";
import { FindDialog } from "@/components/chrome/FindDialog";
import { IssuesAllDialog } from "@/components/agents/IssuesAllDialog";
import { FilesArchive } from "@/components/brain/FilesArchive";
import { BrainItemDetail } from "@/components/detail/BrainItemDetail";
import { DecisionDetail } from "@/components/detail/DecisionDetail";
import { FileDetail } from "@/components/detail/FileDetail";
import { GoalDetail } from "@/components/detail/GoalDetail";
import { GoalEditDialog } from "@/components/life/GoalEditDialog";
import { GoalsAllDialog } from "@/components/life/GoalsAllDialog";
import { LearningAllDialog } from "@/components/life/LearningAllDialog";
import { RulesEditDialog } from "@/components/settings/RulesEditDialog";
import { HabitEditDialog } from "@/components/life/HabitEditDialog";
import { IssueDetail } from "@/components/detail/IssueDetail";
import { LearningDetail } from "@/components/detail/LearningDetail";
import { QueuedItemDetail } from "@/components/detail/QueuedItemDetail";
import { FilterDialog } from "@/components/tasks/FilterDialog";
import { TrendsDialog } from "@/components/life/TrendsDialog";
import { ConfigureDialog } from "@/components/life/ConfigureDialog";
import { CapsDialog } from "@/components/agents/CapsDialog";
import { HistoryDialog as AgentsHistoryDialog } from "@/components/agents/HistoryDialog";
import { EmergencyConfirmDialog } from "@/components/agents/EmergencyLock";
import { ItemEditor } from "@/components/brain/ItemEditor";
import { ProposalEdit } from "@/components/brain/ProposalEdit";
import { CompleteConfirm } from "@/components/tasks/CompleteConfirm";
import { DelegatePicker } from "@/components/tasks/DelegatePicker";
import { SubtaskMenu } from "@/components/tasks/SubtaskMenu";
import { RangeDialog } from "@/components/tasks/RangeDialog";
import { SlicerEditDialog } from "@/components/tasks/SlicerEditDialog";
import { Devices } from "@/components/settings/Devices";
import { Sync } from "@/components/settings/Sync";
import { FocusEditDialog } from "@/components/settings/FocusEditDialog";
import { TaskDetail } from "@/components/tasks/TaskDetail";
import { DemoWatermark } from "@/components/chrome/DemoWatermark";
import { Rail } from "@/components/chrome/Rail";
import { ToastHost, TOAST_BOTTOM, TOAST_MS } from "@/components/chrome/Toast";
import { DEMO_WATERMARK_TEXT, WATERMARK_CLEARANCE } from "@/components/chrome/watermarkText";
import { get as mockDb, reset as resetMock } from "@/data/mock/db";
import { DIALOGS } from "@/layout/dialogs";
import { TextBlock } from "@/layout/blocks";
import { useSessionStore } from "@/stores/session";
import { Subtasks } from "@/components/tasks/Subtasks";
import { TaskRow } from "@/components/tasks/TaskRow";
import { YourTasks } from "@/components/today/YourTasks";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { getAdapter, getOutbox } from "@/data/provider";
import { useTodayStore } from "@/stores/today";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRulesStore } from "@/stores/rules";
import { useTasksStore } from "@/stores/tasks";
import { useTaskCardStore } from "@/stores/taskCard";
import { useBrainStore } from "@/stores/brain";
import { useSettingsStore } from "@/stores/settings";
import { useSectionsStore } from "@/stores/sections";
import { useFilesStore } from "@/stores/files";
// Stage 6 A-3 (BRAIN / TODAY / LIFE / AGENTS / SETTINGS)
import { LatestIn } from "@/components/brain/LatestIn";
import { DecisionCard } from "@/components/today/DecisionCard";
import { Checks } from "@/components/agents/Checks";
import { Feed } from "@/components/agents/Feed";
import { useSyncStore } from "@/stores/sync";
import { SyncDot } from "@/components/chrome/SyncDot";
import { QUEUED_KIND, queuedTitle } from "@/components/settings/Sync";
import { ROUTES } from "@/data/routes";
import { useAgentsStore } from "@/stores/agents";
import { formatTime12, formatWhen, now as clockNow, todayKey } from "@/lib/time";
import { Schedules } from "@/components/settings/Schedules";
import { NeedsYou } from "@/components/today/NeedsYou";
import type { ActionItem, BrainItem, OutboxEntry } from "@/data/types";
import { AppState, StyleSheet, Text as RNText, View } from "react-native";
import { waitFor, within } from "@testing-library/react-native";
import { light, radius, type as typeScale } from "@/theme/tokens";
// Stage 6 A-3 (the chrome findings): the orb, the field's mic control, and the
// two stores whose state the chrome reads (`useAgentsStore` is imported above)
import { Orb } from "@/components/chrome/Orb";
import { FieldButton } from "@/theme/ui";
import { useMicStore } from "@/stores/mic";
import { __resetMicForTests, startMic } from "@/lib/mic";
import { useVoiceStore } from "@/stores/voice";
import { misc, pagePadPhone, space } from "@/theme/tokens";
import { useUiStore } from "@/stores/ui";
import { useDeviceStore } from "@/stores/device";
import { DialogHost } from "@/components/chrome/DialogHost";
import { ARRANGE_NAME_COL } from "@/lib/labelColumn";
// A-6 (the planner's finding on the 20:26 mock): the lock screen's two words
import * as LocalAuthentication from "expo-local-authentication";
import { FaceIDGate } from "@/components/chrome/Gate";
import { Icon } from "@/components/chrome/Icon";
// A-6 (the carried-defect sweep): the reply dialog's sources (S6-57)
import { useRepliesStore } from "@/stores/replies";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <GestureHandlerRootView>
        <ThemeProvider>{children}</ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

/** the stores load through the adapter, so give the microtask queue room */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 24; i++) await Promise.resolve();
  });
}

beforeAll(() => {
  probeTextType((node) => render(<Providers>{node}</Providers>));
});

const SURFACES: { name: string; render: () => React.ReactElement }[] = [
  { name: "tab: Today", render: () => <TodayScreen /> },
  { name: "tab: Tasks", render: () => <TasksScreen /> },
  { name: "tab: Brain", render: () => <BrainScreen /> },
  { name: "tab: Life", render: () => <LifeScreen /> },
  { name: "tab: Agents", render: () => <AgentsScreen /> },

  { name: "Dialog", render: () => <Dialog title="Title" onClose={() => {}}><RNText>body</RNText></Dialog> },
  { name: "Sheet", render: () => <Sheet title="Title" onClose={() => {}}><RNText>body</RNText></Sheet> },
  { name: "Help", render: () => <Help onClose={() => {}} /> },
  { name: "ExternalLinkDialog", render: () => <ExternalLinkDialog url="https://twenty.example/" label="Twenty" onClose={() => {}} /> },
  { name: "SettingsSheet", render: () => <SettingsSheet onClose={() => {}} /> },
  { name: "ArrangeDialog", render: () => <ArrangeDialog payload="today" onClose={() => {}} /> },
  { name: "TeachSheet", render: () => <TeachSheet payload="c1" onClose={() => {}} /> },
  { name: "ReviseDialog", render: () => <ReviseDialog id="c2" onClose={() => {}} /> },
  { name: "HistoryDialog (today)", render: () => <HistoryDialog onClose={() => {}} /> },
  { name: "ReviewDialog", render: () => <ReviewDialog onClose={() => {}} /> },
  { name: "TalkScreen", render: () => <TalkScreen onClose={() => {}} /> }, // VP-11: the full-screen surface mounts on native
  { name: "TalkBanner", render: () => <TalkBanner /> },
  { name: "DictateDialog", render: () => <DictateDialog onClose={() => {}} /> },
  // O-1: the detail dialogs. Mounted with a real id where the fixture has one
  // and a missing id where it does not — the "no longer here" path is the one
  // a stale link actually takes, and it must not render blank.
  { name: "BrainItemDetail", render: () => <BrainItemDetail id="b1" onClose={() => {}} /> },
  { name: "DecisionDetail", render: () => <DecisionDetail id="c3" onClose={() => {}} /> },
  { name: "IssueDetail", render: () => <IssueDetail id="e1" onClose={() => {}} /> },
  { name: "LearningDetail", render: () => <LearningDetail id="l1" onClose={() => {}} /> },
  { name: "GoalDetail", render: () => <GoalDetail id="g1" onClose={() => {}} /> },
  // LG-1: the editor and the archive. The editor is mounted with no payload
  // (its list view) because that is the state the heading link opens.
  { name: "GoalEditDialog", render: () => <GoalEditDialog onClose={() => {}} /> },
  { name: "GoalsAllDialog", render: () => <GoalsAllDialog onClose={() => {}} /> },
  { name: "LearningAllDialog", render: () => <LearningAllDialog onClose={() => {}} /> },
  // LH-2: mounted with no payload, which is the list view the heading opens
  { name: "HabitEditDialog", render: () => <HabitEditDialog onClose={() => {}} /> },
  // ST-1: the EA's standing rules, which replaced Brain's `rule-edit` and
  // `rules-all` — both retired with the `Rule` type and its four routes
  { name: "RulesEditDialog", render: () => <RulesEditDialog onClose={() => {}} /> },
  { name: "FileDetail", render: () => <FileDetail id="f-t9-export" onClose={() => {}} /> },
  { name: "QueuedItemDetail", render: () => <QueuedItemDetail id="queued-x" onClose={() => {}} /> },
  // R-1: mounted with an id that is NOT in the store, because the store is
  // empty until something loads it — which is exactly the state a push into a
  // cold app arrives in, and the "no longer here" line is what must render.
  { name: "ReplyDetail", render: () => <ReplyDetail id="r1" onClose={() => {}} /> },
  // K-1: one component behind two entries, so one row covers both
  { name: "FindDialog", render: () => <FindDialog onClose={() => {}} /> },
  { name: "MemoryHistoryDialog", render: () => <MemoryHistoryDialog onClose={() => {}} /> },
  { name: "IssuesAllDialog", render: () => <IssuesAllDialog onClose={() => {}} /> },
  { name: "FilesArchive", render: () => <FilesArchive onClose={() => {}} /> },
  { name: "FilterDialog", render: () => <FilterDialog onClose={() => {}} /> },
  { name: "TrendsDialog", render: () => <TrendsDialog onClose={() => {}} /> },
  { name: "ConfigureDialog", render: () => <ConfigureDialog id="money" onClose={() => {}} /> },
  { name: "CapsDialog", render: () => <CapsDialog onClose={() => {}} /> },
  { name: "HistoryDialog (agents)", render: () => <AgentsHistoryDialog onClose={() => {}} /> },

  // AUDIT_v2.md AA-05: the first version of this file mounted 15 of the app's
  // 22 overlays and the BUGLOG said "all seventeen" — two of those seventeen
  // were the shared `Dialog`/`Sheet` chrome, not app dialogs. These eight are
  // the remainder of `app/_layout.tsx`'s own overlay list, `TaskDetail` (which
  // hosts Subtasks, EaReport, Activity and the delegate flow) most of all.
  { name: "TaskDetail", render: () => <TaskDetail id="t1" onClose={() => {}} /> },
  { name: "ItemEditor", render: () => <ItemEditor id="b1" onClose={() => {}} /> },
  { name: "ProposalEdit", render: () => <ProposalEdit id="p1" onClose={() => {}} /> },
  { name: "Devices", render: () => <Devices onClose={() => {}} /> },
  { name: "Sync", render: () => <Sync onClose={() => {}} /> }, // V2.1's Settings › Sync (O-2) — the one entry AUDIT_v21 A-5 found missing
  { name: "FocusEditDialog", render: () => <FocusEditDialog payload={undefined} onClose={() => {}} /> },
  { name: "EmergencyConfirmDialog", render: () => <EmergencyConfirmDialog onClose={() => {}} /> },
  // T-2's two choosers. `SubtaskMenu` takes `taskId:subtaskId`; t1's first
  // subtask is the one the card opens on, so this mounts the real thing rather
  // than an empty shell.
  { name: "CompleteConfirm", render: () => <CompleteConfirm id="t1" onClose={() => {}} /> },
  { name: "DelegatePicker", render: () => <DelegatePicker id="t1" onClose={() => {}} /> },
  { name: "SubtaskMenu", render: () => <SubtaskMenu id="t1:t1-1" onClose={() => {}} /> },
  // F-1's two: the range presets behind the always-visible chip, and the
  // slicer editor (a `ChipSetEditDialog` config, like the focus one above).
  { name: "RangeDialog", render: () => <RangeDialog onClose={() => {}} /> },
  { name: "SlicerEditDialog", render: () => <SlicerEditDialog payload={undefined} onClose={() => {}} /> },
];

/**
 * The registry's overlays this file mounts, by registry name. AUDIT_v21.md A-5
 * (and AUDIT_v2.md AA-05 before it): the list above held 23 of the 24 entries
 * in `layout/dialogs.tsx` and nothing said so — Settings › Sync, V2.1's own
 * overlay, was the one missing. The assertion below runs against the registry,
 * so a new entry that nobody mounts here is red the day it is registered.
 */
const COVERED = new Set([
  "help", "history", "review", "revise-card", "task-filter", "brain-dictate", "brain-item", "decision", "issue", "learning", "goal", "file", "queued-item", "memory-history", "issues-all", "files-archive", "reply", "find", "find-phone", "item-editor", "proposal-edit", "goal-edit", "goals-all", "learning-archive", "habit-edit", "rules-edit",
  "trends", "life-config", "caps", "agents-history", "arrange", "settings", "devices", "sync", "focus-edit", "emergency-confirm", "task",
  "external-link", "teach", "talk", "delegate-picker", "subtask-menu", "complete-confirm", "task-range", "slicer-edit",
]);

describe("NR-04 the native lane covers every registered overlay", () => {
  it("every entry in layout/dialogs.tsx is mounted by this file (AUDIT_v21 A-5)", () => {
    expect(DIALOGS.map((d) => d.name).filter((n) => !COVERED.has(n))).toEqual([]);
  });
});

describe("NR-04 native lane: every tab, dialog and sheet mounts on iOS with the real stores", () => {
  it.each(SURFACES)("$name mounts and renders no raw text outside <Text>", async (surface) => {
    const utils = render(<Providers>{surface.render()}</Providers>);
    await flush();

    const violations: string[] = [];
    collectViolations(utils.toJSON() as unknown as RTChild | RTChild[] | null, false, surface.name, violations);
    utils.unmount();

    expect(violations).toEqual([]);
  });

  it("the agents history names its channel as a proper noun — 'via Telegram', not 'via telegram' (ux-review R1-12)", async () => {
    // `ActionHistoryEntry.via` is the wire enum ("app" | "telegram" |
    // "expiry"); the row printed the enum. README Content: "Sentence case
    // everywhere except section labels (tracked caps) and proper nouns."
    const utils = render(
      <Providers>
        <AgentsHistoryDialog onClose={() => {}} />
      </Providers>,
    );
    await flush();
    expect(utils.queryAllByText(/via telegram/).length).toBe(0);
    expect(utils.queryAllByText(/via Telegram/).length).toBeGreaterThan(0);
    utils.unmount();
  });

  it("Arrange's 'App' group heading is a section label, like Configure's groups (ux-review R1-13)", async () => {
    // README Type: "Section label: 11.5 / 1, uppercase, letter-spacing .08em,
    // Accent ink". The heading rendered as `title` — a 15px serif card title,
    // the dialog's fourth heading treatment.
    const utils = render(
      <Providers>
        <ArrangeDialog payload="today" onClose={() => {}} />
      </Providers>,
    );
    await flush();
    const heading = StyleSheet.flatten(utils.getByText("App").props.style as never) as { fontSize?: number; textTransform?: string };
    expect({ fontSize: heading.fontSize, textTransform: heading.textTransform }).toEqual({ fontSize: typeScale.size.label, textTransform: "uppercase" });
    utils.unmount();
  });
});

describe("Stage 4 ux-review round 2", () => {
  it("the demo watermark carries its own ground so it stays legible over a scrim (R2-01)", () => {
    // The mark sits ABOVE every overlay (zIndex 150), so an open dialog does
    // not cover it — it dims the page under it. Muted ink on the scrimmed
    // ground measured 1.7:1 on `settings-d1-1366-light-prod` and 1.07:1 with
    // two scrims stacked (`sync-*`). README Accessibility documents the pair
    // that is legible: "Muted on Card 4.6:1" — so the mark paints its own
    // ground behind its own ink, and the ratio no longer depends on what is
    // open beneath it.
    const utils = render(
      <Providers>
        <DemoWatermark />
      </Providers>,
    );
    const box = StyleSheet.flatten(utils.getByTestId("demo-watermark").props.style as never) as { backgroundColor?: string; borderRadius?: number };
    const ink = StyleSheet.flatten(utils.getByText(DEMO_WATERMARK_TEXT).props.style as never) as { color?: string };
    expect({ backing: box.backgroundColor, radius: box.borderRadius, ink: ink.color }).toEqual({ backing: light.ground, radius: radius.tag, ink: light.muted });
    utils.unmount();
  });

  it("a decision card's expiry is the pack's short form, like the rows beneath it (R2-06)", async () => {
    // README Content: "Expiry is stated as a time and a consequence:
    // `expires Wed 5pm · then proposes 1`" — the pack's one worked example
    // is the short form. R-21 shortened the waiting rows and left the open
    // card long, so one decision read "expires Friday 5pm" on the card and
    // "expires Thu 5pm" on the row 40px below it. The mock still composes
    // the long day (CD-18); the app shortens it wherever it shows it.
    const utils = render(
      <Providers>
        <TodayScreen />
      </Providers>,
    );
    await flush();
    expect(utils.queryAllByText(/expires (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/).length).toBe(0);
    expect(utils.queryAllByText(/expires (Mon|Tue|Wed|Thu|Fri|Sat|Sun) 5pm · then proposes 1/).length).toBeGreaterThan(0);
    utils.unmount();
  });

  it("the offline health line's dot is Muted, not the app's alert colour (R2-08)", async () => {
    // README Colour, "Where colour goes": OK is the health dot; Alert is
    // needs-eyes items, over-budget bars and the emergency lock. Offline is
    // none of those — the line exists to say a capture is being KEPT — and
    // on all 16 `offline-*` frames it opened with the error colour while the
    // words beside it talked about connectivity. The rail and the phone
    // header are one statement in two places (OF-08), so both are checked.
    useSessionStore.setState({ online: false });
    try {
      const rail = render(
        <Providers>
          <Rail active="today" onTab={() => {}} onFind={() => {}} onSettings={() => {}} />
        </Providers>,
      );
      await flush();
      const railDot = StyleSheet.flatten(rail.getByTestId("rail-health").findAllByType(View)[0].props.style as never) as { backgroundColor?: string };
      rail.unmount();

      const today = render(
        <Providers>
          <TodayScreen />
        </Providers>,
      );
      await flush();
      const headerDot = StyleSheet.flatten(today.getByTestId("header-health").findAllByType(View)[0].props.style as never) as { backgroundColor?: string };
      today.unmount();

      expect({ rail: railDot.backgroundColor, header: headerDot.backgroundColor }).toEqual({ rail: light.muted, header: light.muted });
    } finally {
      useSessionStore.setState({ online: true });
    }
  });
});

describe("Stage 4 ux-review round 3", () => {
  it("a phone toast steps over the demo watermark's band instead of the mark moving into content (R3-01)", () => {
    // R-27 raised the mark above a toast by a constant and R-26's ground chip
    // then painted out whatever page or card content was there ("That's all
    // until 4pm." lost the top of every letter). The mark never moves for a
    // toast; while the mark renders, the phone toast sits WATERMARK_CLEARANCE
    // above the pack's 90 (DISCREPANCIES row 22). Desktop keeps 24: the mark
    // is at the rail's foot, nowhere near a centred pill.
    useSessionStore.getState().showToast("Went with option 1 · Dev call");
    try {
      const utils = render(
        <Providers>
          <ToastHost />
        </Providers>,
      );
      const wrapper = utils.UNSAFE_getAllByType(View).map((v) => StyleSheet.flatten(v.props.style as never) as { zIndex?: number; bottom?: number }).find((s) => s.zIndex === 105);
      expect(wrapper?.bottom).toBe(TOAST_BOTTOM.phone + WATERMARK_CLEARANCE);
      utils.unmount();
    } finally {
      useSessionStore.getState().hideToast();
    }
  });

  it("the task Activity card never prints a raw instant (R3-02)", async () => {
    // Day 2's overnight row read "EA · 2026-09-07T03:00:00.000Z" over its
    // sibling "EA · 6 September": every `at` is a timestamp on the wire
    // (CONTRACT_v21.md §1.11) and the card printed it raw.
    //
    // D-1 (ADR-47) changed what it is printed AS. `proseDate` gave the day and
    // dropped the clock — "EA · 6 September" for a run that finished at 2:14am
    // — so the line said when to the nearest day on a card whose whole subject
    // is what happened overnight. It goes through `formatWhen` now, like every
    // other instant in the app, and the pattern below is that shape: a relative
    // day or a dated one, then a twelve-hour time. Still non-vacuous — it
    // demands at least two matches, which is what caught the raw instant.
    resetMock(0, "day2");
    try {
      const utils = render(
        <Providers>
          <TaskDetail id="t1" onClose={() => {}} />
        </Providers>,
      );
      await flush();
      expect(utils.queryAllByText(/\d{4}-\d{2}-\d{2}T/).length).toBe(0);
      expect(utils.queryAllByText(/^EA · (Today|Tomorrow|Yesterday|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2},|\d{1,2} [A-Z][a-z]{2} \d{4},) \d{1,2}:\d{2}(am|pm)$/).length).toBeGreaterThanOrEqual(2);
      utils.unmount();
    } finally {
      resetMock();
    }
  });

  it("the push notice is a row of the Notifications card, not loose on the sheet (R3-05)", async () => {
    // README Components, Settings sheet: "section label above each card,
    // rows 8px tall with hairlines" — the push row rendered on the sheet
    // ground between the quiet-hours footer and the next label, the only
    // content on neither a card nor a label.
    const utils = render(
      <Providers>
        <SettingsSheet onClose={() => {}} />
      </Providers>,
    );
    await flush();
    expect(within(utils.getByTestId("settings-notifications-card")).getByTestId("push-row")).toBeTruthy();
    utils.unmount();
  });
});

/**
 * CD-04 / UX-D (carried from V2.1) — Money's footer never orphans its last value.
 *
 * The reviewer saw "… feed: Redbark, / V2.1" at 1024 and at 1366, and the same
 * line reading correctly at 393 and 1920. That width-dependence is why it took
 * three rounds to see: the two widths nobody re-ran were the two that broke
 * (hard rule 23). Both are asserted here.
 *
 * A jsdom render cannot wrap text, so this does not claim to measure a line
 * break. It asserts the thing that DECIDES the break — that the rendered
 * footer carries no ordinary space before its final token, and none around its
 * middle dots — which is what `richRuns` binds and what the frames needed.
 */
describe("CD-04 · Money's footer binds its dots and its last value (UX-D)", () => {
  const NBSP = " ";

  /** the real shape `money.due` builds, from the LF-06 fixture */
  const FOOTER = { id: "d0", accent: "RACQ home insurance · $1,184.20 due 21 Sep", text: " · feed: Redbark, V2.1" };

  const textOf = (node: unknown): string => {
    if (typeof node === "string") return node;
    if (node == null || typeof node !== "object") return "";
    const children = (node as { children?: unknown[] }).children ?? [];
    return children.map(textOf).join("");
  };

  for (const width of [1024, 1366]) {
    it(`no bare space before the last value, and none at a middle dot, at ${width}`, () => {
      const utils = render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width, height: 900 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <GestureHandlerRootView>
            <ThemeProvider>
              <TextBlock idPrefix="money-due" items={[FOOTER]} />
            </ThemeProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>,
      );

      const rendered = textOf(utils.getByTestId("money-due-d0"));

      // the whole line is there — a binding that dropped content would be worse
      expect(rendered).toContain("RACQ home insurance");
      expect(rendered).toContain("V2.1");

      // "Redbark, V2.1" is the break the frames actually showed
      expect(rendered).toContain(`Redbark,${NBSP}V2.1`);
      expect(rendered).not.toContain("Redbark, V2.1");

      // and no middle dot can start a line (R-34's other half)
      expect(rendered).not.toMatch(/ · /);

      // the final token of the whole line has nothing breakable before it
      expect(rendered).not.toMatch(/ \S+$/);
    });
  }

  it("the assertion can fail — the unbound string is what it used to render", () => {
    // without this, the four expectations above would read the same on a
    // TextBlock that had never heard of richRuns
    const unbound = `${FOOTER.accent}${FOOTER.text}`;
    expect(unbound).toContain("Redbark, V2.1");
    expect(unbound).toMatch(/ \S+$/);
  });
});

/**
 * Stage 5d P-1 — two of the four rendered defects the whole-tree read found
 * (`SIMPLIFICATION_v22.md` F-54, F-59). GL-07's rendered-text sweep never opens
 * the item editor or the Devices dialog, so a raw instant and a raw wire enum
 * sat in both through the whole of Stage 5: rule 19 (one form for each kind of
 * time, made in `lib/time.ts`) and rule 21 (no wire enum on screen), asserted
 * here because this is the lane that mounts those two surfaces.
 */
describe("Stage 5d P-1 · the surfaces the rendered sweep does not open", () => {
  it("the item editor's versions list says when and who in words, never the instant or the enum (F-54)", async () => {
    // a version exists only after an edit — the fixture item has none, and
    // BR-05's e2e only checks that the list APPEARS
    await useBrainStore.getState().saveItemEdit("b1", "Ella's passport expires before Bali — renew it this week");
    try {
      const utils = render(
        <Providers>
          <ItemEditor id="b1" onClose={() => {}} />
        </Providers>,
      );
      await flush();
      expect(utils.queryAllByText(/\d{4}-\d{2}-\d{2}T/).length).toBe(0);
      expect(utils.queryAllByText(/ · josh · /).length).toBe(0);
      expect(utils.queryAllByText(/^Today \d{1,2}:\d{2}(am|pm) · Josh · /).length).toBeGreaterThanOrEqual(1);
      utils.unmount();
    } finally {
      resetMock();
      useBrainStore.setState({ latestIn: [], itemVersions: [], editingItemId: null });
    }
  });

  it("Devices says when each device was last seen in words — never a day key, never an instant (F-59)", async () => {
    // `lastSeen` is an instant on the wire (CONTRACT_v2.md §3); the iPad's
    // fixture carried a bare day key and the dialog printed all three raw
    await useSettingsStore.getState().loadDevices();
    const utils = render(
      <Providers>
        <Devices onClose={() => {}} />
      </Providers>,
    );
    await flush();
    expect(utils.queryAllByText(/last seen \d{4}-\d{2}-\d{2}/).length).toBe(0);
    expect(utils.queryAllByText(/^last seen (Today|Yesterday) \d{1,2}:\d{2}(am|pm)$/).length).toBe(3);
    utils.unmount();
  });
});

/**
 * Stage 5d P-4 — an archive is `SearchableListDialog`'s own list now (F-55):
 * fetched whole once on open, narrowed HERE over the text each row gives.
 * Three dialogs wrote that fetch-filter-catch by hand and none of them had a
 * test on the narrowing.
 */
describe("Stage 5d P-4 · an archive filters its own rows", () => {
  it("GoalsAll narrows over the text each row gives, and an emptied needle brings every row back (F-55)", async () => {
    const utils = render(
      <Providers>
        <GoalsAllDialog onClose={() => {}} />
      </Providers>,
    );
    await flush();
    const before = utils.queryAllByTestId(/^goals-all-row-/).length;
    expect(before).toBeGreaterThan(0);
    fireEvent.changeText(utils.getByTestId("goals-all-search"), "zzzz-no-such-goal");
    await flush();
    expect(utils.queryAllByTestId(/^goals-all-row-/).length).toBe(0);
    expect(utils.queryAllByText("No matches.").length).toBe(1);
    fireEvent.changeText(utils.getByTestId("goals-all-search"), "");
    await flush();
    expect(utils.queryAllByTestId(/^goals-all-row-/).length).toBe(before);
    utils.unmount();
  });
});

/**
 * LL-03 — Life › Learning "all": the section verb opens the searchable
 * archive (`open-learning-archive`, the same shape `open-files-archive` is),
 * the needle finds the one `kind: "listen"` item by its podcast text, and a
 * row opens the same `learning` detail OP-06 already gives every Learning
 * row.
 */
describe("LL-03 · Life › Learning 'all' opens the searchable list; 'podcast' finds the listen item", () => {
  afterEach(() => {
    useSessionStore.setState({ modal: null, modalPayload: undefined });
  });

  /**
   * WPG-1c — the case that stood here mounted `LearningAllDialog` directly,
   * so a mutation that planted the Learning verb onto the FILES archive
   * (`open-files-archive` instead of `open-learning-archive` in
   * `sections.json`, or the same swap in `SECTION_VERBS`) still passed: the
   * dialog opens correctly no matter which section verb told it to. This
   * presses `learning-verb` (`layout/SectionHeaderRight.tsx:37`) on the
   * real `SectionRenderer` over the fixture's own "learning" config, through
   * `DialogHost`, the way a person actually reaches this dialog — so that
   * plant goes red here. `SectionRenderer` rather than the whole `LifeScreen`
   * (CB-04's own choice, `tests/native/sections.test.tsx`): the section's
   * wiring is what this case is about, and mounting the tab besides it would
   * add every other section's own loading and rendering as noise this case
   * has no interest in.
   */
  it("the section's own 'all' link opens the searchable list; 'podcast' narrows to the listen item, and pressing it opens the learning detail", async () => {
    const config = (sectionsFixture as SectionConfig[]).find((c) => c.id === "learning")!;
    const utils = render(
      <Providers>
        <SectionRenderer config={config} />
        <DialogHost />
      </Providers>,
    );
    await flush();

    fireEvent.press(utils.getByTestId("learning-verb"));
    await flush();
    expect(useSessionStore.getState().modal).toBe("learning-archive");
    expect(utils.getByTestId("learning-all-dialog")).toBeTruthy();

    // open-all: every learning item the fixture holds is here
    const before = utils.queryAllByTestId(/^learning-all-row-/).length;
    expect(before).toBeGreaterThan(1);

    // filter: "podcast" finds only the listen item
    fireEvent.changeText(utils.getByTestId("learning-all-search"), "podcast");
    await flush();
    const rows = utils.queryAllByTestId(/^learning-all-row-/);
    expect(rows.length).toBe(1);
    expect(rows[0].props.testID).toBe("learning-all-row-le2");
    expect(utils.getByTestId("learning-all-meta-le2")).toHaveTextContent(/podcast/);

    // open-one: pressing the row opens the same `learning` detail every row opens (OP-06)
    fireEvent.press(rows[0]);
    await flush();
    expect(useSessionStore.getState().modal).toBe("learning");
    expect(useSessionStore.getState().modalPayload).toBe("le2");

    utils.unmount();
  });
});

/**
 * Stage 5d P-9 — the ux findings open at the 5c boundary, the native half:
 * copy and composition the rendered sweeps never looked at.
 */
describe("Stage 5d P-9 · the ux findings, on the native lane", () => {
  it("Brain's Talk and Dictate sub-lines read sentence case (N1-12)", async () => {
    const utils = render(
      <Providers>
        <BrainScreen />
      </Providers>,
    );
    await flush();
    expect(utils.queryAllByText(/^(two-way|dictate,)/).length).toBe(0);
    expect(utils.getByText("Two-way voice, in the app")).toBeTruthy();
    expect(utils.getByText("Dictate; the EA replies in text")).toBeTruthy();
    utils.unmount();
  });

  it("the header's subtitle and a Latest-in title bind their last word, so neither can orphan it (N1-05, N1-04b)", async () => {
    const utils = render(
      <Providers>
        <BrainScreen />
      </Providers>,
    );
    await flush();
    // the default matcher collapses NBSP with every other space — the raw string is the claim
    const raw = { normalizer: (s: string) => s };
    expect(utils.queryAllByText(/runs\u00A0on$/, raw).length).toBe(1);
    expect(utils.queryAllByText(/the\u00A0renewal$/, raw).length).toBeGreaterThan(0);
    utils.unmount();
  });

  it("Brain's Files label carries the count of every file, not only the rows it shows (X1-12)", async () => {
    // a configured section: its record comes from GET /sections and its rows from GET /files
    await useSectionsStore.getState().load();
    await useFilesStore.getState().loadRecent();
    const utils = render(
      <Providers>
        <BrainScreen />
      </Providers>,
    );
    await flush();
    const section = within(utils.getByTestId("brain-files-section"));
    const rows = section.queryAllByTestId(/^file-f-/).length;
    const total = useFilesStore.getState().recent.length;
    // the section shows a capped slice (four of the fixture's ten), so a badge
    // that counted its rows would say 4 and no badge would say nothing — the
    // one number in the section must be the total
    expect(rows).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(rows);
    const numbers = section.queryAllByText(/^\d+$/).map((n) => Number(n.props.children));
    expect(numbers).toEqual([total]);
    utils.unmount();
  });
});

describe("Stage 6 A-2 · what the device pass photographed", () => {
  /**
   * B-130. The 3-second timer lived in `toast()` and twenty store callers
   * raised the pill through `showToast` without it, so "Saved here · syncs
   * when you're back online" and "Synced · 1 capture" stayed at the foot of
   * the screen until the next toast replaced them — four frames of the A-2
   * pass carried one, and V2.1's `offline` frame had too. The host that shows
   * a toast hides it, whichever way it was raised; an undo toast is on its
   * own clock; and a newer toast is never cleared by an older one's timer.
   */
  it("a plain toast leaves on its own after 3s, from wherever it was raised; an undo toast keeps its own clock (B-130)", () => {
    jest.useFakeTimers();
    try {
      const utils = render(
        <Providers>
          <ToastHost />
        </Providers>,
      );
      // raised the way stores/brain.ts and stores/sync.ts raise theirs — through the store, not toast()
      act(() => useSessionStore.getState().showToast("Saved here · syncs when you're back online"));
      expect(useSessionStore.getState().toast?.message).toBe("Saved here · syncs when you're back online");
      act(() => {
        jest.advanceTimersByTime(TOAST_MS - 1);
      });
      expect(useSessionStore.getState().toast?.message).toBe("Saved here · syncs when you're back online");
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(useSessionStore.getState().toast).toBeNull();

      // an undo toast is not on this clock: motion.undoSeconds, counted by expireUndo
      act(() => useSessionStore.getState().pushUndo("Later · Dev call", async () => {}));
      act(() => {
        jest.advanceTimersByTime(TOAST_MS + 500);
      });
      expect(useSessionStore.getState().toast?.undoLabel).toBe("Undo");
      // the ledger cleared by hand: `undoLatest()` is async, and a promise
      // left pending under fake timers would settle in the middle of the
      // next section
      act(() => useSessionStore.setState({ toast: null, undo: { entries: [] } }));

      // a newer toast outlives an older one's timer
      act(() => useSessionStore.getState().showToast("first"));
      act(() => {
        jest.advanceTimersByTime(TOAST_MS - 1000);
      });
      act(() => useSessionStore.getState().showToast("second"));
      act(() => {
        jest.advanceTimersByTime(1500);
      });
      expect(useSessionStore.getState().toast?.message).toBe("second");
      act(() => {
        jest.advanceTimersByTime(TOAST_MS);
      });
      expect(useSessionStore.getState().toast).toBeNull();
      utils.unmount();
    } finally {
      useSessionStore.setState({ toast: null, undo: { entries: [] } });
      jest.useRealTimers();
    }
  });
});

/**
 * S6-30 (ux round, Stage 6) — "1 subtask isn't done. Mark them done and
 * complete this task?" The count was right and the pronoun was written for
 * the plural. README Content: short sentences, plain words — and a sentence
 * that disagrees with its own number is neither. This is the copy's pin: no
 * other test quoted the sentence, which is how it stood on all 24 frames.
 */
describe("Stage 6 A-3 · the completion confirm's pronoun follows its count (S6-30)", () => {
  it("one open subtask reads 'Mark it done'; two read 'Mark them done'", async () => {
    resetMock();
    const t1 = mockDb().tasks.find((t) => t.id === "t1")!;
    expect(t1.subtasks.filter((s) => !s.done)).toHaveLength(1);
    const two = { ...t1, id: "t1-two-open", subtasks: t1.subtasks.map((s) => ({ ...s, done: false })).slice(0, 2) };
    expect(two.subtasks.filter((s) => !s.done)).toHaveLength(2);
    const before = useTasksStore.getState().list;
    // `useTask` reads the open card's copy BEFORE the list (P-2, B-26), and an
    // earlier case in this file leaves day 2's t1 on the card — with every
    // subtask done, which would make the count 0 and the sentence plural.
    const card = useTaskCardStore.getState();
    const cardBefore = { detailTask: card.detailTask, pendingComplete: card.pendingComplete };
    try {
      useTaskCardStore.setState({ detailTask: null, pendingComplete: null });
      useTasksStore.setState({ list: [t1, two] });
      const one = render(
        <Providers>
          <CompleteConfirm id="t1" onClose={() => {}} />
        </Providers>,
      );
      expect(one.getByTestId("complete-confirm-count")).toHaveTextContent("1 subtask isn't done. Mark it done and complete this task?");
      one.unmount();
      const more = render(
        <Providers>
          <CompleteConfirm id="t1-two-open" onClose={() => {}} />
        </Providers>,
      );
      expect(more.getByTestId("complete-confirm-count")).toHaveTextContent("2 subtasks aren't done. Mark them done and complete this task?");
      more.unmount();
    } finally {
      useTasksStore.setState({ list: before });
      useTaskCardStore.setState(cardBefore);
    }
  });
});

/**
 * Stage 6 A-3 — the chrome findings of the ux round (S6-02, S6-05, S6-06,
 * S6-09, S6-13, S6-17, S6-18, S6-34), each red on the tree the round
 * photographed. What every one of them has in common is a piece of floating
 * or shared chrome that was right against the neighbours its author had in
 * mind and wrong against one it had not: the watermark against a banner that
 * did not exist when its offset was measured, a second scrim over a first, a
 * health line that dropped its own words to say "mic on", a toast clamped for
 * an orb it could simply ask to step aside.
 */
describe("Stage 6 A-3 · the chrome findings (ux-review round 1), on the native lane", () => {
  /** the rendered instance type, derived from `render` rather than imported:
   * `react-test-renderer` ships no declarations here, so RNTL's own re-use of
   * the name resolves to `any` and an import of it is a TS7016 */
  type ReactTestInstance = ReturnType<ReturnType<typeof render>["getByTestId"]>;
  const degraded = { runsToday: 3, successPct: 90, spendToday: 0.4, issues: 1, health: "degraded" as const, heartbeat: { every: "5m", last: "" } };

  /** the nearest HOST ancestor — `getByTestId` hands back a host View whose
   * `.parent` is the composite that rendered it, not the box it sits in */
  const hostParent = (node: ReactTestInstance): ReactTestInstance | null => {
    let p = node.parent;
    while (p != null && typeof p.type !== "string") p = p.parent;
    return p;
  };
  /** is there a ListCard (`data-list`) anywhere above this node? */
  const onListCard = (node: ReactTestInstance | null): boolean => node != null && (((node.props as { dataSet?: Record<string, string> }).dataSet?.list === "1") || onListCard(node.parent));
  /** Talk renders the honest "not in this build" line unless the server says
   * live voice exists — the mock does (V-2), the cold store does not */
  const capabilitiesBefore = useSettingsStore.getState().capabilities;
  const withLiveVoice = () => useSettingsStore.setState({ capabilities: { ...capabilitiesBefore, liveVoice: true } });

  afterEach(() => {
    useMicStore.setState({ state: "off", purpose: null, error: null, notice: null });
    useVoiceStore.setState({ running: false, state: "idle", transcript: [], interim: "", filed: [] });
    useSessionStore.setState({ modal: null, modalPayload: undefined, sheet: null, sheetPayload: undefined, settingsOpen: false, toast: null, undo: { entries: [] } });
    useAgentsStore.setState({ summary: null });
    useSettingsStore.setState({ capabilities: capabilitiesBefore });
  });

  it("the demo watermark leaves the band while a mic banner is up on a phone (S6-02)", () => {
    // `mic-listening-d1-393-*`: the mark's opaque chip painted over the whole
    // of "Mic on · listening for Brain" and left a bar with a lone "Stop".
    // The two share the band above the tab bar, and the banner is the one a
    // person must read (JOSH_QA_v22 item 11) — so the mark yields, as it
    // already does while a field is expanded (TE-03).
    useMicStore.setState({ state: "listening", purpose: "brain" });
    const up = render(
      <Providers>
        <DemoWatermark />
      </Providers>,
    );
    expect(up.queryByTestId("demo-watermark")).toBeNull();
    up.unmount();

    useMicStore.setState({ state: "off", purpose: null });
    const down = render(
      <Providers>
        <DemoWatermark />
      </Providers>,
    );
    expect(down.getByTestId("demo-watermark")).toBeTruthy();
    down.unmount();
  });

  it("a dialog over the settings sheet paints no second scrim (S6-05)", () => {
    // `sync-conflict-d1-1366-*`: scrim + sheet + scrim + dialog — the
    // Settings sheet's own card measured (181,181,180), darker than the
    // app's light ground. README Components: "scrim + ONE frosted sheet".
    const backdropOf = () => {
      const u = render(
        <Providers>
          <Dialog testID="d" title="Title" onClose={() => {}}>
            <RNText>body</RNText>
          </Dialog>
        </Providers>,
      );
      const s = StyleSheet.flatten(u.getByTestId("d-backdrop").props.style as never) as { backgroundColor?: string };
      u.unmount();
      return s.backgroundColor;
    };
    expect(backdropOf()).toBe(misc.scrim);
    useSessionStore.setState({ settingsOpen: true });
    expect(backdropOf()).toBeUndefined();
  });

  it("the phone health line draws a separator before the sync dot, and the dot still contributes no text (S6-06)", async () => {
    // `brain-d1-393-*`: "● needs attention · $0.40 ●" — the second dot tacked
    // on after a space, on a line whose grammar is a middle dot between every
    // pair (README Content). DRAWN, not typed: §4 A-114 records that the dot
    // contributes no text so TD-02's exact-text pin holds, and it still does.
    useAgentsStore.setState({ summary: degraded });
    const utils = render(
      <Providers>
        <TodayScreen />
      </Providers>,
    );
    try {
      await flush();
      // the tab's own loads answer after the first paint; the line is read
      // once the summary is on it
      const line = utils.getByTestId("header-health");
      // decoration, hidden from accessibility — a screen reader gets the dot's
      // own name and no stray punctuation — which is why the default query,
      // which skips hidden elements, must not find it
      const sep = await waitFor(() => within(line).getByTestId("health-sep", { includeHiddenElements: true }));
      expect(within(line).queryByTestId("health-sep")).toBeNull();
      const style = StyleSheet.flatten(sep.props.style as never) as { width?: number; height?: number; backgroundColor?: string };
      expect({ width: style.width, height: style.height, ink: style.backgroundColor }).toEqual({ width: 2, height: 2, ink: light.muted });
      const order = line.findAll((n: ReactTestInstance) => typeof n.type === "string" && (n.props.testID === "health-sep" || n.props.testID === "sync-dot")).map((n: ReactTestInstance) => n.props.testID as string);
      expect(order).toEqual(["health-sep", "sync-dot"]);
      await flush();
    } finally {
      utils.unmount();
    }
  });

  it("Talk with the mic unavailable wears one dress: a resting orb and one Muted line under the field (S6-09)", async () => {
    // `talk-d1-1366-*`: a Marker-filled orb over "listening" over "Mic
    // unavailable here · type instead · you can still type below" in Alert —
    // three lines, two claims, and they disagree. The state line kept the
    // SESSION's word until A4R11-06 (v2.3 B-3, BUGLOG_v23.md): "listening" is
    // a claim about the microphone, so with none it reads "mic off", and the
    // resting orb and the Muted line under the field say the same, once each.
    withLiveVoice();
    useVoiceStore.setState({ running: true, state: "listening" });
    useMicStore.setState({ state: "error", purpose: "talk", error: "Mic unavailable here · type instead" });
    const utils = render(
      <Providers>
        <TalkScreen onClose={() => {}} />
      </Providers>,
    );
    try {
      await flush();
      expect(utils.getByTestId("talk-state")).toHaveTextContent("mic off");
      const line = utils.getByTestId("talk-mic-error");
      expect(line).toHaveTextContent("Mic unavailable here · type instead");
      expect(line).not.toHaveTextContent("you can still type below");
      expect((StyleSheet.flatten(line.props.style as never) as { color?: string }).color).toBe(light.muted);
      // the orb is the resting one — no live pulse, the Card surface
      const orb = utils.getByTestId("talk-orb");
      expect((orb.props as { dataSet?: Record<string, string> }).dataSet?.["mic-live"]).toBeUndefined();
      expect((StyleSheet.flatten(orb.props.style as never) as { backgroundColor?: string }).backgroundColor).toBe(light.card);
      await flush();
    } finally {
      utils.unmount();
    }
  });

  it("the mic orb stands down while an overlay is open, and on a phone while a toast is up (S6-09, S6-13)", () => {
    // `talk-d1-1366-*`: the idle orb at x 1297–1343 over the Talk panel's
    // scrim — a live control that starts a second capture over a running
    // conversation. And R12-01 clamped the phone toast to 248 so it would not
    // bite the orb; with the orb stepping aside the toast can have the band.
    const orbShown = () => {
      const u = render(
        <Providers>
          <Orb />
        </Providers>,
      );
      const shown = u.queryByTestId("mic-orb") != null;
      u.unmount();
      return shown;
    };
    expect(orbShown()).toBe(true);
    useSessionStore.setState({ sheet: "talk" });
    expect(orbShown()).toBe(false);
    useSessionStore.setState({ sheet: null, modal: "help" });
    expect(orbShown()).toBe(false);
    useSessionStore.setState({ modal: null, toast: { message: "Went with option 1 · Dev call" } });
    expect(orbShown()).toBe(false);
    useSessionStore.setState({ toast: null });
    expect(orbShown()).toBe(true);
  });

  it("the phone toast grows to the page padding and never ellipsises (S6-13)", () => {
    // `undo-toast-d1-393-*`: clamped to 246, the sentence wrapped AND
    // ellipsised — "Later · returns Mon 8am ·" / "RACQ home insurance · …" —
    // so the line that says what you just did was cut, ending on a dangling
    // dot. The pack gives the toast no width; the page padding is the edge.
    useSessionStore.getState().showToast("Later · returns Mon 8am · RACQ home insurance renewal");
    const utils = render(
      <Providers>
        <ToastHost />
      </Providers>,
    );
    const wrapper = utils
      .UNSAFE_getAllByType(View)
      .map((v) => StyleSheet.flatten(v.props.style as never) as { zIndex?: number; paddingHorizontal?: number })
      .find((s) => s.zIndex === 105);
    expect(wrapper?.paddingHorizontal).toBe(pagePadPhone.sides);
    const pill = StyleSheet.flatten(utils.getByTestId("toast").props.style as never) as { maxWidth?: number | string };
    expect(pill.maxWidth).toBe("100%");
    expect(utils.getByText(/RACQ/).props.numberOfLines).toBeUndefined();
    utils.unmount();
  });

  it("the toast reports its band, and the page and the sheet end above it while one is up (S6-13)", async () => {
    // `undo-toast-d1-393-*`: the toast sat on the EMAIL row's title and cut its
    // Approve to `rove`; `toast-over-sheet-d1-1366-*`: it covered the Time zone
    // value and the Calendar proposals label. The A-1 rule: "no floating
    // element over content or a control with a toast up". Padding inside the
    // scroll CONTENT would not clear a frame at scroll 0, so the toast
    // measures itself and publishes the band it occupies (`ui.toastInset`,
    // the keyboard inset's shape), and the page and the sheet END above it.
    useSessionStore.setState({ toast: { message: "Later · returns Mon 8am · RACQ home insurance", undoLabel: "Undo", secondsLeft: 10 } });
    const host = render(
      <Providers>
        <ToastHost />
      </Providers>,
    );
    const wrapper = host
      .UNSAFE_getAllByType(View)
      .map((v) => StyleSheet.flatten(v.props.style as never) as { zIndex?: number; bottom?: number })
      .find((s) => s.zIndex === 105);
    act(() => {
      fireEvent(host.getByTestId("toast"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 353, height: 56 } } });
    });
    const band = (wrapper?.bottom ?? 0) + 56 + space[3];
    expect(band).toBeGreaterThan(pagePadPhone.bottom);
    expect(useUiStore.getState().toastInset).toBe(band);

    const today = render(
      <Providers>
        <TodayScreen />
      </Providers>,
    );
    await flush();
    const page = StyleSheet.flatten(today.getByTestId("tab-screen-today").props.style as never) as { marginBottom?: number };
    expect(page.marginBottom).toBe(band);
    today.unmount();

    const sheet = render(
      <Providers>
        <SettingsSheet onClose={() => {}} />
      </Providers>,
    );
    await flush();
    const scroll = StyleSheet.flatten(sheet.getByTestId("settings-scroll").props.style as never) as { marginBottom?: number };
    expect(scroll.marginBottom).toBe(band);
    sheet.unmount();

    // and the band is given back the moment the toast leaves
    act(() => useSessionStore.setState({ toast: null }));
    expect(useUiStore.getState().toastInset).toBe(0);
    host.unmount();
  });

  it("a dialog opened over the task card paints no second scrim — one scrim, the outermost (S6-41)", async () => {
    // `delegate-picker-d1-1366-*`: scrim + task card + scrim + picker — the
    // card under the picker measured (118,117,113), 111 levels below the
    // ground. S6-05's class on a surface B-152's settings-only exemption never
    // reached; the host now hands the scrim to the outermost open overlay.
    useTaskCardStore.setState({ openTaskId: "t1" });
    useSessionStore.setState({ sheet: "delegate-picker", sheetPayload: "t1" });
    const utils = render(
      <Providers>
        <DialogHost />
      </Providers>,
    );
    try {
      await flush();
      const bg = (id: string) => (StyleSheet.flatten(utils.getByTestId(id).props.style as never) as { backgroundColor?: string }).backgroundColor;
      expect(bg("task-detail-backdrop")).toBe(misc.scrim);
      expect(bg("delegate-picker-backdrop")).toBeUndefined();
    } finally {
      utils.unmount();
      useSessionStore.setState({ sheet: null, sheetPayload: undefined });
      useTaskCardStore.setState({ openTaskId: null });
    }
  });

  it("an open dialog's frame is addressable by its own name on native (C-3b)", async () => {
    // Not the same claim `lib/dialogFocus.ts`'s header once made in passing —
    // native has no working "announce this as a modal" flag yet, see that
    // file's and `DialogHost.tsx`'s `DialogFrame` comments for why
    // `accessibilityViewIsModal` was tried and reverted. This is the part
    // that did land: a stable `${name}-frame` testID per open dialog.
    useTaskCardStore.setState({ openTaskId: "t1" });
    const utils = render(
      <Providers>
        <DialogHost />
      </Providers>,
    );
    try {
      await flush();
      expect(utils.getByTestId("task-frame")).toBeTruthy();
    } finally {
      utils.unmount();
      useTaskCardStore.setState({ openTaskId: null });
    }
  });

  it("the mini Gantt and the Calendar list are sections of their own: a disclosure each, and collapsing Waiting on leaves the Gantt (S6-42, JQ-06)", async () => {
    // `tasks-collapsed-d1-1366-*` against `tasks-list-*`: collapsing WAITING ON
    // took the GANTT label and card with it (the page 1586 → 1232 at 393), and
    // GANTT and CALENDAR were the only two headings with no triangle — the
    // mini card lived INSIDE the section above it and the calendar list's
    // heading was a bare label. JOSH_QA_v22 JQ-06; BRAIN_PROPOSAL, "Collapsible
    // headings everywhere … one implementation in the section label".
    const tasks = render(
      <Providers>
        <TasksScreen />
      </Providers>,
    );
    try {
      await flush();
      act(() => useDeviceStore.getState().toggleCollapsed("waiting-on"));
      await flush();
      expect(tasks.queryByTestId("disclose-waiting-on")).not.toBeNull();
      expect(tasks.queryAllByTestId(/^nudge-/)).toHaveLength(0);
      expect(tasks.queryByTestId("gantt-mini-label")).not.toBeNull();
      expect(tasks.queryByTestId("disclose-gantt-mini")).not.toBeNull();
    } finally {
      tasks.unmount();
      act(() => useDeviceStore.getState().toggleCollapsed("waiting-on"));
    }
    const today = render(
      <Providers>
        <TodayScreen />
      </Providers>,
    );
    try {
      await flush();
      expect(today.queryByTestId("disclose-calendar")).not.toBeNull();
      expect(today.queryByTestId("disclose-calendar-list")).not.toBeNull();
    } finally {
      today.unmount();
    }
  });

  it("Arrange's names sit in one column, so the ↑↓ pair starts at one x on every row (S6-43)", async () => {
    // `arrange-d1-1366-*` after B-156: the pair sat right after a name of
    // variable length — 26 px of travel on ↑ down one card. The rule S6-14
    // quoted and B-134 applied: "Type label at 48px fixed width so titles align."
    const utils = render(
      <Providers>
        <ArrangeDialog payload="today" onClose={() => {}} />
      </Providers>,
    );
    await flush();
    const widthOf = (id: string) => (StyleSheet.flatten(utils.getByTestId(`arrange-name-${id}`).props.style as never) as { width?: number }).width;
    expect(widthOf("needs")).toBe(ARRANGE_NAME_COL);
    expect(widthOf("glance")).toBe(ARRANGE_NAME_COL);
    utils.unmount();
  });

  it("'mic on' and 'Listening' are words in ink; Marker is the circle's alone (S6-48)", async () => {
    // `mic-listening-d1-393-*`: the health line's `mic on` measured (98,141,184)
    // and the field's `Listening` (102,143,179) — Marker, which README Colour
    // gives to "count badge … mic orb while listening. Nowhere else." B-157's
    // own note said the word stays ink; the pixels said otherwise.
    const fb = render(
      <Providers>
        <FieldButton icon="mic" primary testID="fb" state="listening" label="Listening" accessibilityLabel="Dictate" onPress={() => {}} />
      </Providers>,
    );
    const word = StyleSheet.flatten(fb.getByTestId("fb-state").props.style as never) as { color?: string };
    expect(word.color).toBe(light.ink);
    fb.unmount();
    useAgentsStore.setState({ summary: degraded });
    useMicStore.setState({ state: "listening", purpose: "brain" });
    const rail = render(
      <Providers>
        <Rail active="today" onTab={() => {}} onFind={() => {}} onSettings={() => {}} />
      </Providers>,
    );
    try {
      await flush();
      expect(rail.getByTestId("rail-health")).toHaveTextContent(/mic on$/);
      const colours = rail.getByTestId("rail-health").findAllByType(RNText).map((t: ReactTestInstance) => (StyleSheet.flatten(t.props.style as never) as { color?: string }).color);
      expect(colours).not.toContain(light.micLive);
    } finally {
      rail.unmount();
      useMicStore.setState({ state: "off", purpose: null });
    }
  });

  it("the toast binds its last two words, so a date never breaks across its lines (S6-50)", () => {
    // `toast-over-sheet-d1-1366-*`: "… · due 24" / "Sep" — B-155's wrap
    // landed inside a date. The same `noOrphan` B-143 wired into card titles.
    useSessionStore.getState().showToast("Later · returns Mon 8am · RACQ home insurance · $1,184.20 · due 24 Sep");
    const utils = render(
      <Providers>
        <ToastHost />
      </Providers>,
    );
    expect(String(utils.getByText(/due 24/).props.children)).toContain("24\u00A0Sep");
    utils.unmount();
    useSessionStore.setState({ toast: null });
  });

  it("the Edit caps dialog puts Save and Cancel in one row, as every other dialog does (S6-51)", async () => {
    // `caps-edit-d1-1366-*`: Save at y 548–583 and Cancel directly beneath it,
    // where the completion confirm, Arrange and every decision card put their
    // verbs side by side — Josh's v1.1 complaint, "some buttons centred, some
    // left-aligned", one dialog at a time.
    const hostAbove = (node: ReactTestInstance | null): ReactTestInstance | null => {
      let p = node?.parent ?? null;
      while (p != null && typeof p.type !== "string") p = p.parent;
      return p;
    };
    await useAgentsStore.getState().load();
    const utils = render(
      <Providers>
        <CapsDialog onClose={() => {}} />
      </Providers>,
    );
    await flush();
    const row = hostAbove(utils.getByTestId("caps-save"));
    expect(row).not.toBeNull();
    expect(hostAbove(utils.getByTestId("caps-cancel"))).toBe(row);
    expect((StyleSheet.flatten(row!.props.style as never) as { flexDirection?: string }).flexDirection).toBe("row");
    utils.unmount();
  });

  it("the delegate picker's default wears the recommended-option dress, and the alternative is Muted (S6-52)", async () => {
    // `delegate-picker-d1-1366-*`: `EA` in Accent ink, `Dev` in Ink, no fill,
    // no mark — 27 levels of ink between the default and the alternative.
    // README Components, Decision card: "recommended row filled Accent soft
    // with number in Accent ink; others transparent with number Muted".
    const hostAbove = (node: ReactTestInstance | null): ReactTestInstance | null => {
      let p = node?.parent ?? null;
      while (p != null && typeof p.type !== "string") p = p.parent;
      return p;
    };
    await useTasksStore.getState().loadRoster();
    const utils = render(
      <Providers>
        <DelegatePicker id="t1" onClose={() => {}} />
      </Providers>,
    );
    await flush();
    const ea = hostAbove(utils.getByTestId("delegate-to-ea-pick"));
    expect((StyleSheet.flatten(ea!.props.style as never) as { backgroundColor?: string }).backgroundColor).toBe(light.accentSoft);
    expect((StyleSheet.flatten(utils.getByTestId("delegate-to-dev-pick").props.style as never) as { color?: string }).color).toBe(light.muted);
    utils.unmount();
  });

  it("the Speed control takes its row, so six segments are wider than their own labels (S6-54)", async () => {
    // `settings-voice-*`: the track had shrunk to 119 px — 19.8 px a segment,
    // the `1` of `1.75x` printed through the `x` of `1.5x` — after ST1-11
    // dropped its fixed 200 without giving it the row. README Accessibility:
    // "Tap targets 36px minimum on phone."
    await useSettingsStore.getState().load();
    const utils = render(
      <Providers>
        <SettingsSheet onClose={() => {}} />
      </Providers>,
    );
    await flush();
    const speed = StyleSheet.flatten(utils.getByTestId("voice-speed").props.style as never) as { flex?: number; width?: number; flexShrink?: number };
    expect(speed.flex).toBe(1);
    expect(speed.width).toBeUndefined();
    const style = StyleSheet.flatten(utils.getByTestId("voice-style").props.style as never) as { width?: number };
    expect(style.width).toBe(200);
    utils.unmount();
  });

  it("the health line never breaks 'in conversation' across two lines (S6-59)", async () => {
    // `talk-d1-*` at 1366: the rail read "… · in" / "conversation" on eight frames
    withLiveVoice();
    useVoiceStore.setState({ running: true, state: "listening" });
    useAgentsStore.setState({ summary: degraded });
    const rail = render(
      <Providers>
        <Rail active="today" onTab={() => {}} onFind={() => {}} onSettings={() => {}} />
      </Providers>,
    );
    try {
      await flush();
      expect(rail.getByTestId("rail-health")).toHaveTextContent(/in conversation$/);
      expect(rail.queryByText(/in\u00A0conversation/, { normalizer: (s: string) => s })).not.toBeNull();
      // A62-01: the separator is NOT bound to the phrase. Binding it fixed the
      // trailing dot and produced a leading one, which the pack forbids by
      // name; both are carried to Josh with the two real answers
      // (CARRIED_DEFECTS_v22.md). This pins the state the tree is left in, so
      // that whoever takes the decision changes it deliberately.
      expect(rail.queryByText(/\u00b7 in\u00A0conversation/, { normalizer: (s: string) => s })).not.toBeNull();
    } finally {
      rail.unmount();
      useVoiceStore.setState({ running: false, state: "idle" });
    }
  });

  it("Arrange's rows sit on list cards, and a row's arrows sit beside its name rather than at the far edge (S6-17)", async () => {
    // `arrange-d1-1366-*`: rows on the bare frosted sheet with the page
    // ghosting through, and 671 px of every row empty between the name and
    // its first control. README Components, Settings sheet: "section label
    // above each card, rows 8px tall with hairlines" — Arrange had the
    // rows and no card.
    const utils = render(
      <Providers>
        <ArrangeDialog payload="today" onClose={() => {}} />
      </Providers>,
    );
    await flush();
    expect(onListCard(utils.getByTestId("arrange-row-glance").parent)).toBe(true);
    expect(onListCard(utils.getByTestId("arrange-tab-row-tasks").parent)).toBe(true);
    const up = hostParent(utils.getByTestId("arrange-up-glance"));
    const hide = hostParent(utils.getByTestId("arrange-hide-glance"));
    expect(up).not.toBeNull();
    expect(within(up!).queryByText("At a glance")).not.toBeNull();
    expect(up).not.toBe(hide);
    utils.unmount();
  });

  it("with the mic on, the health line keeps the agents' state and appends 'mic on' — on the rail and in the phone header (S6-18)", async () => {
    // `mic-listening-d1-1366-*`: the rail read "● mic on" and nothing else —
    // the attention state and the spend gone for as long as the mic was
    // open; at 393 the line did not say "mic on" at all. One state, one
    // sentence, at every width: "needs attention · $0.40 · mic on".
    useAgentsStore.setState({ summary: degraded });
    useMicStore.setState({ state: "listening", purpose: "brain" });
    const rail = render(
      <Providers>
        <Rail active="today" onTab={() => {}} onFind={() => {}} onSettings={() => {}} />
      </Providers>,
    );
    await flush();
    const railLine = rail.getByTestId("rail-health");
    expect(railLine).toHaveTextContent(/needs attention · \$0\.40 · mic on$/);
    const railDot = StyleSheet.flatten(railLine.findAllByType(View)[0].props.style as never) as { backgroundColor?: string };
    expect(railDot.backgroundColor).toBe(light.alert);
    rail.unmount();

    const today = render(
      <Providers>
        <TodayScreen />
      </Providers>,
    );
    await flush();
    expect(today.getByTestId("header-health")).toHaveTextContent(/needs attention · \$0\.40 · mic on$/);
    today.unmount();
  });

  it("the in-field mic control wears the pack's Listening dress while live — a Marker circle with a white glyph and the pulse, not the selected-chip soft fill (S6-18)", () => {
    // `mic-listening-*`: the live control's fill was Accent soft — the fill
    // of the selected focus chip 60 px above it. README Colour: Marker is
    // "mic while listening; the only saturated colour", and nothing on the
    // page was Marker-filled. JOSH_QA_v22 item 11: "I couldn't visually
    // differentiate when I'd clicked it or if it's working or not?"
    const utils = render(
      <Providers>
        <FieldButton icon="mic" primary testID="fb" state="listening" label="Listening" accessibilityLabel="Dictate" onPress={() => {}} />
      </Providers>,
    );
    const button = StyleSheet.flatten(utils.getByTestId("fb").props.style as never) as { backgroundColor?: string };
    expect(button.backgroundColor).not.toBe(light.accentSoft);
    const live = utils.getByTestId("fb").findAll((n: ReactTestInstance) => typeof n.type === "string" && (n.props as { dataSet?: Record<string, string> }).dataSet?.["mic-live"] === "1");
    expect(live).toHaveLength(1);
    utils.unmount();
  });

  it("Talk anchors the transcript to the foot and gives Mute and Reply equal weight (S6-34)", async () => {
    // `talk-d1-393-*`: the newest reply 408 px above the field you answer
    // in, and Mute 52 px beside a 299 px Reply. BRAIN_PROPOSAL row 2: "Mute ·
    // Reply · End at 64 px in car mode" — equal-weight controls, and a
    // conversation reads from the bottom.
    withLiveVoice();
    useVoiceStore.setState({ running: true, state: "listening", transcript: [{ role: "you", text: "What's most urgent?" }] });
    const utils = render(
      <Providers>
        <TalkScreen onClose={() => {}} />
      </Providers>,
    );
    try {
      await flush();
      const content = StyleSheet.flatten(utils.getByTestId("talk-transcript").props.contentContainerStyle as never) as { justifyContent?: string } | undefined;
      expect(content?.justifyContent).toBe("flex-end");
      const flexOf = (id: string) => (StyleSheet.flatten(utils.getByTestId(id).props.style as never) as { flex?: number }).flex;
      expect({ mute: flexOf("talk-mute"), reply: flexOf("talk-reply") }).toEqual({ mute: 1, reply: 1 });
      await flush();
    } finally {
      utils.unmount();
    }
  });
});

/**
 * Stage 6 A-3, round 1 — the ux findings in BRAIN / TODAY / LIFE / AGENTS /
 * SETTINGS, on the native lane. Every case here was red before its fix
 * (`evidence/ux-review.md` S6-07 · S6-11 · S6-12 · S6-16 · S6-22 · S6-31).
 */
describe("Stage 6 A-3 · what the owner reads, on the native lane", () => {
  /** jest-native's string form is an exact match; these cases mean "somewhere in it" */
  const has = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  it("Settings › Sync names a queued capture by its own first line and any other entry by its kind — never by its route (S6-07)", async () => {
    const before = useSyncStore.getState();
    const at = new Date().toISOString();
    const entries: OutboxEntry[] = [
      { offlineId: "q-dump", method: "POST", path: "/brain/dump", body: { text: "Ring the school about Term 4\nand ask about the dates" }, createdAt: at, attempts: 0, state: "queued" },
      { offlineId: "q-habit", method: "POST", path: "/habits/h1/log", body: { done: true }, createdAt: at, attempts: 0, state: "queued" },
    ];
    try {
      useSyncStore.setState({ queued: entries.length, entriesNow: entries });
      const utils = render(
        <Providers>
          <Sync onClose={() => {}} />
        </Providers>,
      );
      await flush();
      expect(utils.getByTestId("sync-queued-q-dump")).toHaveTextContent(has("Ring the school about Term 4"));
      expect(utils.getByTestId("sync-queued-q-dump")).not.toHaveTextContent("and ask about the dates");
      expect(utils.getByTestId("sync-queued-q-habit")).toHaveTextContent(has("a habit tick"));
      expect(utils.queryAllByText(/^\/(brain|habits)\//).length).toBe(0);
      utils.unmount();
    } finally {
      act(() => useSyncStore.setState({ queued: before.queued, entriesNow: before.entriesNow }));
    }
    // the kind map covers every route the queue can hold, and an upload is named by its file
    const offline = ROUTES.filter((r) => r.offline === true).map((r) => r.name).sort();
    expect(Object.keys(QUEUED_KIND).sort()).toEqual(offline);
    const upload: OutboxEntry = { offlineId: "q-file", method: "POST", path: "/files", body: undefined, multipart: { file: { filename: "receipt-oct.jpg", contentType: "image/jpeg", size: 12, data: "file:///tmp/receipt-oct.jpg" } }, createdAt: at, attempts: 0, state: "queued" };
    expect(queuedTitle(upload)).toBe("receipt-oct.jpg");
  });

  it("a Latest-in meta line is joined once: no leading dot without a routing, one bound dot with one (S6-12)", async () => {
    const at = new Date().toISOString();
    const base = { at, meta: "typed", source: "typed" as const, labels: { silo: "personal:josh" as const, types: ["open" as const], setBy: "source" as const }, setAt: at, focus: "personal" };
    const routed: BrainItem = { ...base, id: "s6-routed", text: "Ring the school about the Term 4 dates", routed: ["→ filing · Librarian"] };
    const bare: BrainItem = { ...base, id: "s6-bare", text: "What's most urgent?", routed: [] };
    const before = useBrainStore.getState().latestIn;
    try {
      useBrainStore.setState({ latestIn: [routed, bare] });
      const utils = render(
        <Providers>
          <LatestIn />
        </Providers>,
      );
      await flush();
      const raw = { normalizer: (s: string) => s };
      // ONE separator at the join, bound to both neighbours so it can never lead a line
      expect(utils.queryAllByText(/Librarian\u00A0·\u00A0typed/, raw).length).toBeGreaterThan(0);
      // and with nothing to route, no dot at all — nothing rendered begins with one
      expect(utils.queryAllByText(/^\s*·/, raw).length).toBe(0);
      expect(utils.queryByTestId("latest-routing-s6-bare")).toBeNull();
      expect(utils.getByTestId("latest-meta-s6-bare")).toHaveTextContent(/^typed · /);
      utils.unmount();
    } finally {
      act(() => useBrainStore.setState({ latestIn: before }));
    }
  });

  it("a decision card binds its title's last word and shows the silo's word, not its key (S6-16, S6-07)", async () => {
    const at = new Date().toISOString();
    const card: ActionItem = {
      id: "s6-tr",
      type: "Triage",
      kind: "triage",
      title: "Filed afr.com under Personal · reading. Keep it there?",
      state: "open",
      rank: 2,
      triage: { captureId: "x", routing: { kind: "reading", silos: ["personal:josh"], labels: ["open"], sensitivity: "normal", storage: "dropbox", provisional: true }, why: "no rule matched" },
      why: "no rule matched",
      sources: [],
      expiresAt: at,
      thenWhat: "expires Thursday 5pm · then it stays where it is",
      silence: "silence keeps the filing",
      verb: "Keep it there",
      toast: "Kept",
      history: [],
      receipt: { cost: 0.01, model: "haiku", sources: 0, seconds: 3 },
      labels: { silo: "personal:josh", types: ["unlabelled"], setBy: "review" },
      setAt: at,
      focus: "personal",
    };
    const utils = render(
      <Providers>
        <DecisionCard card={card} />
      </Providers>,
    );
    await flush();
    const raw = { normalizer: (s: string) => s };
    expect(utils.queryAllByText(/Keep it\u00A0there\?$/, raw).length).toBe(1);
    expect(utils.getByTestId("decision-triage-silo-s6-tr")).toHaveTextContent(has("personal"));
    expect(utils.getByTestId("decision-triage-silo-s6-tr")).not.toHaveTextContent("personal:josh");
    utils.unmount();
  });

  it("the Security card and the feed write every time through formatWhen — no long month, no 'h ago' (S6-22)", async () => {
    await useAgentsStore.getState().load();
    const { checks, feed } = useAgentsStore.getState();
    expect(checks.length).toBe(7);
    expect(feed.length).toBeGreaterThan(0);
    const utils = render(
      <Providers>
        <Checks />
        <Feed />
      </Providers>,
    );
    await flush();
    const secrets = checks.find((c) => c.id === "chk5")!;
    expect(utils.getByTestId("check-chk5")).toHaveTextContent(has(formatWhen(secrets.lastRun!)));
    const longMonth = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/;
    for (const c of checks) expect(utils.getByTestId(`check-${c.id}`)).not.toHaveTextContent(longMonth);
    for (const f of feed) {
      expect(utils.getByTestId(`feed-${f.id}`)).toHaveTextContent(has(formatWhen(f.at)));
      expect(utils.getByTestId(`feed-${f.id}`)).not.toHaveTextContent(/\d+ h ago/);
    }
    utils.unmount();
  });

  it("the Files archive counts and ends its list, offers open on every row, names the parent, and can filter for Dev (S6-31)", async () => {
    await useFilesStore.getState().loadArchive({});
    const utils = render(
      <Providers>
        <FilesArchive onClose={() => {}} />
      </Providers>,
    );
    await flush();
    const n = useFilesStore.getState().archive.length;
    expect(n).toBeGreaterThan(1);
    expect(utils.getByTestId("files-archive-count")).toHaveTextContent(has(`${n} files · that's all`));
    expect(utils.queryAllByTestId(/^archive-open-/).length).toBe(n);
    expect(within(utils.getByTestId("files-archive-who")).getByText("Dev")).toBeTruthy();
    expect(utils.getByTestId("files-archive-row-f-t1-quote")).toHaveTextContent(has("on a subtask"));
    expect(utils.getByTestId("files-archive-row-f-inbox-receipt")).toHaveTextContent(has("with a capture"));
    utils.unmount();
  });

  it("the Trends week tab is the month tab's card grid: a card per habit, seven dated cells with their weekday, and no second toggle (S6-11)", async () => {
    const utils = render(
      <Providers>
        <TrendsDialog onClose={() => {}} />
      </Providers>,
    );
    await flush();
    await flush();
    const today = todayKey();
    expect(utils.getByTestId("trend-row-h1")).toBeTruthy();
    expect(utils.queryAllByTestId(/^trend-week-h1-\d{4}-\d{2}-\d{2}$/).length).toBe(7);
    expect(utils.getByTestId(`trend-week-h1-${today}`)).toHaveTextContent(has(String(Number(today.slice(8, 10)))));
    expect(utils.getByTestId(`trend-week-h1-${today}-today`)).toBeTruthy();
    expect(utils.queryAllByTestId(/^life-habit-/).length).toBe(0);
    utils.unmount();
  });
});

describe("A-4 round 5 · a set editor never saves a set it has not loaded (A4R5-03)", () => {
  // A rule found in Find opens `rules-edit` with the rule's id, and nothing on
  // that path had loaded the rules: the editor found no member for the id, fell
  // through to a BLANK "Add a rule" form, and saving it replaced all seven
  // standing rules with one. The editor must wait for the set, then open the
  // rule it was asked for — never the add form, never a save composed from
  // nothing.
  beforeEach(() => {
    resetMock();
    useRulesStore.setState({ rules: [], loaded: false });
  });

  it("opened cold for one rule, it waits, then edits THAT rule — and a save keeps every other rule", async () => {
    const all = mockDb().autonomyRules;
    const target = all.find((r) => r.id === "ar4");
    expect(target).toBeDefined(); // else "that rule" proves nothing
    expect(all.length).toBeGreaterThan(1);

    const utils = render(
      <Providers>
        <RulesEditDialog payload="ar4" onClose={() => {}} />
      </Providers>,
    );
    // before the set arrives: a holding line, and no form to save
    expect(utils.getByTestId("rule-edit-loading")).toBeTruthy();
    expect(utils.queryByTestId("rule-save")).toBeNull();

    await flush();
    // the EDIT form for ar4, carrying its text — not a blank add form
    expect(utils.getByTestId("rule-text").props.value).toBe(target?.text);
    fireEvent.changeText(utils.getByTestId("rule-text"), `${target?.text} Tuesdays too.`);
    fireEvent.press(utils.getByTestId("rule-save"));
    await flush();

    const after = mockDb().autonomyRules;
    expect(after.map((r) => r.id)).toEqual(all.map((r) => r.id));
    expect(after.find((r) => r.id === "ar4")?.text).toBe(`${target?.text} Tuesdays too.`);
    utils.unmount();
  });
});

/**
 * A-4 round 11, A4R11-02 (security-class). MC-07 names unmount as an exit
 * path; nothing built it. The Dictate dialog is the one surface whose words
 * live in its own state — closed, they go nowhere, and the microphone went on
 * listening (in a real browser, streaming the room to the recogniser's cloud
 * service) with no surface behind the banner.
 */
describe("A-4 round 11 · closing the Dictate dialog releases its microphone (A4R11-02)", () => {
  it("the dialog's unmount stops every track of the session it owns", async () => {
    const stops = [0, 0];
    const tracks = stops.map((_, i) => ({ stop: () => (stops[i] += 1) }));
    const saved = (globalThis as Record<string, unknown>).navigator;
    (globalThis as Record<string, unknown>).navigator = { mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => tracks }) } };
    try {
      const utils = render(
        <Providers>
          <DictateDialog onClose={() => {}} />
        </Providers>,
      );
      await flush();
      // no callbacks: this lane has no SpeechRecognition, and a session that
      // wants words without a recogniser ends in `error` rather than listening
      await act(async () => {
        await startMic({ purpose: "dictate" });
      });
      expect(useMicStore.getState().state).toBe("listening");
      expect(stops).toEqual([0, 0]);

      utils.unmount();
      expect(stops).toEqual([1, 1]);
      expect(useMicStore.getState().state).toBe("off");
    } finally {
      if (saved === undefined) delete (globalThis as Record<string, unknown>).navigator;
      else (globalThis as Record<string, unknown>).navigator = saved;
      __resetMicForTests();
    }
  });
});

/**
 * v2.3 B-3 · A4R11-06 (the A-4 audit, round 11). A lock during Talk released
 * the microphone — the safe direction, MC-07 — and the screen went on saying
 * "listening", so a person driving kept talking to a microphone that was gone.
 * The planner's decision, within Josh's rule: the state line reads "Paused —
 * locked" with the transcript kept, a single Resume reopens the microphone
 * after the unlock, and nothing reopens on its own. Counted in streams the
 * device handed out, never read off a flag (D-6's lesson, AUDIT_v22.md).
 */
describe("A4R11-06 · a lock during Talk pauses the conversation, and only Resume reopens the microphone", () => {
  it("the lock leaves 'Paused — locked' and no open stream; the unlock opens nothing; Resume opens exactly one", async () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { navigator: g.navigator, MediaRecorder: g.MediaRecorder };
    const capabilities = useSettingsStore.getState().capabilities;
    /** one entry per stream the device handed out: how often its track was stopped */
    const streams: number[] = [];
    g.navigator = {
      mediaDevices: {
        getUserMedia: () => {
          const i = streams.push(0) - 1;
          return Promise.resolve({ getTracks: () => [{ stop: () => (streams[i] += 1) }] });
        },
      },
    };
    g.MediaRecorder = Object.assign(
      class {
        state = "recording";
        ondataavailable: unknown = null;
        start() {}
        stop() {
          this.state = "inactive";
        }
      },
      { isTypeSupported: (m: string) => m === "audio/webm;codecs=opus" },
    );
    const open = () => streams.filter((stops) => stops === 0).length;
    const settle = () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });
    useSettingsStore.setState({ capabilities: { ...capabilities, liveVoice: true } });
    useSessionStore.setState({ locked: false });
    const utils = render(
      <Providers>
        <TalkScreen onClose={() => {}} />
      </Providers>,
    );
    try {
      await act(async () => {
        useVoiceStore.getState().start();
        await new Promise((r) => setTimeout(r, 150)); // the greeting is spoken and the microphone opens
      });
      expect(open()).toBe(1);
      expect(utils.getByTestId("talk-state")).toHaveTextContent("listening");
      const transcript = useVoiceStore.getState().transcript;

      await act(async () => {
        useSessionStore.getState().relock();
      });
      expect(open()).toBe(0);
      expect(utils.getByTestId("talk-state")).toHaveTextContent("Paused — locked");
      expect(useVoiceStore.getState().running).toBe(true);
      expect(useVoiceStore.getState().transcript).toEqual(transcript);

      await act(async () => {
        useSessionStore.getState().unlock();
      });
      await settle();
      expect(streams).toHaveLength(1); // nothing reopened on its own
      expect(utils.getByTestId("talk-state")).toHaveTextContent("Paused — locked");

      fireEvent.press(utils.getByTestId("talk-resume"));
      await settle();
      expect(streams).toHaveLength(2);
      expect(open()).toBe(1);
      expect(utils.getByTestId("talk-state")).toHaveTextContent("listening");
      expect(utils.queryByTestId("talk-resume")).toBeNull();
    } finally {
      await act(async () => {
        useVoiceStore.getState().end();
      });
      utils.unmount();
      if (saved.navigator === undefined) delete g.navigator;
      else g.navigator = saved.navigator;
      if (saved.MediaRecorder === undefined) delete g.MediaRecorder;
      else g.MediaRecorder = saved.MediaRecorder;
      useSettingsStore.setState({ capabilities });
      useSessionStore.setState({ locked: false });
      __resetMicForTests();
    }
  });
});

/**
 * v2.3.1 WPJ-3 — Josh, 15 Sep: "If I lock the device, voice locks too." The device locking, or the app switching away,
 * pauses Talk the way JSTACK's own lock does (A4R11-06): the microphone is released, the transcript kept, and only
 * Resume reopens it. The state line reads "Paused" rather than "Paused — locked" because JSTACK itself has not locked
 * here; a phone with `lock.lockOnHideTouch` on locks as well, and then the line says so. Counted in streams the device
 * handed out, as A4R11-06's case is.
 */
describe("WPJ-3 · the app leaving the screen pauses Talk, and only Resume reopens the microphone", () => {
  it("background leaves 'Paused' and no open stream; coming back opens nothing; Resume opens exactly one", async () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { navigator: g.navigator, MediaRecorder: g.MediaRecorder };
    const capabilities = useSettingsStore.getState().capabilities;
    const appState = AppState.addEventListener as unknown as jest.Mock;
    const watchers = new Set<(state: string) => void>();
    appState.mockImplementation((_type: string, watch: (state: string) => void) => {
      watchers.add(watch);
      return { remove: () => watchers.delete(watch) };
    });
    const move = (state: string) =>
      act(async () => {
        [...watchers].forEach((watch) => watch(state));
      });
    /** one entry per stream the device handed out: how often its track was stopped */
    const streams: number[] = [];
    g.navigator = {
      mediaDevices: {
        getUserMedia: () => {
          const i = streams.push(0) - 1;
          return Promise.resolve({ getTracks: () => [{ stop: () => (streams[i] += 1) }] });
        },
      },
    };
    g.MediaRecorder = Object.assign(
      class {
        state = "recording";
        ondataavailable: unknown = null;
        start() {}
        stop() {
          this.state = "inactive";
        }
      },
      { isTypeSupported: (m: string) => m === "audio/webm;codecs=opus" },
    );
    const open = () => streams.filter((stops) => stops === 0).length;
    const settle = () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });
    useSettingsStore.setState({ capabilities: { ...capabilities, liveVoice: true } });
    useSessionStore.setState({ locked: false });
    const utils = render(
      <Providers>
        <TalkScreen onClose={() => {}} />
      </Providers>,
    );
    try {
      await act(async () => {
        useVoiceStore.getState().start();
        await new Promise((r) => setTimeout(r, 150)); // the greeting is spoken and the microphone opens
      });
      expect(open()).toBe(1);
      expect(utils.getByTestId("talk-state")).toHaveTextContent("listening");
      const transcript = useVoiceStore.getState().transcript;

      await move("background");
      expect(open()).toBe(0);
      expect(utils.getByTestId("talk-state")).toHaveTextContent("Paused");
      expect(utils.getByTestId("talk-state")).not.toHaveTextContent("locked");
      expect(useVoiceStore.getState().running).toBe(true);
      expect(useVoiceStore.getState().transcript).toEqual(transcript);

      await move("active");
      await settle();
      expect(streams).toHaveLength(1); // nothing reopened on its own
      expect(utils.getByTestId("talk-state")).toHaveTextContent("Paused");

      fireEvent.press(utils.getByTestId("talk-resume"));
      await settle();
      expect(streams).toHaveLength(2);
      expect(open()).toBe(1);
      expect(utils.getByTestId("talk-state")).toHaveTextContent("listening");
    } finally {
      await act(async () => {
        useVoiceStore.getState().end();
      });
      utils.unmount();
      appState.mockImplementation(() => ({ remove: jest.fn() }));
      if (saved.navigator === undefined) delete g.navigator;
      else g.navigator = saved.navigator;
      if (saved.MediaRecorder === undefined) delete g.MediaRecorder;
      else g.MediaRecorder = saved.MediaRecorder;
      useSettingsStore.setState({ capabilities });
      useSessionStore.setState({ locked: false });
      __resetMicForTests();
    }
  });
});

/**
 * v2.3 B-10 (seen beside A4R11-06, B-3). `TalkBanner` drew its mic glyph in the
 * live colour for as long as a conversation ran — paused by a lock included — so
 * the banner claimed a microphone the device was not backing. The glyph wears
 * the live colour only while the mic owner has Talk's microphone open, and the
 * resting orb's colour otherwise.
 */
describe("B-10 · the Talk banner's mic glyph is live only while Talk's microphone is open", () => {
  it("paused by a lock it rests; with Talk's microphone listening it is live", () => {
    useSessionStore.setState({ sheet: null });
    try {
      useVoiceStore.setState({ running: true, state: "listening", paused: "locked" });
      useMicStore.setState({ state: "off", purpose: null });
      const paused = render(
        <Providers>
          <TalkBanner />
        </Providers>,
      );
      expect(paused.UNSAFE_getByType(Icon).props.color).toBe(light.accentInk);
      paused.unmount();

      useVoiceStore.setState({ paused: null });
      useMicStore.setState({ state: "listening", purpose: "talk" });
      const live = render(
        <Providers>
          <TalkBanner />
        </Providers>,
      );
      expect(live.UNSAFE_getByType(Icon).props.color).toBe(light.micLive);
      live.unmount();
    } finally {
      useVoiceStore.setState({ running: false, state: "idle", paused: null });
      useMicStore.setState({ state: "off", purpose: null });
    }
  });
});

/**
 * Stage 6 A-6 · WCAG 2.5.3 Label in Name, on the lane where the two words
 * differ. The planner read the 20:26 mock at 393 (12 Sep) and found the pair:
 * the lock button shows "Unlock with passkey" and its control announced
 * "Unlock with Face ID". One of the two was wrong wherever you stood — a
 * speech-input user on the web said the words they could see and reached
 * nothing, and on a phone the screen offered a mechanism `Gate.tsx` never runs
 * there (native unlocks through expo-local-authentication; only the web runs
 * the passkey ceremony, `lib/webauthnGate.ts`).
 *
 * The web half is swept by `e2e/matrix/theme.spec.ts` ("label in name", every
 * control on the locked gate and all five tabs). This lane is the only place
 * the NATIVE words are rendered at all, so it is where the native pair is
 * pinned: what the button shows, what the gate announces, and that both name
 * the mechanism iOS actually runs.
 */
describe("Stage 6 A-6 · the lock screen announces the label it shows (WCAG 2.5.3)", () => {
  const textOf = (node: unknown): string => {
    if (typeof node === "string") return node;
    if (node == null || typeof node !== "object") return "";
    const children = (node as { children?: unknown[] }).children ?? [];
    return children.map(textOf).join("");
  };

  it("on iOS the gate's name contains the button's label, and both say Face ID", async () => {
    // the global mock in tests/setup.ts succeeds, which would unlock the gate
    // out from under the assertion: this case needs the screen to stay up
    const auth = LocalAuthentication.authenticateAsync as jest.MockedFunction<typeof LocalAuthentication.authenticateAsync>;
    auth.mockResolvedValueOnce({ success: false } as never);
    const wasLocked = useSessionStore.getState().locked;
    act(() => useSessionStore.setState({ locked: true, emergency: false }));
    const utils = render(
      <Providers>
        <FaceIDGate />
      </Providers>,
    );
    try {
      await act(async () => {
        await Promise.resolve();
      });
      const visible = textOf(utils.getByTestId("unlock-btn")).trim();
      const announced = String(utils.getByTestId("facelock").props.accessibilityLabel ?? "");
      // 2.5.3: the name contains the visible label, so "tap <what I can read>" lands
      expect(announced).toContain(visible);
      // and on this platform the mechanism is Face ID, not the web's passkey
      expect(visible).toBe("Unlock with Face ID");
      expect(utils.queryAllByText(/passkey/i)).toHaveLength(0);
    } finally {
      utils.unmount();
      act(() => useSessionStore.setState({ locked: wasLocked }));
    }
  });
});

/**
 * Stage 6 A-6 · S6-45..S6-63 sweep — the reply dialog's sources look tappable
 * (S6-57, carried at the A-3 cap).
 *
 * "The reply dialog's source rows are tappable and painted exactly like the
 * prose above them." They are the half that makes a reply checkable: each one
 * opens the record it cites (`layout/openRef.ts`). Painted as prose, the only
 * way to discover that is to tap the text and see what happens.
 *
 * The fix is the app's own vocabulary rather than a new dress: every other row
 * list in this app sits in a `ListCard` — the card ground, the border and the
 * hairlines between rows ARE how a row says it is a row (`theme/ui/surfaces.tsx`,
 * `EmergencyLock`'s consequences, Settings' every list). The sources were the
 * one list mounted bare on the dialog's ground.
 */
describe("Stage 6 A-6 · a reply's sources are rows, not prose (S6-57)", () => {
  it("the source rows sit in an Inset and each carries the chevron an opening row carries", async () => {
    resetMock();
    await act(async () => {
      await useRepliesStore.getState().load();
    });
    const reply = useRepliesStore.getState().replies.find((r) => r.sources.length > 0);
    expect(reply).toBeTruthy();
    const utils = render(
      <Providers>
        <ReplyDetail id={reply!.id} onClose={() => {}} />
      </Providers>,
    );
    try {
      const box = utils.getByTestId("reply-sources");
      const style = StyleSheet.flatten(box.props.style as never) as { backgroundColor?: string; borderWidth?: number };
      // A6-05: an Inset, the pack's container for a block inside a card — NOT a
      // second card. A ListCard here was a 30-level step on the dialog's own
      // ground with a shadow of its own.
      expect(style.backgroundColor).toBe(light.surfaceInset);
      expect(style.borderWidth).toBeUndefined();
      // the rows are INSIDE it, and the prose above is not
      const row = within(box).getByTestId(`reply-source-${reply!.sources[0].ref}`);
      expect(within(box).queryByTestId("reply-text")).toBeNull();
      // and each row says it opens something the way every other opening row in
      // the app says it: the muted chevron (FindRow.tsx, TaskRow.tsx)
      for (const src of reply!.sources) {
        const r = within(box).getByTestId(`reply-source-${src.ref}`);
        expect(within(r).UNSAFE_queryAllByType(Icon).length).toBe(1);
      }
      expect(row).toBeTruthy();
    } finally {
      utils.unmount();
    }
  });
});

/**
 * A-2 (WP-A, v2.3) — offline with nothing cached, a tab says so in one sentence
 * instead of an empty shell under its title. The same sentence on every tab,
 * chosen by session.online; a tap retries, because on a phone nothing else would.
 */
describe("A-2 · a tab whose first load failed says why", () => {
  it("offline it says captures still queue; online it offers a retry, and the retry loads the tab", async () => {
    const read = jest.spyOn(getAdapter(), "getToday").mockRejectedValue(new TypeError("Network request failed"));
    // whatever is still mounted when an assertion throws comes down BEFORE the
    // store is reset, or the reset re-renders it outside act() (GL-00)
    let mounted: { unmount: () => void } | null = null;
    try {
      // nothing cached is this case's own precondition: since A-3 a successful Today
      // load leaves an offline copy, and an earlier render in this file made one
      await AsyncStorage.removeItem("jstack.lastSeen.today");
      useTodayStore.setState({ composite: null });
      useSessionStore.setState({ online: false });
      const offline = render(
        <Providers>
          <TodayScreen />
        </Providers>,
      );
      mounted = offline;
      await flush();
      expect({ offline: offline.queryByText("You're offline · captures still queue") != null }).toEqual({ offline: true });
      offline.unmount();
      mounted = null;

      useSessionStore.setState({ online: true });
      const online = render(
        <Providers>
          <TodayScreen />
        </Providers>,
      );
      mounted = online;
      await flush();
      expect({ failed: online.queryByText("Couldn't load · tap to retry") != null }).toEqual({ failed: true });

      read.mockRestore();
      fireEvent.press(online.getByTestId("tab-unavailable-today"));
      await flush();
      expect({ failed: online.queryByText("Couldn't load · tap to retry") != null, loaded: useTodayStore.getState().composite != null }).toEqual({ failed: false, loaded: true });
      online.unmount();
      mounted = null;
    } finally {
      mounted?.unmount();
      read.mockRestore();
      useSessionStore.setState({ online: true });
    }
  });
});

/**
 * A-7 (WP-A, v2.3) — a queue held only in memory says so where the sync state is read. The table
 * in `tests/unit/syncStatus.test.ts` decides the words; these are the two places that show them:
 * the dot's label, and Settings › Sync beside the queue it lists.
 */
describe("A-7 · a queue held only in memory says so, on the dot and in Settings › Sync", () => {
  it("the dot's label and Settings › Sync both say captures are not being saved on this device", async () => {
    useSyncStore.setState({ persistent: false });
    try {
      const view = render(
        <Providers>
          <SyncDot withLabel />
          <Sync onClose={() => {}} />
        </Providers>,
      );
      await flush();
      expect({
        dot: view.getByTestId("sync-dot").props.accessibilityLabel,
        settings: view.queryAllByText(/captures are not being saved on this device/i).length,
      }).toEqual({ dot: "Sync · captures are not being saved on this device", settings: 1 });
      view.unmount();
    } finally {
      act(() => useSyncStore.setState({ persistent: true }));
    }
  });
});

/**
 * WPI-2 (v2.3.1) — a phone whose runtime cannot seal keeps nothing offline (`lib/encryptedStore.ts`'s probe), and
 * Settings › Sync says why, once, in place of A-7's line. The dot keeps A-7's words: the queue is in memory either way.
 */
describe("WPI-2 · Settings › Sync says when this device has no secure storage", () => {
  it("Settings › Sync says secure storage is unavailable, once, in place of the memory line, and the dot says what A-7's does", async () => {
    useSessionStore.setState({ secureStoreStatus: { status: "unavailable", reason: "crypto.getRandomValues is not provided on this device" } });
    useSyncStore.setState({ persistent: false });
    try {
      const view = render(
        <Providers>
          <SyncDot withLabel />
          <Sync onClose={() => {}} />
        </Providers>,
      );
      await flush();
      expect({
        dot: view.getByTestId("sync-dot").props.accessibilityLabel,
        secureLine: view.queryAllByText("Secure storage is unavailable on this device — captures are sent live and held in memory only; nothing is saved offline").length,
        memoryLine: view.queryAllByTestId("sync-not-persistent").length,
      }).toEqual({ dot: "Sync · captures are not being saved on this device", secureLine: 1, memoryLine: 0 });
      view.unmount();
    } finally {
      act(() => {
        useSessionStore.setState({ secureStoreStatus: { status: "ok", reason: null } });
        useSyncStore.setState({ persistent: true });
      });
    }
  });
});

/**
 * WPS-1 (v2.3.2) — Josh: "add 'needs you' schedule to be adjustable, in the settings schedule like all the others".
 * Needs you sits in Settings › Schedules after the seven, in their row's shape — the name and its line, the times in
 * accent ink, pause/resume — with its windows and quiet hours under it, and each change reaches the server's record.
 * The schedule is a field of quiet hours' record (`QuietHours.needsYou`). Today reads it: outside every window the
 * cards wait, the label keeps the count and the section says when they come; inside one, the cards, as before.
 */
describe("WPS-1 · Settings › Schedules carries Needs you beside the seven, and a change round-trips", () => {
  beforeEach(async () => {
    resetMock();
    await act(async () => {
      await useSettingsStore.getState().load();
    });
  });

  it("the entry renders in the Schedules card with the seven's controls, and pause/resume, the windows and quiet hours each reach the server", async () => {
    const view = render(
      <Providers>
        <Schedules />
      </Providers>,
    );
    await flush();
    const card = view.getByTestId("settings-schedules");
    const entry = within(card).getByTestId("schedule-needs-you");
    const checked = (id: string) => {
      const el = view.getByTestId(id);
      return el.props["aria-checked"] ?? el.props.accessibilityState?.checked;
    };
    expect({
      rows: within(card).queryAllByTestId(/^schedule-(sc\d+|needs-you)$/).length,
      name: within(entry).queryAllByText("Needs you").length,
      times: within(entry).queryAllByText("8:00 · 16:00").length,
      toggle: within(entry).queryAllByText("resume").length,
      windows: view.getByTestId("needs-you-windows").props.value,
      quietHours: checked("needs-you-quiet-hours"),
    }).toEqual({ rows: 8, name: 1, times: 1, toggle: 1, windows: "8:00–9:00, 16:00–17:00", quietHours: true });

    fireEvent.press(view.getByTestId("schedule-toggle-needs-you"));
    await flush();
    fireEvent.changeText(view.getByTestId("needs-you-windows"), "9:30–10:30, 15:00-16:00");
    await flush();
    fireEvent.press(view.getByTestId("needs-you-quiet-hours"));
    await flush();
    expect({
      server: mockDb().quietHours,
      toggle: within(view.getByTestId("schedule-needs-you")).queryAllByText("pause").length,
      times: within(view.getByTestId("schedule-needs-you")).queryAllByText("9:30 · 15:00").length,
      quietHours: checked("needs-you-quiet-hours"),
    }).toEqual({
      server: {
        start: "21:30",
        end: "07:00",
        exceptions: ["Security"],
        needsYou: { windows: [{ start: "09:30", end: "10:30" }, { start: "15:00", end: "16:00" }], respectsQuietHours: false, paused: false },
      },
      toggle: 1,
      times: 1,
      quietHours: false,
    });
    view.unmount();
  });
});

describe("WPS-1 · Today's Needs you waits outside its windows, with the count and when they come; inside one, the cards", () => {
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  /** the loaded quiet hours carrying one window, from and to so many minutes after `base`, quiet hours aside */
  const quietHoursAround = (base: number, fromMinutes: number, toMinutes: number) => ({
    ...useSettingsStore.getState().quietHours!,
    needsYou: {
      windows: [{ start: hhmm(new Date(base + fromMinutes * 60_000)), end: hhmm(new Date(base + toMinutes * 60_000)) }],
      respectsQuietHours: false,
      paused: false,
    },
  });

  beforeEach(async () => {
    resetMock();
    await act(async () => {
      await useSettingsStore.getState().load();
      await useTodayStore.getState().load();
    });
  });

  afterEach(async () => {
    resetMock();
    await act(async () => {
      await useSettingsStore.getState().load();
    });
  });

  it("outside: no card, the waiting line with the count and the next window's start, the count on the label; then inside: the open card and the end line, and no waiting line", async () => {
    const count = useTodayStore.getState().composite?.needsYou.length ?? 0;
    const base = clockNow().getTime();
    act(() => useSettingsStore.setState({ quietHours: quietHoursAround(base, 120, 180) }));
    const view = render(
      <Providers>
        <NeedsYou />
      </Providers>,
    );
    await flush();
    expect({
      count: count > 0,
      waitingLine: view.queryAllByText(`${count} waiting · next at ${formatTime12(new Date(base + 120 * 60_000))}`).length,
      cards: view.queryAllByTestId(/^decision-card-/).length,
      endLine: view.queryAllByTestId("needs-you-endline").length,
      badge: within(view.getByTestId("needs-you-label")).queryAllByText(String(count)).length,
    }).toEqual({ count: true, waitingLine: 1, cards: 0, endLine: 0, badge: 1 });

    act(() => useSettingsStore.setState({ quietHours: quietHoursAround(base, -60, 60) }));
    await flush();
    expect({
      waitingLine: view.queryAllByTestId("needs-you-held").length,
      cards: view.queryAllByTestId(/^decision-card-/).length,
      endLine: view.queryAllByTestId("needs-you-endline").length,
      badge: within(view.getByTestId("needs-you-label")).queryAllByText(String(count)).length,
    }).toEqual({ waitingLine: 0, cards: 1, endLine: 1, badge: 1 });
    view.unmount();
  });
});

/**
 * A-9 (WP-A, v2.3) — two small losses on the offline path, each on the surface it happens on.
 *
 * A4R7-11: the subtask field cleared the typed title before the write, so a write that threw —
 * offline over HTTP, where adding a subtask does not queue — lost the words. A4R8-09: an offline
 * tick patched the copies the app had loaded, and the next reload brought the server's copy back,
 * still open, while the completion sat in the queue; ticking it again was the natural response.
 */
describe("A-9 · a subtask title and an offline tick survive the offline path", () => {
  it("A4R7-11: a typed subtask title is still in the field when the write throws", async () => {
    const saved = useTaskEditsStore.getState().addSubtask;
    const add = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    useTaskEditsStore.setState({ addSubtask: add });
    let view: ReturnType<typeof render> | undefined;
    try {
      const task = { ...mockDb().tasks.find((t) => t.id === "t2")!, subtasks: [] };
      view = render(
        <Providers>
          <Subtasks task={task} usage={null} />
        </Providers>,
      );
      fireEvent.changeText(view.getByPlaceholderText("+ subtask"), "call the venue first");
      fireEvent.press(view.getByLabelText("Add subtask"));
      await flush();
      expect({ writes: add.mock.calls.length, stillTyped: view.queryByDisplayValue("call the venue first") != null }).toEqual({ writes: 1, stillTyped: true });
    } finally {
      // unmounted before the store is put back, so a failed assertion cannot re-render it outside act()
      view?.unmount();
      useTaskEditsStore.setState({ addSubtask: saved });
    }
  });

  it("A4R8-09: a task ticked offline still reads done on Today and in the Tasks list after a reload, while its completion is queued", async () => {
    useSessionStore.setState({ online: false, locked: false });
    let view: ReturnType<typeof render> | undefined;
    try {
      await useTodayStore.getState().load();
      const task = useTodayStore.getState().composite!.tasks.find((t) => t.status !== "done" && t.subtasks.every((s) => s.done))!;
      await useTaskCardStore.getState().completeTask(task.id, false, task);
      // a tab switch: Today reloads, and the server still has the task open
      await useTodayStore.getState().load();
      const reloaded = useTodayStore.getState().composite!.tasks.find((t) => t.id === task.id)!;
      view = render(
        <Providers>
          <YourTasks />
          <TaskRow task={reloaded} />
        </Providers>,
      );
      await flush();
      // the native host carries a checkbox's state as `accessibilityState.checked` — Pressable maps `aria-checked` onto it
      const ticked = (id: string) => (view!.getByTestId(id).props.accessibilityState as { checked?: boolean } | undefined)?.checked;
      expect({ serverStillOpen: reloaded.status !== "done", today: ticked(`your-task-cb-${task.id}`), tasksList: ticked(`task-cb-${task.id}`) }).toEqual({
        serverStillOpen: true,
        today: true,
        tasksList: true,
      });
    } finally {
      // unmounted before the stores move, so a failed assertion cannot re-render it outside act()
      view?.unmount();
      useSessionStore.setState({ online: true });
      await getOutbox().replay();
      await useSyncStore.getState().refresh();
      resetMock();
    }
  });
});
