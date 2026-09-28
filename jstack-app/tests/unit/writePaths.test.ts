/**
 * A-4 round 6 — the two exempt classes, closed as classes (the planner's 18:50
 * order): every undo takes back exactly what ITS OWN write wrote, and every
 * offline-queued capture is handled as queued by the store that sent it.
 *
 * The enumeration these cases were written from is `BUGLOG_v22.md` A-156: all
 * 69 mutating routes with their store callers, every undo site, every
 * offline route. Each case here is one path that failed that review, driven
 * through the route or the store that owns it.
 */
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { getAdapter, getOutbox } from "@/data/provider";
import { isQueued } from "@/data/transport/outbox";
import { useLifeEditsStore } from "@/stores/lifeEdits";
import { useLifeStore } from "@/stores/life";
import { currentParameter, useParametersStore } from "@/stores/parameters";
import { useSessionStore } from "@/stores/session";
import { useTaskCardStore, INITIAL as CARD_INITIAL } from "@/stores/taskCard";
import { useTasksStore, INITIAL as TASKS_INITIAL } from "@/stores/tasks";
import { useSyncStore } from "@/stores/sync";
import { useFilesStore } from "@/stores/files";
import { useBrainStore } from "@/stores/brain";
import { useAgentsStore } from "@/stores/agents";
import { useTodayStore } from "@/stores/today";
import { useSectionsStore } from "@/stores/sections";
import { ContractError } from "@/data/ApiAdapter";
import { applyRuleVerb } from "@/data/mock/handlers/settings";
import { applyTriageVerb } from "@/data/mock/ingest";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { useRepliesStore } from "@/stores/replies";
import { optimisticWrite } from "@/lib/optimistic";
import { keyableCard, NEEDS_YOU_SECTION, reviseCard } from "@/lib/cardVerbs";
import { __resetPressGate, keyVerbLands, pressLands } from "@/lib/pressGate";
import { useDeviceStore } from "@/stores/device";
import type { ActionItem, AgentIssue, AutonomyRule, Goal, Parameter, SecurityCheck, Task } from "@/data/types";

const verb = (id: string, body: Record<string, unknown>) => handle({ method: "POST", path: `/actions/${id}`, body });
const undo = (id: string) => handle({ method: "POST", path: `/actions/${id}/undo` });
const reopen = (id: string) => handle({ method: "POST", path: `/actions/${id}/reopen` });
const rules = () => db.get().autonomyRules as AutonomyRule[];
const lock = () => (db.get().parameters as Parameter[]).find((p) => p.key === "lock.afterMinutes") as Parameter;

async function ruleCard(): Promise<ActionItem> {
  const res = await handle({ method: "POST", path: "/settings/autonomy/propose", body: { text: "Move a Thursday meeting only after asking" } });
  expect(res.status).toBeLessThan(300);
  return res.json as ActionItem;
}
async function lockCard(value: number): Promise<ActionItem> {
  const res = await handle({ method: "POST", path: "/parameters/propose", body: { key: "lock.afterMinutes", value, reason: "you leave it open" } });
  expect(res.status).toBeLessThan(300);
  return res.json as ActionItem;
}

async function drain(): Promise<void> {
  useSessionStore.setState({ locked: false, online: true });
  await getOutbox().replay();
}

beforeEach(async () => {
  await drain();
  db.reset();
  db.asUser("josh");
  useSessionStore.setState({ undo: { entries: [] }, toast: null, locked: false, online: true });
  useTasksStore.setState(TASKS_INITIAL);
  useTaskCardStore.setState(CARD_INITIAL);
});

describe("A4R6-01 · a reopen takes the answer back, and a second answer is one rule", () => {
  it("approve → reopen removes the rule; approve again is ONE rule under the id; its undo takes it back", async () => {
    const card = await ruleCard();
    const id = `ar-${card.id}`;
    expect((await verb(card.id, { verb: "approve" })).status).toBe(200);
    expect(rules().filter((r) => r.id === id)).toHaveLength(1);

    db.setClockOffsetMs(11_000); // the first answer's window has closed
    expect((await reopen(card.id)).status).toBe(200);
    expect(rules().filter((r) => r.id === id)).toHaveLength(0); // the reopen took the rule back

    expect((await verb(card.id, { verb: "approve" })).status).toBe(200);
    expect(rules().filter((r) => r.id === id)).toHaveLength(1); // one rule, not two
    expect((await undo(card.id)).status).toBe(200); // the SECOND answer's undo, not the first's expired one
    expect(rules().filter((r) => r.id === id)).toHaveLength(0);
  });

  it("approve → reopen → never leaves no auto rule standing", async () => {
    const card = await ruleCard();
    await verb(card.id, { verb: "approve" });
    await reopen(card.id);
    await verb(card.id, { verb: "never" });
    expect(rules().some((r) => r.id === `ar-${card.id}`)).toBe(false);
  });

  it("a lock approved then reopened goes back to what it was", async () => {
    const before = lock().value;
    const card = await lockCard(20);
    await verb(card.id, { verb: "approve" });
    expect(lock().value).toBe(20);
    await reopen(card.id);
    expect(lock().value).toBe(before);
  });
});

describe("A4R6-03 · the parameter card's undo takes back what ITS answer wrote", () => {
  it("an Undo on Later changes nothing — not even a value Josh set himself meanwhile", async () => {
    const card = await lockCard(20);
    expect((await handle({ method: "PUT", path: "/parameters/lock.afterMinutes", body: { value: 5 } })).status).toBe(200);
    await verb(card.id, { verb: "later" });
    expect((await undo(card.id)).status).toBe(200);
    expect(lock().value).toBe(5);
  });

  it("two approvals on one key: one Undo takes back ONE of them", async () => {
    const a = await lockCard(5);
    expect((await verb(a.id, { verb: "approve" })).status).toBe(200);
    const b = await lockCard(7);
    expect((await verb(b.id, { verb: "approve" })).status).toBe(200);
    expect(lock().value).toBe(7);
    await undo(b.id);
    expect(lock().value).toBe(5);
  });
});

