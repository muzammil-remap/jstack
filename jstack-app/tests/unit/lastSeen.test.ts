/**
 * A-3 (WP-A, v2.3) — the last copy of the three tabs Josh plans from, on this
 * device, for when a load fails with no connection.
 *
 * The owner's words: "I don't want to cache the whole database. But at least
 * capture thoughts and new notes and plan tasks". Planning offline needs
 * something to plan FROM, so Today, the Tasks list for the filter on screen
 * and Brain's recent items are kept — encrypted, sensitive items with the rest
 * (WPI-1), replaced by each successful load, and shown only when a load
 * fails offline, under a line that says how old they are. Nothing else is
 * kept, and the emergency wipe takes all of it.
 *
 * The keys are spelled as literals, as `recentFiles.test.ts` spells its own:
 * renaming one orphans the copy on every device that already has one, which
 * is a change a test should notice rather than follow.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { reset as resetDb } from "@/data/mock/db";
import { getAdapter } from "@/data/provider";
import { encryptedGet, encryptedSet, wipeAllLocalData } from "@/lib/encryptedStore";
import { installSync } from "@/lib/syncInstall";
import { useAgentsStore } from "@/stores/agents";
import { useBrainStore } from "@/stores/brain";
import { useLifeStore } from "@/stores/life";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { INITIAL, useTasksStore } from "@/stores/tasks";
import { useTodayStore } from "@/stores/today";
import type { BrainItem, TodayComposite } from "@/data/types";

const TODAY = "jstack.lastSeen.today";
const TASKS = "jstack.lastSeen.tasks";
const BRAIN = "jstack.lastSeen.brain";

/** lets a write nobody awaits finish — the copy is written beside the load, not in front of it */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

/** what the device holds under a key, decrypted and parsed */
async function onDisk(key: string): Promise<{ savedAt?: string; payload?: unknown } | null> {
  const raw = await encryptedGet(key);
  return raw == null ? null : (JSON.parse(raw) as { savedAt?: string; payload?: unknown });
}

/** the connection drops, and the next read fails the way a phone's does */
function goOffline(read: "getToday" | "getTasks" | "getBrainLatest") {
  useSessionStore.setState({ online: false });
  return jest.spyOn(getAdapter(), read).mockRejectedValue(new TypeError("Network request failed"));
}

beforeEach(async () => {
  resetDb();
  await AsyncStorage.clear();
  useSessionStore.setState({ online: true, locked: false });
  useTodayStore.setState({ composite: null });
  useTasksStore.setState(INITIAL);
  useBrainStore.setState({ latestIn: [], proposals: [], hitRate: null });
});

afterEach(() => {
  useSessionStore.setState({ online: true });
});

describe("A-3 · offline, the three planning tabs show their last copy, and say how old it is", () => {
  it("Today: a load that fails offline shows the last good composite under a 'last updated … · offline' line", async () => {
    await useTodayStore.getState().load();
    const saved = useTodayStore.getState().composite?.generatedAt;
    await settle();
    useTodayStore.setState({ composite: null }); // a cold open on the plane
    const read = goOffline("getToday");
    try {
      await useTodayStore.getState().load();
      const s = useTodayStore.getState();
      expect({ shown: s.composite?.generatedAt, line: s.deltaLine() }).toEqual({ shown: saved, line: "last updated just now · offline" });
    } finally {
      read.mockRestore();
    }
  });

  it("Tasks: the copy is the list for the filter it was loaded under, and another filter gets none", async () => {
    await useTasksStore.getState().load();
    const saved = useTasksStore.getState().list.map((t) => t.id);
    expect(saved.length).toBeGreaterThan(0);
    await settle();
    useTasksStore.setState({ list: [] });
    const read = goOffline("getTasks");
    try {
      await useTasksStore.getState().load();
      const same = { ids: useTasksStore.getState().list.map((t) => t.id), stale: useTasksStore.getState().staleAt != null };
      useTasksStore.setState({ list: [], staleAt: null, view: "board" });
      await useTasksStore.getState().load();
      const other = { ids: useTasksStore.getState().list.map((t) => t.id), stale: useTasksStore.getState().staleAt != null };
      expect({ same, other }).toEqual({ same: { ids: saved, stale: true }, other: { ids: [], stale: false } });
    } finally {
      read.mockRestore();
    }
  });

  it("Brain: a load that fails offline shows the last recent items, marked with when they are from", async () => {
    await useBrainStore.getState().load();
    const saved = useBrainStore.getState().latestIn.map((i) => i.id); // WPI-1: every recent item, marked ones included
    expect(saved.length).toBeGreaterThan(0);
    await settle();
    useBrainStore.setState({ latestIn: [] });
    const read = goOffline("getBrainLatest");
    try {
      await useBrainStore.getState().load();
      expect({ ids: useBrainStore.getState().latestIn.map((i) => i.id), stale: useBrainStore.getState().staleAt != null }).toEqual({ ids: saved, stale: true });
    } finally {
      read.mockRestore();
    }
  });

  it("online, a failed load never shows an old copy — that is A-2's sentence, not a stale page", async () => {
    await useTodayStore.getState().load();
    await settle();
    useTodayStore.setState({ composite: null });
    const read = jest.spyOn(getAdapter(), "getToday").mockRejectedValue(new TypeError("Network request failed"));
    try {
      await useTodayStore.getState().load();
      const s = useTodayStore.getState();
      expect({ composite: s.composite, stale: s.staleAt ?? null }).toEqual({ composite: null, stale: null });
    } finally {
      read.mockRestore();
    }
  });
});

