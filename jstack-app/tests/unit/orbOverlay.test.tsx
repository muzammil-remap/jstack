/**
 * MC-10, `02_ACCEPTANCE_TESTS_v22.md` — the orb and Talk's Mute use the same
 * states and the same release (`lib/mic.ts`'s single microphone owner,
 * `tests/unit/mic.test.ts` MC-01/MC-07); the orb cannot start a session
 * while one is open (S6-09) — including Talk's own, which is a `sheet`-
 * sourced overlay `useOverlayOpen()` already answers true for.
 */
import { render } from "@testing-library/react-native";
import { reset as resetDb } from "@/data/mock/db";
import { Orb } from "@/components/chrome/Orb";
import { useMicStore } from "@/stores/mic";
import { useSessionStore } from "@/stores/session";
import { useTaskCardStore, INITIAL as CARD_INITIAL } from "@/stores/taskCard";

beforeEach(() => {
  resetDb();
  useSessionStore.setState({ modal: null, sheet: null, settingsOpen: false, toast: null });
  useTaskCardStore.setState(CARD_INITIAL);
  useMicStore.getState().clear();
});

describe("MC-10 · the orb cannot start a session while one is open", () => {
  it("renders when nothing is open", () => {
    const { queryByTestId } = render(<Orb />);
    expect(queryByTestId("mic-orb")).not.toBeNull();
  });

  it("is gone while Talk is open (sheet: \"talk\") — no second microphone over a running conversation", () => {
    useSessionStore.setState({ sheet: "talk" });
    const { queryByTestId } = render(<Orb />);
    expect(queryByTestId("mic-orb")).toBeNull();
  });

  it("is gone while any other overlay is open (a modal) — S6-09, not just Talk specifically", () => {
    useSessionStore.setState({ modal: "help" });
    const { queryByTestId } = render(<Orb />);
    expect(queryByTestId("mic-orb")).toBeNull();
  });

  it("is gone while the task card is open", () => {
    useTaskCardStore.setState({ openTaskId: "t1" });
    const { queryByTestId } = render(<Orb />);
    expect(queryByTestId("mic-orb")).toBeNull();
  });

  it("is gone while Talk's microphone is live with no overlay showing — a background Talk session " +
     "is still the one owner, and the orb offering itself would let a press steal it (MC-10 / C-7b)", () => {
    useMicStore.setState({ state: "listening", purpose: "talk" });
    const { queryByTestId } = render(<Orb />);
    expect(queryByTestId("mic-orb")).toBeNull();
  });
});
