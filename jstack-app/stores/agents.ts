/**
 * agents.ts (ADR-04) — summary, spend and caps, portals, agent issues,
 * the feed, security checks, decision history (answered/expired
 * ActionItems), and schedules.
 */
import { create } from "zustand";
import { ContractError } from "@/data/ApiAdapter";
import { getAdapter } from "@/data/provider";
import { attempt, REFUSED } from "@/lib/optimistic";
import { recordLoad } from "@/lib/loadError";
import { useSessionStore } from "@/stores/session";
import { refetchFor } from "@/stores/today";
import type { ActionItem, AgentIssue, AgentSummary, FeedEvent, Portal, Schedule, SecurityCheck, Spend } from "@/data/types";

type AgentsState = {
  summary: AgentSummary | null;
  spend: Spend | null;
  portals: Portal[];
  issues: AgentIssue[];
  feed: FeedEvent[];
  checks: SecurityCheck[];
  history: ActionItem[];
  schedules: Schedule[];
  /** A-2: why the last load failed, or null once one gets through (`lib/loadError.ts`) */
  loadError: string | null;

  load: () => Promise<void>;
  /** the aggregates an issue's verb changes — the summary (health, count), the checks (`run` runs the linked one) and the feed (it records the run) — re-read together, not with the other four */
  loadDerived: () => Promise<void>;
  /** Settings' own Schedules section (row 16) reuses this store rather
   * than duplicating schedule state — but Settings can open from any
   * tab without Agents ever having been visited, so it needs a way to
   * fetch just the schedules on its own rather than the full `load()`. */
  loadSchedules: () => Promise<void>;
  loadHistory: (q?: string) => Promise<void>;
  reopenAction: (id: string) => Promise<void>;
  actIssue: (id: string, action: "renew" | "run" | "open") => Promise<void>;
  runCheck: (id: string) => Promise<void>;
  putCaps: (caps: { agent: string; cap: number }[], nonce: string, biometricAssertion: string) => Promise<void>;
  pauseSchedule: (id: string) => Promise<void>;
  resumeSchedule: (id: string) => Promise<void>;
  runSchedule: (id: string) => Promise<void>;
};

/** the undo label for each issue verb (AG-04's pins) — a table over the closed union (F-14) */
const ISSUE_TOAST: Record<AgentIssue["verb"]["action"], string> = { renew: "Renewed", run: "Running the suite", open: "Opened" };

