/**
 * today.ts (ADR-04) — the Today composite, which decision card is open,
 * option picks, the From-your-EA insight's local state, and the journal
 * draft. Answering a card is undoable (ADR-13): every verb pushes a
 * session.ts ledger entry whose revert calls POST /actions/{id}/undo —
 * including `later`/`never`/`teach` (mock v11 `answer()`, UN-01: "every
 * answered card"; there is no verb exception).
 */
import { FOLLOW_TODAY, resolveAnchor, shortWeekday } from "@/lib/time";
import { recordLoad } from "@/lib/loadError";
import { offlineCopy, rememberLastSeen, staleLine } from "@/lib/lastSeen";
import { stepAnchor } from "@/lib/timeGrid";
import { composeDeltaLine } from "@/lib/deltaLine";
import { toastFor } from "@/lib/decisionCopy";
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { useSessionStore } from "@/stores/session";
import { useSectionsStore } from "@/stores/sections";
import { useParametersStore } from "@/stores/parameters";
import { useRulesStore } from "@/stores/rules";
import type { ActionItem, CalendarView, CalEvent, FreeGap, PostActionBody, ReviewComposite, TodayComposite } from "@/data/types";

/** the first clause of `thenWhat` ("expires Wed 5pm · then proposes option
 * 1" → "expires Wed 5pm") — the waiting row's short expiry form; there is
 * no separate short-expiry field on the wire (BUGLOG_v2.md A-18). The
 * weekday is shortened by `lib/time.ts`'s `shortWeekday`, which the open
 * card uses too (ux-review R1-08, R2-06). */
export function shortExpiry(thenWhat: string): string {
  return shortWeekday(thenWhat.split(" · then")[0]);
}

type TodayState = {
  composite: TodayComposite | null;
  openDecisionId: string | null;
  picks: Record<string, 1 | 2 | 3>;
  journalDraft: string;
  calView: CalendarView;
  calAnchor: string;
  calendar: { events: CalEvent[]; gaps: FreeGap[] };
  review: ReviewComposite | null;
  /** TD-04: the Calendar card's own "3 days" — a second window beside the
   * grid's, from the composite's own day (P-4, F-47) */
  threeDay: { events: CalEvent[]; gaps: FreeGap[] } | null;
  /** DC-01's history dialog: the query goes to the server (P-4, F-47) */
  history: ActionItem[];
  /** A-2: why the last load failed, or null once one gets through (`lib/loadError.ts`) */
  loadError: string | null;
  /** A-3: when the offline copy on screen was saved, or null once a load gets through (`lib/lastSeen.ts`) */
  staleAt: string | null;

  load: (focus?: string, opts?: { since?: string }) => Promise<void>;
  deltaLine: () => string | undefined;
  openDecision: (id: string | null) => void;
  pickOption: (cardId: string, option: 1 | 2 | 3) => void;
  answer: (id: string, body: PostActionBody) => Promise<void>;
  answerInsight: (id: string, action: "block" | "leave") => Promise<void>;
  setJournalDraft: (text: string) => void;
  submitJournal: (source: "voice" | "typed") => Promise<void>;
  setCalView: (view: CalendarView, focus?: string) => Promise<void>;
  navCalendar: (dir: 1 | -1, focus?: string) => Promise<void>;
  loadCalendar: (focus?: string) => Promise<void>;
  loadReview: (anchor?: string) => Promise<void>;
  loadThreeDay: (focus?: string) => Promise<void>;
  loadHistory: (q?: string) => Promise<void>;
  /** DC-05: the revised draft, written before the card is answered (P-4) */
  saveDraft: (id: string, body: string) => Promise<void>;
};

/** A verb that changes data another STORE owns has to refetch it: the
 *  composite carries the CARD, never the thing the card changed. `section`
 *  was the first (B-3), `parameter` the one that was missed — the device held
 *  the undone lock timeout until a reload (B-174). Called on the verb AND on
 *  the undo, because the undo is the one that lied. All four `KIND_EFFECTS`
 *  kinds are here now (B-183): covering two of four was the shape of the bug,
 *  and `rule` and `triage` both write a standing autonomy rule. */
export async function refetchFor(card: ActionItem | undefined): Promise<void> {
  if (card?.kind === "section") await useSectionsStore.getState().load();
  if (card?.kind === "parameter") await useParametersStore.getState().load();
  if (card?.kind === "rule" || card?.kind === "triage") await useRulesStore.getState().load();
}

/** the open-card reset rule shared by load() and answer()'s undo revert
 * (mock v11 `today()` line 453): keep the current open card if it is
 * still in the (possibly refiltered) open list, else fall back to the
 * first one, else none. */
function resetOpenId(prevOpenId: string | null, needsYou: ActionItem[]): string | null {
  if (prevOpenId != null && needsYou.some((c) => c.id === prevOpenId)) return prevOpenId;
  return needsYou[0]?.id ?? null;
}

