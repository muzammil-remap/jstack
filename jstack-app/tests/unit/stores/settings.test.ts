/** stores/settings.ts — hydrateLocal()/setThemeMode()/setPrivacyBlur()
 * load() populates the server-held config records. The device-local slice
 * (theme mode, privacy blur) moved to `stores/device.ts` at S-5, and its
 * cases moved with it to `tests/unit/stores/device.test.ts`. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reset as resetDb } from "@/data/mock/db";
import { getAdapter } from "@/data/provider";
import { selectHiddenTabs, useSettingsStore } from "@/stores/settings";
import { useSessionStore } from "@/stores/session";

beforeEach(() => {
  resetDb();
  useSettingsStore.setState({
    notificationGroups: [],
    quietHours: null,
    autonomy: {},
    voice: null,
    focuses: [],
    activeFocus: "all",
    layouts: {},
    appLayout: null,
  });
});

describe("stores/settings.ts", () => {
  it("load() populates notification groups, quiet hours, autonomy, voice, focuses and capabilities", async () => {
    await useSettingsStore.getState().load();
    const s = useSettingsStore.getState();
    expect(s.notificationGroups.length).toBeGreaterThan(0);
    expect(s.quietHours).not.toBeNull();
    expect(Object.keys(s.autonomy).length).toBeGreaterThan(0);
    expect(s.voice).not.toBeNull();
    expect(s.focuses.length).toBeGreaterThan(0);
    expect(s.capabilities.calendarViews).toBe(true);
  });

  it("putLayout() rejects hiding a pinned section and leaves the store untouched", async () => {
    await useSettingsStore.getState().loadLayout("today");
    const before = useSettingsStore.getState().layouts.today;
    await expect(useSettingsStore.getState().putLayout("today", { hidden: ["needs"] })).rejects.toBeTruthy();
    expect(useSettingsStore.getState().layouts.today).toEqual(before);
  });
});

describe("exportAll (P-4, F-47)", () => {
  it("posts the export through the store and resolves", async () => {
    await expect(useSettingsStore.getState().exportAll()).resolves.toBeUndefined();
  });
});

describe("selectHiddenTabs (P-6, F-71)", () => {
  it("returns ONE reference while appLayout is still null, so the shell's selector cannot loop", () => {
    useSettingsStore.setState({ appLayout: null });
    const a = selectHiddenTabs(useSettingsStore.getState());
    const b = selectHiddenTabs(useSettingsStore.getState());
    expect(a).toEqual([]);
    expect(a).toBe(b);
  });

  it("and the saved list once there is one", () => {
    useSettingsStore.setState({ appLayout: { hiddenTabs: ["life"], showFocusRow: true } });
    expect(selectHiddenTabs(useSettingsStore.getState())).toEqual(["life"]);
  });
});

describe("a write sets its slice from the response (P-10, F-15)", () => {
  it("putQuietHours() keeps the saved record and asks for nothing else — no reload of the seven settings reads", async () => {
    await useSettingsStore.getState().load();
    const reads = ["getNotificationGroups", "getQuietHours", "getAutonomy", "getVoiceSettings", "getFocuses", "getAppLayout", "getCapabilities"] as const;
    const spies = reads.map((m) => jest.spyOn(getAdapter(), m));
    try {
      const next = { ...useSettingsStore.getState().quietHours!, start: "23:15" };
      await useSettingsStore.getState().putQuietHours(next);
      expect(useSettingsStore.getState().quietHours?.start).toBe("23:15");
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("putNotificationGroup() replaces the one group in place", async () => {
    await useSettingsStore.getState().load();
    const [first] = useSettingsStore.getState().notificationGroups;
    const spy = jest.spyOn(getAdapter(), "getNotificationGroups");
    try {
      await useSettingsStore.getState().putNotificationGroup(first.id, first.devices);
      expect(useSettingsStore.getState().notificationGroups.map((g) => g.id)).toContain(first.id);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * v2.3 B-5 · A4R6-11 (the A-4 audit, round 6). `load()` is all-or-nothing, and
 * a save composes over whatever it left: with the boot load failed, the store
 * holds the defaults — no focuses, no autonomy — and the audit's "Add a focus"
 * took the server from four focuses to one. On the mock no read can fail, so
 * the failure is made here, and the assertion is on what reached the server.
 */
