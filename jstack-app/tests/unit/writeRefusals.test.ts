/**
 * REMAP, the hand test of 30 Sep — every write the app makes, refused the way the n8n build refuses
 * an unwired one (`501 { reason: "not connected yet" }`; a real server's 5xx takes the same path).
 * A Board drag into Done and "Dictate to EA" used to end in "Uncaught Error: contract error 501".
 *
 *  A. a store action a tap starts and nothing awaits: it resolves, says "Couldn't · not connected
 *     yet" (or returns the refusal its caller shows), and leaves what it changed as it was;
 *  B. one whose caller awaits it: it rejects with the 501, having put back what it changed — and
 *     C. every fire-and-forget call of one of those in the app carries its catch;
 *  D. every write route in `data/routes.ts` is driven here, or named with why nothing can call it.
 *
 * The mock answers every read (the fixtures are what there is to act on); every write is 501. An
 * `unhandledRejection` listener watches the whole file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as db from "@/data/mock/db";
import { ContractError } from "@/data/ApiAdapter";
import { ROUTES } from "@/data/routes";
import type { TransportRequest } from "@/data/transport/Transport";
import { approveCard, laterCard, reviseCard } from "@/lib/cardVerbs";
import { useAgentsStore } from "@/stores/agents";
import { useBrainStore } from "@/stores/brain";
import { useDictateStore } from "@/stores/dictate";
import { useLifeEditsStore } from "@/stores/lifeEdits";
import { useLifeStore } from "@/stores/life";
import { useParametersStore } from "@/stores/parameters";
import { useRepliesStore } from "@/stores/replies";
import { useRulesStore } from "@/stores/rules";
import { useSectionsStore } from "@/stores/sections";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useTaskCardStore, INITIAL as CARD_INITIAL } from "@/stores/taskCard";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { useTasksStore, INITIAL as TASKS_INITIAL } from "@/stores/tasks";
import { useTodayStore } from "@/stores/today";
import type { Task } from "@/data/types";

/** every write route the file drove, by name — D reads it at the end */
const mockDriven = new Set<string>();
jest.mock("@/data/transport/mock", () => {
  const actual = jest.requireActual("@/data/transport/mock");
  const { handle } = jest.requireActual("@/data/mock/server");
  const routes = jest.requireActual("@/data/routes");
  return {
    ...actual,
    mockTransport: async (req: TransportRequest) => {
      if (req.method === "GET") return handle(req);
      const route = routes.ROUTES.find((r: { method: string; path: string }) => r.method === req.method && routes.pathToPattern(r.path).test(req.path));
      mockDriven.add(route?.name ?? `${req.method} ${req.path}`);
      return { status: 501, json: { reason: "not connected yet" } };
    },
  };
});

const REFUSED = "Couldn't · not connected yet";
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
beforeAll(() => process.on("unhandledRejection", onUnhandled));
afterAll(() => process.off("unhandledRejection", onUnhandled));

/** let every fire-and-forget promise a call left behind settle, so a rejection nobody caught surfaces */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
const toast = () => useSessionStore.getState().toast?.message ?? null;
const snapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

beforeEach(async () => {
  db.reset();
  db.asUser("josh");
  useSessionStore.setState({ undo: { entries: [] }, toast: null, locked: false, online: true });
  useTasksStore.setState(TASKS_INITIAL);
  useTaskCardStore.setState(CARD_INITIAL);
  await Promise.all([useTasksStore.getState().load(), useTodayStore.getState().load(), useSettingsStore.getState().load()]);
  await Promise.all([useTasksStore.getState().loadColumns(), useLifeStore.getState().load(), useAgentsStore.getState().load(), useBrainStore.getState().load(), useRepliesStore.getState().load()]);
});
afterEach(async () => {
  await settle();
  expect(unhandled).toEqual([]);
});

const task = (pick: (t: Task) => boolean): Task => {
  const found = useTasksStore.getState().list.find(pick);
  if (found == null) throw new Error("no fixture task fits");
  return found;
};
const tasksNow = () => snapshot(useTasksStore.getState().list);