describe("A4R6-02 · an issue's undo puts back what THAT press found, inside its window only", () => {
  const issues = () => db.get().agentIssues as AgentIssue[];
  const checks = () => db.get().securityChecks as SecurityCheck[];

  it("a second press after the first window has closed: its undo keeps the first press's run", async () => {
    const issue = issues().find((i) => i.checkId != null && i.state === "open") as AgentIssue;
    expect(issue).toBeDefined();
    const act = () => handle({ method: "POST", path: `/agents/issues/${issue.id}`, body: { action: "run" } });
    await act();
    const afterFirst = checks().find((c) => c.id === issue.checkId);
    expect(afterFirst?.status).toBe("passed");

    db.setClockOffsetMs(11_000);
    await act(); // pressed again from its detail, on an issue already done
    expect((await handle({ method: "POST", path: `/agents/issues/${issue.id}/undo` })).status).toBe(200);
    expect(issues().find((i) => i.id === issue.id)?.state).toBe("done");
    expect(checks().find((c) => c.id === issue.checkId)).toEqual(afterFirst);
  });

  it("an undo after the window is refused, never a guess at 'open'", async () => {
    const issue = issues().find((i) => i.state === "open") as AgentIssue;
    await handle({ method: "POST", path: `/agents/issues/${issue.id}`, body: { action: "run" } });
    db.setClockOffsetMs(11_000);
    expect((await handle({ method: "POST", path: `/agents/issues/${issue.id}/undo` })).status).toBe(409);
    expect(issues().find((i) => i.id === issue.id)?.state).toBe("done");
  });
});

describe("the offline captures are handled as QUEUED by the stores that send them", () => {
  it("A4R6-04: a completion queued offline offers no undo, shows done here, and lands on reconnect", async () => {
    const t1 = (await handle({ method: "GET", path: "/tasks/t1" })).json as Task;
    useSessionStore.setState({ online: false });
    await useTaskCardStore.getState().completeTask("t1", true, t1);
    expect(useSessionStore.getState().undo.entries).toHaveLength(0);
    expect(await getOutbox().entries()).toHaveLength(1);
    await drain();
    expect(((await handle({ method: "GET", path: "/tasks/t1" })).json as Task).status).toBe("done");
  });

  // A4R8-02 (v2.3 B-6) moved half of this case: the record still stays whole —
  // the case's point — but at the server's value, with the new one pending
  // until its replay lands (BUGLOG_v23.md WPB-6). The title stands as it was:
  // BUGLOG_v22.md quotes it, and "with the new value" is still where it is held
  it("A4R6-05: a parameter set offline keeps the device's record, with the new value", async () => {
    useSessionStore.setState({ online: false });
    const server = currentParameter("lock.afterMinutes");
    expect(server).not.toBe(2);
    expect(await useParametersStore.getState().setParameter("lock.afterMinutes", 2)).toBe(true);
    const record = useParametersStore.getState().parameters.find((p) => p.key === "lock.afterMinutes");
    expect(record?.value).toBe(server);
    expect(useParametersStore.getState().pending["lock.afterMinutes"]).toBe(2);
    expect(useParametersStore.getState().parameters.every((p) => typeof p.key === "string")).toBe(true);
  });

  it("A4R6-06: a task created offline is queued, and nothing asks for a task with no id", async () => {
    useSessionStore.setState({ online: false });
    const made = await useTaskCardStore.getState().createTask({ title: "From a goal, offline", owner: "josh", priority: "medium", status: "open", links: [], labels: { silo: "work", types: ["open"], setBy: "josh" }, setAt: "2026-09-11", focus: "work" });
    expect(made).toBeNull();
    expect(isQueued((await getOutbox().entries())[0]?.body ?? {})).toBe(false); // the entry is the request, not a receipt
    expect(await getOutbox().entries()).toHaveLength(1);
  });
});

describe("the round-5 claims round 6 found untested (A4R6-09), and the order of an undone delete (A4R6-08)", () => {
  it("B-200: a goal the editor showed, archived meanwhile, is not brought back by the save", async () => {
    await useLifeStore.getState().load();
    const shown = useLifeStore.getState().goals;
    const g = shown[0];
    await handle({ method: "PUT", path: "/goals", body: { goals: (await getAdapter().getGoals()).filter((x) => x.id !== g.id) } }); // another device archives it
    expect(await useLifeEditsStore.getState().saveGoals(shown, shown)).toBeNull();
    expect((await getAdapter().getGoals()).some((x) => x.id === g.id)).toBe(false);
  });

  it("A4R6-12: a history entry the server wrote while the editor was open survives the editor's save", async () => {
    await useLifeStore.getState().load();
    const shown = useLifeStore.getState().goals;
    const g = shown[0];
    // a NEW record, as a server's write would be: the in-process mock hands the
    // store the db's own objects, so mutating one in place would change the
    // editor's copy too and prove nothing
    const state = db.get();
    state.goals = state.goals.map((x) => (x.id === g.id ? { ...x, history: [...x.history, { at: "2026-09-11T09:00:00+10:00", event: "kpi", detail: "the backend reported progress" }] } : x));
    const edited = shown.map((x) => (x.id === g.id ? { ...x, text: `${x.text}, renamed` } : x));
    expect(await useLifeEditsStore.getState().saveGoals(shown, edited)).toBeNull();
    const after = (await getAdapter().getGoals()).find((x) => x.id === g.id) as Goal;
    expect(after.text).toBe(`${g.text}, renamed`);
    expect(after.history.some((h) => h.detail === "the backend reported progress")).toBe(true);
  });

  it("B-203: a new subtask never takes the id of a deleted one an undo may restore", async () => {
    const t = (await handle({ method: "GET", path: "/tasks/t1" })).json as Task;
    const last = t.subtasks[t.subtasks.length - 1];
    await handle({ method: "DELETE", path: `/tasks/t1/subtasks/${last.id}` });
    const added = (await handle({ method: "POST", path: "/tasks/t1/subtasks", body: { title: "new one", owner: "josh" } })).json as Task;
    expect(added.subtasks.find((s) => s.title === "new one")?.id).not.toBe(last.id);
  });

  it("B-203: a new task never takes the id of one still there", async () => {
    const state = db.get();
    state.tasks = state.tasks.filter((t) => t.id !== "t2"); // a gap: the count no longer names a free id
    const made = (await handle({ method: "POST", path: "/tasks", body: { title: "gap", owner: "josh", priority: "medium", status: "open", links: [], labels: { silo: "work", types: ["open"], setBy: "josh" }, setAt: "2026-09-11", focus: "work" } })).json as Task;
    expect(db.get().tasks.filter((x) => x.id === made.id)).toHaveLength(1);
  });

  it("A4R6-08: an undone delete puts the subtask back where it stood", async () => {
    const t = (await handle({ method: "GET", path: "/tasks/t1" })).json as Task;
    const middle = t.subtasks[1];
    await handle({ method: "DELETE", path: `/tasks/t1/subtasks/${middle.id}` });
    const back = (await handle({ method: "POST", path: "/tasks/t1/subtasks", body: { title: middle.title, owner: middle.owner, restoreId: middle.id } })).json as Task;
    expect(back.subtasks.map((s) => s.id)).toEqual(t.subtasks.map((s) => s.id));
  });
});