export const useAgentsStore = create<AgentsState>((set, get) => ({
  summary: null,
  spend: null,
  portals: [],
  issues: [],
  feed: [],
  checks: [],
  history: [],
  schedules: [],
  loadError: null,

  load: () => recordLoad(set, async () => {
    const adapter = getAdapter();
    const [summary, spend, portals, issues, feed, checks, schedules] = await Promise.all([
      adapter.getAgentSummary(),
      adapter.getAgentSpend(),
      adapter.getPortals(),
      adapter.getAgentIssues(),
      adapter.getAgentFeed(24),
      adapter.getSecurityChecks(),
      adapter.getSchedules(),
    ]);
    set({ summary, spend, portals, issues, feed, checks, schedules });
  }),

  loadDerived: async () => {
    const adapter = getAdapter();
    const read = await Promise.all([adapter.getAgentSummary(), adapter.getSecurityChecks(), adapter.getAgentFeed(24)]).catch(() => null);
    if (read != null) set({ summary: read[0], checks: read[1], feed: read[2] }); // unreadable after a write: as it was
  },

  loadSchedules: async () => {
    // F-65 (P-10): the store short-circuits once it has them, so the Settings
    // card can ask on every mount without a deps disable
    if (get().schedules.length > 0) return;
    const schedules = await getAdapter().getSchedules().catch(() => null); // unreadable: the card stays as it was
    if (schedules != null) set({ schedules });
  },

  loadHistory: async (q) => {
    const history = await getAdapter().getActions("history", { q }).catch(() => null); // unreadable: the list stays as it was
    if (history != null) set({ history });
  },
  // the verbs below are taps nothing awaits: a refusal is said (`attempt`), never an unhandled rejection
  reopenAction: async (id) => {
    const card = get().history.find((a) => a.id === id);
    if ((await attempt(() => getAdapter().postActionReopen(id))) === REFUSED) return;
    set((s) => ({ history: s.history.filter((a) => a.id !== id) }));
    // A4R7-03: a reopen takes the answer's effect back on the server, so the
    // device refetches what the card touched — the third door B-174 missed
    await refetchFor(card);
    useSessionStore.getState().showToast("Reopened · back in Needs you");
  },

  // F-15 (P-10): each write sets ITS slice from the record the handler returns
  // — the open list keeps only open issues, as GET /agents/issues does — and
  // re-reads only the aggregates the write changed. Each used to call load():
  // seven GETs per click, invisible on the mock, seven round trips on HTTP.
  actIssue: async (id, action) => {
    // B-197. The undo used to be gated on finding the issue in `get().issues`
    // — the OPEN list — and `IssueDetail` fetches its record through
    // `useDetail` straight from the adapter while `getAgentIssue` answers for
    // an issue in ANY state. So an issue reached from the detail after it had
    // left the open list wrote with no undo and NO TOAST at all.
    //
    // No snapshot is needed and none was ever used: the revert is
    // `undoAgentIssueAction(id)`, which the SERVER answers. The lookup only
    // ever decided WHERE to put the row back, and -1 is a legitimate answer
    // off the open list — so it chooses a position now instead of deciding
    // whether an undo exists (B-190's lesson, one store over).
    const index = get().issues.findIndex((i) => i.id === id);
    const saved = await attempt(() => getAdapter().postAgentIssueAction(id, action));
    if (saved === REFUSED) return;
    set((s) => ({ issues: saved.state === "open" ? s.issues.map((i) => (i.id === id ? saved : i)) : s.issues.filter((i) => i.id !== id) }));
    // WPF-7: the Undo is offered before the reload, so a reload that fails does not take it away
    useSessionStore.getState().pushUndo(ISSUE_TOAST[action], async () => {
      // A4R6-02: the server answers 409 when there is nothing left to undo
      // (UN-02, as a decision card's undo), and the issue goes back to the
      // state THIS press found — which, pressed from its detail, may be done
      let back;
      try {
        back = await getAdapter().undoAgentIssueAction(id);
      } catch (error) {
        // only the 409 is "nothing left to undo"; any other failure is a revert
        // still owed, which `undoLatest` offers again (WPF-7, A4R7-12)
        if (error instanceof ContractError && error.status === 409) return;
        throw error;
      }
      set((s) => {
        const rest = s.issues.filter((i) => i.id !== id);
        const at = index === -1 ? rest.length : index;
        return { issues: back.state === "open" ? [...rest.slice(0, at), back, ...rest.slice(at)] : rest };
      });
      await get().loadDerived();
    });
    await get().loadDerived();
  },
  runCheck: async (id) => {
    const saved = await attempt(() => getAdapter().postSecurityCheckRun(id));
    if (saved === REFUSED) return;
    set((s) => ({ checks: s.checks.map((c) => (c.id === id ? saved : c)) }));
    await get().loadDerived();
  },
  putCaps: async (caps, nonce, biometricAssertion) => {
    set({ spend: await getAdapter().putAgentCaps(caps, { nonce, biometricAssertion }) });
  },
  pauseSchedule: async (id) => {
    const saved = await attempt(() => getAdapter().postSchedulePause(id));
    if (saved === REFUSED) return;
    set((s) => ({ schedules: s.schedules.map((sc) => (sc.id === id ? saved : sc)) }));
    useSessionStore.getState().showToast("Paused · resume any time");
  },
  resumeSchedule: async (id) => {
    const saved = await attempt(() => getAdapter().postScheduleResume(id));
    if (saved === REFUSED) return;
    set((s) => ({ schedules: s.schedules.map((sc) => (sc.id === id ? saved : sc)) }));
    useSessionStore.getState().showToast("Resumed");
  },
  runSchedule: async (id) => {
    const saved = await attempt(() => getAdapter().postScheduleRun(id));
    if (saved === REFUSED) return;
    set((s) => ({ schedules: s.schedules.map((sc) => (sc.id === id ? saved : sc)) }));
    useSessionStore.getState().showToast("Running now · the result lands in the feed");
  },
}));
