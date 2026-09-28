/** stores/brain.ts — load() populates latest/proposals/rules/hitRate;
 * dump() posts through the adapter and reloads. */
import { reset as resetDb } from "@/data/mock/db";
import { useBrainStore } from "@/stores/brain";
import { loadWhileUnreachable } from "./failingLoad";

beforeEach(() => {
  resetDb();
  // W-1: the Dictate thread moved to `stores/dictate.ts` — a two-way
  // conversation with one dialog is a different subject from what came in.
  useBrainStore.setState({ dumpDraft: "", shareDraft: null, latestIn: [], proposals: [], hitRate: null, findQuery: "", findAnswer: null, findResults: [] });
});

describe("stores/brain.ts", () => {
  // ST-1: `rules` left this store with Brain's Rules section. The EA's
  // standing instructions are `AutonomyRule`s under Settings now, in
  // `stores/settings.ts`, and `tests/unit/rules.test.ts` is where they are
  // asserted.
  it("load() populates latestIn, proposals and hitRate", async () => {
    await useBrainStore.getState().load();
    const s = useBrainStore.getState();
    expect(s.latestIn.length).toBeGreaterThan(0);
    expect(s.proposals.length).toBeGreaterThan(0);
    expect(s.hitRate).not.toBeNull();
  });

  it("dump() posts the draft, clears it, and reloads latestIn", async () => {
    useBrainStore.getState().setDumpDraft("Call Steve about Bali");
    await useBrainStore.getState().dump("typed");
    expect(useBrainStore.getState().dumpDraft).toBe("");
    expect(useBrainStore.getState().latestIn[0].text).toBe("Call Steve about Bali");
  });

  /**
   * OF-05, the bug behind the flake. `Entry.tsx` disables `dump-send` while
   * the draft is empty, and `dump()` cleared the draft AFTER awaiting the
   * POST. So a send and a subsequent keystroke race: the clear belonging to
   * the first send lands on top of the second draft, the field goes empty,
   * the button disables itself, and nothing is left to re-enable it. It was
   * seen once in 684 e2e cases and 18 of 18 green in isolation, which is why
   * it read as a flake for two stages.
   *
   * No mocking and no fake timers: `dump()` genuinely awaits the adapter, so
   * a synchronous write straight after the call is guaranteed to land while
   * the POST is in flight. That is the real interleaving, deterministically.
   *
   * Same family as CL-03 and B-22 — a fire-and-forget write racing the state
   * it writes to.
   */
  it("OF-05 · a keystroke during an in-flight send is not wiped by that send's clear", async () => {
    useBrainStore.getState().setDumpDraft("Call Steve about Bali");
    const sending = useBrainStore.getState().dump("typed");
    // the next thing typed, while the POST is still open
    useBrainStore.getState().setDumpDraft("Ring the school");
    await sending;
    expect(useBrainStore.getState().dumpDraft).toBe("Ring the school");
  });

  it("find() sets an answer and results for a matching query", async () => {
    await useBrainStore.getState().find("Bali");
    expect(useBrainStore.getState().findAnswer).not.toBeNull();
  });

  it("resolveProposal() accepts a proposal and reloads (it drops from the open list)", async () => {
    await useBrainStore.getState().load();
    expect(useBrainStore.getState().proposals.find((p) => p.id === "p1")).toBeDefined();
    await useBrainStore.getState().resolveProposal("p1", "ok");
    expect(useBrainStore.getState().proposals.find((p) => p.id === "p1")).toBeUndefined();
  });
});

/**
 * A-2 (WP-A, v2.3) — Brain's load, failing, is recorded rather than thrown at
 * a tab that cannot catch it. The tab calls it fire-and-forget, so offline with
 * nothing cached the rejection went nowhere and the tab rendered an empty shell.
 */
describe("A-2 · a failed load is recorded, not thrown at the tab", () => {
  it("a rejecting read leaves loadError set, latestIn as it was, and a load that resolves, so nothing is thrown at the tab", async () => {
    const { settled } = await loadWhileUnreachable("getBrainLatest", () => useBrainStore.getState().load());
    const s = useBrainStore.getState();
    expect({ loadError: s.loadError, latestIn: s.latestIn, settled }).toEqual({ loadError: "Network request failed", latestIn: [], settled: "resolved" });
  });

  it("the next load that gets through clears it", async () => {
    await loadWhileUnreachable("getBrainLatest", () => useBrainStore.getState().load());
    await useBrainStore.getState().load();
    const s = useBrainStore.getState();
    expect({ loadError: s.loadError, loaded: s.latestIn.length > 0 }).toEqual({ loadError: null, loaded: true });
  });
});