describe("A · a tap nothing awaits: said, resolved, and put back", () => {
  it("a Board drag into Done — the reported crash — completes nothing and the card stays in its column", async () => {
    const t = task((x) => x.status !== "done" && x.subtasks.every((s) => s.done));
    const done = useTasksStore.getState().columns.find((c) => c.statuses.includes("done"))!;
    const before = tasksNow();
    await expect(useTaskEditsStore.getState().moveTask(t.id, done)).resolves.toBeNull();
    expect({ toast: toast(), list: tasksNow(), pending: useTaskCardStore.getState().pendingComplete }).toEqual({ toast: REFUSED, list: before, pending: null });
  });

  it("a Board drag between open columns returns the refusal the Board toasts, and the card goes back", async () => {
    const t = task((x) => x.status === "open");
    const other = useTasksStore.getState().columns.find((c) => c.id !== t.column && !c.statuses.includes("done"))!;
    const before = tasksNow();
    await expect(useTaskEditsStore.getState().moveTask(t.id, other)).resolves.toEqual({ field: undefined, reason: "not connected yet" });
    expect(tasksNow()).toEqual(before);
  });

  it("ticking a task, reopening one, and completing with its subtasks change nothing and say why", async () => {
    const card = useTaskCardStore.getState();
    const open = task((x) => x.status !== "done" && x.subtasks.every((s) => s.done));
    const before = tasksNow();
    await expect(card.requestComplete(open)).resolves.toBeUndefined();
    expect(toast()).toBe(REFUSED);
    await expect(card.completeTask(open.id, true, open)).resolves.toBeUndefined();
    const done = { ...open, status: "done" as const };
    useSessionStore.setState({ toast: null });
    await expect(card.requestComplete(done)).resolves.toBeUndefined();
    expect({ toast: toast(), list: tasksNow() }).toEqual({ toast: "not connected yet", list: before });
  });

  it.each([
    ["accept", () => useTaskCardStore.getState().acceptTask("t1")],
    ["delegate", () => useTaskCardStore.getState().delegate("t1", "ea")],
    ["draft a nudge", () => useTasksStore.getState().nudge("t1")],
    ["log a habit", () => useLifeStore.getState().logHabit(useLifeStore.getState().habits[0]!.id, "2026-09-30", true)],
    ["reopen a decision", async () => {
      await useAgentsStore.getState().loadHistory();
      return useAgentsStore.getState().reopenAction(useAgentsStore.getState().history[0]!.id);
    }],
    ["pause a schedule", async () => {
      await useAgentsStore.getState().loadSchedules();
      return useAgentsStore.getState().pauseSchedule(useAgentsStore.getState().schedules[0]!.id);
    }],
    ["resume a schedule", async () => {
      await useAgentsStore.getState().loadSchedules();
      return useAgentsStore.getState().resumeSchedule(useAgentsStore.getState().schedules[0]!.id);
    }],
    ["run a schedule", async () => {
      await useAgentsStore.getState().loadSchedules();
      return useAgentsStore.getState().runSchedule(useAgentsStore.getState().schedules[0]!.id);
    }],
    ["run a security check", () => useAgentsStore.getState().runCheck(useAgentsStore.getState().checks[0]!.id)],
    ["act on an agent issue", () => useAgentsStore.getState().actIssue(useAgentsStore.getState().issues[0]!.id, useAgentsStore.getState().issues[0]!.verb.action)],
    ["approve a card (a key or its button)", () => approveCard(useTodayStore.getState().composite!.needsYou[0]!)],
    ["put a card off (Later)", () => laterCard(useTodayStore.getState().composite!.needsYou[0]!)],
    ["revise a choice card", async () => {
      reviseCard(useTodayStore.getState().composite!.needsYou.find((c) => c.kind === "opts")!);
    }],
  ])("%s: resolves and says so, and Needs you, the tasks and the undo stack are as they were", async (_label, run) => {
    const before = { tasks: tasksNow(), needsYou: snapshot(useTodayStore.getState().composite!.needsYou), habits: snapshot(useLifeStore.getState().habitLogs) };
    await expect(run()).resolves.toBeUndefined();
    await settle();
    expect(toast()).toBe(REFUSED);
    expect({ tasks: tasksNow(), needsYou: useTodayStore.getState().composite!.needsYou, habits: useLifeStore.getState().habitLogs, undo: useSessionStore.getState().undo.entries }).toEqual({ ...before, undo: [] });
  });

  it("an EA report returns null, and its handler goes no further", async () => {
    await expect(useTaskCardStore.getState().submitReport("t1", "accept")).resolves.toBeNull();
    expect(toast()).toBe(REFUSED);
  });

  it("the settings saves answer false, said, with the record as it was", async () => {
    const s = useSettingsStore.getState();
    const before = snapshot({ quietHours: s.quietHours, autonomy: s.autonomy, voice: s.voice, focuses: s.focuses, appLayout: s.appLayout, groups: s.notificationGroups });
    const saves: [string, () => Promise<boolean>][] = [
      ["quiet hours", () => s.putQuietHours({ ...s.quietHours!, start: "22:00" })],
      ["autonomy", () => s.putAutonomy({ ...s.autonomy, Bills: "auto" })],
      ["voice", () => s.putVoice({ ...s.voice!, readAloud: !s.voice!.readAloud })],
      ["focuses", () => s.putFocuses(s.focuses.slice(0, 2))],
      ["a notification group", () => {
        const group = s.notificationGroups.find((g) => g.id !== "security")!;
        return s.putNotificationGroup(group.id, { ...group.devices, pc: !group.devices.pc });
      }],
      ["rules", () => useRulesStore.getState().put([])],
      ["slicers", () => useTasksStore.getState().putSlicers([])],
      ["a parameter", () => useParametersStore.getState().setParameter("lock.afterMinutes", 20)],
    ];
    for (const [label, save] of saves) {
      useSessionStore.setState({ toast: null });
      expect([label, await save()]).toEqual([label, false]);
      if (label !== "a parameter") expect([label, toast()]).toEqual([label, REFUSED]);
    }
    const after = useSettingsStore.getState();
    expect({ quietHours: after.quietHours, autonomy: after.autonomy, voice: after.voice, focuses: after.focuses, appLayout: after.appLayout, groups: after.notificationGroups }).toEqual(before);
  });

  it("the life editors and the subtask writes return the refusal their callers show, and roll back", async () => {
    const edits = useLifeEditsStore.getState();
    const goals = snapshot(useLifeStore.getState().goals);
    const habits = snapshot(useLifeStore.getState().habits);
    expect((await edits.saveGoals(goals, goals.slice(1)))?.reason).toBe("not connected yet");
    expect((await edits.archiveGoal(goals[0]!.id, "dropped"))?.reason).toBe("not connected yet");
    expect((await edits.saveHabits(habits.slice(1)))?.reason).toBe("not connected yet");
    expect({ goals: useLifeStore.getState().goals, habits: useLifeStore.getState().habits }).toEqual({ goals, habits });

    const t = task((x) => x.subtasks.length > 0);
    const before = tasksNow();
    const s = t.subtasks[0]!;
    expect((await useTaskEditsStore.getState().patchSubtask(t.id, s.id, { done: !s.done }))?.reason).toBe("not connected yet");
    expect((await useTaskEditsStore.getState().deleteSubtask(t.id, s.id))?.reason).toBe("not connected yet");
    expect(tasksNow()).toEqual(before);
  });

  it("marking a reply read puts it back to unread", async () => {
    const unread = useRepliesStore.getState().replies.find((r) => !r.read)!;
    await expect(useRepliesStore.getState().markRead(unread.id)).resolves.toBeUndefined();
    expect(useRepliesStore.getState().replies.find((r) => r.id === unread.id)?.read).toBe(false);
  });
});

