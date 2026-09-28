/**
 * brain.ts (ADR-04) — the dump draft, latest-in, memory proposals, hit
 * rate, rules and the Find answer. The Dictate thread is `stores/dictate.ts`
 * (W-1): a two-way conversation with one dialog is a different subject from
 * what came in and where it was filed.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { recordLoad } from "@/lib/loadError";
import { offlineCopy, rememberLastSeen } from "@/lib/lastSeen";
import { keptShare, shareKey } from "@/lib/shareDraft";
import { isQueued } from "@/data/transport/outbox";
import { useDictation } from "@/stores/mic";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import type { BrainItem, BrainItemVersion, FindAnswer, FindResult, MemoryHitRate, MemoryProposal, Rule } from "@/data/types";


type BrainState = {
  dumpDraft: string;
  /**
   * W-1: the draft in the field came from a SHARE, and this is what it brought
   * with it.
   *
   * A share almost always arrives at a LOCKED app — that is what opening JSTACK
   * by a URL means — so the capture route's own send is refused by the gate and
   * the words wait in the field for one tap. Without this the tap would file
   * them as `typed`: the provenance would be gone, and with it the extraction
   * and the triage card, because those hang off `source: "share"` and the URL.
   * Cleared when the capture lands, so the next thing typed is typed — and
   * when the field stops holding the share's own words (A4R11-03): deleting
   * them is how a person discards a share, and the link, the extraction and
   * the triage card followed whatever they typed next. `text` is what the
   * route put in the field, so an ANNOTATED share still files as that share.
   */
  shareDraft: { url?: string; text?: string } | null;
  setShareDraft: (share: { url?: string; text?: string } | null) => void;
  /** MC-04: the draft is an INTERIM transcript — heard, not settled. Field
   * renders it muted; the final replaces it and clears this. */
  dumpInterim: boolean;
  latestIn: BrainItem[];
  proposals: MemoryProposal[];
  hitRate: MemoryHitRate | null;
  findQuery: string;
  findAnswer: FindAnswer | null;
  findResults: FindResult[];
  editingItemId: string | null;
  itemVersions: BrainItemVersion[];
  loadError: string | null; // A-2: why the last load failed, or null (lib/loadError.ts)
  staleAt: string | null; // A-3: when the offline copy on screen was saved, or null (lib/lastSeen.ts)

  load: (focus?: string, opts?: { since?: string }) => Promise<void>;
  setDumpDraft: (text: string) => void;
  setDumpInterim: (text: string) => void;
  /** `textOverride` is the voice path (a live transcript never lived in
   * `dumpDraft`) — BR-01's toast is for typed, VO-02's for voice. */
  /** `attachmentIds` (X-1, UP-02): files already uploaded, referenced by the
   * capture. The upload is its own request so a queued capture and its file
   * replay in order rather than as one body the outbox cannot inspect. */
  dump: (source: "voice" | "typed" | "share", textOverride?: string, offlineId?: string, attachmentIds?: string[], url?: string) => Promise<void>;
  find: (q: string) => Promise<void>;
  /** TS-04: re-hydrate the Dictate thread from the server on open. The thread
   * used to live only in this store, so closing the modal kept it and a reload
   * lost it — and nothing else could ever see it. */
  resolveProposal: (id: string, verb: "ok" | "edit", text?: string) => Promise<void>;
  openItemEditor: (id: string | null) => Promise<void>;
  saveItemEdit: (id: string, text: string) => Promise<void>;
};