describe("A-4 round 7 · the offline-capture class, end to end", () => {
  const sync = () => useSyncStore.getState().syncNow();

  it("A4R7-01: two journal lines filed in one millisecond keep two ids, each its own text", async () => {
    const at = Date.now();
    const spy = jest.spyOn(Date, "now").mockReturnValue(at);
    try {
      const a = (await handle({ method: "POST", path: "/journal", body: { text: "R7 first", source: "typed", offlineId: "oa" } })).json as { id: string };
      const b = (await handle({ method: "POST", path: "/journal", body: { text: "R7 second", source: "typed", offlineId: "ob" } })).json as { id: string };
      expect(a.id).not.toBe(b.id);
      expect(((await handle({ method: "GET", path: `/brain/items/${a.id}` })).json as { text: string }).text).toBe("R7 first");
    } finally {
      spy.mockRestore();
    }
  });

  it("A4R7-02: offline, a lock value outside its range is refused on the device and nothing is queued", async () => {
    useSessionStore.setState({ online: false });
    expect(await useParametersStore.getState().setParameter("lock.afterMinutes", 0)).toBe(false);
    expect(useParametersStore.getState().invalid?.key).toBe("lock.afterMinutes");
    expect(useParametersStore.getState().parameters.find((p) => p.key === "lock.afterMinutes")?.value).not.toBe(0);
    expect(await getOutbox().entries()).toHaveLength(0);
  });

  it("A4R7-02: a queued value the server refuses on replay does not stay on the device", async () => {
    useSessionStore.setState({ online: false });
    expect(await useParametersStore.getState().setParameter("lock.afterMinutes", 2)).toBe(true);
    const [entry] = await getOutbox().entries();
    db.get().conflicting.push(entry.offlineId); // the server will refuse it
    useSessionStore.setState({ online: true });
    await sync();
    expect(useParametersStore.getState().parameters.find((p) => p.key === "lock.afterMinutes")?.value).toBe(lock().value);
    expect(lock().value).not.toBe(2);
  });

  /**
   * v2.3 B-6 · A4R8-02 (the A-4 audit, round 8). A4R7-02's range check runs only
   * when the app believes it is offline; a send that fails at the network layer
   * while it believes it is online is queued too, and the value was adopted the
   * moment the receipt came back — 0 locked the app at every tap and 9999
   * switched the auto-lock off until the next replay. The outbox's receipt is
   * answered here as the network failure produces it.
   */
  it("A4R8-02: a lock value queued on a network failure is not adopted — the lock keeps the server's value until the replay lands", async () => {
    const before = currentParameter("lock.afterMinutes");
    const receipt = jest.spyOn(getAdapter(), "putParameter").mockResolvedValueOnce({ queued: true, offlineId: "r8-02" } as never);
    try {
      expect(await useParametersStore.getState().setParameter("lock.afterMinutes", 0)).toBe(true);
      expect(currentParameter("lock.afterMinutes")).toBe(before);
    } finally {
      receipt.mockRestore();
    }
  });

  it("A4R7-03: a reopen does not take back a lock Josh set after answering, and neither does the Undo", async () => {
    const card = await lockCard(20);
    await verb(card.id, { verb: "approve" });
    await handle({ method: "PUT", path: "/parameters/lock.afterMinutes", body: { value: 5 } });
    await reopen(card.id);
    expect(lock().value).toBe(5);

    const again = await lockCard(20);
    await verb(again.id, { verb: "approve" });
    await handle({ method: "PUT", path: "/parameters/lock.afterMinutes", body: { value: 3 } });
    await undo(again.id);
    expect(lock().value).toBe(3);
  });

  it("A4R7-03/B-209: a Later records nothing, so its Undo leaves a value set AFTER it", async () => {
    const card = await lockCard(20);
    await verb(card.id, { verb: "later" });
    await handle({ method: "PUT", path: "/parameters/lock.afterMinutes", body: { value: 5 } });
    await undo(card.id);
    expect(lock().value).toBe(5);
  });

  it("A4R7-04: a file attached offline arrives WITH its capture", async () => {
    useSessionStore.setState({ online: false });
    const up = await useFilesStore.getState().upload({ filename: "train receipt.jpg", contentType: "image/jpeg", size: 3, data: new Blob(["abc"]) }, {});
    expect(up != null && "queued" in up).toBe(true);
    const ref = up != null && "queued" in up ? up.ref : "";
    await useBrainStore.getState().dump("typed", "R7 offline ticket", undefined, [ref]);
    useSessionStore.setState({ online: true });
    await sync();
    const capture = (db.get().brainItems as { id: string; text: string }[]).find((b) => b.text === "R7 offline ticket");
    const file = (db.get().files as { name: string; captureId?: string }[]).find((f) => f.name === "train receipt.jpg");
    expect(capture).toBeDefined();
    expect(file?.captureId).toBe(capture?.id);
  });

  it("A4R7-14: an upload replayed under the same offlineId is filed once", async () => {
    const file = { filename: "twice.txt", contentType: "text/plain", size: 1, data: new Blob(["x"]) };
    const send = () => handle({ method: "POST", path: "/files", multipart: { file, fields: { offlineId: "same-one" } } });
    await send();
    await send();
    expect((db.get().files as { name: string }[]).filter((f) => f.name === "twice.txt")).toHaveLength(1);
  });

  /**
   * v2.3 B-7 · A4R8-03 (the A-4 audit, round 8). B-218 closed A4R7-04 when the
   * upload and its capture are BOTH queued, because the upload replays first.
   * A capture that goes straight through does not wait behind the queue, so it
   * named `offline:<id>` for a file the server did not have yet, and the upload
   * that arrived afterwards was filed as a loose file in the inbox.
   */
  it("A4R8-03: an upload still queued when its capture goes through online is filed with the capture", async () => {
    useSessionStore.setState({ online: false });
    const up = await useFilesStore.getState().upload({ filename: "late receipt.jpg", contentType: "image/jpeg", size: 3, data: new Blob(["abc"]) }, {});
    const ref = up != null && "queued" in up ? up.ref : "";
    expect(ref).toMatch(/^offline:/);
    // the connection comes back inside one send: the capture goes straight
    // through, and the upload is still waiting in the queue
    useSessionStore.setState({ online: true });
    await useBrainStore.getState().dump("typed", "R8 capture online, its file queued", undefined, [ref]);
    expect(await getOutbox().entries()).toHaveLength(1);
    await sync();
    const capture = (db.get().brainItems as { id: string; text: string }[]).find((b) => b.text === "R8 capture online, its file queued");
    const file = (db.get().files as { name: string; captureId?: string }[]).find((f) => f.name === "late receipt.jpg");
    expect(capture).toBeDefined();
    expect(file?.captureId).toBe(capture?.id);
  });

  it("A4R7-06: a completion queued from Today shows done on Today's own slice, and a second one completes nothing twice", async () => {
    await useTodayStore.getState().load();
    const task = useTodayStore.getState().composite?.tasks.find((t) => t.subtasks.every((s) => s.done)) ?? useTodayStore.getState().composite?.tasks[0];
    expect(task).toBeDefined();
    useSessionStore.setState({ online: false });
    await useTaskCardStore.getState().completeTask((task as Task).id, true, task as Task);
    expect(useTodayStore.getState().composite?.tasks.find((t) => t.id === (task as Task).id)?.status).toBe("done");
    await useTaskCardStore.getState().completeTask((task as Task).id, true, task as Task); // a second tick, its own offlineId
    await drain();
    const after = (await handle({ method: "GET", path: `/tasks/${(task as Task).id}` })).json as Task;
    expect(after.activity.filter((a) => a.text === "Completed")).toHaveLength(1);
  });

  it("B-207: a rule writer called twice for one card leaves ONE rule under its id", async () => {
    const card = await ruleCard();
    const now = new Date();
    applyRuleVerb(card, "approve", now);
    applyRuleVerb(card, "approve", now);
    expect(rules().filter((r) => r.id === `ar-${card.id}`)).toHaveLength(1);
  });
});

