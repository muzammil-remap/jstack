/**
 * e2e state hook (web only): Playwright asserts on STORE STATE, never
 * logs. Row 5 of the V2 build rewrites this in full against the seven
 * stores, the undo ledger and data/mock/db.ts (ADR-04, ADR-05). Reads
 * data/mock/db.ts directly (not through data/provider.ts) — the one
 * intentional exception to CT-03's "only data/mock/, data/provider.ts and
 * tests import the mock server" boundary, because this file's entire job
 * is deep test introspection into whichever adapter is live, and it never
 * ships (lib/testBuild.ts swaps it for a no-op in production, SEC-01).
 */
import { Platform } from "react-native";
import { useDeviceStore } from "@/stores/device";
import { apiCalls } from "@/data/ApiAdapter";
import { API_BASE_URL, USE_API_ADAPTER } from "@/data/config";
import { getAdapter } from "@/data/provider";
import * as mockDb from "@/data/mock/db";
import * as mockMirror from "@/data/mock/handlers/mirror";
import * as mockTest from "@/data/mock/handlers/test";
import * as mockSession from "@/data/mock/handlers/session";
import { refreshAccessToken } from "@/lib/authTokens";
import { __setBiometricForTests } from "@/lib/highRisk";
import { useAutoLockStore } from "@/lib/autoLock";
import { useMicStore } from "@/stores/mic";
import { useAgentsStore } from "@/stores/agents";
import { useVoiceStore } from "@/stores/voice";
import { __dropVoiceSocketForTests } from "@/data/mock/voice";
import type { SectionConfig } from "@/data/types";
import { useBrainStore } from "@/stores/brain";
import { useLifeStore } from "@/stores/life";
import { useSessionStore } from "@/stores/session";
import { useParametersStore } from "@/stores/parameters";
import { useSectionsStore } from "@/stores/sections";
import { useRulesStore } from "@/stores/rules";
import { useSettingsStore } from "@/stores/settings";
import { useSyncStore } from "@/stores/sync";
import { useTasksStore } from "@/stores/tasks";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTodayStore } from "@/stores/today";
import { useUiStore } from "@/stores/ui";

/** structured-clone-safe snapshot (drops store action functions) */
function snap<T>(v: T): unknown {
  return JSON.parse(JSON.stringify(v));
}

