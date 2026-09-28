/**
 * session.ts (ADR-04) — locked/emergency, online, clock offset, the
 * modal/sheet stack, the toast, and
 * the undo ledger. Everything here is either device-local runtime state
 * (nothing to load from the server) or fed by lib/autoLock.ts's real
 * timer and lib/keyboard.ts's real listeners — this store is the single
 * place they write to.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { motion } from "@/theme/tokens";
import { emergencyLock } from "@/lib/emergencyLock";
import { setLockSource } from "@/lib/lockGate";
import { stopActiveMic } from "@/lib/mic";
import { setClockOffsetSource } from "@/lib/time";
// C-1: a store cycle, read only via getState() inside an action — the shape taskCard.ts's own header already accepts with taskEdits.ts.
import { useTaskCardStore } from "@/stores/taskCard";
import type { Silo } from "@/data/labels";
import type { SessionUser } from "@/data/types";
import type { SecureStoreStatus } from "@/lib/encryptedStore";

type UndoEntry = {
  id: string;
  label: string;
  revert: () => Promise<void>;
  expiresAt: number;
};

type ModalName = string;
type SheetName = string;

type SessionState = {
  /** Who holds this session and which silos the SERVER says they may read (ID-01). Null until `loadSession()` answers; stored to RENDER with — the filtering is the server's, so a surface that forgets cannot leak. */
  user: SessionUser | null;
  silos: Silo[];
  /** the access token's life, as the server reported it (SEC-05) */
  tokenTtlSeconds: number;
  locked: boolean;
  /** SH-09: the SERVER revoked this device — the locked screen says so
   * rather than "unlock with your passkey", which would not work. */
  signedOut: boolean;
  emergency: boolean;
  online: boolean;
  /** WPI-2: whether this device can keep anything encrypted — "unavailable", with the reason, when boot found it cannot */
  secureStoreStatus: SecureStoreStatus;
  clockOffsetMs: number;
  // `keyboardInset` moved to stores/ui.ts at E-1, with the offsetTop it is
  // half of — one store owns the keyboard band. This one was at its cap.
  modal: ModalName | null;
  modalPayload: string | undefined;
  sheet: SheetName | null;
  sheetPayload: string | undefined;
  /** SettingsSheet's own slot, separate from `modal` (like taskCard.ts's `openTaskId`): Devices/FocusEditDialog/the emergency-lock confirm each open FROM WITHIN it via `modal`, and one shared string would close Settings the moment they did. `settingsSection` names a section to scroll to (AG-08's "schedules" hint). */
  settingsOpen: boolean;
  settingsSection: string | undefined;
  toast: { message: string; undoLabel?: string; secondsLeft?: number } | null;
  undo: { entries: UndoEntry[] };

  /** Reads `GET /session` and keeps who/what-they-may-see. Called after unlock, and again by the rig after it reseeds the session as somebody else. */
  isMine: (ownerId: string) => boolean;
  loadSession: () => Promise<void>;
  unlock: () => void;
  relock: () => void;
  setEmergency: (v: boolean) => void;
  /** AG-12: revokes every session/token server-side, then shows the
   * emergency locked screen. Caller supplies a fresh biometric assertion
   * (SEC-07). The round trip, and a server that cannot be reached, are
   * `lib/emergencyLock.ts`'s (WPF-4). */
  lock: (nonce: string, biometricAssertion: string) => Promise<void>;
  /** LK-05: passkey + recovery key + a fresh biometric assertion restores
   * the session; returns the agents resuming for the caller's toast. */
  recover: (recoveryKey: string, nonce: string, biometricAssertion: string) => Promise<{ agentsResuming: string[] }>;
  setOnline: (v: boolean) => void;
  setClockOffsetMs: (ms: number) => void;
  now: () => Date;
  openModal: (name: ModalName, payload?: string) => void;
  closeModal: () => void;
  openSheet: (name: SheetName, payload?: string) => void;
  closeSheet: () => void;
  openSettings: (section?: string) => void;
  closeSettings: () => void;
  closeAll: () => void;
  showToast: (message: string) => void;
  hideToast: () => void;
  /** Pushes an undo ledger entry for an undoable verb and shows the
   * matching toast with a countdown ring (motion.undoSeconds, 10). One
   * entry at a time (UN-04): a new undoable action replaces whatever was
   * there — the superseded entry's revert never fires. */
  pushUndo: (label: string, revert: () => Promise<void>) => void;
  /** Called by ToastHost's 1s tick — drops any entry past its window. */
  expireUndo: () => void;
  /** Fires the newest ledger entry's revert() and clears the toast. */
  undoLatest: () => Promise<void>;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  silos: [],
  tokenTtlSeconds: 900,
  locked: true,
  signedOut: false,
  emergency: false,
  online: true,
  secureStoreStatus: { status: "ok", reason: null },
  clockOffsetMs: 0,
  modal: null,
  modalPayload: undefined,
  sheet: null,
  sheetPayload: undefined,
  settingsOpen: false,
  settingsSection: undefined,
  toast: null,
  undo: { entries: [] },

  /** MU-03: a tag hard-coded to Josh's point of view says the wrong thing
   * the moment Joce is looking. */
  isMine: (ownerId: string) => get().user?.id === ownerId,
  loadSession: async () => {
    const session = await getAdapter().getSession();
    set({ user: session.user, silos: session.silos, tokenTtlSeconds: session.tokenTtlSeconds });
  },
  unlock: () => {
    set({ locked: false });
    // ID-01: asked for the moment the gate opens, fire-and-forget — a slow
    // reply must not hold the unlock, and an unreachable one leaves `user`
    // null, which every identity-dependent surface already renders for.
    void get().loadSession().catch(() => {});
  },
  /**
   * MC-07, security-class. A lock — the inactivity timer, the emergency hold,
   * a server's sign-out or refresh reuse — is an EXIT PATH for the microphone, and Josh
   * was explicit: "this must never happen." A locked screen with a live mic
   * behind it is the worst version of the bug ADR-49 exists to close, so the
   * release happens here rather than being left to whoever called relock.
   */
  relock: () => {
    stopActiveMic();
    set({ locked: true });
  },
  setEmergency: (emergency) => set({ emergency }),
  lock: (nonce, biometricAssertion) => emergencyLock(nonce, biometricAssertion, (auth) => getAdapter().postLock(auth)),
  recover: async (recoveryKey, nonce, biometricAssertion) => {
    const { agentsResuming } = await getAdapter().postRecover({ recoveryKey, nonce, biometricAssertion });
    set({ locked: false, emergency: false });
    return { agentsResuming };
  },
  setOnline: (online) => set({ online }),
  setClockOffsetMs: (clockOffsetMs) => set({ clockOffsetMs }),
  now: () => new Date(Date.now() + get().clockOffsetMs),

  openModal: (modal, modalPayload) => set({ modal, modalPayload }),
  closeModal: () => set({ modal: null, modalPayload: undefined }),
  openSheet: (sheet, sheetPayload) => set({ sheet, sheetPayload }),
  closeSheet: () => set({ sheet: null, sheetPayload: undefined }),
  openSettings: (settingsSection) => set({ settingsOpen: true, settingsSection }),
  closeSettings: () => set({ settingsOpen: false, settingsSection: undefined }),
  // C-1: the task card's open state lives in its own store — reach it via its own close action.
  closeAll: () => {
    set({ modal: null, modalPayload: undefined, sheet: null, sheetPayload: undefined, settingsOpen: false, settingsSection: undefined });
    useTaskCardStore.getState().openTask(null);
  },

  showToast: (message) => set({ toast: { message } }),
  hideToast: () => set({ toast: null }),

  pushUndo: (label, revert) => {
    const expiresAt = get().now().getTime() + motion.undoSeconds * 1000;
    const entry: UndoEntry = { id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label, revert, expiresAt };
    set({ undo: { entries: [entry] }, toast: { message: label, undoLabel: "Undo", secondsLeft: motion.undoSeconds } });
  },
  expireUndo: () => {
    const now = get().now().getTime();
    set((s) => {
      const entries = s.undo.entries.filter((e) => e.expiresAt > now);
      const stillHasNewest = entries.length === s.undo.entries.length;
      return { undo: { entries }, toast: stillHasNewest ? s.toast : null };
    });
  },
  undoLatest: async () => {
    const latest = get().undo.entries.at(-1);
    if (!latest) return;
    const toast = get().toast;
    // A4R7-12: spent BEFORE it runs, so a second press in flight finds nothing; a
    // revert that FAILS is still owed and goes back, with its toast, inside its window
    set((s) => ({ undo: { entries: s.undo.entries.filter((e) => e.id !== latest.id) }, toast: null }));
    try { await latest.revert(); } catch (e) {
      if (latest.expiresAt > get().now().getTime() && get().undo.entries.length === 0) set({ undo: { entries: [latest] }, toast }); // A4R9-05: never over a newer undo
      throw e;
    }
  },
}));

// S-5: `lib/time.ts` is deliberately free of app imports (this store reaches the
// provider, which reaches the mock db, which needs the time helpers — a ring),
// so it takes its clock offset from here, registered once at module load.
setClockOffsetSource(() => useSessionStore.getState().clockOffsetMs);
// CD-14: the adapter asks this before letting any write leave (lib/lockGate.ts).
setLockSource(() => useSessionStore.getState().locked);