describe("A-3 · what the copy never holds, and how it leaves", () => {
  // WPI-1 (v2.3.1) — Josh, 15 Sep 2026: the cache keeps "all including sensitive". It is ciphertext at rest, it goes with
  // the wipe and the key that sealed it (WPA-14), and nothing is written while the emergency state is set (A-13)
  it("a record marked sensitive is cached like any other: its words are in the copy read back, and the bytes at rest are ciphertext", async () => {
    const real = await getAdapter().getToday();
    const planted = { ...real, needsYou: [...real.needsYou, { ...real.needsYou[0], id: "planted-sens", title: "the bill amount kept for the plane", sensitivity: "sens" }] } as TodayComposite;
    const brainReal = await getAdapter().getBrainLatest();
    const brainPlanted = [...brainReal, { ...brainReal[0], id: "planted-sensitive", text: "a health note kept for the plane", routing: { kind: "note", silos: [], labels: [], sensitivity: "sensitive" } }] as unknown as BrainItem[];
    const today = jest.spyOn(getAdapter(), "getToday").mockResolvedValueOnce(planted);
    const brain = jest.spyOn(getAdapter(), "getBrainLatest").mockResolvedValueOnce(brainPlanted);
    try {
      await useTodayStore.getState().load();
      await useBrainStore.getState().load();
      await settle();
      const rawToday = (await AsyncStorage.getItem(TODAY)) ?? "";
      const rawBrain = (await AsyncStorage.getItem(BRAIN)) ?? "";
      expect({
        todayKeptSens: JSON.stringify(await onDisk(TODAY)).includes("the bill amount kept for the plane"),
        brainKeptSensitive: JSON.stringify(await onDisk(BRAIN)).includes("a health note kept for the plane"),
        ciphertext: rawToday.startsWith("jstack-enc-v1:") && rawBrain.startsWith("jstack-enc-v1:"),
        plaintextOnDisk: rawToday.includes("the bill amount") || rawBrain.includes("a health note"),
      }).toEqual({ todayKeptSens: true, brainKeptSensitive: true, ciphertext: true, plaintextOnDisk: false });
    } finally {
      today.mockRestore();
      brain.mockRestore();
    }
  });

  it("still nothing while the emergency state is set — a record marked sensitive included", async () => {
    const real = await getAdapter().getToday();
    const planted = { ...real, needsYou: [...real.needsYou, { ...real.needsYou[0], id: "planted-sens", title: "the bill amount kept for the plane", sensitivity: "sens" }] } as TodayComposite;
    const today = jest.spyOn(getAdapter(), "getToday").mockResolvedValueOnce(planted);
    useSessionStore.setState({ emergency: true, locked: true });
    try {
      await useTodayStore.getState().load();
      await settle();
      expect({ loaded: useTodayStore.getState().composite != null, copyOnDevice: (await AsyncStorage.getItem(TODAY)) != null }).toEqual({ loaded: true, copyOnDevice: false });
    } finally {
      today.mockRestore();
      useSessionStore.setState({ emergency: false, locked: false });
    }
  });

  it("only the three planning tabs are kept — Life, Agents and Settings leave nothing behind", async () => {
    await useTodayStore.getState().load();
    await useTasksStore.getState().load();
    await useBrainStore.getState().load();
    await useLifeStore.getState().load();
    await useAgentsStore.getState().load();
    await useSettingsStore.getState().load();
    await settle();
    const kept = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("jstack.lastSeen.")).sort();
    expect(kept).toEqual([BRAIN, TASKS, TODAY]);
  });

  it("one write per load: back-to-back loads leave the latest copy, not a queue of them", async () => {
    // the mock's own call log rather than a spy: `AsyncStorage.setItem` is already a
    // jest.fn, and restoring a spy on one strips its implementation — the first draft
    // of this case did that, and every later write in the file stored nothing
    const setItem = AsyncStorage.setItem as jest.Mock;
    const from = setItem.mock.calls.length;
    await useTodayStore.getState().load();
    await useTodayStore.getState().load();
    await useTodayStore.getState().load();
    await settle();
    const writes = setItem.mock.calls.slice(from).filter(([k]) => k === TODAY).length;
    const copy = (await onDisk(TODAY))?.payload as TodayComposite | undefined;
    expect({ writesPerLoadAtMostOne: writes >= 1 && writes <= 3, latest: copy?.generatedAt === useTodayStore.getState().composite?.generatedAt }).toEqual({ writesPerLoadAtMostOne: true, latest: true });
  });

  it("the emergency wipe removes every copy", async () => {
    await useTodayStore.getState().load();
    await useTasksStore.getState().load();
    await useBrainStore.getState().load();
    await settle();
    const before = await Promise.all([TODAY, TASKS, BRAIN].map(async (k) => (await AsyncStorage.getItem(k)) != null));
    await wipeAllLocalData();
    const after = await Promise.all([TODAY, TASKS, BRAIN].map(async (k) => (await AsyncStorage.getItem(k)) != null));
    expect({ before, after }).toEqual({ before: [true, true, true], after: [false, false, false] });
  });

  it("a write already under way when the wipe runs cannot put a copy back", async () => {
    // the first use of the store, whatever ran before: since A-6 the native key is
    // remembered, and a remembered key would let the write skip the read it is held at
    await wipeAllLocalData();
    // hold the write at its first await — the key read — until the wipe has finished
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const read = SecureStore.getItemAsync as jest.Mock;
    const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
    read.mockImplementationOnce(async (k: string) => {
      await gate;
      return store.get(k) ?? null;
    });
    const late = encryptedSet(TODAY, JSON.stringify({ savedAt: new Date().toISOString(), scope: "", payload: { planted: "after the wipe" } }));
    await wipeAllLocalData();
    release();
    await late;
    await settle();
    expect({ copyAfterWipe: (await AsyncStorage.getItem(TODAY)) != null }).toEqual({ copyAfterWipe: false });
  });
});