/**
 * A-4 round 8 — the revert class (A4R8-01; BUGLOG_v22.md A-158 is the path-by-path
 * list): every undo and every reopen takes back only what STILL HOLDS its own
 * write. A value, a rule or a status someone set after the write is theirs.
 * B-217 made that true for the parameter kind; these are the other paths in
 * the class, each driven at the route or the store that owns it.
 */
describe("A-4 round 8 · every revert takes back only what still holds its own write", () => {
  const issues = () => db.get().agentIssues as AgentIssue[];
  const checks = () => db.get().securityChecks as SecurityCheck[];
  const ruleText = (id: string) => rules().find((r) => r.id === id)?.text;
  /** Josh's own edit, through the rules editor's whole-set write */
  const rewrite = async (id: string, text: string) => {
    const list = rules().map((r) => (r.id === id ? { ...r, text } : r));
    expect((await handle({ method: "PUT", path: "/settings/autonomy/rules", body: { rules: list } })).status).toBe(200);
  };
  const task = async (id: string) => (await handle({ method: "GET", path: `/tasks/${id}` })).json as Task;

  it("A4R8-01: a rule card's reopen, or its Undo, leaves a rule Josh rewrote after answering", async () => {
    const card = await ruleCard();
    await verb(card.id, { verb: "approve" });
    await rewrite(`ar-${card.id}`, "Move a Thursday meeting only after asking me — MY WORDS");
    expect((await reopen(card.id)).status).toBe(200);
    expect(ruleText(`ar-${card.id}`)).toBe("Move a Thursday meeting only after asking me — MY WORDS");

    const again = await ruleCard();
    await verb(again.id, { verb: "approve" });
    await rewrite(`ar-${again.id}`, "Only Thursdays, and ask me first");
    expect((await undo(again.id)).status).toBe(200);
    expect(ruleText(`ar-${again.id}`)).toBe("Only Thursdays, and ask me first");
  });

  it("A4R8-01: a triage card's reopen leaves the taught rule Josh rewrote", async () => {
    const res = await handle({ method: "POST", path: "/brain/dump", body: { text: "https://r8hunt.example/a", url: "https://r8hunt.example/a", source: "share" } });
    const item = (res.json as { item: { id: string } }).item;
    const card = db.get().actions.find((a) => a.kind === "triage" && a.triage?.captureId === item.id) as ActionItem;
    expect(card).toBeDefined();
    expect((await verb(card.id, { verb: "teach", rule: "" })).status).toBe(200);
    expect(ruleText(`ar-${card.id}`)).toBeDefined();
    await rewrite(`ar-${card.id}`, "File r8hunt.example under Work, and ask me first — MY WORDS");
    db.setClockOffsetMs(300_000); // five minutes on: the reopen is the door a person uses
    expect((await reopen(card.id)).status).toBe(200);
    expect(ruleText(`ar-${card.id}`)).toBe("File r8hunt.example under Work, and ask me first — MY WORDS");
  });

  it("A4R8-01: answering a reopened card again leaves the rule Josh rewrote, and its Undo takes nothing", async () => {
    const card = await ruleCard();
    await verb(card.id, { verb: "approve" });
    await rewrite(`ar-${card.id}`, "MY WORDS");
    await reopen(card.id);
    expect((await verb(card.id, { verb: "approve" })).status).toBe(200);
    expect(rules().filter((r) => r.id === `ar-${card.id}`).map((r) => r.text)).toEqual(["MY WORDS"]);
    expect((await undo(card.id)).status).toBe(200);
    expect(ruleText(`ar-${card.id}`)).toBe("MY WORDS");
  });

  it("B-222 (A4R8-08): the triage writer, called twice for one card, leaves ONE rule under its id", async () => {
    const res = await handle({ method: "POST", path: "/brain/dump", body: { text: "https://r8twice.example/a", url: "https://r8twice.example/a", source: "share" } });
    const item = (res.json as { item: { id: string } }).item;
    const card = db.get().actions.find((a) => a.kind === "triage" && a.triage?.captureId === item.id) as ActionItem;
    const now = new Date();
    applyTriageVerb(card, "teach", now);
    applyTriageVerb(card, "teach", now);
    expect(rules().filter((r) => r.id === `ar-${card.id}`)).toHaveLength(1);
  });

  it("an issue's Undo takes back nothing once its security check has run again since the press", async () => {
    const issue = issues().find((i) => i.checkId != null && i.state === "open") as AgentIssue;
    expect(issue).toBeDefined();
    await handle({ method: "POST", path: `/agents/issues/${issue.id}`, body: { action: "run" } });
    db.setClockOffsetMs(3_000); // inside the window, a run that is not this press's
    await handle({ method: "POST", path: `/security/checks/${issue.checkId}/run` });
    const rerun = checks().find((c) => c.id === issue.checkId);
    expect((await handle({ method: "POST", path: `/agents/issues/${issue.id}/undo` })).status).toBe(409);
    expect(checks().find((c) => c.id === issue.checkId)).toEqual(rerun);
    expect(issues().find((i) => i.id === issue.id)?.state).toBe("done");
  });

  it("a completion's Undo leaves a status set after the completion", async () => {
    const t2 = await task("t2");
    const later = t2.status === "waiting" ? "open" : "waiting";
    await useTaskCardStore.getState().completeTask("t2", true, t2);
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
    await handle({ method: "PATCH", path: "/tasks/t2", body: { status: later } }); // another device, inside the window
    await useSessionStore.getState().undoLatest();
    expect((await task("t2")).status).toBe(later);
  });

  it("a field edit's Undo leaves a value written to that field after the edit", async () => {
    await useTasksStore.getState().load();
    const original = (await task("t3")).priority;
    const [mine, theirs] = (["high", "medium", "low"] as const).filter((p) => p !== original);
    expect(await useTaskEditsStore.getState().patchTask("t3", { priority: mine })).toBeNull();
    await handle({ method: "PATCH", path: "/tasks/t3", body: { priority: theirs } }); // another device, inside the window
    await useSessionStore.getState().undoLatest();
    expect((await task("t3")).priority).toBe(theirs);
  });

  it("A4R7-12: an Undo whose revert fails is still owed — it comes back, with its toast", async () => {
    let tries = 0;
    useSessionStore.getState().pushUndo("Changed", async () => {
      tries += 1;
      if (tries === 1) throw new Error("the network went");
    });
    await expect(useSessionStore.getState().undoLatest()).rejects.toThrow("the network went");
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
    expect(useSessionStore.getState().toast?.undoLabel).toBe("Undo");
    await useSessionStore.getState().undoLatest();
    expect(tries).toBe(2);
    expect(useSessionStore.getState().undo.entries).toHaveLength(0);
  });

  it("A4R7-12: Undo pressed twice while its revert is in flight reverts once", async () => {
    await useTasksStore.getState().load();
    const before = (await task("t1")).subtasks.map((s) => `${s.id}:${s.title}`);
    await useTaskEditsStore.getState().deleteSubtask("t1", "t1-2");
    await Promise.all([useSessionStore.getState().undoLatest(), useSessionStore.getState().undoLatest()]);
    expect((await task("t1")).subtasks.map((s) => `${s.id}:${s.title}`)).toEqual(before);
  });
});

