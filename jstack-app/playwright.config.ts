import { defineConfig } from "@playwright/test";

/**
 * L4 e2e/visual rig — runs against the static Expo web export served on
 * :4173. Build first: pnpm build:web (outputs ~/.jstack-dist).
 * tools/serve-web.mjs serves that export.
 *
 * V2 (row 5, ADR-05): eight projects, `w{393,1024,1366,1920}-{light,dark}`
 * — the four widths theme/useLayout.ts's breakpoint table cares about
 * (393 phone/1col, 1024 rail/2col, 1366 and 1920 rail/3col), crossed with
 * both colour schemes (the app defaults to Auto, so the emulated scheme
 * drives it — GL-02/GL-03). `e2e/core/**` (behaviour specs) run ONLY on
 * `w393-light` and `w1366-light` — one phone-shaped run, one desktop-
 * shaped run, enough to prove behaviour without paying for all eight.
 * `e2e/matrix/**` (layout, theme, density specs — the ones that actually
 * need every width × scheme) run on all eight.
 *
 * workers:4 + fullyParallel (kept from v1.2, BUGLOG A-19): every test owns
 * its own browser context, localStorage and CDP virtual authenticator, so
 * this is safe. There was a second, serial `@timing` lane for
 * timing-sensitive tests (toast auto-dismiss, undo-window expiry); no test
 * was ever tagged for it in the whole V2 build, so S-7 removed it (CD-02).
 * `tools/run-e2e.mjs` is one invocation now; if a test genuinely needs to
 * run serially, bring the lane back together with that test.
 */
const WIDTHS = [
  { key: "w393", viewport: { width: 393, height: 830 }, touch: true },
  { key: "w1024", viewport: { width: 1024, height: 768 }, touch: true },
  { key: "w1366", viewport: { width: 1366, height: 900 }, touch: false },
  { key: "w1920", viewport: { width: 1920, height: 1080 }, touch: false },
] as const;

const CORE_PROJECTS = new Set(["w393-light", "w1366-light"]);

/**
 * Core specs run at 393 and 1366. S-2b's `textentry` is the one that needs
 * a third width: UX-01..03 says the expanded editor is proven "at 393 and
 * 1024 with the keyboard-inset rig, and at 1366", because 1024 is the
 * widest touch viewport — still below the 1180 desktop breakpoint, so it
 * expands, but with far more room than a phone. Rather than promote every
 * core spec to a third project (four minutes of board time for one file),
 * this one spec is added to w1024-light.
 */
const EXTRA_CORE: Record<string, RegExp[]> = {
  "w1024-light": [/core\/textentry\.spec\.ts/],
};

const projects = WIDTHS.flatMap((w) =>
  (["light", "dark"] as const).map((scheme) => {
    const name = `${w.key}-${scheme}`;
    return {
      name,
      testMatch: CORE_PROJECTS.has(name) ? [/core\/.*\.spec\.ts/, /matrix\/.*\.spec\.ts/] : [/matrix\/.*\.spec\.ts/, ...(EXTRA_CORE[name] ?? [])],
      use: {
        browserName: "chromium" as const,
        viewport: { ...w.viewport },
        hasTouch: w.touch,
        colorScheme: scheme,
        // D-1 (ADR-47, resolution #53): every copy pin in the suite — "Friday
        // 4 September", "9:00am", a due label — is now a function of the
        // BROWSER's zone, because that is what the app formats in. Unpinned,
        // the whole suite would pass on a Brisbane laptop and fail on a UTC
        // runner, which is the class of bug TZ-01 exists to prevent, moved out
        // of the app and into the harness. `timezone.spec.ts` overrides its own
        // contexts, which is the only place a different zone is the point.
        timezoneId: "Australia/Brisbane",
      },
    };
  }),
);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts",
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  // dot for a cheap full-board run; targeted single-spec runs pass
  // --reporter=list on the CLI (overrides this)
  reporter: [["dot"]],
  use: {
    baseURL: "http://localhost:4173", // WebAuthn needs a domain origin — 127.0.0.1 is refused (SEC-02 rig)
    trace: "retain-on-failure",
    // OS-WebAuthn kill switch: on Windows, Chromium forwards platform-passkey
    // ceremonies to Windows Hello — a REAL dialog pops on the build machine
    // for any context missing a CDP virtual authenticator. Tests only ever
    // use the virtual environment, so the native path is disabled outright.
    launchOptions: {
      args: ["--disable-features=WebAuthenticationUseNativeWinApi,WebAuthnUseNativeWinApi,WebAuthenticationWindowsHello"],
    },
  },
  projects,
  // B-03: refuse to run against a bundle older than the source. The server
  // below serves a PREBUILT export and never builds one.
  globalSetup: require.resolve("./e2e/assert-fresh-build.ts"),
  webServer: {
    command: "node tools/serve-web.mjs 4173",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
