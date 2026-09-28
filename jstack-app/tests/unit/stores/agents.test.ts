/** stores/agents.ts — load() populates summary/spend/issues/checks;
 * actIssue() resolves an issue and reloads. */
import { reset as resetDb } from "@/data/mock/db";
import { useSessionStore } from "@/stores/session";
import { useAgentsStore } from "@/stores/agents";
import { getAdapter } from "@/data/provider";
import { loadWhileUnreachable } from "./failingLoad";

beforeEach(() => {
  resetDb();
  useAgentsStore.setState({ summary: null, spend: null, portals: [], issues: [], feed: [], checks: [], history: [], schedules: [] });
});

describe("stores/agents.ts", () => {
  it("load() populates summary, spend, portals, issues, feed, checks and schedules", async () => {
    await useAgentsStore.getState().load();
    const s = useAgentsStore.getState();
    expect(s.summary).not.toBeNull();
    expect(s.spend).not.toBeNull();
    expect(s.portals.length).toBeGreaterThan(0);
    expect(s.issues.length).toBeGreaterThan(0);
    expect(s.feed.length).toBeGreaterThan(0);
    expect(s.checks.length).toBeGreaterThan(0);
    expect(s.schedules.length).toBeGreaterThan(0);
  });

  it("actIssue() resolves the issue and it drops from the open list on reload", async () => {
    await useAgentsStore.getState().load();
    expect(useAgentsStore.getState().issues.find((i) => i.id === "e1")).toBeDefined();
    await useAgentsStore.getState().actIssue("e1", "renew");
    expect(useAgentsStore.getState().issues.find((i) => i.id === "e1")).toBeUndefined();
  });

  it("loadHistory() populates answered/expired decision cards", async () => {
    await useAgentsStore.getState().loadHistory();
    expect(useAgentsStore.getState().history.length).toBeGreaterThan(0);
  });
});

describe("a write sets its slice from the response (P-10, F-15)", () => {
  it("pauseSchedule() flips the one row and asks for nothing but that row", async () => {
    await useAgentsStore.getState().load();
    const [first] = useAgentsStore.getState().schedules;
    const spies = (["getAgentSummary", "getAgentSpend", "getPortals", "getAgentIssues", "getAgentFeed", "getSecurityChecks", "getSchedules"] as const).map((m) => jest.spyOn(getAdapter(), m));
    try {
      await useAgentsStore.getState().pauseSchedule(first.id);
      expect(useAgentsStore.getState().schedules.find((s) => s.id === first.id)?.paused).toBe(true);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("actIssue() drops the resolved issue and re-reads only the summary it changes", async () => {
    await useAgentsStore.getState().load();
    const summary = jest.spyOn(getAdapter(), "getAgentSummary");
    const portals = jest.spyOn(getAdapter(), "getPortals");
    try {
      await useAgentsStore.getState().actIssue("e1", "renew");
      expect(useAgentsStore.getState().issues.find((i) => i.id === "e1")).toBeUndefined();
      expect(summary).toHaveBeenCalledTimes(1);
      expect(portals).not.toHaveBeenCalled();
    } finally {
      summary.mockRestore();
      portals.mockRestore();
    }
  });
});

describe("A4R4-03 · the issue verb is undoable from the DETAIL, not only from the list", () => {
  it("an issue that is not in the open list still gets an undo and a toast", async () => {
    // `IssueDetail` fetches its record through `useDetail`, straight off the
    // adapter, and never touches the open list — and `getAgentIssue` answers
    // for an issue in any state while `getAgentIssues` returns only open ones.
    // The undo used to be gated on finding the issue in that list, so the write
    // happened and nothing was said. Same shape as B-190, one store over.
    await useAgentsStore.getState().load();
    const id = useAgentsStore.getState().issues[0]!.id;
    useAgentsStore.setState({ issues: [] }); // reached from the detail, list cold
    useSessionStore.setState({ undo: { entries: [] }, toast: null });

    await useAgentsStore.getState().actIssue(id, "renew");

    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
    expect(useSessionStore.getState().toast?.message).toBeTruthy();
  });
});

describe("A4R5-06 · Undo on Run now puts back BOTH records the verb wrote", () => {
  // The verb marks the issue done AND sets its security check to "passed · ran
  // just now"; the undo reopened the issue and left the check reading passed,
  // beside the reopened issue saying the suite did not run.
  it("the issue reopens and its security check reads exactly what it read before", async () => {
    const adapter = getAdapter();
    const issue = (await adapter.getAgentIssues()).find((i) => i.checkId != null);
    expect(issue).toBeDefined();
    const checkId = issue?.checkId as string;
    const checkBefore = (await adapter.getSecurityChecks()).find((c) => c.id === checkId);
    expect(checkBefore?.ok).toBe(false); // else "put back" proves nothing

    await adapter.postAgentIssueAction(issue?.id as string, "run");
    expect((await adapter.getSecurityChecks()).find((c) => c.id === checkId)?.status).toBe("passed");

    await adapter.undoAgentIssueAction(issue?.id as string);
    expect((await adapter.getAgentIssues()).some((i) => i.id === issue?.id)).toBe(true);
    expect((await adapter.getSecurityChecks()).find((c) => c.id === checkId)).toEqual(checkBefore);
  });
});

/**
 * A-2 (WP-A, v2.3) — Agents's load, failing, is recorded rather than thrown at
 * a tab that cannot catch it. The tab calls it fire-and-forget, so offline with
 * nothing cached the rejection went nowhere and the tab rendered an empty shell.
 */
describe("A-2 · a failed load is recorded, not thrown at the tab", () => {
  it("a rejecting read leaves loadError set, summary as it was, and a load that resolves, so nothing is thrown at the tab", async () => {
    const { settled } = await loadWhileUnreachable("getAgentSummary", () => useAgentsStore.getState().load());
    const s = useAgentsStore.getState();
    expect({ loadError: s.loadError, summary: s.summary, settled }).toEqual({ loadError: "Network request failed", summary: null, settled: "resolved" });
  });

  it("the next load that gets through clears it", async () => {
    await loadWhileUnreachable("getAgentSummary", () => useAgentsStore.getState().load());
    await useAgentsStore.getState().load();
    const s = useAgentsStore.getState();
    expect({ loadError: s.loadError, loaded: s.summary != null }).toEqual({ loadError: null, loaded: true });
  });
});