/**
 * A-4 round 9 — the revert class, the paths round 9 found beside A-158
 * (BUGLOG_v22.md A-160): a retry that re-runs a restore already landed, a
 * failed revert given back over a newer action's undo, an undo that could not
 * read the record, the memory proposal's undo route, and the halves round 9
 * found unguarded in round 8's fixes (A4R9-09).
 */
describe("A-4 round 9 · the reverts round 9 found", () => {
  const task = async (id: string) => (await handle({ method: "GET", path: `/tasks/${id}` })).json as Task;
  const proposals = () => db.get().memoryProposals as { id: string; state: string; text: string }[];

  afterEach(() => {
    useSessionStore.getState().setClockOffsetMs(0);
    db.setClockOffsetMs(0);
  });

  it("A4R9-04: a subtask restore that has already landed is not a second subtask", async () => {
    const t1 = await task("t1");
    const sub = t1.subtasks.find((s) => s.id === "t1-2")!;
    await handle({ method: "DELETE", path: "/tasks/t1/subtasks/t1-2" });
    // the body the store's undo sends (`taskEdits.deleteSubtask`)
    const restore = () => handle({ method: "POST", path: "/tasks/t1/subtasks", body: { title: sub.title, owner: sub.owner, restoreId: "t1-2" } });
    expect((await restore()).status).toBe(200);
    expect((await restore()).status).toBe(200); // the retry of a restore whose answer was lost on the way back
    expect((await task("t1")).subtasks.map((s) => `${s.id}:${s.title}`)).toEqual(t1.subtasks.map((s) => `${s.id}:${s.title}`));
  });

  it("A4R9-05: a failed revert is not given back over a newer action's undo", async () => {
    let fail: (e: Error) => void = () => undefined;
    useSessionStore.getState().pushUndo("Older", () => new Promise<void>((_, reject) => (fail = reject)));
    const inFlight = useSessionStore.getState().undoLatest();
    useSessionStore.getState().pushUndo("Newer", async () => undefined); // a newer action while the older revert is in flight
    fail(new Error("the network went"));
    await expect(inFlight).rejects.toThrow("the network went");
    expect(useSessionStore.getState().undo.entries.map((e) => e.label)).toEqual(["Newer"]);
    expect(useSessionStore.getState().toast?.message).toBe("Newer");
  });

  it("B-227 (A4R9-09): a revert that fails after its window has closed is not given back", async () => {
    useSessionStore.getState().pushUndo("Changed", async () => {
      useSessionStore.getState().setClockOffsetMs(11_000);
      throw new Error("late");
    });
    await expect(useSessionStore.getState().undoLatest()).rejects.toThrow("late");
    expect(useSessionStore.getState().undo.entries).toHaveLength(0);
  });

  it("A4R9-07: when the record cannot be read (offline), a field edit's undo still sends what it overwrote", async () => {
    const sent: unknown[] = [];
    await optimisticWrite<{ priority: string }>({
      before: { priority: "low" },
      patch: { priority: "high" },
      apply: () => undefined,
      send: async () => ({ priority: "high" }),
      sendUndo: async (previous) => {
        sent.push(previous);
      },
      current: () => Promise.reject(new Error("offline")),
      wroteOf: (r) => r as { priority: string },
      undoLabel: "Changed",
      after: async () => undefined,
    });
    await useSessionStore.getState().undoLatest();
    expect(sent).toEqual([{ priority: "low" }]);
  });

  it("A4R9-11: a memory proposal's undo takes back exactly what its answer wrote, and only inside ten seconds", async () => {
    const p = proposals().find((x) => x.state === "open")!;
    const original = p.text;
    await handle({ method: "POST", path: `/memory/proposals/${p.id}`, body: { verb: "edit", text: "an edited line" } });
    expect((await handle({ method: "POST", path: `/memory/proposals/${p.id}/undo` })).status).toBe(200);
    const back = proposals().find((x) => x.id === p.id)!;
    expect({ state: back.state, text: back.text }).toEqual({ state: "open", text: original });

    await handle({ method: "POST", path: `/memory/proposals/${p.id}`, body: { verb: "ok" } });
    db.setClockOffsetMs(11_000);
    expect((await handle({ method: "POST", path: `/memory/proposals/${p.id}/undo` })).status).toBe(409);
    expect(proposals().find((x) => x.id === p.id)?.state).toBe("accepted");
  });

  it("B-223 (A4R9-09): a rule whose MODE Josh changed after answering stands through a reopen", async () => {
    const card = await ruleCard();
    await verb(card.id, { verb: "approve" });
    const list = rules().map((r) => (r.id === `ar-${card.id}` ? { ...r, mode: "ask" as const } : r));
    await handle({ method: "PUT", path: "/settings/autonomy/rules", body: { rules: list } });
    await reopen(card.id);
    expect(rules().find((r) => r.id === `ar-${card.id}`)?.mode).toBe("ask");
  });

  it("B-223 (A4R9-09): teaching a reopened triage card again leaves the rule Josh rewrote", async () => {
    const res = await handle({ method: "POST", path: "/brain/dump", body: { text: "https://r9twice.example/a", url: "https://r9twice.example/a", source: "share" } });
    const item = (res.json as { item: { id: string } }).item;
    const card = db.get().actions.find((a) => a.kind === "triage" && a.triage?.captureId === item.id) as ActionItem;
    await verb(card.id, { verb: "teach", rule: "" });
    const list = rules().map((r) => (r.id === `ar-${card.id}` ? { ...r, text: "MY WORDS for r9twice" } : r));
    await handle({ method: "PUT", path: "/settings/autonomy/rules", body: { rules: list } });
    await reopen(card.id);
    await verb(card.id, { verb: "teach", rule: "" });
    expect(rules().filter((r) => r.id === `ar-${card.id}`).map((r) => r.text)).toEqual(["MY WORDS for r9twice"]);
  });

  it("B-225 (A4R9-09): a completion's Undo leaves a subtask ticked again since", async () => {
    const t1 = await task("t1");
    const closed = t1.subtasks.find((s) => !s.done)!;
    await useTaskCardStore.getState().completeTask("t1", true, t1);
    db.setClockOffsetMs(2_000); // another device, inside the window, a stamp of its own
    await handle({ method: "PATCH", path: `/tasks/t1/subtasks/${closed.id}`, body: { done: false } });
    await handle({ method: "PATCH", path: `/tasks/t1/subtasks/${closed.id}`, body: { done: true } });
    await useSessionStore.getState().undoLatest();
    expect((await task("t1")).subtasks.find((s) => s.id === closed.id)?.done).toBe(true);
  });

  it("B-226 (A4R9-09): a subtask edit's Undo leaves a title written after the edit", async () => {
    await useTasksStore.getState().load();
    expect(await useTaskEditsStore.getState().patchSubtask("t1", "t1-3", { title: "mine" })).toBeNull();
    await handle({ method: "PATCH", path: "/tasks/t1/subtasks/t1-3", body: { title: "theirs" } });
    await useSessionStore.getState().undoLatest();
    expect((await task("t1")).subtasks.find((s) => s.id === "t1-3")?.title).toBe("theirs");
  });
});

