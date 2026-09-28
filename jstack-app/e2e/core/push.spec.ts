/**
 * PU-01..PU-05 (U-1) — push, in a browser.
 *
 * `tests/unit/push.test.ts` proves the states and the one prompt against a
 * fake browser. This file proves them on the real Settings sheet: the
 * sentence when the backend has no push service, a permission prompt that
 * arrives only from the switch, a subscription that carries the endpoint,
 * the keys and the groups (and follows a group toggle), a delivered push
 * that becomes a notification through the real service worker, and a
 * revoke that removes the revoked device's subscription — not this one's.
 *
 * The browser's push machinery is stubbed at the window (`installPushRig`)
 * for PU-01..03 and PU-05: a headless browser has no push service to mint a
 * subscription against, and the acceptance rows are about what the APP does
 * with one. PU-04 uses the REAL worker: it registers `/sw.js` itself — the
 * test build deliberately does not (P-1) — because the thing under test is
 * the worker's own handler.
 *
 * Written at Stage 4 A-0 (Josh's row 1): U-1 never wrote this file, and PU-05
 * sat PARTIAL for a stage on that account.
 */
import { calls, db, expect, gotoTab, openUnlocked, store, test } from "../helpers";

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__ and the push rig are test-only, untyped by design */
const rig = (page: import("@playwright/test").Page) => ({
  setCapability: (key: string, value: boolean) => page.evaluate(([k, v]) => (window as any).__JSTACK__.setCapability(k, v), [key, value] as const),
  asked: () => page.evaluate(() => (window as any).__pushRig.asked as number),
  subscribed: () => page.evaluate(() => (window as any).__pushRig.sub != null),
  biometricApprove: () => page.evaluate(() => (window as any).__JSTACK__.biometric.approve()),
  push: (payload: Record<string, unknown>) => page.evaluate((p) => (window as any).__JSTACK__.push(p), payload),
  adapterCall: (method: string, args: unknown[]) =>
    page.evaluate(
      async ([m, a]) => {
        try {
          await (window as any).__JSTACK__.getAdapter()[m](...(a as unknown[]));
          return { outcome: "ok" };
        } catch (e) {
          return { outcome: "error", status: (e as { status?: number }).status };
        }
      },
      [method, args] as const,
    ),
});

/**
 * A browser that CAN do push, counting how often it was asked. `Notification`
 * and `navigator.serviceWorker` are read-only accessors, so both are
 * `defineProperty`d; the fake registration hands out one subscription per
 * `subscribe()` and forgets it on `unsubscribe()`.
 */
async function installPushRig(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const state: { asked: number; sub: unknown } = { asked: 0, sub: null };
    class FakeSub {
      endpoint = "https://push.example.test/dev1";
      toJSON() {
        return { endpoint: this.endpoint, keys: { p256dh: "p256dh-dev1", auth: "auth-dev1" } };
      }
      async unsubscribe() {
        state.sub = null;
        return true;
      }
    }
    const reg = {
      active: null,
      pushManager: {
        getSubscription: async () => state.sub,
        subscribe: async () => (state.sub = new FakeSub()),
      },
    };
    const notification = {
      permission: "default",
      requestPermission: async () => {
        state.asked += 1;
        notification.permission = "granted";
        return "granted";
      },
    };
    Object.defineProperty(window, "Notification", { configurable: true, value: notification });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: async () => reg, ready: Promise.resolve(reg), register: async () => reg },
    });
    (window as any).__pushRig = state;
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function openSettings(page: import("@playwright/test").Page) {
  const rail = page.getByTestId("rail-settings");
  if (await rail.count()) await rail.click();
  else await page.getByTestId("header").getByLabel("Settings").click();
  await expect(page.getByTestId("settings-sheet")).toBeVisible();
  await page.getByTestId("push-row").scrollIntoViewIfNeeded();
}

/** the group ids with any device ticked — what the subscription must carry */
async function wantedGroups(page: import("@playwright/test").Page): Promise<string[]> {
  const settings = await store(page, "settings");
  return (settings.notificationGroups as { id: string; devices: Record<string, boolean> }[]).filter((g) => Object.values(g.devices).some(Boolean)).map((g) => g.id);
}

test.describe("PU-01 the sentence when the backend has no push service", () => {
  test("says push needs the backend, shows no switch, and asks the browser nothing", async ({ page }) => {
    await installPushRig(page);
    await openUnlocked(page);
    await rig(page).setCapability("pushPublicKey", false);
    await openSettings(page);
    await expect(page.getByTestId("push-state")).toContainText("push needs the backend");
    await expect(page.getByTestId("push-switch")).toHaveCount(0);
    expect(await rig(page).asked()).toBe(0);

    // and with a key the switch is offered, still without asking
    await rig(page).setCapability("pushPublicKey", true);
    await expect(page.getByTestId("push-switch")).toBeVisible();
    await expect(page.getByTestId("push-state")).toContainText("off");
    expect(await rig(page).asked()).toBe(0);
  });
});

test.describe("PU-02 the prompt comes from the switch and nowhere else", () => {
  test("opening the app, the tabs and Settings asks nothing; the switch asks once", async ({ page }) => {
    await installPushRig(page);
    await openUnlocked(page);
    for (const tab of ["tasks", "brain", "life", "agents", "today"] as const) await gotoTab(page, tab);
    await openSettings(page);
    expect(await rig(page).asked()).toBe(0);

    await page.getByTestId("push-switch").click();
    await expect(page.getByTestId("push-state")).toContainText("on");
    expect(await rig(page).asked()).toBe(1);
    expect(await rig(page).subscribed()).toBe(true);
  });
});