describe("B · awaited by their callers: rejected with the 501, with nothing left changed", () => {
  const is501 = (e: unknown) => e instanceof ContractError && e.status === 501;
  const rejects501 = async (run: () => Promise<unknown>) => expect(is501(await run().then(() => null, (e: unknown) => e))).toBe(true);

  it("a decision's own verbs (Never, Teach, a revision) leave the card in Needs you", async () => {
    const card = useTodayStore.getState().composite!.needsYou[0]!;
    const before = snapshot(useTodayStore.getState().composite!.needsYou);
    await rejects501(() => useTodayStore.getState().answer(card.id, { verb: "never" }));
    await rejects501(() => useTodayStore.getState().saveDraft(card.id, "a revision"));
    expect(useTodayStore.getState().composite!.needsYou).toEqual(before);
  });

  it("Dictate to EA — the reported crash — takes Josh's line back off the thread", async () => {
    const before = snapshot(useDictateStore.getState().chat);
    await rejects501(() => useDictateStore.getState().sendChat("remind me about the dentist"));
    expect(useDictateStore.getState().chat).toEqual(before);
  });

  it("a journal line and a mind dump give the words back", async () => {
    useTodayStore.setState({ journalDraft: "a good day" });
    await rejects501(() => useTodayStore.getState().submitJournal("typed"));
    expect(useTodayStore.getState().journalDraft).toBe("a good day");
    useBrainStore.setState({ dumpDraft: "buy milk" });
    await rejects501(() => useBrainStore.getState().dump("typed"));
    expect(useBrainStore.getState().dumpDraft).toBe("buy milk");
  });

  it("the rest change nothing: the insight, a memory proposal, an item edit, a new task or subtask, caps, sections, a person, the lock", async () => {
    const before = { tasks: tasksNow(), latest: snapshot(useBrainStore.getState().latestIn), proposals: snapshot(useBrainStore.getState().proposals) };
    const insight = useTodayStore.getState().composite!.insight;
    if (insight != null) await rejects501(() => useTodayStore.getState().answerInsight(insight.id, "leave"));
    await rejects501(() => useBrainStore.getState().resolveProposal(before.proposals[0]!.id, "ok"));
    await rejects501(() => useBrainStore.getState().saveItemEdit(before.latest[0]!.id, "edited"));
    await rejects501(() => useTaskCardStore.getState().createTask({ ...task(() => true), title: "new" }));
    await rejects501(() => useTaskEditsStore.getState().addSubtask("t1", "a step", "josh"));
    await rejects501(() => useAgentsStore.getState().putCaps([], "n", "a"));
    await rejects501(() => useSectionsStore.getState().save("s1", { title: "x" }));
    await rejects501(() => useSectionsStore.getState().revert("s1"));
    await rejects501(() => useSectionsStore.getState().propose({ id: "p", tab: "life", title: "x", blocks: [] } as never, "why"));
    await rejects501(() => useLifeStore.getState().saveSectionConfig("x", { showWithin: 3 }));
    await rejects501(() => useLifeStore.getState().revertSectionConfig("x"));
    await rejects501(() => useLifeStore.getState().actPerson(useLifeStore.getState().people[0]!.id, "done"));
    await rejects501(() => useSessionStore.getState().lock("n", "a"));
    await rejects501(() => useSessionStore.getState().recover("key", "n", "a"));
    await rejects501(() => useSettingsStore.getState().revokeDevice("d1", "n", "a"));
    expect({ tasks: tasksNow(), latest: useBrainStore.getState().latestIn, proposals: useBrainStore.getState().proposals }).toEqual(before);
  });

  it("the layouts and the export (their callers catch; their own tests pin the rejection) leave the settings as they were", async () => {
    const s = useSettingsStore.getState();
    await s.loadLayout("today");
    const before = snapshot({ layouts: useSettingsStore.getState().layouts, appLayout: s.appLayout });
    await rejects501(() => s.putLayout("today", { hidden: [] }));
    await rejects501(() => s.revertLayout("today"));
    await rejects501(() => s.putAppLayout({ showFocusRow: false }));
    await rejects501(() => s.exportAll());
    expect({ layouts: useSettingsStore.getState().layouts, appLayout: useSettingsStore.getState().appLayout }).toEqual(before);
  });
});