export function installTestHook(): void {
  if (Platform.OS !== "web") return;
  const g = globalThis as Record<string, unknown>;

  // NC-01 sweep: a monotonic counter over every store mutation — a tap
  // that changes nothing anywhere is a dead control.
  let mutations = 0;
  const allStores = [useSessionStore, useTodayStore, useTasksStore, useTaskCardStore, useBrainStore, useLifeStore, useAgentsStore, useSettingsStore, useSectionsStore];
  for (const store of allStores) {
    (store as { subscribe: (cb: () => void) => void }).subscribe(() => {
      mutations++;
    });
  }

  g.__JSTACK__ = {
    mutationCount: () => mutations,
    /** true when the app is running against the real backend (BS-05 swap) */
    apiMode: USE_API_ADAPTER,
    getAdapter,
    stores: {
      session: () => snap(useSessionStore.getState()),
      today: () => snap(useTodayStore.getState()),
      tasks: () => snap(useTasksStore.getState()),
      taskCard: () => snap(useTaskCardStore.getState()),
      brain: () => snap(useBrainStore.getState()),
      life: () => snap(useLifeStore.getState()),
      agents: () => snap(useAgentsStore.getState()),
      settings: () => snap(useSettingsStore.getState()),
      sync: () => snap(useSyncStore.getState()),
      sections: () => snap(useSectionsStore.getState()),
      // H-1/CL-03: the collapsed map is device-local and never goes to the
      // server, so a test asking "did that stick?" has nowhere else to look.
      device: () => snap(useDeviceStore.getState()),
      // L-1/LK-03: the six tunables, so an e2e can assert the value the
      // control saved rather than the label it happens to render.
      parameters: () => snap(useParametersStore.getState()),
      // the session itself is a live object with a socket and timers, so it
              // is projected away rather than serialised — a rig snapshot is
              // for asserting on, and `running`/`state` are what a test asks.
      voice: () => {
        const { session: _session, ...rest } = useVoiceStore.getState();
        return snap(rest);
      },
    },
    // BS-05: in API mode the db snapshot comes from the reference server's
    // test-only debug endpoint and calls from the ApiAdapter request log —
    // the SAME assertions run against both adapters.
    db: () =>
      USE_API_ADAPTER
        ? fetch(`${new URL(API_BASE_URL!).origin}/__test__/db`).then((r) => r.json())
        : Promise.resolve(mockDb.inspect()),
    calls: () => snap(apiCalls),
    /**
     * `reset("day2")` seeds the morning after (D2-01..04, ADR-31).
     *
     * And then RELOADS the stores. A reset that reseeds the server and leaves
     * the app holding the previous scene is not a reset — every caller wants
     * the screen to show what was just seeded, and a page reload cannot do it
     * because `data/mock/db.ts` reseeds day 1 at module load.
     */
    reset: async (scenario?: string) => {
      if (USE_API_ADAPTER) {
        await fetch(`${new URL(API_BASE_URL!).origin}/__test__/reset`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scenario }),
        });
      } else {
        mockDb.reset(0, scenario);
      }
      await Promise.all([
        useTodayStore.getState().load(),
        useTasksStore.getState().load(),
        useBrainStore.getState().load(),
        useLifeStore.getState().load(),
        useAgentsStore.getState().load(),
      ]);
    },
    /**
     * TM-01: answer a card from "Telegram" — a channel that is not this app.
     * Goes through the mock's own route so the server-event stream fires
     * exactly as it would for a real second channel; the app finds out the
     * way it will in production, by being told.
     */
    telegramAnswer: async (actionId: string, verb: string, option?: number) => {
      const body = { actionId, verb, option };
      if (USE_API_ADAPTER) {
        const res = await fetch(`${new URL(API_BASE_URL!).origin}/__mirror__/telegram`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: res.status, json: await res.json() };
      }
      return snap(mockMirror.postTelegramMirror({ method: "POST", path: "/__mirror__/telegram", body }));
    },
    /**
     * WK-03 (T-5): flip an agent's working state on the SERVER.
     *
     * Named rather than a generic `call`, for the reason `telegramAnswer` is:
     * a hook that can post anything anywhere is a second transport, and the
     * point of these is that the app finds out the way it will in production —
     * the mock's own route emits the `tasks` event and the surfaces follow.
     */
    setWork: async (taskId: string, state: string, step?: string) => {
      const body = { taskId, state, step };
      if (USE_API_ADAPTER) {
        const res = await fetch(`${new URL(API_BASE_URL!).origin}/__test__/work`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: res.status, json: await res.json() };
      }
      return snap(mockTest.setTestWork({ method: "POST", path: "/__test__/work", body }));
    },
    /**
     * UP-06: a file landing in the Dropbox inbox. A lever rather than a page
     * `fetch`, because the mock runs IN PROCESS — a real request to
     * `/__test__/inbox` from the page would go to the dev server and 404,
     * which is the trap that makes a rig route look broken when it is not.
     */
    inbox: async (name: string, kind?: string) => {
      const body = { name, kind };
      if (USE_API_ADAPTER) {
        const res = await fetch(`${new URL(API_BASE_URL!).origin}/__test__/inbox`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: res.status, json: await res.json() };
      }
      return snap(mockTest.setTestInbox({ method: "POST", path: "/__test__/inbox", body }));
    },
    setClockOffsetMs: (ms: number) => {
      useSessionStore.getState().setClockOffsetMs(ms);
      if (USE_API_ADAPTER) {
        void fetch(`${new URL(API_BASE_URL!).origin}/__test__/clock`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ offsetMs: ms }),
        }).catch(() => {});
      } else {
        mockDb.setClockOffsetMs(ms);
      }
    },
    setOnline: (v: boolean) => useSessionStore.getState().setOnline(v),
    /**
     * MU-01: reseed the session as somebody else. Goes through the SERVER
     * (`POST /__test__/user`, mock-only) rather than writing the store
     * directly — the point of MU-02 is that the server filters, so a rig that
     * set `silos` client-side would be testing the wrong half.
     */
    asUser: async (id: string) => {
      if (USE_API_ADAPTER) {
        await fetch(`${new URL(API_BASE_URL!).origin}/__test__/user`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
      } else {
        mockDb.asUser(id);
      }
      await useSessionStore.getState().loadSession();
      return snap(useSessionStore.getState().user);
    },
    /**
     * UX-02 rig: the soft keyboard's height. A real one is reported by
     * `visualViewport` on web and by `Keyboard` events on native
     * (lib/keyboard.ts) — Playwright can raise neither, so the expanded
     * `Field` could not otherwise be tested against the viewport it
     * actually has to fit above. Writes the same store field those two
     * listeners write, so the component under test sees no difference.
     *
     * E-1 moved the band from `stores/session.ts` to `stores/ui.ts` and added
     * the offset: `offsetTop` is where the visible band BEGINS, which on iOS
     * moves independently of the height it lost. TE-02 drives both.
     */
    setKeyboardInset: (px: number, offsetTop?: number) => {
      useUiStore.getState().setKeyboardInset(px);
      useUiStore.getState().setKeyboardOffsetTop(offsetTop ?? 0);
    },
    // CT-05 rig: flips a capability flag and reloads settings so every
    // surface reading `capabilities()` re-renders against the new value.
    setCapability: async (key: string, value: boolean) => {
      if (USE_API_ADAPTER) return;
      mockDb.setCapability(key as never, value);
      await useSettingsStore.getState().load();
    },
    /**
     * ID-04: arm the server to answer the NEXT refresh with
     * `401 { reason: "reuse" }`, then drive the app's own refresh path. The
     * assertion is on what the client does about it — lock, emergency — not
     * on the 401 itself.
     */
    /**
     * SH-09: the server signs THIS device out — `POST /__test__/revoke` on the
     * mock, which locks the mock's session and emits `{ kind: "session" }`;
     * the app's handler (`lib/serverEvents.ts`) must lock, purge the tokens
     * and say "This device was signed out." The assertion is on what the
     * client does, so this goes through the server's own route, as the
     * hardening unit test does.
     */
    revokeThisDevice: async () => {
      if (USE_API_ADAPTER) {
        await fetch(`${new URL(API_BASE_URL!).origin}/__test__/revoke`, { method: "POST" });
        return;
      }
      mockTest.setTestRevoke({ method: "POST", path: "/__test__/revoke" });
    },
    forceRefreshReuse: async () => {
      if (USE_API_ADAPTER) {
        await fetch(`${new URL(API_BASE_URL!).origin}/__test__/refresh-reuse`, { method: "POST" });
      } else {
        mockSession.armRefreshReuse();
      }
      try {
        await refreshAccessToken();
      } catch {
        // the throw is expected; the state change is the point
      }
      return snap(useSessionStore.getState());
    },
    /** OF-02: what is waiting to be sent, exactly as the queue holds it. */
    outbox: async () => snap(await useSyncStore.getState().entries()),
    /**
     * OF-02/OF-04: the connection, as the app sees it. Playwright's
     * `context.setOffline(true)` stops the network but does not tell the app,
     * and `navigator.onLine` in a headless browser is not reliable — so the
     * rig writes the same field the real listeners write, which is the field
     * every surface reads.
     */
    goOffline: () => useSessionStore.getState().setOnline(false),
    goOnline: async () => {
      useSessionStore.getState().setOnline(true);
      await useSyncStore.getState().syncNow();
      return snap(useSyncStore.getState());
    },
    /** OF-07: arm the server to refuse this entry on replay. */
    forceConflict: (offlineId: string) => {
      if (USE_API_ADAPTER) return;
      mockDb.get().conflicting.push(offlineId);
    },
    sync: () => snap(useSyncStore.getState()),
    /**
     * PU-02..05: deliver a push payload to the service worker, the way the
     * push service would. Playwright can grant notification permission and
     * register a worker, but it cannot make a real push service send
     * anything — so the rig posts the payload the worker would have received
     * and the handlers do the rest.
     */
    push: async (payload: Record<string, unknown>) => {
      // R-11: `serviceWorker.ready` never settles with nothing registered
      // (B-30) — this lever awaited it blind and HUNG in every test build
      // while its own comment promised a reason. Ask `getRegistration()`.
      const nav = (globalThis as { navigator?: Navigator }).navigator;
      const existing = await nav?.serviceWorker?.getRegistration().catch(() => undefined);
      if (existing == null) return { delivered: false, reason: "no service worker (test builds do not register one)" };
      const reg = await nav!.serviceWorker.ready;
      if (reg.active == null) return { delivered: false, reason: "the service worker is not active yet" };
      reg.active.postMessage({ __jstackPush: payload });
      return { delivered: true };
    },
    /**
     * MC-06: set a tunable through the SAME action Settings uses, so the test
     * drives the real write (PUT /parameters/{key}) rather than poking the
     * store. A test that set the value directly would pass over a broken
     * route, which is the shape rule 15 is about.
     */
    setParameter: (key: string, value: number | boolean) => useParametersStore.getState().setParameter(key as never, value),
    /**
     * TS-02/TS-03/TS-06: flip a Voice setting through the SAME action the
     * Settings screen uses, so the PUT is exercised and the store is not
     * poked behind the adapter's back. Merges, because a test that wants car
     * mode on should not have to restate the style and the speed.
     */
    setVoice: (patch: Record<string, unknown>) => {
      const voice = useSettingsStore.getState().voice;
      return useSettingsStore.getState().putVoice({ style: "warm", speed: 1, readBriefAt: null, ...(voice ?? {}), ...patch } as never);
    },
    setTheme: (mode: "light" | "dark" | "auto") => useDeviceStore.getState().setThemeMode(mode),
    setPrivacy: (v: boolean) => useDeviceStore.getState().setPrivacyBlur(v),
    setAutoLockMs: (ms: number) => useAutoLockStore.getState().setTimeoutMs(ms),
    unlockForCapture: () => useSessionStore.getState().unlock(),
    /**
     * V-1's microphone lever (MC-08), replacing the `stt` engine seam.
     *
     * It STUBS THE THREE BROWSER APIs rather than injecting an engine, and
     * that is the whole point: a mock route cannot reach `getUserMedia`,
     * `SpeechRecognition` or `MediaRecorder`, so a server-side seam could
     * never have tested the case Josh actually hit — an unsupported mime type
     * on an iPhone. `lib/mic.ts` reads exactly what a real browser offers, so
     * driving these globals drives the real code path.
     *
     * This file is the ONE exception to hard rule 12(c)'s "nothing outside
     * lib/mic.ts names a microphone API", named with its reason in MC-01's
     * allow-list. It is test-build only (`lib/testBuild.prod.ts` has no
     * `__JSTACK__` at all).
     */
    mic: (() => {
      type Rec = { onresult: ((e: unknown) => void) | null; onerror: ((e: unknown) => void) | null };
      let recogniser: Rec | null = null;
      const g = globalThis as unknown as Record<string, unknown>;

      const result = (transcript: string, isFinal: boolean) =>
        recogniser?.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript }, length: 1 }] });

      return {
        /**
         * `available: false` is "this browser cannot", `mime` is which
         * container it admits to supporting — `null` for neither, which is
         * the Safari-without-webm case that used to throw into a swallowed
         * catch and leave the session stuck in `listening`.
         */
        use: (opts: { available?: boolean; mime?: string | null; denied?: boolean; noDevice?: boolean } = {}) => {
          const available = opts.available !== false;
          // `window.navigator` is a getter with no setter, so it is replaced
          // property by property: `defineProperty` on the INSTANCE shadows
          // the prototype's `mediaDevices` accessor. Assigning to
          // `g.navigator` throws "which has only a getter" in Chrome.
          Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
              getUserMedia: () => {
                if (opts.denied) return Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
                if (opts.noDevice) return Promise.reject(Object.assign(new Error("none"), { name: "NotFoundError" }));
                // `available: false` is "this browser cannot TRANSCRIBE" — no
                // SpeechRecognition — which is Safari. The microphone itself
                // is still there and still opens, and conflating the two hid
                // the difference between "no device" and "no engine".
                return Promise.resolve({ getTracks: () => [{ stop: () => {} }] });
              },
            },
          });
          const mime = opts.mime === undefined ? "audio/webm;codecs=opus" : opts.mime;
          g.MediaRecorder = Object.assign(
            class {
              state = "recording";
              ondataavailable: unknown = null;
              start() {}
              stop() {
                this.state = "inactive";
              }
            },
            { isTypeSupported: (m: string) => mime != null && m === mime },
          );
          if (available) {
            g.SpeechRecognition = class {
              lang = "";
              interimResults = false;
              continuous = false;
              onresult: ((e: unknown) => void) | null = null;
              onerror: ((e: unknown) => void) | null = null;
              start() {
                recogniser = this;
              }
              stop() {
                recogniser = null;
              }
            };
          } else {
            delete g.SpeechRecognition;
            delete g.webkitSpeechRecognition;
          }
        },
        /** interim text, as the browser would stream it */
        partial: (t: string) => result(t, false),
        /** the final transcript that replaces the interim */
        speak: (t: string) => result(t, true),
        listening: () => recogniser != null,
        state: () => useMicStore.getState().state,
      };
    })(),
    biometric: {
      approve: () => __setBiometricForTests(async () => true),
      decline: () => __setBiometricForTests(async () => false),
      clear: () => __setBiometricForTests(null),
    },
    /**
     * CB-05 rig: the EA proposes a section. The real trigger is the EA
     * skill, which does not exist in the app — so the rig posts the same
     * `POST /sections/propose` the backend will, rather than reaching into
     * the mock's tables and building a card by hand (a rig that constructs
     * the outcome cannot prove the endpoint produces it).
     */
    proposeSection: async (config: SectionConfig, reason: string) => {
      await getAdapter().proposeSection(config, reason);
      await useTodayStore.getState().load();
      await useSectionsStore.getState().load();
    },

    /** ST-1/ST-03: the same shape again, for the rule the EA proposes when it
     * notices it keeps being told the same thing. Through the ROUTE, like its
     * two siblings — a rig that builds the card by hand cannot prove the
     * endpoint produces one. */
    proposeRule: async (text?: string) => {
      await getAdapter().postAutonomyPropose(text);
      await useTodayStore.getState().load();
      await useRulesStore.getState().load();
    },

    /** L-1/LK-04: the same shape for a parameter proposal — raise it as the
     * EA would, then reload the two stores that show the result, because the
     * app has no reason to poll and a page reload would take the mock's own
     * db with it. */
    proposeParameter: async (key: string, value: number | boolean, reason: string) => {
      await getAdapter().proposeParameter(key, value, reason);
      await useTodayStore.getState().load();
      await useParametersStore.getState().load();
    },

    /**
     * The voice rig (V-2). A browser under test has no microphone and no
     * permission dialog, so `audio` pushes the chunks `captureAudio` would
     * have — the scripted server answers them exactly as it would answer a
     * real recorder, which is the point of the whole `Socket` seam.
     *
     * `drop` is the only way to test a reconnect: it closes the socket
     * WITHOUT the client having asked, which is what a tunnel does.
     */
    voice: {
      start: () => useVoiceStore.getState().start(),
      audio: (chunk: string) => useVoiceStore.getState().audio(chunk),
      say: (text: string) => useVoiceStore.getState().say(text),
      reply: () => useVoiceStore.getState().reply(),
      end: () => useVoiceStore.getState().end("user"),
      state: () => useVoiceStore.getState().state,
      drop: () => __dropVoiceSocketForTests(),
    },

    // AR-06 rig: proposes an EA layout for `tab`, keeping whatever's
    // currently hidden (the EA never re-shows a Josh-hidden section).
    eaLayout: async (tab: string, order: string[], reason: string) => {
      const store = useSettingsStore.getState();
      const current = store.layouts[tab] ?? (await getAdapter().getLayout(tab));
      await store.postLayoutEa(tab, { order, hidden: current.hidden }, reason);
    },
  };
}