export const useTodayStore = create<TodayState>((set, get) => ({
  composite: null,
  openDecisionId: null,
  picks: {},
  journalDraft: "",
  calView: "today",
  // CD-09: this used to be `new Date().toISOString().slice(0, 10)` — a
  // literal evaluated at MODULE LOAD, strictly before any clock offset could
  // be installed, so the calendar window was pinned to the machine's real
  // UTC date for the life of the process. FOLLOW_TODAY resolves on every
  // read, off the same Brisbane clock every other surface reads.
  calAnchor: FOLLOW_TODAY,
  calendar: { events: [], gaps: [] },
  review: null,
  threeDay: null,
  history: [],
  loadError: null,
  staleAt: null,

  load: (focus, opts) => recordLoad(set, async () => {
    // OF-09: `?since=` on a refetch only — a cold open has seen nothing yet; the
    // reconnect passes the one seenAt it passes every composite (F-17, P-10)
    const composite = await getAdapter().getToday(focus, opts?.since);
    set((s) => ({ composite, openDecisionId: resetOpenId(s.openDecisionId, composite.needsYou), staleAt: null }));
    void rememberLastSeen("today", focus ?? "", composite);
  }, async () => {
    const copy = await offlineCopy<TodayComposite>("today", focus ?? "");
    if (copy != null) set((s) => ({ composite: copy.payload, openDecisionId: resetOpenId(s.openDecisionId, copy.payload.needsYou), staleAt: copy.savedAt }));
  }),
  deltaLine: () => {
    const { composite, staleAt } = get();
    return staleAt != null ? staleLine(staleAt) : composeDeltaLine(composite?.delta, composite?.since);
  },

  openDecision: (openDecisionId) => set({ openDecisionId }),
  pickOption: (cardId, option) => set((s) => ({ picks: { ...s.picks, [cardId]: option } })),

  answer: async (id, body) => {
    const adapter = getAdapter();
    const card = get().composite?.needsYou.find((c) => c.id === id);
    const pick = get().picks[id] ?? card?.recommended ?? 1;
    await adapter.postActionVerb(id, body.verb === "approve" ? { ...body, option: body.option ?? pick } : body); // A4R9-02: the option its toast names
    if (card != null) { // WPF-7: offered before the reloads, so one that fails cannot take the way back with it
      useSessionStore.getState().pushUndo(toastFor(card, body, pick), async () => {
        try {
          await adapter.postActionUndo(id);
        } catch (error) {
          if ((error as { status?: number }).status === 409) return; // UN-02: a late undo 409s — nothing wrong to show
          throw error; // WPF-7: any other failure is a revert still owed, and `undoLatest` offers it again (A4R7-12)
        }
        await get().load();
        await refetchFor(card);
        set({ openDecisionId: id });
      });
    }
    await get().load();
    await refetchFor(card);
  },

  answerInsight: async (id, action) => {
    await getAdapter().postInsightAction(id, action);
    await get().load();
  },

  setJournalDraft: (journalDraft) => set({ journalDraft }),
  submitJournal: async (source) => {
    const text = get().journalDraft;
    if (text.trim() === "") return;
    // A-9 (A4R8-07): cleared as the line goes, as Brain's capture is (OF-05), so words typed meanwhile stay — and given back on a throw if none were
    set({ journalDraft: "" });
    await getAdapter().postJournal({ text, source }).catch((e: unknown) => { if (get().journalDraft === "") set({ journalDraft: text }); throw e; });
    await get().load();
  },

  setCalView: async (calView, focus) => {
    set({ calView });
    await get().loadCalendar(focus);
  },
  navCalendar: async (dir, focus) => {
    const { calView, calAnchor } = get();
    if (calView === "today") return; // CG-08: Today has no navigation
    // stepping AWAY from today stores a real key: a week the user navigated
    // to is a week they chose, and it must not follow the clock
    set({ calAnchor: stepAnchor(resolveAnchor(calAnchor), calView, dir) });
    await get().loadCalendar(focus);
  },
  loadCalendar: async (focus) => {
    const { calView, calAnchor } = get();
    const calendar = await getAdapter().getCalendar(calView, resolveAnchor(calAnchor), focus);
    set({ calendar });
  },

  loadReview: async (anchor) => {
    const review = await getAdapter().getReview(anchor);
    set({ review });
  },
  loadThreeDay: async (focus) => {
    const today = get().composite?.todayDate;
    if (today == null) return;
    const threeDay = await getAdapter().getCalendar("3day", today, focus);
    set({ threeDay });
  },
  loadHistory: async (q) => {
    const history = await getAdapter().getActions("history", { q });
    set({ history });
  },
  saveDraft: async (id, body) => {
    await getAdapter().putActionDraft(id, { body });
  },
}));