describe("C · every fire-and-forget call of a B action carries its catch", () => {
  const B = ["answer", "saveDraft", "sendChat", "submitJournal", "dump", "answerInsight", "resolveProposal", "saveItemEdit", "createTask", "addSubtask", "putCaps", "saveSection", "revertSection", "proposeSection", "saveSectionConfig", "revertSectionConfig", "undoLatest", "togglePush", "putLayout", "revertLayout", "putAppLayout"];
  const root = join(__dirname, "..", "..");
  const walk = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((name) => {
      const rel = `${dir}/${name}`;
      return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.tsx?$/.test(name) ? [rel] : [];
    });
  /** the statement a `void …name(` starts, to its `;` or the bracket that closes around it */
  const statementAt = (text: string, at: number): string => {
    let depth = 0;
    for (let i = at; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") {
        if (depth === 0) return text.slice(at, i);
        depth--;
      } else if (ch === ";" && depth === 0) return text.slice(at, i);
    }
    return text.slice(at);
  };

  it("no `void X(…)` of one of them lets its rejection go", () => {
    const bare: string[] = [];
    for (const file of ["components", "app", "layout", "lib"].flatMap(walk)) {
      const text = readFileSync(join(root, file), "utf8");
      for (const name of B) {
        const call = new RegExp(`void (?:[\\w.\\s]+\\(\\)\\s*\\.\\s*)*(?:\\w+\\.)*${name}\\(`, "g");
        for (let m = call.exec(text); m != null; m = call.exec(text)) {
          const stmt = statementAt(text, m.index);
          if (!/\.catch\(|\.then\([^]*?,\s*sayRefused\)/.test(stmt)) bare.push(`${file}: ${stmt.slice(0, 90)}`);
        }
      }
    }
    expect(bare).toEqual([]);
  });
});

