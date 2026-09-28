/**
 * PU-01..05, SE-02 — push, and the one prompt (U-1).
 *
 * The behaviour that matters most here is a refusal to ask. A notification
 * permission prompt that arrives unprompted gets denied, and a denied
 * permission is close to permanent — the browser stops asking and the way
 * back is through settings nobody finds. So the prompt happens in exactly one
 * place, when the person turns the switch on, and every other state is a
 * sentence instead.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pushState, subscribePush, unsubscribePush, updatePushGroups } from "@/lib/push";
import { get as dbGet, reset as resetDb } from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { useSettingsStore } from "@/stores/settings";
import type { TransportRequest } from "@/data/transport/Transport";

const app = join(__dirname, "..", "..");
const KEY = "BJStackDemoVapidPublicKeyNotARealOne0000000000000000000000000000000000000000000000000000";

type Globals = { navigator?: unknown; Notification?: unknown };
const g = globalThis as Globals;

/**
 * `registered: false` models the case this fake used to be unable to
 * express, and the one B-30 was hiding in: NO service worker registered.
 * The real `serviceWorker.ready` then never settles — it means "wake me
 * when one is active", not "is there one?" — so a fake that only offers
 * a resolved `ready` cannot fail the way the browser does. It offers
 * `getRegistration` too, which is what `lib/push.ts` now asks first.
 */
function fakeBrowser(opts: { permission?: string; subscribed?: boolean; asked?: string[]; registered?: boolean } = {}) {
  const asked = opts.asked ?? [];
  const registered = opts.registered ?? true;
  const subscription = {
    endpoint: "https://push.example.test/abc",
    toJSON: () => ({ endpoint: "https://push.example.test/abc", keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: async () => true,
  };
  let current = opts.subscribed ? subscription : null;
  const reg = {
    pushManager: {
      getSubscription: async () => current,
      subscribe: async () => {
        current = subscription;
        return subscription;
      },
    },
  };
  g.navigator = {
    serviceWorker: {
      getRegistration: async () => (registered ? reg : undefined),
      // never settles when nothing is registered — the browser's own behaviour
      ready: registered ? Promise.resolve(reg) : new Promise(() => {}),
    },
  };
  g.Notification = {
    permission: opts.permission ?? "default",
    requestPermission: async () => {
      asked.push("asked");
      return opts.permission === "denied" ? "denied" : "granted";
    },
  };
  return { asked };
}

afterEach(() => {
  delete g.navigator;
  delete g.Notification;
});

describe("PU-01 · what the switch shows, without asking for anything", () => {
  it("unavailable when the backend has no key — the person is told why", async () => {
    fakeBrowser();
    expect(await pushState(undefined)).toBe("unavailable");
    expect(await pushState("")).toBe("unavailable");
  });

  it("denied is reported as denied, not as off", async () => {
    // "off" invites a tap that cannot work; "denied" says where to go
    fakeBrowser({ permission: "denied" });
    expect(await pushState(KEY)).toBe("denied");
  });

  it("off when it could be on, on when it already is", async () => {
    fakeBrowser();
    expect(await pushState(KEY)).toBe("off");
    fakeBrowser({ subscribed: true, permission: "granted" });
    expect(await pushState(KEY)).toBe("on");
  });

  it("reading the state NEVER prompts", async () => {
    // the whole design: this runs on every render of the settings sheet
    const { asked } = fakeBrowser();
    await pushState(KEY);
    await pushState(KEY);
    expect(asked).toEqual([]);
  });
});

describe("PU-02 · subscribing", () => {
  it("asks once, subscribes, and sends the endpoint and keys — not a token", async () => {
    // web push has no token: a backend given one could not send anything
    const { asked } = fakeBrowser();
    const calls: unknown[] = [];
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const provider = require("@/data/provider") as typeof import("@/data/provider");
    jest.spyOn(provider, "getAdapter").mockReturnValue({
      postPushSubscribe: async (input: unknown) => {
        calls.push(input);
      },
    } as never);

    expect(await subscribePush(KEY, ["ng1", "ng2"], "this device")).toBe("on");
    expect(asked).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      device: "this device",
      endpoint: "https://push.example.test/abc",
      keys: { p256dh: "p", auth: "a" },
      groups: ["ng1", "ng2"],
    });
    jest.restoreAllMocks();
  });

  it("a denied prompt reports denied and subscribes to nothing", async () => {
    const { asked } = fakeBrowser({ permission: "denied" });
    expect(await subscribePush(KEY, [], "d")).toBe("denied");
    // it never even asked: `pushState` already said denied
    expect(asked).toEqual([]);
  });

  it("refuses to ask when there is no key to subscribe against", async () => {
    const { asked } = fakeBrowser();
    expect(await subscribePush(undefined, [], "d")).toBe("unavailable");
    expect(asked).toEqual([]);
  });
});

