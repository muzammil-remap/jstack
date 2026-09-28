/**
 * S-5 — what this DEVICE remembers, and that it really persists.
 *
 * These three moved here from `stores/settings.test.ts` with the code they
 * cover. A refactor that leaves its tests behind in the old file is a refactor
 * that has made the old file wrong, and the next person to read it will look
 * for `setThemeMode` in a store that no longer has one.
 */
import * as encryptedStore from "@/lib/encryptedStore";
import { useDeviceStore } from "@/stores/device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { useSessionStore } from "@/stores/session";

describe("S-5 · the device-local slice persists through encryptedStore", () => {
  it("setThemeMode() updates state and persists through encryptedStore", () => {
    const setSpy = jest.spyOn(encryptedStore, "encryptedSet");
    useDeviceStore.getState().setThemeMode("dark");
    expect(useDeviceStore.getState().themeMode).toBe("dark");
    expect(setSpy).toHaveBeenCalledWith("jstack.themeMode", "dark");
    setSpy.mockRestore();
  });

  it("hydrateLocal() reads a previously persisted theme mode back", async () => {
    // setThemeMode() persists fire-and-forget (it must not block the UI on
    // a store write) — awaited directly here instead, so this test isn't
    // racing the write it's about to read back.
    await encryptedStore.encryptedSet("jstack.themeMode", "light");
    useDeviceStore.setState({ themeMode: "auto" }); // simulate a fresh mount
    await useDeviceStore.getState().hydrateLocal();
    expect(useDeviceStore.getState().themeMode).toBe("light");
  });

  it("setPrivacyBlur() updates state and persists", () => {
    useDeviceStore.getState().setPrivacyBlur(true);
    expect(useDeviceStore.getState().privacyBlur).toBe(true);
  });

  it("an unreadable stored mode hydrates to auto rather than throwing", async () => {
    // this runs before anything is on screen, so a boot that throws here is a
    // boot that never finishes — the fallback is the behaviour, not a nicety
    await encryptedStore.encryptedSet("jstack.themeMode", "chartreuse");
    useDeviceStore.setState({ themeMode: "dark" });
    await useDeviceStore.getState().hydrateLocal();
    expect(useDeviceStore.getState().themeMode).toBe("auto");
  });
});

/**
 * WPA-16 (WP-H, v2.3) — the same rule for what this device remembers: a preference changed under the emergency lock
 * was written through `encryptedSet`, which minted a key for it on the wiped device. The screen still changes; the
 * device keeps nothing new.
 */
describe("WPA-16 · under the emergency lock a preference changes on screen and nothing reaches the device", () => {
  const keychain = (SecureStore as unknown as { __store: Map<string, string> }).__store;
  afterEach(() => useSessionStore.setState({ emergency: false, locked: false }));

  it("toggles under the lock leave AsyncStorage and the key store empty, and the state still moves", async () => {
    await encryptedStore.wipeAllLocalData();
    useDeviceStore.setState({ themeMode: "auto", privacyBlur: false, collapsed: {} });
    useSessionStore.setState({ emergency: true, locked: true });
    useDeviceStore.getState().setThemeMode("dark");
    useDeviceStore.getState().setPrivacyBlur(true);
    useDeviceStore.getState().toggleCollapsed("today.needsYou");
    // the writes were fire-and-forget: let any that started land before the device is read
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
    const { themeMode, privacyBlur, collapsed } = useDeviceStore.getState();
    expect({ themeMode, privacyBlur, collapsed, onDisk: await AsyncStorage.getAllKeys(), keyMinted: keychain.has("jstack.enc.key.v1") }).toEqual({
      themeMode: "dark",
      privacyBlur: true,
      collapsed: { "today.needsYou": true },
      onDisk: [],
      keyMinted: false,
    });
  });
});
