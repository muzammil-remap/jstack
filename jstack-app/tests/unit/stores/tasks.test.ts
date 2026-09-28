/** stores/tasks.ts — the LIST: load() populates it and loadWaiting() the
 * waiting rows. Completion and the open card are `stores/taskCard.ts` (P-2)
 * and are tested in `taskCard.test.ts`. */
import { reset as resetDb } from "@/data/mock/db";
import { getAdapter } from "@/data/provider";
import { INITIAL, useTasksStore } from "@/stores/tasks";
import { loadWhileUnreachable } from "./failingLoad";

beforeEach(() => {
  resetDb();
  // F-84: reset from the store's own declaration, not a hand-typed copy that
  // drifts as the store gains fields
  useTasksStore.setState(INITIAL);
});

describe("stores/tasks.ts", () => {
  it("load() populates the list from GET /tasks", async () => {
    await useTasksStore.getState().load();
    expect(useTasksStore.getState().list.length).toBeGreaterThan(0);
  });

  it("loadWaiting() populates rows with a taskId", async () => {
    await useTasksStore.getState().loadWaiting();
    expect(useTasksStore.getState().waiting.length).toBeGreaterThan(0);
    expect(useTasksStore.getState().waiting[0]).toHaveProperty("taskId");
  });
});

describe("the tab's header count and the filter panel's projects (P-4, F-47)", () => {
  it("load() on the plain list view answers the open count itself; any other view fetches it", async () => {
    await useTasksStore.getState().load();
    const plain = useTasksStore.getState().list.length;
    expect(plain).toBeGreaterThan(0);
    expect(useTasksStore.getState().openCount).toBe(plain);

    await useTasksStore.getState().setView("done");
    // the list is Done's now, and the count did not follow it (B-12)
    expect(useTasksStore.getState().list.every((t) => t.status === "done")).toBe(true);
    expect(useTasksStore.getState().openCount).toBe(plain);
    useTasksStore.setState({ openCount: 0 });
    await useTasksStore.getState().loadOpenCount();
    expect(useTasksStore.getState().openCount).toBe(plain);
  });

  it("loadProjects() holds every project name once, sorted", async () => {
    await useTasksStore.getState().loadProjects();
    const projects = useTasksStore.getState().projects;
    expect(projects.length).toBeGreaterThan(0);
    expect(projects).toEqual([...new Set(projects)].sort());
    const fromServer = new Set((await getAdapter().getTasks({ view: "board" })).map((t) => t.project).filter((p) => p != null));
    expect(new Set(projects)).toEqual(fromServer);
  });
});

/**
 * A-2 (WP-A, v2.3) — Tasks's load, failing, is recorded rather than thrown at
 * a tab that cannot catch it. The tab calls it fire-and-forget, so offline with
 * nothing cached the rejection went nowhere and the tab rendered an empty shell.
 */
describe("A-2 · a failed load is recorded, not thrown at the tab", () => {
  it("a rejecting read leaves loadError set, list as it was, and a load that resolves, so nothing is thrown at the tab", async () => {
    const { settled } = await loadWhileUnreachable("getTasks", () => useTasksStore.getState().load());
    const s = useTasksStore.getState();
    expect({ loadError: s.loadError, list: s.list, settled }).toEqual({ loadError: "Network request failed", list: [], settled: "resolved" });
  });

  it("the next load that gets through clears it", async () => {
    await loadWhileUnreachable("getTasks", () => useTasksStore.getState().load());
    await useTasksStore.getState().load();
    const s = useTasksStore.getState();
    expect({ loadError: s.loadError, loaded: s.list.length > 0 }).toEqual({ loadError: null, loaded: true });
  });
});

/**
 * A-2b (WP-A, v2.3) — QA on A-2: the Tasks tab fires the waiting rows and the open count beside its list,
 * fire-and-forget, and offline both still rejected with nobody to hear it. Each is recorded now under a key of its
 * own and settles, as the list's load does — and neither speaks for the list, whose failure is what the tab reads.
 */
describe("A-2b · the tab's other loads are recorded, not thrown at the tab", () => {
  it("a failed waiting load settles and records waitingError, and the next one that gets through clears it", async () => {
    const { settled } = await loadWhileUnreachable("getTasksWaiting", () => useTasksStore.getState().loadWaiting());
    const failed = { settled, waitingError: useTasksStore.getState().waitingError };
    await useTasksStore.getState().loadWaiting();
    const s = useTasksStore.getState();
    expect({ failed, cleared: s.waitingError, loaded: s.waiting.length > 0 }).toEqual({
      failed: { settled: "resolved", waitingError: "Network request failed" },
      cleared: null,
      loaded: true,
    });
  });

  it("a failed open-count load settles and records openCountError, and the next one that gets through clears it", async () => {
    useTasksStore.setState({ view: "done" }); // off the plain list, where the count is a request of its own
    const { settled } = await loadWhileUnreachable("getTasks", () => useTasksStore.getState().loadOpenCount());
    const failed = { settled, openCountError: useTasksStore.getState().openCountError };
    await useTasksStore.getState().loadOpenCount();
    const s = useTasksStore.getState();
    expect({ failed, cleared: s.openCountError, counted: s.openCount > 0 }).toEqual({
      failed: { settled: "resolved", openCountError: "Network request failed" },
      cleared: null,
      counted: true,
    });
  });

  it("neither speaks for the list: a waiting load that gets through leaves the list's failure standing", async () => {
    await loadWhileUnreachable("getTasks", () => useTasksStore.getState().load());
    await useTasksStore.getState().loadWaiting();
    expect({ loadError: useTasksStore.getState().loadError }).toEqual({ loadError: "Network request failed" });
  });
});