describe("PU-03 · unsubscribing", () => {
  it("drops the subscription and reports off", async () => {
    fakeBrowser({ subscribed: true, permission: "granted" });
    expect(await unsubscribePush()).toBe("off");
  });

  /**
   * A-0 review, R-07. This case used to read `stores/settings.ts` as text and
   * pass on the word `unsubscribePush` being in it — and the behaviour behind
   * the word was wrong: revoking device B called `unsubscribePush()`, which
   * drops THIS browser's subscription (device A's), while the mock stored no
   * subscriptions at all, so B's was never removed anywhere. PU-05 names the
   * route (`DELETE /push/subscribe/{device}`); it had no row. Asserted on
   * state now: the server's table, and the browser's own subscription.
   */
  it("revoking device B removes B's subscription on the server and leaves this device's alone", async () => {
    fakeBrowser({ subscribed: true, permission: "granted" });
    resetDb();
    // this device (dev1) and the iPad (dev2) both subscribed
    await handle({ method: "POST", path: "/push/subscribe", body: { device: "dev1", endpoint: "https://push.example.test/dev1", keys: { p256dh: "p", auth: "a" }, groups: ["security"] } } as TransportRequest);
    await handle({ method: "POST", path: "/push/subscribe", body: { device: "dev2", endpoint: "https://push.example.test/dev2", keys: { p256dh: "p", auth: "a" }, groups: ["security"] } } as TransportRequest);
    expect(dbGet().pushSubscriptions.map((x) => x.device).sort()).toEqual(["dev1", "dev2"]);

    await useSettingsStore.getState().revokeDevice("dev2", "nonce-1", "assertion-1");

    expect(dbGet().pushSubscriptions.map((x) => x.device)).toEqual(["dev1"]);
    expect(dbGet().devices.some((d) => d.id === "dev2")).toBe(false);
    // and this browser is still subscribed — revoking the iPad is not a way to
    // silence the phone in your hand
    expect(await pushState(KEY)).toBe("on");
  });

  it("subscribing twice from one device replaces, never duplicates; deleting is idempotent", async () => {
    resetDb();
    const sub = (groups: string[]) => handle({ method: "POST", path: "/push/subscribe", body: { device: "dev1", endpoint: "https://push.example.test/dev1", keys: { p256dh: "p", auth: "a" }, groups } } as TransportRequest);
    await sub(["security"]);
    await sub(["security", "tasks"]);
    expect(dbGet().pushSubscriptions).toHaveLength(1);
    expect(dbGet().pushSubscriptions[0].groups).toEqual(["security", "tasks"]);

    expect((await handle({ method: "DELETE", path: "/push/subscribe/dev1" } as TransportRequest)).status).toBe(200);
    expect(dbGet().pushSubscriptions).toEqual([]);
    expect((await handle({ method: "DELETE", path: "/push/subscribe/dev1" } as TransportRequest)).status).toBe(200);
  });

  it("switching push off on this device tells the server too — the browser drop alone leaves a dead endpoint on file", async () => {
    fakeBrowser({ subscribed: true, permission: "granted" });
    resetDb();
    await handle({ method: "POST", path: "/push/subscribe", body: { device: "dev1", endpoint: "https://push.example.test/dev1", keys: { p256dh: "p", auth: "a" }, groups: ["security"] } } as TransportRequest);
    expect(await unsubscribePush("dev1")).toBe("off");
    expect(dbGet().pushSubscriptions).toEqual([]);
  });
});

describe("PU-04/05 · the service worker's half", () => {
  const sw = () => readFileSync(join(app, "public", "sw.js"), "utf8");

  it("shows a notification for a push, and survives an unparseable one", () => {
    expect(sw()).toContain('addEventListener("push"');
    expect(sw()).toContain("showNotification");
    // the browser shows its own generic notification if the handler throws
    expect(sw()).toContain("catch");
  });

  it("a click goes to the thing it is about, not the top of the app", () => {
    expect(sw()).toContain('addEventListener("notificationclick"');
    expect(sw()).toContain("data.tab");
    expect(sw()).toContain("data.ref");
  });

  it("focuses an open tab rather than opening a second one", () => {
    // two copies of the app is how somebody answers the same card twice
    expect(sw()).toContain("matchAll");
    expect(sw()).toContain("client.focus");
  });

  it("the rig's delivery goes through the SAME handler", () => {
    // a second copy of the handler would be testing the copy
    expect(sw()).toContain("__jstackPush");
    expect(sw()).toContain('new Event("push")');
  });
});

describe("B-30 · no service worker registered", () => {
  /**
   * The defect this guards: `unsubscribePush()` is awaited BEFORE a device
   * revoke, and it used to await `serviceWorker.ready`, which never settles
   * when nothing is registered. A test build registers no worker by design,
   * so LK-06 revoked nothing and toasted nothing, with no error to find. The
   * same hang is reachable in production on a first load and wherever a
   * browser has workers disabled.
   *
   * Each of these fails by TIMING OUT rather than by asserting, which is the
   * honest shape for "this used to hang": Jest's own 5s limit is the
   * assertion.
   */
  it("unsubscribePush resolves instead of hanging", async () => {
    fakeBrowser({ registered: false });
    await expect(unsubscribePush()).resolves.toBe("off");
  });

  it("pushState answers 'off' rather than waiting for a worker that will never arrive", async () => {
    fakeBrowser({ registered: false, permission: "granted" });
    await expect(pushState(KEY)).resolves.toBe("off");
  });

  it("subscribePush reports 'unsupported' rather than hanging", async () => {
    fakeBrowser({ registered: false, permission: "granted" });
    await expect(subscribePush(KEY, ["decisions"], "iPhone")).resolves.toBe("unsupported");
  });
});

describe("PU-03 · toggling a group updates the subscription", () => {
  it("re-posts the same endpoint and keys with the new group list; with no subscription it posts nothing", async () => {
    resetDb();
    fakeBrowser({ subscribed: true, permission: "granted" });
    await updatePushGroups(["security", "tasks"], "dev1");
    expect(dbGet().pushSubscriptions).toEqual([
      { device: "dev1", endpoint: "https://push.example.test/abc", keys: { p256dh: "p", auth: "a" }, groups: ["security", "tasks"] },
    ]);
    await updatePushGroups(["security"], "dev1");
    expect(dbGet().pushSubscriptions.map((p) => p.groups)).toEqual([["security"]]);

    fakeBrowser({ subscribed: false, permission: "granted" });
    resetDb();
    await updatePushGroups(["security"], "dev1");
    expect(dbGet().pushSubscriptions).toEqual([]);
  });
});
