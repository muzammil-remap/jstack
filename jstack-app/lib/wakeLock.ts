/**
 * wakeLock.ts (V-2; v2.3.1 WPJ-1) — keep the screen awake while a microphone is open, and in car mode.
 *
 * Josh, 15 Sep: "When talk / dictation is on — the app and phone/ipad/app should ensure the device remains
 * open and screen on." So the one microphone owner (`lib/mic.ts`) holds it for the life of each session, and
 * Talk in car mode holds it for the conversation (VP-07). Held by TAG, one per holder: the screen stays on
 * while any tag is held, so neither holder can give back the other's.
 *
 * On a phone it is `expo-keep-awake`, which keeps tags of its own. In a browser it is `navigator.wakeLock` —
 * one lock for every tag, asked for with the first and given back with the last — and nothing where the API
 * does not exist: a device that cannot be told to stay awake is not a reason to refuse the microphone.
 */
import { Platform } from "react-native";

type Sentinel = { release: () => Promise<void> };

const tags = new Set<string>();
/** the browser's one lock for every tag, once it has handed one over */
let sentinel: Sentinel | null = null;
let requesting = false;

function keepAwake(): typeof import("expo-keep-awake") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-keep-awake") as typeof import("expo-keep-awake");
  } catch {
    return null; // not in this binary
  }
}

/** keep the screen on under `tag`; taking a tag already held does nothing */
export function holdScreenAwake(tag: string): void {
  if (tags.has(tag)) return;
  tags.add(tag);
  if (Platform.OS !== "web") {
    try {
      void keepAwake()?.activateKeepAwakeAsync(tag).catch(() => undefined);
    } catch {
      // a module that cannot answer leaves the screen sleeping as it always did
    }
    return;
  }
  void requestBrowserLock();
}

/** give back `tag`; the screen may sleep once no tag is held */
export function releaseScreenAwake(tag: string): void {
  if (!tags.delete(tag)) return;
  if (Platform.OS !== "web") {
    try {
      void keepAwake()?.deactivateKeepAwake(tag).catch(() => undefined);
    } catch {
      // the same
    }
    return;
  }
  if (tags.size > 0) return;
  const held = sentinel;
  sentinel = null;
  void held?.release().catch(() => undefined);
}

async function requestBrowserLock(): Promise<void> {
  const nav = (globalThis as { navigator?: { wakeLock?: { request: (type: string) => Promise<Sentinel> } } }).navigator;
  if (nav?.wakeLock == null || sentinel != null || requesting) return;
  requesting = true;
  let granted: Sentinel | null = null;
  try {
    granted = await nav.wakeLock.request("screen");
  } catch {
    granted = null;
  }
  requesting = false;
  // every holder gave its tag back while the browser was deciding: the lock goes straight back
  if (tags.size === 0) {
    void granted?.release().catch(() => undefined);
    return;
  }
  sentinel = granted;
}
