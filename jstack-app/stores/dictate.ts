/**
 * dictate.ts (W-1) — the Dictate thread, the conversation `DictateDialog`
 * holds with the EA.
 *
 * Split out of `stores/brain.ts`, which reached its 200-line cap when W-1
 * taught the capture field to remember that its draft came from a share. A
 * real seam rather than a place to put lines: Brain's store is about CAPTURES
 * — what came in, where it was filed, what the Librarian proposed — and this
 * is a two-way conversation with one dialog, with one consumer.
 *
 * TS-04's rule is why it is SERVER state and not local: the thread lives on
 * the server so the dialog re-hydrates it on open. Before that it lived only
 * in this store, so closing the modal kept the conversation and a reload lost
 * it — and nothing else could ever see it.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";

type ChatMessage = { from: "josh" | "ea"; text: string; sources?: string[] };

type DictateState = {
  chat: ChatMessage[];
  loadChatThread: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
};

export const useDictateStore = create<DictateState>((set) => ({
  chat: [],

  loadChatThread: async () => {
    const thread = await getAdapter().getChatThread().catch(() => null); // unreadable: the thread stays as it was
    if (thread != null) set({ chat: thread.turns });
  },

  sendChat: async (text) => {
    if (text.trim() === "") return;
    // Josh's turn goes up immediately and the EA's follows: a dictated line
    // that only appeared once the answer came back would leave a person
    // wondering whether the app heard them.
    const turn = { from: "josh" as const, text };
    set((s) => ({ chat: [...s.chat, turn] }));
    let answered;
    try {
      answered = await getAdapter().postChat(text);
    } catch (e) {
      // not heard: the line comes off the thread, and the dialog gives the words back (`DictateDialog`)
      set((s) => ({ chat: s.chat.filter((t) => t !== turn) }));
      throw e;
    }
    const { reply, sources } = answered;
    set((s) => ({ chat: [...s.chat, { from: "ea", text: reply, sources }] }));
  },
}));