/**
 * v2.3 WPF-8 (CODE_REVIEW_v23.md finding 11) — a refused write is put back as it
 * was, and only what it changed. `deleteSubtask`'s rollback compared the record
 * `optimisticWrite` hands back with the one it removed, by identity — a copy
 * never matches — so a refused delete left the subtask gone; and a refused
 * mark-read restored the whole list, over a reload that landed in between.
 */
describe("WPF-8 · a refused write is put back as it was, and only what it changed", () => {
  afterEach(() => jest.restoreAllMocks());

  it("a subtask delete the server refuses puts the subtask back where it was", async () => {
    await useTasksStore.getState().load();
    const ids = () => (useTasksStore.getState().list.find((t) => t.id === "t1") as Task).subtasks.map((s) => s.id);
    const before = ids();
    expect(before).toContain("t1-2");
    jest.spyOn(getAdapter(), "deleteSubtask").mockRejectedValueOnce(Object.assign(new Error("contract error 503"), { status: 503, reason: "maintenance" }));
    const refusal = await useTaskEditsStore.getState().deleteSubtask("t1", "t1-2");
    expect(refusal).toEqual(expect.objectContaining({ reason: "maintenance" }));
    expect(ids()).toEqual(before);
  });

  it("a mark-read the server refuses rolls back that reply only, not a reload that landed meanwhile", async () => {
    await useRepliesStore.getState().load();
    const [first, second] = useRepliesStore.getState().replies;
    useRepliesStore.setState({ replies: [{ ...first, read: false }, { ...second, read: false }] });
    jest.spyOn(getAdapter(), "patchReply").mockImplementationOnce(async () => {
      // a reload lands while the PATCH is out: the second reply has been read elsewhere
      useRepliesStore.setState((s) => ({ replies: s.replies.map((r) => (r.id === second.id ? { ...r, read: true } : r)) }));
      throw new TypeError("Failed to fetch");
    });
    await useRepliesStore.getState().markRead(first.id);
    const read = Object.fromEntries(useRepliesStore.getState().replies.map((r) => [r.id, r.read]));
    expect(read).toEqual({ [first.id]: false, [second.id]: true });
  });
});

/**
 * v2.3 WPF-7 (CODE_REVIEW_v23.md finding 10) — the Undo belongs to the verb that
 * landed. `answer` reloaded twice before it registered the Undo, so a reload that
 * failed took the way back with it; and the reverts caught every error as a late
 * 409, so a revert that failed on the network cleared the toast, restored
 * nothing, and was never offered again.
 */