test.describe("PU-03 the subscription carries the endpoint, the keys and the groups", () => {
  test("POST /push/subscribe is the device id, the endpoint, the keys and the ticked groups; a group toggle re-posts", async ({ page }) => {
    await installPushRig(page);
    await openUnlocked(page);
    await openSettings(page);
    await page.getByTestId("push-switch").click();
    await expect(page.getByTestId("push-state")).toContainText("on");

    const wanted = await wantedGroups(page);
    expect(wanted.length).toBeGreaterThan(0);
    const posted = (await calls(page)).filter((c) => c.method === "postPushSubscribe");
    expect(posted).toHaveLength(1);
    expect(posted[0].args[1]).toEqual({
      device: "dev1",
      endpoint: "https://push.example.test/dev1",
      keys: { p256dh: "p256dh-dev1", auth: "auth-dev1" },
      groups: wanted,
    });
    // the server holds it, by device id
    expect(((await db(page)).pushSubscriptions as { device: string; groups: string[] }[]).map((p) => [p.device, p.groups])).toEqual([["dev1", wanted]]);

    // toggle a group's phone column: the subscription follows
    const settings = await store(page, "settings");
    const group = (settings.notificationGroups as { id: string; devices: Record<string, boolean> }[]).find((g) => g.id !== "security")!;
    await page.getByTestId(`notif-${group.id}-iphone`).click();
    await expect.poll(async () => (await calls(page)).filter((c) => c.method === "postPushSubscribe").length).toBe(2);
    const after = await wantedGroups(page);
    const second = (await calls(page)).filter((c) => c.method === "postPushSubscribe")[1];
    expect(second.args[1]).toMatchObject({ device: "dev1", groups: after });
    expect(((await db(page)).pushSubscriptions as { device: string; groups: string[] }[])[0].groups).toEqual(after);
  });
});

test.describe("PU-04 a delivered push reaches the real worker's handler", () => {
  /**
   * What this proves: the rig's push goes through `/sw.js`'s OWN push handler
   * — the message → dispatched `push` event path `tests/unit/push.test.ts`
   * reads as text — and that handler asks for a notification carrying the
   * payload's title, body, tab and ref. The worker reports what it asked for
   * to the open page (`__jstackShown`).
   *
   * What it cannot prove, and says so: that the notification DISPLAYS. A
   * headless Chromium reports `Notification.permission` as "denied" whatever
   * the context grants (probed at A-0: `showNotification` throws "No
   * notification permission has been granted for this origin"), and a headed
   * browser cannot launch on the build machine. The display and the tap
   * (`notificationclick` → the named tab and card) are the five-minute phone
   * check in DEVICE_RUNBOOK_v21.md, and the handler text is asserted in the
   * unit suite.
   */
  test("the rig's push goes through /sw.js's own handler, which asks for the named notification", async ({ page }) => {
    await openUnlocked(page);
    // the test build registers no worker (P-1); the test does, because the
    // handler under test lives in the worker
    const active = await page.evaluate(async () => {
      (window as unknown as { __shown: unknown[] }).__shown = [];
      navigator.serviceWorker.addEventListener("message", (e) => {
        const shown = (e.data as { __jstackShown?: unknown } | null)?.__jstackShown;
        if (shown != null) (window as unknown as { __shown: unknown[] }).__shown.push(shown);
      });
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      return reg.active != null;
    });
    expect(active).toBe(true);
    try {
      const delivered = await rig(page).push({ title: "Ping from the rig", body: "one decision is waiting", tab: "tasks", ref: "t1" });
      expect(delivered).toEqual({ delivered: true });
      await expect.poll(async () => page.evaluate(() => (window as unknown as { __shown: unknown[] }).__shown)).toEqual([
        {
          title: "Ping from the rig",
          options: expect.objectContaining({ body: "one decision is waiting", tag: "t1", data: { tab: "tasks", ref: "t1" } }),
        },
      ]);
    } finally {
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.unregister();
      });
    }
  });
});

test.describe("PU-05 revoking a device removes ITS subscription", () => {
  test("revoking the iPad deletes dev2's subscription on the server and leaves this device subscribed", async ({ page }) => {
    await installPushRig(page);
    await openUnlocked(page);
    await openSettings(page);
    await page.getByTestId("push-switch").click();
    await expect(page.getByTestId("push-state")).toContainText("on");
    // the iPad subscribed too, as it would from its own browser
    expect(await rig(page).adapterCall("postPushSubscribe", [{ device: "dev2", endpoint: "https://push.example.test/dev2", keys: { p256dh: "p256dh-dev2", auth: "auth-dev2" }, groups: ["security"] }])).toEqual({ outcome: "ok" });
    expect(((await db(page)).pushSubscriptions as { device: string }[]).map((p) => p.device).sort()).toEqual(["dev1", "dev2"]);

    await page.getByTestId("devices-manage").click();
    await expect(page.getByTestId("devices-dialog")).toBeVisible();
    await rig(page).biometricApprove();
    await page.getByTestId("device-revoke-dev2").click();
    await expect(page.getByTestId("device-dev2")).toHaveCount(0);

    const deletes = (await calls(page)).filter((c) => c.method === "deletePushSubscription");
    expect(deletes.map((c) => c.args[0])).toEqual(["/push/subscribe/dev2"]);
    expect(((await db(page)).pushSubscriptions as { device: string }[]).map((p) => p.device)).toEqual(["dev1"]);
    // this browser's own subscription is untouched: revoking the iPad is
    // not a way to silence the phone in your hand
    expect(await rig(page).subscribed()).toBe(true);
  });
});
