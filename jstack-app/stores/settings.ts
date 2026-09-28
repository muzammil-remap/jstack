/**
 * settings.ts (ADR-04) — notification groups × devices, quiet hours, autonomy,
 * voice, focuses + the active one, layout per tab, capabilities. Every one of
 * them is a config record loaded from the adapter and shared by every device.
 *
 * What this device remembers for itself — theme mode, privacy blur, and from
 * H-1 the collapsed sections — is `stores/device.ts` (S-5). The two used to
 * live together, and the difference is not cosmetic: one is what the account
 * is set to, the other is how this screen should look on this phone.
 */
import { create } from "zustand";
import { ContractError } from "@/data/ApiAdapter";
import { getAdapter } from "@/data/provider";
import { localCapabilitiesFallback } from "@/data/capabilities";
import { useSectionsStore } from "@/stores/sections";
import { useSessionStore } from "@/stores/session";
import type {
  AppLayout,
  AutonomyRule, AutonomySettings,
  Capabilities,
  Device,
  Focus,
  Layout,
  NotificationGroup,
  QuietHours,
  VoiceSettings,
} from "@/data/types";

type SettingsState = {
  notificationGroups: NotificationGroup[];
  quietHours: QuietHours | null;
  autonomy: AutonomySettings;
  voice: VoiceSettings | null;
  focuses: Focus[];
  activeFocus: string;
  layouts: Record<string, Layout>;
  appLayout: AppLayout | null;
  capabilities: Capabilities;
  devices: Device[];

  setActiveFocus: (id: string) => void;

  /** A4R6-11: a load has succeeded, so what is in memory is the server's and not the defaults */
  loaded: boolean;
  load: () => Promise<void>;
  /** the saves that send a whole record composed over what `load()` brought: `false` when refused (A4R6-11) */
  putNotificationGroup: (id: string, devices: NotificationGroup["devices"]) => Promise<boolean>;
  putQuietHours: (q: QuietHours) => Promise<boolean>;
  putAutonomy: (settings: AutonomySettings) => Promise<boolean>;
  putVoice: (settings: VoiceSettings) => Promise<boolean>;
  putFocuses: (focuses: Focus[]) => Promise<boolean>;
  loadLayout: (tab: string) => Promise<void>;
  putLayout: (tab: string, layout: Partial<Layout>) => Promise<void>;
  revertLayout: (tab: string) => Promise<void>;
  putAppLayout: (layout: Partial<AppLayout>) => Promise<void>;
  /** AR-06 test rig (`__JSTACK__.eaLayout`) — a real Josh action never
   * calls this; the EA proposes through its own channel. */
  postLayoutEa: (tab: string, sections: { order: string[]; hidden: string[] }, reason: string) => Promise<void>;
  loadDevices: () => Promise<void>;
  /** SE-08: high-risk (SEC-07) — caller supplies a fresh biometric assertion. */
  revokeDevice: (id: string, nonce: string, biometricAssertion: string) => Promise<void>;
  /** SE-08: the account export (P-4, F-47) — the toast is the caller's */
  exportAll: () => Promise<void>;
};

/** The hidden tabs as ONE stable reference while `appLayout` is still null
 * (before `load()` resolves): a `?? []` inside a selector would mint a new
 * array every call and trip `useSyncExternalStore` into an infinite
 * re-render loop (zustand v5). The store owns that rule, so the shell's
 * selector is this one line (F-71, P-6). */
const NO_HIDDEN_TABS: string[] = [];
export const selectHiddenTabs = (s: SettingsState): string[] => s.appLayout?.hiddenTabs ?? NO_HIDDEN_TABS;

/**
 * A4R6-11: those saves compose over what `load()` brought, and after a failed
 * boot load that is the defaults — the audit's "Add a focus" took the server
 * from four focuses to one. Refused until a load has succeeded, in the words
 * the verbs use offline, and the load is tried again for the next press.
 */
