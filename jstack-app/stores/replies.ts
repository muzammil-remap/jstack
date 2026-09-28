/**
 * replies.ts (R-1, §3) — the EA's answers to captures that were questions.
 *
 * Its own store rather than a slice of `stores/brain.ts`, for two reasons and
 * not only the size cap. A reply is read from THREE surfaces that have
 * nothing else in common — Brain › Replies, Today's "From your EA" card, and
 * a push that opens one directly — and only one of them is on the Brain tab;
 * a Today card reaching into the Brain store to find out whether it should
 * render is the coupling that makes a tab's store into everybody's store.
 * `stores/brain.ts` is also at 196 of its 200 lines (hard rule 3), and
 * "shave four lines off the neighbour" is how a store ends up owning a
 * subject it never chose.
 *
 * `markRead` is optimistic in ONE direction only: it flips the local row
 * immediately so the badge and the card go without a round trip, and on
 * failure it puts the row back. A reply that silently stayed unread on the
 * server while showing read here would send the same push again.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { recordLoad } from "@/lib/loadError";
import type { Reply } from "@/data/types";

type RepliesState = {
  replies: Reply[];
  /** A-2b: why the last load failed, or null once one gets through (`lib/loadError.ts`) */
  loadError: string | null;
  load: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
};

export const useRepliesStore = create<RepliesState>((set, get) => ({
  replies: [],
  loadError: null,

  // A-2b: recorded, never thrown — Today and Brain fire it beside their own load, fire-and-forget
  load: () => recordLoad(set, async () => {
    set({ replies: await getAdapter().getReplies() });
  }),

  markRead: async (id) => {
    const before = get().replies;
    if (!before.some((r) => r.id === id && !r.read)) return;
    set({ replies: before.map((r) => (r.id === id ? { ...r, read: true } : r)) });
    try {
      await getAdapter().patchReply(id, true);
    } catch {
      // WPF-8: only this reply goes back to unread. The list as it stood before the
      // PATCH would also wipe a reload that landed while the PATCH was out
      set((s) => ({ replies: s.replies.map((r) => (r.id === id ? { ...r, read: false } : r)) }));
    }
  },
}));

/** RP-03: the card shows the NEWEST UNREAD one, and the server has already
 * put it first (`getReplies` sorts unread-first, newest-first). Reading the
 * order rather than re-deriving it is the point — see the handler. */
export function newestUnread(replies: Reply[]): Reply | null {
  return replies.find((r) => !r.read) ?? null;
}