describe("A4R6-11 · a failed settings load never lets a later save write defaults over the server", () => {
  it("the boot load rejects; a save then sends nothing, says so, and the server's records stand", async () => {
    const serverFocuses = (await getAdapter().getFocuses()).length;
    const serverAutonomy = await getAdapter().getAutonomy();
    expect(serverFocuses).toBeGreaterThan(1);
    useSettingsStore.setState({ loaded: false } as never); // the boot load has not succeeded
    const failing = jest.spyOn(getAdapter(), "getAppLayout").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(useSettingsStore.getState().load()).rejects.toThrow("Failed to fetch");
    failing.mockRestore();

    const sent = [jest.spyOn(getAdapter(), "putFocuses"), jest.spyOn(getAdapter(), "putAutonomy")];
    try {
      // what the dialogs compose, over the defaults the failed load left
      const { focuses, autonomy } = useSettingsStore.getState();
      await useSettingsStore.getState().putFocuses([...focuses, { id: "focus-r6", name: "Travel", filter: { silos: [] } } as never]);
      await useSettingsStore.getState().putAutonomy({ ...autonomy, email: "auto" } as never);
      for (const spy of sent) expect(spy).not.toHaveBeenCalled();
      expect((await getAdapter().getFocuses()).length).toBe(serverFocuses);
      expect(await getAdapter().getAutonomy()).toEqual(serverAutonomy);
      expect(useSessionStore.getState().toast?.message).toContain("needs a connection");
    } finally {
      for (const spy of sent) spy.mockRestore();
    }
  });
});

describe("the Settings cards read the store the way every other card does (P-10, F-65, F-67)", () => {
  const root = join(__dirname, "..", "..", "..");
  it("Schedules.tsx has no exhaustive-deps disable, and Sync.tsx subscribes through selectors", () => {
    const schedules = readFileSync(join(root, "components/settings/Schedules.tsx"), "utf8");
    expect(schedules).not.toMatch(/eslint-disable/);
    const sync = readFileSync(join(root, "components/settings/Sync.tsx"), "utf8");
    expect(sync).not.toMatch(/= useSyncStore\(\)/);
  });
});

/**
 * WPS-1 (v2.3.2) — the Needs you schedule is a field of quiet hours' record: `load()` reads it with quiet hours, and
 * it saves through quiet hours' own action and route — the whole record, the copy the server saved kept, nothing read
 * again — and a fresh load reads the same schedule back.
 */
describe("WPS-1 · the Needs you schedule persists through PUT /settings/quiet-hours and reloads", () => {
  const next = { windows: [{ start: "09:30", end: "10:30" }, { start: "15:00", end: "16:00" }], respectsQuietHours: false, paused: false };

  it("load() reads it with quiet hours, paused as the fixture ships it", async () => {
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().quietHours?.needsYou).toEqual({
      windows: [{ start: "08:00", end: "09:00" }, { start: "16:00", end: "17:00" }],
      respectsQuietHours: true,
      paused: true,
    });
  });

  it("putQuietHours() carries the schedule through the route, keeps the saved copy, reads nothing again, and a fresh load reads it back", async () => {
    await useSettingsStore.getState().load();
    const reads = ["getNotificationGroups", "getQuietHours", "getAutonomy", "getVoiceSettings", "getFocuses", "getAppLayout", "getCapabilities"] as const;
    const put = jest.spyOn(getAdapter(), "putQuietHours");
    const spies = reads.map((m) => jest.spyOn(getAdapter(), m));
    const record = { ...useSettingsStore.getState().quietHours!, needsYou: next };
    try {
      await expect(useSettingsStore.getState().putQuietHours(record)).resolves.toBe(true);
      expect(put).toHaveBeenCalledWith(record);
      expect(useSettingsStore.getState().quietHours?.needsYou).toEqual(next);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      put.mockRestore();
      for (const spy of spies) spy.mockRestore();
    }
    useSettingsStore.setState({ quietHours: null });
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().quietHours?.needsYou).toEqual(next);
  });
});
