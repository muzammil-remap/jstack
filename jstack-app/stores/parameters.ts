/**
 * parameters.ts (L-1, ADR-41) — the six tunables, as the server holds them.
 *
 * Its own store rather than a slice of `stores/settings.ts` (defaults table
 * #54). Two reasons, and the second is the real one: `settings.ts` is a
 * config record Josh edits in one dialog, while these are read by code that
 * runs nowhere near a dialog — `lib/autoLock.ts` arms a timer at boot, the
 * task filters compose a chip label, the microphone closes itself. A store
 * everything reads should not be a store one screen owns.
 *
 * The table's defaults are the floor: `parameterValue()` answers with the
 * documented default until the server has been heard from, because a lock
 * timeout that reads `undefined` for the first half-second of a session is an
 * app that never locks.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { ContractError } from "@/data/ApiAdapter";
import { isQueued } from "@/data/transport/outbox";
import { defaultParameters, parameterValue } from "@/data/parameters";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import type { Parameter, ParameterKey } from "@/data/types";

type ParametersState = {
  parameters: Parameter[];
  /**
   * The server's last refusal, and which control caused it (LK-03). Held in
   * the store rather than thrown at the caller because the honest line
   * belongs under the control that was wrong, and the control is re-rendered
   * from here anyway.
   */
  invalid: { key: string; reason: string } | null;
  /**
   * A4R8-02: values the outbox holds for the server and nobody has judged yet.
   * Shown beside the control and never enforced: `currentParameter` reads the
   * record, which stays the server's until the replay's reload brings the new one.
   */
  pending: Partial<Record<ParameterKey, number | boolean>>;
  load: () => Promise<void>;
  /** true when the value was taken; false leaves `invalid` set for the control */
  setParameter: (key: ParameterKey, value: number | boolean) => Promise<boolean>;
  clearInvalid: () => void;
};

export const useParametersStore = create<ParametersState>((set, get) => ({
  // seeded from the table, not empty: everything that reads a parameter reads
  // it before the first request has come back
  parameters: defaultParameters(),
  invalid: null,
  pending: {},

  load: async () => {
    const parameters = await getAdapter()
      .getParameters()
      .catch(() => null);
    // a failed read keeps the documented defaults rather than emptying the
    // registry — an empty list would silently turn every range into "anything".
    // A read that lands is the server's answer to anything pending (A4R8-02):
    // applied by the replay this reload follows, or refused by it.
    if (parameters != null) set({ parameters, pending: {} });
  },

  setParameter: async (key, value) => {
    // A4R7-02: offline nobody else will judge the value before the device adopts
    // it, and 0 minutes locked the app on every tap while 9999 switched the
    // auto-lock off — so the record's own range is checked here first. Online
    // the server is the judge and answers its own 422 (LK-03).
    const record = get().parameters.find((p) => p.key === key);
    const outside = record != null && typeof value === "number" && record.min != null && record.max != null && (!Number.isInteger(value) || value < record.min || value > record.max);
    if (!useSessionStore.getState().online && record != null && outside) {
      set({ invalid: { key, reason: `${record.label} must be between ${record.min} and ${record.max} ${record.unit}` } });
      return false;
    }
    try {
      const saved = await getAdapter().putParameter(key, value);
      // A4R6-05: `PUT /parameters/{key}` is a capture. Offline it answers the
      // outbox's receipt, and storing that in place of the record erased the
      // lock's parameter on the device — Settings crashed and the auto-lock ran
      // on the default while the server was sent the value the person chose.
      // Queued, the record stays whole.
      //
      // A4R8-02: and queued is not accepted. Nobody has judged the value — a
      // send that fails at the network layer is queued while the app believes
      // it is online, so the range check above never ran — and adopting it here
      // let 0 lock the app at every tap and 9999 switch the auto-lock off until
      // the next replay. The device keeps enforcing the server's value; the new
      // one is pending, and the reload that follows its replay adopts it.
      if (isQueued(saved)) {
        set({ pending: { ...get().pending, [key]: value }, invalid: null });
        await useSyncStore.getState().refresh();
        return true;
      }
      set({ parameters: get().parameters.map((p) => (p.key === key ? saved : p)), invalid: null });
      return true;
    } catch (e) {
      const reason = e instanceof ContractError && e.reason != null ? e.reason : "that could not be saved";
      set({ invalid: { key, reason } });
      return false;
    }
  },

  clearInvalid: () => set({ invalid: null }),
}));

/** The read every consumer wants: this device's current value for one key,
 *  falling back to the table's default. Not a hook — `lib/autoLock.ts` reads
 *  it from a timer callback, outside React entirely. */
export function currentParameter(key: ParameterKey): number | boolean {
  return parameterValue(useParametersStore.getState().parameters, key);
}