describe("WPF-7 · an Undo is offered as soon as its verb lands, and a revert that fails is still owed", () => {
  afterEach(() => jest.restoreAllMocks());

  it("a decision whose reload fails after the verb still offers its Undo", async () => {
    // WPF-7b: since A-2 a failed Today load resolves, so the case answers a rule card, whose answer still awaits a
    // rules reload that rejects (`refetchFor`, stores/rules.ts)
    const card = await ruleCard();
    await useTodayStore.getState().load();
    jest.spyOn(getAdapter(), "getAutonomyRules").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(useTodayStore.getState().answer(card.id, { verb: "approve" })).rejects.toThrow("Failed to fetch");
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
  });

  it("a decision's Undo that fails on the network is offered again, not swallowed", async () => {
    await useTodayStore.getState().load();
    await useTodayStore.getState().answer("c1", { verb: "approve" });
    jest.spyOn(getAdapter(), "postActionUndo").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(useSessionStore.getState().undoLatest()).rejects.toThrow("Failed to fetch");
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
  });

  it("an issue's Undo that fails on the network is offered again", async () => {
    const issue = (db.get().agentIssues as AgentIssue[]).find((i) => i.state === "open") as AgentIssue;
    await useAgentsStore.getState().actIssue(issue.id, "run");
    jest.spyOn(getAdapter(), "undoAgentIssueAction").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(useSessionStore.getState().undoLatest()).rejects.toThrow("Failed to fetch");
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
  });

  it("a memory proposal whose reload fails after it was accepted still offers its Undo", async () => {
    const proposal = (db.get().memoryProposals as { id: string; state: string }[]).find((p) => p.state === "open") as { id: string };
    jest.spyOn(getAdapter(), "getBrainLatest").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // merged with WP-A (A-2): the reload's failure is recorded in loadError, not thrown
    await useBrainStore.getState().resolveProposal(proposal.id, "ok");
    expect(useBrainStore.getState().loadError).toBe("Failed to fetch");
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
  });
});

/**
 * v2.3 WPF-6 (CODE_REVIEW_v23.md finding 9) — a failed load is not an empty list.
 * `.catch(() => [])` turned a 5xx, a 401 or a dropped connection into "no
 * slicers" and "no configured sections", over lists that were already right, and
 * the slicer editor composed its whole-set PUT from the empty one.
 */
describe("WPF-6 · a failed load is not an empty list", () => {
  afterEach(() => jest.restoreAllMocks());

  it("a slicer load that fails keeps the chips it had, and does not count as loaded", async () => {
    await useTasksStore.getState().loadSlicers();
    const before = useTasksStore.getState().slicers;
    expect(before.length).toBeGreaterThan(0);
    useTasksStore.setState({ slicersLoaded: false });
    jest.spyOn(getAdapter(), "getSlicers").mockRejectedValueOnce(new ContractError(503, { reason: "maintenance" }));
    await useTasksStore.getState().loadSlicers();
    expect(useTasksStore.getState().slicers).toEqual(before);
    expect(useTasksStore.getState().slicersLoaded).toBe(false);
  });

  it("only a 404 — a backend without the slicer routes — means no slicers", async () => {
    jest.spyOn(getAdapter(), "getSlicers").mockRejectedValueOnce(new ContractError(404, { reason: "not found" }));
    await useTasksStore.getState().loadSlicers();
    expect(useTasksStore.getState()).toEqual(expect.objectContaining({ slicers: [], slicersLoaded: true }));
  });

  it("a sections load that fails keeps the configured sections", async () => {
    await useSectionsStore.getState().load();
    const before = useSectionsStore.getState().sections;
    expect(before.length).toBeGreaterThan(0);
    jest.spyOn(getAdapter(), "getSections").mockRejectedValueOnce(new ContractError(500, { reason: "boom" }));
    await useSectionsStore.getState().load();
    expect(useSectionsStore.getState().sections).toEqual(before);
  });

  // merged with WP-A (A-2): a load that fails resolves and keeps its reason, as every tab's load does
  it("a sections load that fails records why and resolves, and the next that gets through clears it", async () => {
    await useSectionsStore.getState().load();
    jest.spyOn(getAdapter(), "getSections").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const settled = await useSectionsStore
      .getState()
      .load()
      .then(() => "resolved");
    const failed = useSectionsStore.getState().loadError;
    await useSectionsStore.getState().load();
    expect({ settled, failed, after: useSectionsStore.getState().loadError }).toEqual({ settled: "resolved", failed: "Failed to fetch", after: null });
  });

  it("a slicer load that fails records why in its own slot, and leaves the list's loadError to the list", async () => {
    useTasksStore.setState({ loadError: "the list's own failure" });
    try {
      jest.spyOn(getAdapter(), "getSlicers").mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await useTasksStore.getState().loadSlicers();
      const failed = { slicers: useTasksStore.getState().slicersLoadError, list: useTasksStore.getState().loadError };
      await useTasksStore.getState().loadSlicers();
      const after = { slicers: useTasksStore.getState().slicersLoadError, list: useTasksStore.getState().loadError };
      expect({ failed, after }).toEqual({ failed: { slicers: "Failed to fetch", list: "the list's own failure" }, after: { slicers: null, list: "the list's own failure" } });
    } finally {
      useTasksStore.setState({ loadError: null });
    }
  });
});

/**
 * A-4 round 9 — the callers class (A4R9-01/02; BUGLOG_v22.md A-160): whatever
 * calls a writer with arguments of its own must write what the control it
 * stands for would. The keyboard's A, R and L are driven in the browser by
 * `e2e/core/decisions.spec.ts`; these are the roots they now share.
 */
describe("A-4 round 9 · a key answers as its button does", () => {
  const history = (id: string) => (db.get().actions as ActionItem[]).find((a) => a.id === id)?.history ?? [];

  beforeEach(async () => {
    await useTodayStore.getState().load();
    useSessionStore.setState({ modal: null, sheet: null, settingsOpen: false, locked: false, online: true });
    useTodayStore.setState({ openDecisionId: "c1", picks: {} });
  });

  it("A4R9-02: an approve that names no option records the one its toast announces", async () => {
    useTodayStore.getState().pickOption("c1", 2);
    await useTodayStore.getState().answer("c1", { verb: "approve" });
    expect(history("c1").at(-1)).toEqual(expect.objectContaining({ verb: "approve", option: 2 }));
    expect(useSessionStore.getState().toast?.message).toContain("option 2");
  });

  it("A4R9-01: the keys' card exists only on Today, with nothing over it, unlocked and online", () => {
    expect(keyableCard(true)?.id).toBe("c1");
    expect(keyableCard(false)).toBeNull();
    useSessionStore.setState({ modal: "history" });
    expect(keyableCard(true)).toBeNull();
    useSessionStore.setState({ modal: null, sheet: "teach" });
    expect(keyableCard(true)).toBeNull();
    useSessionStore.setState({ sheet: null, settingsOpen: true });
    expect(keyableCard(true)).toBeNull();
    useSessionStore.setState({ settingsOpen: false, online: false });
    expect(keyableCard(true)).toBeNull();
    useSessionStore.setState({ online: true, locked: true });
    expect(keyableCard(true)).toBeNull();
  });

  it("A4R9-01: R revises a card that is not a quote, and opens the draft editor for a quote only", async () => {
    const cards = useTodayStore.getState().composite?.needsYou ?? [];
    const clash = cards.find((c) => c.id === "c1")!;
    reviseCard(clash);
    expect(useSessionStore.getState().modal).toBeNull();
    for (let i = 0; i < 50 && history("c1").at(-1)?.verb !== "revise"; i++) await new Promise((r) => setTimeout(r, 0));
    expect(history("c1").at(-1)?.verb).toBe("revise");
    const quote = cards.find((c) => c.kind === "quote");
    if (quote != null) {
      reviseCard(quote);
      expect(useSessionStore.getState().modal).toBe("revise-card");
    }
  });
});