export const useBrainStore = create<BrainState>((set, get) => ({
  dumpDraft: "",
  shareDraft: null,
  dumpInterim: false,
  latestIn: [],
  proposals: [],
  hitRate: null,
  findQuery: "",
  findAnswer: null,
  findResults: [],
  editingItemId: null,
  itemVersions: [],
  loadError: null,
  staleAt: null,

  load: (focus, opts) => recordLoad(set, async () => {
    const adapter = getAdapter();
    const [latestIn, proposals, hitRate] = await Promise.all([
      adapter.getBrainLatest(focus, opts?.since),
      adapter.getMemoryProposals(focus),
      adapter.getMemoryHitRate(),
    ]);
    set({ latestIn, proposals, hitRate, staleAt: null });
    void rememberLastSeen("brain", focus ?? "", latestIn);
  }, async () => {
    const copy = await offlineCopy<BrainItem[]>("brain", focus ?? "");
    if (copy != null) set({ latestIn: copy.payload, staleAt: copy.savedAt });
  }),

  setDumpDraft: (dumpDraft) => set({ dumpDraft, dumpInterim: false, shareDraft: keptShare(get().shareDraft, dumpDraft) }),
  setDumpInterim: (text) => set({ dumpDraft: text, dumpInterim: true }),
  setShareDraft: (share) => set({ shareDraft: share }),

  dump: async (source, textOverride, offlineId, attachmentIds, url) => {
    const text = textOverride ?? get().dumpDraft;
    if (text.trim() === "") {
      useSessionStore.getState().showToast("Type or dictate first");
      return;
    }
    // OF-05: clear the draft BEFORE the await, not after it.
    //
    // The field belongs to the send that took it. Clearing after the POST
    // resolved meant a keystroke typed while the request was open was wiped
    // by the previous send's clear — and because `Entry.tsx` disables
    // `dump-send` on an empty draft, the button then sat disabled with
    // nothing left to re-enable it. Seen once in 684 e2e cases, green 18 of
    // 18 in isolation, so it read as a flake for two stages; it is a race.
    // Same family as CL-03 and B-22.
    //
    // The words are given back if the POST throws, which is the only thing
    // the late clear was buying. A QUEUED result is not a throw — it is a
    // successful capture (O-2) — so it keeps the clear.
    if (textOverride == null) set({ dumpDraft: "", shareDraft: null });
    let result;
    try {
      // A-8 (R11-REMAP-1): a share's key is read off the share, so the same share filed twice is one capture — not with files, whose retry must not be swallowed
      const key = offlineId ?? (source === "share" && attachmentIds == null ? shareKey(text, url) : undefined);
      result = await getAdapter().postBrainDump({ text, source, offlineId: key, attachmentIds, url });
    } catch (e) {
      // only if nothing has been typed since: a restore that overwrites a
      // newer draft would be the same bug pointing the other way
      if (textOverride == null && get().dumpDraft === "") set({ dumpDraft: text });
      throw e;
    }

    // Offline the capture is QUEUED, not filed: the response carries
    // { queued, offlineId } and no record at all, so reading `result.item`
    // off it throws (O-2). The row still appears — `stores/sync.ts` renders
    // the queue itself — and the words say what actually happened.
    if (isQueued(result)) {
      await useSyncStore.getState().refresh();
      useSessionStore.getState().showToast("Saved here · syncs when you're back online");
      return;
    }

    await get().load();
    useSessionStore.getState().showToast(source === "typed" ? "In. Filing itself · check Latest in" : `Filed to Brain · ${result.item.routed.join(" · ")}`);
  },

  find: async (q) => {
    set({ findQuery: q });
    if (q.trim() === "") {
      set({ findAnswer: null, findResults: [] });
      return;
    }
    const { answer, results } = await getAdapter().getBrainSearch(q);
    set({ findAnswer: answer, findResults: results });
  },

  resolveProposal: async (id, verb, text) => {
    await getAdapter().postMemoryProposal(id, verb, text);
    if (verb === "ok") { // WPF-7: the Undo first; the reload after it may fail without taking it away
      useSessionStore.getState().pushUndo("Accepted · versioned, nothing overwritten", async () => {
        await getAdapter().undoMemoryProposal(id);
        await get().load();
      });
    } else {
      useSessionStore.getState().showToast("Saved · the Librarian learns from the correction");
    }
    await get().load();
  },

  openItemEditor: async (id) => {
    set({ editingItemId: id, itemVersions: [] });
    if (id != null) {
      const itemVersions = await getAdapter().getBrainItemVersions(id);
      set({ itemVersions });
    }
  },
  saveItemEdit: async (id, text) => {
    await getAdapter().putBrainItem(id, { text });
    await get().load();
    set({ editingItemId: null });
  },
}));

/**
 * MC-02 / MC-04 — dictating into Brain, declared once. TWO controls start it:
 * the mic button inside the dump field and the floating orb, one session
 * writing one draft (hard rule 16). `setDumpInterim` renders muted, the final
 * replaces it, and nothing is filed until send.
 */
export function useBrainDictation(): ReturnType<typeof useDictation> {
  const setDumpDraft = useBrainStore((s) => s.setDumpDraft);
  const setDumpInterim = useBrainStore((s) => s.setDumpInterim);
  return useDictation({ purpose: "brain", onInterim: setDumpInterim, onFinal: setDumpDraft });
}