/**
 * A-3b (WP-A, v2.3) — QA on A-3: once a copy was on screen, "last updated … · offline" outlived the offline
 * state. Nothing reloaded on a reconnect unless a replay sent or refused something, so with nothing queued the
 * line stayed on screen after the connection came back. Driven through `installSync`, the way the app boots.
 */
describe("A-3b · coming back online takes the offline copies down, whatever the queue holds", () => {
  it("copies shown offline, then online again with nothing queued: every stale mark is gone and the tabs hold live data", async () => {
    const stop = installSync();
    try {
      await Promise.all([useTodayStore.getState().load(), useTasksStore.getState().load(), useBrainStore.getState().load()]);
      await settle();
      const reads = [goOffline("getToday"), goOffline("getTasks"), goOffline("getBrainLatest")];
      await Promise.all([useTodayStore.getState().load(), useTasksStore.getState().load(), useBrainStore.getState().load()]);
      const offline = { today: useTodayStore.getState().deltaLine(), tasks: useTasksStore.getState().staleAt != null, brain: useBrainStore.getState().staleAt != null };
      reads.forEach((r) => r.mockRestore());
      const live = jest.spyOn(getAdapter(), "getToday");
      try {
        useSessionStore.getState().setOnline(true);
        await settle();
        await settle();
        expect({
          offline,
          staleAt: [useTodayStore.getState().staleAt, useTasksStore.getState().staleAt, useBrainStore.getState().staleAt],
          stillSaysOffline: useTodayStore.getState().deltaLine() === offline.today,
          reloaded: live.mock.calls.length > 0,
        }).toEqual({
          offline: { today: "last updated just now · offline", tasks: true, brain: true },
          staleAt: [null, null, null],
          stillSaysOffline: false,
          reloaded: true,
        });
      } finally {
        live.mockRestore();
      }
    } finally {
      stop();
    }
  });
});

/**
 * A-13 (WP-A, v2.3) — the WP-F merge put WPF-4's lock retry and A-3b's tab reload on the same reconnect. A planning read
 * the server answered before `POST /lock` can land after the wipe that follows it, and the copy it would take carries the
 * wipe's own count, so A-3's wipe guards let it through. While `session.emergency` is set, no copy is taken.
 */
describe("A-13 · an emergency-locked device keeps no offline copy", () => {
  it("emergency set and the device wiped, a composite that resolves late leaves no copy on the device", async () => {
    const real = await getAdapter().getToday();
    let answer: (composite: TodayComposite) => void = () => {};
    const today = jest.spyOn(getAdapter(), "getToday").mockImplementationOnce(() => new Promise<TodayComposite>((resolve) => (answer = resolve)));
    try {
      const load = useTodayStore.getState().load();
      useSessionStore.setState({ emergency: true, locked: true });
      await wipeAllLocalData();
      answer(real);
      await load;
      await settle();
      expect({ loaded: useTodayStore.getState().composite != null, copyOnDevice: (await AsyncStorage.getItem(TODAY)) != null }).toEqual({ loaded: true, copyOnDevice: false });
    } finally {
      today.mockRestore();
      useSessionStore.setState({ emergency: false, locked: false });
    }
  });
});