/**
 * A-4 round 10 — the keys' gate reads the screen (A4R10-01; BUGLOG_v22.md
 * A-162): the card is answerable only where it is on the screen, and the
 * halves round 10 found unguarded (A4R10-06).
 */
describe("A-4 round 10 · the card has to be on the screen", () => {
  beforeEach(async () => {
    await useTodayStore.getState().load();
    useSessionStore.setState({ modal: null, sheet: null, settingsOpen: false, locked: false, online: true });
    useTodayStore.setState({ openDecisionId: "c1", picks: {} });
    useTaskCardStore.setState({ openTaskId: null });
    useDeviceStore.setState({ collapsed: {} });
  });

  it("A4R10-01: with the task card open over Today, the keys have no card", () => {
    expect(keyableCard(true)?.id).toBe("c1");
    useTaskCardStore.setState({ openTaskId: "t1" });
    expect(keyableCard(true)).toBeNull();
  });

  it("A4R10-01: with Needs you collapsed, the keys have no card", () => {
    useDeviceStore.setState({ collapsed: { [NEEDS_YOU_SECTION]: true } });
    expect(keyableCard(true)).toBeNull();
  });

  it("B-237 (A4R10-06): a memory proposal changed since its answer is not the undo's to take back", async () => {
    const p = (db.get().memoryProposals as { id: string; state: string; text: string }[]).find((x) => x.state === "open")!;
    await handle({ method: "POST", path: `/memory/proposals/${p.id}`, body: { verb: "ok" } });
    // the proposal changed by something other than an answer — another device, the Librarian
    const list = db.get().memoryProposals as { id: string; text: string }[];
    const i = list.findIndex((x) => x.id === p.id);
    list[i] = { ...list[i], text: "changed elsewhere" };
    expect((await handle({ method: "POST", path: `/memory/proposals/${p.id}/undo` })).status).toBe(409);
    expect((db.get().memoryProposals as { id: string; text: string }[]).find((x) => x.id === p.id)?.text).toBe("changed elsewhere");
  });

  it("B-223 (A4R10-06): a rule whose SCOPE Josh changed after answering stands through a reopen", async () => {
    const card = await ruleCard();
    await verb(card.id, { verb: "approve" });
    const list = rules().map((r) => (r.id === `ar-${card.id}` ? { ...r, scope: "triage" as const } : r));
    await handle({ method: "PUT", path: "/settings/autonomy/rules", body: { rules: list } });
    await reopen(card.id);
    expect(rules().find((r) => r.id === `ar-${card.id}`)?.scope).toBe("triage");
  });
});

/**
 * A-4 round 11, A4R11-01: a verb's write reloads its list, the answered row
 * leaves, and the next row takes its place — on the screen and, for the keys,
 * in the open card's slot. A second press then answers a row nobody read, and
 * the one undo entry offers to take back the SECOND write.
 */
describe("A-4 round 11 · a press answers the control that was there", () => {
  const at = (id: string, x: number, y: number) => pressLands(id, { nativeEvent: { pageX: x, pageY: y } });

  beforeEach(() => __resetPressGate());

  it("A4R11-01: a second press at the same point, on a control that changed under it, is refused", () => {
    expect(at("waiting-verb-c2", 400, 300)).toBe(true);
    expect(at("waiting-verb-c3", 400, 300)).toBe(false); // the row that moved into the point
    // and the one after it, until c3 has held the place: a triple-click must
    // not simply answer the third card
    expect(at("waiting-verb-c3", 400, 300)).toBe(false);
  });

  it("A4R11-01: the same control pressed twice, and a press somewhere else, both land", () => {
    expect(at("qty-plus", 100, 100)).toBe(true);
    expect(at("qty-plus", 100, 100)).toBe(true);
    expect(at("task-cb-t3", 100, 400)).toBe(true);
  });

  it("A4R11-01: the window is over 800ms after the control took the place — it has settled", () => {
    const now = jest.spyOn(Date, "now");
    try {
      now.mockReturnValue(10_000);
      expect(at("proposal-ok-p1", 200, 200)).toBe(true);
      now.mockReturnValue(10_400);
      expect(at("proposal-ok-p2", 200, 200)).toBe(false); // p2 arrives at 10_400
      now.mockReturnValue(11_100);
      expect(at("proposal-ok-p2", 200, 200)).toBe(false); // 700 ms is not enough
      now.mockReturnValue(11_200);
      expect(at("proposal-ok-p2", 200, 200)).toBe(true); // 800 ms, and the person can see what they are pressing
      // and the NEXT row, pressed deliberately rather than in a burst: the
      // person looked before they pressed, so it lands at once
      now.mockReturnValue(12_100);
      expect(at("proposal-ok-p3", 200, 200)).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  it("A4R11-01: a press with no coordinates is never refused — nothing says where it landed", () => {
    expect(pressLands("issue-act-e1")).toBe(true);
    expect(pressLands("issue-act-e2")).toBe(true);
  });

  it("A4R11-03: a share discarded from the field takes its provenance with it; annotating it keeps it", () => {
    const brain = useBrainStore.getState();
    brain.setShareDraft({ url: "https://afr.com/dental-rollups", text: "Dental roll-ups — worth reading" });
    brain.setDumpDraft("Dental roll-ups — worth reading  (ask Moz about this)");
    expect(useBrainStore.getState().shareDraft?.url).toBe("https://afr.com/dental-rollups");
    brain.setDumpDraft("");
    expect(useBrainStore.getState().shareDraft).toBeNull();
    brain.setShareDraft({ url: "https://afr.com/dental-rollups", text: "Dental roll-ups — worth reading" });
    brain.setDumpDraft("my own note, nothing to do with that link");
    expect(useBrainStore.getState().shareDraft).toBeNull();
  });

  it("A4R11-01: the keys' slot is the open card — a second verb inside the window answers nothing", () => {
    expect(keyVerbLands("c1")).toBe(true);
    expect(keyVerbLands("c2")).toBe(false); // `resetOpenId` promoted it the moment c1 was answered
    expect(keyVerbLands("c2")).toBe(true); // pressed again, for the card now open
  });
});
