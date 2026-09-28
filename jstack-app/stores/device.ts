/**
 * device.ts (S-5, ADR-16) — what this DEVICE remembers, as opposed to what the
 * account is set to.
 *
 * Theme mode and privacy blur were in `stores/settings.ts` beside notification
 * groups, quiet hours and focuses, and the difference between them is not
 * cosmetic: everything else in that store is a config record the server owns
 * and every device shares, while these two are answers to "how should this
 * screen look, on this phone, for whoever is holding it". They persist through
 * `lib/encryptedStore.ts` directly and never touch the adapter.
 *
 * Splitting them out is what makes room for the rest of the device's memory:
 * H-1's collapsed sections land here, and so does anything later that is true
 * of a device rather than of the account. The alternative was `settings.ts`
 * growing past its 200-line cap holding two unrelated kinds of state.
 *
 * Encrypted rather than plain storage even though none of it is a secret: the
 * store is already there, it costs nothing, and a device-local store is
 * exactly where a secret would eventually be put by somebody who did not check.
 */
import { create } from "zustand";
import { encryptedGet, encryptedSet, secureStoreStatus } from "@/lib/encryptedStore";
import { useSessionStore } from "@/stores/session";

export type ThemeMode = "auto" | "light" | "dark";

const THEME_MODE_KEY = "jstack.themeMode";
const PRIVACY_KEY = "jstack.privacyBlur";
const COLLAPSED_KEY = "jstack.collapsed";

/**
 * Which sections this device has collapsed (H-1, CL-03).
 *
 * COLLAPSED ONLY — `{ [sectionId]: true }`, and an absent id means open. The
 * alternative, a map of every section to a boolean, would have to be migrated
 * every time a section is added or renamed, and a section nobody has ever
 * touched would carry a stored opinion about itself. Everything starts open
 * (CL-01), so the empty object is the correct first run.
 *
 * Separate from Arrange's hidden sections, which are an account-level layout
 * decision: hidden stays hidden on every device, collapsed is this screen on
 * this phone, and CL-03 asserts one does not move the other.
 */
/** Not exported: CT-06 refuses an export nothing imports, and nothing outside
 *  this store needs the name — callers read `collapsed[id] === true`. */
type Collapsed = Record<string, true>;

type DeviceState = {
  themeMode: ThemeMode;
  privacyBlur: boolean;
  collapsed: Collapsed;

  /** read what this device remembers, once, at boot */
  hydrateLocal: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => void;
  setPrivacyBlur: (v: boolean) => void;
  toggleCollapsed: (sectionId: string) => void;
};

/**
 * Read the stored map back, keeping only `true` entries under string keys.
 *
 * Anything else — a corrupted write, an older shape, a hand-edited store — is
 * dropped rather than trusted, and the section opens. An unreadable memory of
 * what was collapsed should cost a person one tap, never a blank tab.
 */
function parseCollapsed(raw: string | null): Collapsed {
  if (raw == null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Collapsed = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true) out[id] = true;
    }
    return out;
  } catch {
    return {};
  }
}

/** WPA-16: what this device remembers is written only while it may keep anything — under the emergency lock the
 * screen still changes and nothing reaches the device (A-13's rule); a write already under way is refused by the wipe count */
function remember(key: string, value: string): void {
  if (useSessionStore.getState().emergency || secureStoreStatus().status !== "ok") return; // WPI-2: nor where the store cannot seal
  void encryptedSet(key, value);
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  themeMode: "auto",
  privacyBlur: false,
  collapsed: {},

  hydrateLocal: async () => {
    const [mode, blur, collapsed] = await Promise.all([encryptedGet(THEME_MODE_KEY), encryptedGet(PRIVACY_KEY), encryptedGet(COLLAPSED_KEY)]);
    set({
      // an unreadable or absent value is "auto", never a crash: this runs
      // before anything is on screen, and a boot that throws here is a boot
      themeMode: mode === "light" || mode === "dark" || mode === "auto" ? mode : "auto",
      privacyBlur: blur === "1",
      collapsed: parseCollapsed(collapsed),
    });
  },

  toggleCollapsed: (sectionId) => {
    const next = { ...get().collapsed };
    if (next[sectionId]) delete next[sectionId];
    else next[sectionId] = true;
    set({ collapsed: next });
    remember(COLLAPSED_KEY, JSON.stringify(next));
  },

  setThemeMode: (themeMode) => {
    set({ themeMode });
    remember(THEME_MODE_KEY, themeMode);
  },

  setPrivacyBlur: (privacyBlur) => {
    set({ privacyBlur });
    remember(PRIVACY_KEY, privacyBlur ? "1" : "0");
  },
}));