describe("D · every write route is driven here, or has no caller", () => {
  /** routes this file does not drive, and why — each checked by hand */
  const NOT_DRIVEN: Record<string, string> = {
    registerDevice: "the passkey runs on the device (lib/webauthnGate.ts); no store sends it",
    webauthnCeremony: "the same",
    refreshAuth: "only the test rig calls lib/authTokens.ts's refresh, which rethrows for it",
    postPushSubscribe: "behind the browser's push permission (lib/push.ts); Settings' switch carries its catch (C)",
    deletePushSubscription: "caught where it is sent (lib/push.ts; stores/settings.ts revokeDevice)",
    patchEvent: "no caller in the app",
    deleteEvent: "no caller in the app",
    postCalendarPropose: "no caller in the app",
    postUndo: "no caller in the app",
    putLabels: "no caller in the app",
    deleteSection: "no caller in the app",
    postAutonomyPropose: "the test rig's only (lib/testHook.ts)",
    proposeParameter: "the test rig's only (lib/testHook.ts)",
    postLayoutEa: "the test rig's only (lib/testHook.ts)",
    postFile: "stores/files.ts upload keeps its own refusal line (uploadError) and never throws",
    undoMemoryProposal: "sent only by the undo of an accepted proposal; none is accepted here",
    undoAgentIssueAction: "sent only by the undo of an issue action that landed; none lands here",
    postActionUndo: "sent only by the undo of an answer that landed (the Toast's Undo carries its catch, C)",
    putTask: "sent only by the undo of a completion that landed; none lands here",
  };

  it("the file drove every write route but the ones named, and each named one is a write route", () => {
    const writes: string[] = ROUTES.filter((r) => r.method !== "GET").map((r) => r.name);
    expect(writes.length).toBe(69);
    expect(Object.keys(NOT_DRIVEN).filter((n) => !writes.includes(n))).toEqual([]);
    expect(writes.filter((n) => !mockDriven.has(n) && NOT_DRIVEN[n] == null)).toEqual([]);
  });
});
