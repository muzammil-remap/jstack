/**
 * A4R10-04 (rest), KNOWN_GAPS.md — Revise's Save, a proposal's Configure
 * Save, the Teach sheet's Save and Decision history's reopen all stayed
 * enabled offline and failed with nothing written: each is reached only
 * online in the mock, so a press with `online: false` threw where nobody
 * saw it. Same fix, same shape `lib/cardVerbs.ts`'s decision verbs already
 * have (`components/today/DecisionCard.tsx`) — `disabledReason` instead of
 * `onPress`, which `theme/ui/controls.tsx`'s `useButtonChrome` renders
 * disabled and toasts on press.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { reset as resetDb } from "@/data/mock/db";
import { OFFLINE_REASON } from "@/lib/cardVerbs";
import { useSessionStore } from "@/stores/session";
import { useTodayStore } from "@/stores/today";
import { useRulesStore } from "@/stores/rules";
import { useSectionsStore } from "@/stores/sections";
import { useAgentsStore } from "@/stores/agents";
import { ReviseDialog } from "@/components/today/ReviseDialog";
import { TeachSheet } from "@/components/today/TeachSheet";
import { ConfigureDialog } from "@/components/life/ConfigureDialog";
import { HistoryDialog } from "@/components/agents/HistoryDialog";

beforeEach(() => {
  resetDb();
  useSessionStore.setState({ online: true, toast: null });
});

describe("A4R10-04 · verbs that cannot succeed offline are disabled offline", () => {
  it("Revise's Save (ReviseDialog) — offline, no write and the offline toast", async () => {
    await useTodayStore.getState().load();
    const card = useTodayStore.getState().composite?.needsYou.find((c) => c.kind === "quote");
    expect(card).toBeDefined();
    const saveDraft = jest.spyOn(useTodayStore.getState(), "saveDraft");
    useSessionStore.setState({ online: false });

    const { getByTestId } = render(<ReviseDialog id={card!.id} onClose={jest.fn()} />);
    fireEvent.press(getByTestId("revise-save"));

    expect(saveDraft).not.toHaveBeenCalled();
    expect(useSessionStore.getState().toast?.message).toBe(OFFLINE_REASON);
  });

  it("the Teach sheet's Save — offline, no write and the offline toast", () => {
    const add = jest.spyOn(useRulesStore.getState(), "add");
    useSessionStore.setState({ online: false });

    const { getByTestId } = render(<TeachSheet payload={undefined} onClose={jest.fn()} />);
    fireEvent.changeText(getByTestId("teach-text"), "School pickup days are fixed");
    fireEvent.press(getByTestId("teach-save"));

    expect(add).not.toHaveBeenCalled();
    expect(useSessionStore.getState().toast?.message).toBe(OFFLINE_REASON);
  });

  it("a proposal's Configure Save (ConfigureDialog) — offline, no write and the offline toast", async () => {
    await useSectionsStore.getState().load();
    const save = jest.spyOn(useSectionsStore.getState(), "save");
    useSessionStore.setState({ online: false });

    const { getByTestId, queryByTestId } = render(<ConfigureDialog id="money" onClose={jest.fn()} />);
    await waitFor(() => expect(queryByTestId("config-save")).not.toBeNull());
    fireEvent.press(getByTestId("config-save"));

    expect(save).not.toHaveBeenCalled();
    expect(useSessionStore.getState().toast?.message).toBe(OFFLINE_REASON);
  });

  it("Decision history's reopen (agents HistoryDialog) — offline, no write and the offline toast", async () => {
    await useAgentsStore.getState().loadHistory();
    const row = useAgentsStore.getState().history[0];
    expect(row).toBeDefined();
    const reopenAction = jest.spyOn(useAgentsStore.getState(), "reopenAction");
    useSessionStore.setState({ online: false });

    const { getByTestId } = render(<HistoryDialog onClose={jest.fn()} />);
    // SearchableListDialog reloads on mount (its own `fetch` prop) — let that
    // settle before pressing, or React warns about an update outside act()
    await waitFor(() => expect(getByTestId(`agents-history-reopen-${row.id}`)).toBeTruthy());
    fireEvent.press(getByTestId(`agents-history-reopen-${row.id}`));

    expect(reopenAction).not.toHaveBeenCalled();
    expect(useSessionStore.getState().toast?.message).toBe(OFFLINE_REASON);
  });
});