function refusedUnloaded(get: () => SettingsState): boolean {
  if (get().loaded) return false;
  useSessionStore.getState().showToast("Settings haven't loaded · needs a connection");
  void get().load().catch(() => undefined);
  return true;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  notificationGroups: [],
  quietHours: null,
  autonomy: {},
  voice: null,
  focuses: [],
  activeFocus: "all",
  layouts: {},
  appLayout: null,
  capabilities: localCapabilitiesFallback(),
  devices: [],
  loaded: false,

  setActiveFocus: (activeFocus) => set({ activeFocus }),

  load: async () => {
    const adapter = getAdapter();
    const [notificationGroups, quietHours, autonomy, voice, focuses, appLayout, capabilities] = await Promise.all([
      adapter.getNotificationGroups(),
      adapter.getQuietHours(),
      adapter.getAutonomy(),
      adapter.getVoiceSettings(),
      adapter.getFocuses(),
      adapter.getAppLayout(),
      adapter.getCapabilities().catch(() => localCapabilitiesFallback()),
    ]);
    set({ notificationGroups, quietHours, autonomy, voice, focuses, appLayout, capabilities, loaded: true });
    // §4.10 lives in its own store (stores/sections.ts) but loads with the
    // rest of the app's shape, so a tab never renders before its configured
    // sections have had a chance to arrive.
    await useSectionsStore.getState().load();
  },

  // F-15 (P-10): every write below sets ITS slice from the saved record the
  // handler returns, the way putLayout and putAppLayout already did. Each
  // used to call load() — seven GETs plus the sections — after one toggle,
  // which the mock made invisible and REMAP's HTTP would not.
  putNotificationGroup: async (id, devices) => {
    if (refusedUnloaded(get)) return false;
    try {
      const saved = await getAdapter().putNotificationGroup(id, devices);
      set((s) => ({ notificationGroups: s.notificationGroups.map((g) => (g.id === id ? saved : g)) }));
      return true;
    } catch (e) {
      if (e instanceof ContractError && e.status === 423) {
        useSessionStore.getState().showToast("Security notifications are always on · by design");
        return false;
      }
      throw e;
    }
  },
  putQuietHours: async (q) => {
    if (refusedUnloaded(get)) return false;
    set({ quietHours: await getAdapter().putQuietHours(q) });
    return true;
  },
  putAutonomy: async (settings) => {
    if (refusedUnloaded(get)) return false;
    set({ autonomy: await getAdapter().putAutonomy(settings) });
    return true;
  },
  putVoice: async (settings) => {
    if (refusedUnloaded(get)) return false;
    set({ voice: await getAdapter().putVoiceSettings(settings) });
    return true;
  },
  putFocuses: async (focuses) => {
    if (refusedUnloaded(get)) return false;
    set({ focuses: await getAdapter().putFocuses(focuses) });
    return true;
  },
  loadLayout: async (tab) => {
    const layout = await getAdapter().getLayout(tab);
    set((s) => ({ layouts: { ...s.layouts, [tab]: layout } }));
  },
  putLayout: async (tab, layout) => {
    const next = await getAdapter().putLayout(tab, layout);
    set((s) => ({ layouts: { ...s.layouts, [tab]: next } }));
  },
  revertLayout: async (tab) => {
    const next = await getAdapter().revertLayout(tab);
    set((s) => ({ layouts: { ...s.layouts, [tab]: next } }));
  },
  putAppLayout: async (layout) => {
    const next = await getAdapter().putAppLayout(layout);
    set({ appLayout: next });
  },
  postLayoutEa: async (tab, sections, reason) => {
    const next = await getAdapter().postLayoutEa(tab, sections, reason);
    set((s) => ({ layouts: { ...s.layouts, [tab]: next } }));
  },
  loadDevices: async () => {
    const { devices } = await getAdapter().getSession();
    set({ devices });
  },
  revokeDevice: async (id, nonce, biometricAssertion) => {
    // PU-05: a revoked device that keeps receiving notifications is a revoked
    // device in name only — so ITS subscription goes, by id, through §4.13's
    // DELETE. This used to call `unsubscribePush()`, which drops THIS
    // browser's subscription: revoking the iPad silenced the phone and left
    // the iPad's endpoint on file (R-07). Before the revoke, because after it
    // the server may refuse anything about that device.
    await getAdapter().deletePushSubscription(id).catch(() => undefined);
    await getAdapter().revokeDevice(id, { nonce, biometricAssertion });
    await get().loadDevices();
  },
  exportAll: async () => {
    await getAdapter().postExport();
  },
}));
