/**
 * P-1 — the app installs, and it opens when the server does not.
 *
 * This one is different from every other spec here: it must run against the
 * PRODUCTION build, because the test build deliberately does not register a
 * service worker (a worker serving Playwright a cached shell between specs
 * would turn every timing question into a flake). The rig that serves the
 * prod export is `tools/serve-web.mjs --prod`.
 *
 * The check that matters is the last one: stop the server, reload, and the
 * shell still comes up. Everything before it is the configuration that makes
 * that possible, asserted where it actually ships rather than where it was
 * written.
 */
// GL-A (audit A-7): from the helpers, not the package. The helpers' `test`
// carries the console guard; the bare fixture silently opts out of it, which
// is how this spec ran outside the console budget for a whole build.
import { expect, expectOffline, test } from "../helpers";

/**
 * Runs in the ordinary lane against the test build, because the manifest, the
 * head tags and the CSP are injected by `tools/build-web.mjs` into BOTH
 * flavours — so this checks what actually ships.
 *
 * The service worker is deliberately absent from the test build (a worker
 * serving Playwright a cached shell between specs turns every timing question
 * into a flake), so the two specs that need one SKIP and say why. To run them
 * for real:
 *
 *   pnpm build:web:prod
 *   JSTACK_DIST=~/.jstack-dist-prod node tools/serve-web.mjs 8788
 *   JSTACK_PROD_URL=http://127.0.0.1:8788 npx playwright test e2e/core/pwa.spec.ts
 *
 * A red test for running the wrong build teaches nothing; a skip that names
 * the build teaches the reader what to do. The skip is on IS_PROD — a fact
 * known before the page loads — never on hasWorker, which is false for the
 * first second of every run and made these two skip ALWAYS (audit A-1).
 */
const IS_PROD = process.env.JSTACK_PROD_URL != null;
const BASE = process.env.JSTACK_PROD_URL ?? "http://localhost:4173";

async function hasWorker(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => navigator.serviceWorker != null && navigator.serviceWorker.getRegistrations().then((r) => r.length > 0));
}

test.describe("P-1 / PW-01 / PW-03 the manifest and the head", () => {
  test("the manifest is linked, served, and says what app.json says", async ({ page }) => {
    await page.goto(BASE);
    const href = await page.getAttribute('link[rel="manifest"]', "href");
    expect(href).toBe("/manifest.webmanifest");

    const res = await page.request.get(`${BASE}/manifest.webmanifest`);
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as { name: string; display: string; icons: { sizes: string }[] };
    expect(manifest.name).toBe("JSTACK");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((i) => i.sizes).sort()).toEqual(["192x192", "512x512"]);
  });

  test("theme-color is declared per scheme, and the icons are really there", async ({ page }) => {
    await page.goto(BASE);
    // the browser chrome should match the ground the app is painting, not
    // one of the two
    expect(await page.locator('meta[name="theme-color"][media*="light"]').count()).toBe(1);
    expect(await page.locator('meta[name="theme-color"][media*="dark"]').count()).toBe(1);
    for (const size of [192, 512]) {
      const res = await page.request.get(`${BASE}/icons/icon-${size}.png`);
      expect(res.ok()).toBe(true);
      expect(res.headers()["content-type"]).toContain("image/png");
    }
  });

  test("the CSP that ships names no origin but its own — and loopback only in the test flavour", async ({ page }) => {
    await page.goto(BASE);
    const csp = (await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', "content")) ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");

    // SEC-09. The TEST flavour allows loopback so the e2e rig and the swap
    // proof can reach a local server; production allows nothing. Asserting
    // "no origin at all" against the test build was asserting the wrong
    // build's policy — the check that means something on both is that no
    // origin outside this machine is ever named.
    const origins = [...csp.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0]);
    const external = origins.filter((o) => !/(127\.0\.0\.1|localhost)/.test(o));
    expect(external).toEqual([]);
    if (IS_PROD) expect(origins).toEqual([]);
  });
});

test.describe("P-1 / PW-02 the service worker", () => {
  test("registers in production, and deliberately does NOT in the test build", async ({ page }) => {
    await page.goto(BASE);
    if (IS_PROD) {
      await expect.poll(async () => hasWorker(page), { timeout: 10000 }).toBe(true);
      return;
    }
    // Not a weaker check — a different one, and one worth making. A worker in
    // the test build would serve Playwright a cached shell between specs and
    // turn every timing question into a flake, so its ABSENCE here is the
    // contract (SEC-01's sibling: the test build carries what production must
    // not, and must not carry what production does).
    await page.waitForTimeout(500);
    expect(await hasWorker(page)).toBe(false);
  });

  test("the shell opens with the server stopped — the whole point", async ({ page, context }) => {
    // PW-A (audit A-1): the skip is on WHICH BUILD is being served — a fact
    // known before the page loads — never on `hasWorker`, which is false for
    // the first second of every run because registration is asynchronous.
    // Skipping on that raced, so this test never ran and PW-02 read PASS.
    test.skip(!IS_PROD, "the service worker ships only in the production build — see the note at the top for the three commands");
    await page.goto(BASE);
    // now it must appear: a missing worker on the prod build is a FAILURE
    await expect.poll(() => hasWorker(page), { timeout: 10000 }).toBe(true);
    // let the worker install and take the page
    await page.waitForFunction(() => navigator.serviceWorker.controller != null, undefined, { timeout: 10000 });

    // Offline at the BROWSER, which is what a tunnel looks like: the socket
    // is gone, not the origin. If the shell comes back, it came from the
    // worker's cache.
    // the browser will complain about every asset it can no longer fetch;
    // that is the condition of this test, declared rather than ignored
    expectOffline(page);
    await context.setOffline(true);
    await page.reload();

    // `#root, body` matched two elements and threw on strict mode — the test
    // could never have passed, and nobody found out because it always skipped.
    // The claim is CD-11's: the GATE renders, so #root has content in it. A
    // visible <body> is true of the browser's own error page too.
    await expect(page.locator("#root")).toBeVisible();
    await expect
      .poll(() => page.locator("#root").evaluate((el) => el.childElementCount), { timeout: 10000 })
      .toBeGreaterThan(0);
    // "the shell opened" and "the app rendered" are different claims, and this
    // is the second one: a real surface with real testIDs, not a mounted div.
    // Before C-6 this reached an EMPTY #root — the bundle ran, `useAppFonts()`
    // never resolved because the five faces under /assets/ were not precached,
    // and RootLayout returned null. Not the gate: the session persists from the
    // online load, so what comes back is the app, already unlocked.
    await expect(page.getByTestId("tab-today")).toBeVisible();
    expect(await page.locator("[data-testid]").count()).toBeGreaterThan(5);

    await context.setOffline(false);
  });

  test("never caches an API response", async ({ page }) => {
    test.skip(!IS_PROD, "the service worker ships only in the production build — see the note at the top for the three commands");
    await page.goto(BASE);
    await expect.poll(() => hasWorker(page), { timeout: 10000 }).toBe(true);
    await page.waitForFunction(() => navigator.serviceWorker.controller != null, undefined, { timeout: 10000 });
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const urls: string[] = [];
      for (const name of names) {
        const keys = await (await caches.open(name)).keys();
        urls.push(...keys.map((k) => k.url));
      }
      return urls;
    });
    // a cached answer to "what is on my plate today" is worse than no answer
    expect(cached.filter((u) => u.includes("/api/"))).toEqual([]);
  });
});
