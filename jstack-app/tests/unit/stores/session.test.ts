/**
 * UN-01 (Jest half) — stores/session.ts's undo ledger: pushUndo() shows
 * the toast with a countdown, undoLatest() fires the revert and clears
 * it, and an entry past its expiresAt drops out on the next expireUndo()
 * tick without firing.
 */
import { reset as resetDb, setClockOffsetMs as setDbClockOffsetMs } from "@/data/mock/db";
import { useSessionStore } from "@/stores/session";
import { INITIAL as CARD_INITIAL, useTaskCardStore } from "@/stores/taskCard";

function freshSession() {
  useSessionStore.setState({
    locked: true,
    emergency: false,
    online: true,
    clockOffsetMs: 0,
    modal: null,
    modalPayload: undefined,
    sheet: null,
    toast: null,
    undo: { entries: [] },
  });
}

beforeEach(() => {
  resetDb();
  setDbClockOffsetMs(0);
  freshSession();
});

describe("stores/session.ts", () => {
  it("unlock()/relock() flip locked", () => {
    useSessionStore.getState().unlock();
    expect(useSessionStore.getState().locked).toBe(false);
    useSessionStore.getState().relock();
    expect(useSessionStore.getState().locked).toBe(true);
  });

  it("openModal/closeModal and openSheet/closeSheet track the stack", () => {
    const s = useSessionStore.getState();
    s.openModal("task", "t1");
    expect(useSessionStore.getState()).toMatchObject({ modal: "task", modalPayload: "t1" });
    s.closeModal();
    expect(useSessionStore.getState().modal).toBeNull();
    s.openSheet("dump");
    expect(useSessionStore.getState().sheet).toBe("dump");
    s.closeAll();
    expect(useSessionStore.getState()).toMatchObject({ modal: null, sheet: null });
  });

  it("closeAll() closes the open task card too, not just modal/sheet/settings (C-1)", () => {
    useTaskCardStore.setState(CARD_INITIAL);
    useTaskCardStore.setState({ openTaskId: "t1" });
    useSessionStore.getState().closeAll();
    expect(useTaskCardStore.getState().openTaskId).toBeNull();
    expect(useTaskCardStore.getState().detailTask).toBeNull();
  });

  it("pushUndo shows a toast with an undo label and a 10s countdown", () => {
    useSessionStore.getState().pushUndo("Went with option 1", async () => {});
    const state = useSessionStore.getState();
    expect(state.toast).toMatchObject({ message: "Went with option 1", undoLabel: "Undo", secondsLeft: 10 });
    expect(state.undo.entries).toHaveLength(1);
  });

  it("undoLatest() fires the newest entry's revert and clears the ledger + toast", async () => {
    const revert = jest.fn(async () => {});
    useSessionStore.getState().pushUndo("Answered", revert);
    await useSessionStore.getState().undoLatest();
    expect(revert).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().undo.entries).toHaveLength(0);
    expect(useSessionStore.getState().toast).toBeNull();
  });

  it("expireUndo() drops an entry once its expiresAt has passed, without firing its revert", async () => {
    const revert = jest.fn(async () => {});
    useSessionStore.getState().pushUndo("Answered", revert);
    setDbClockOffsetMs(11_000);
    useSessionStore.getState().setClockOffsetMs(11_000);
    useSessionStore.getState().expireUndo();
    expect(useSessionStore.getState().undo.entries).toHaveLength(0);
    expect(revert).not.toHaveBeenCalled();
  });

  it("UN-04: a new undoable action replaces the previous toast and ledger entry — one at a time", async () => {
    const firstRevert = jest.fn(async () => {});
    const secondRevert = jest.fn(async () => {});
    useSessionStore.getState().pushUndo("First", firstRevert);
    useSessionStore.getState().pushUndo("Second", secondRevert);

    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
    expect(useSessionStore.getState().toast).toMatchObject({ message: "Second" });

    await useSessionStore.getState().undoLatest();
    expect(secondRevert).toHaveBeenCalledTimes(1);
    expect(firstRevert).not.toHaveBeenCalled(); // superseded — never fires
  });
});
