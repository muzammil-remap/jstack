/**
 * SH-06..SH-10, CD-14 — the hardening pass (H-1).
 *
 * Each of these is a hole somebody could walk through if nobody had looked.
 * None of them is theoretical: the locked-write one is `B8-01` reopened at a
 * lower level, and the text-only one is the difference between an EA that
 * writes a sentence and an EA that writes markup.
 */
import { richRuns } from "@/lib/richText";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ApiAdapter, ContractError } from "@/data/ApiAdapter";
import { get as dbGet, reset } from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { mockTransport } from "@/data/transport/mock";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { validate as appValidate } from "@/data/mock/schemaValidate";
import { LockedError, setLockSource } from "@/lib/lockGate";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAdapter, getOutbox } from "@/data/provider";
import { isQueued } from "@/data/transport/outbox";
import { webAuthnAvailable } from "@/lib/webauthnGate";
import { useSessionStore } from "@/stores/session";
import { installSync } from "@/lib/syncInstall";
import { getAccessToken, setTokens } from "@/lib/authTokens";
import { Platform } from "react-native";
import { encryptedGet, wipeCount } from "@/lib/encryptedStore";
import { wipeThisDevice } from "@/lib/emergencyWipe";
import type { TransportRequest } from "@/data/transport/Transport";

const app = join(__dirname, "..", "..");

beforeEach(() => reset());
afterEach(() => setLockSource(() => false));

describe("CD-14 · a locked session writes nothing", () => {
  const adapter = () => new ApiAdapter(mockTransport);

  it("refuses a write, and the record is untouched", async () => {
    const before = JSON.stringify(dbGet().tasks);
    setLockSource(() => true);

    await expect(adapter().patchTask("t1", { title: "changed while locked" })).rejects.toBeInstanceOf(LockedError);
    expect(JSON.stringify(dbGet().tasks)).toBe(before);
  });

  it("refuses EVERY write verb, not just the one somebody remembered", async () => {
    setLockSource(() => true);
    const a = adapter();
    await expect(a.postJournal({ text: "x", source: "typed" })).rejects.toBeInstanceOf(LockedError);
    await expect(a.postHabitLog("h1", "2026-09-07", true)).rejects.toBeInstanceOf(LockedError);
    await expect(a.postTask({} as never)).rejects.toBeInstanceOf(LockedError);
    await expect(a.putQuietHours({ start: "22:00", end: "07:00", exceptions: [] })).rejects.toBeInstanceOf(LockedError);
  });

  it("still allows reads — a locked screen that cannot read cannot say why it locked", async () => {
    setLockSource(() => true);
    await expect(adapter().getToday()).resolves.toBeDefined();
  });

  it("still allows the routes that END the lock", async () => {
    // refusing these would be a lock with no key
    setLockSource(() => true);
    await expect(adapter().getAuthNonce()).resolves.toBeDefined();
    await expect(adapter().refreshAuth()).resolves.toBeDefined();
  });

  it("the refusal is a THROW, not a silent no-op", async () => {
    // a caller that believes its write succeeded will tell the person it did
    setLockSource(() => true);
    let threw = false;
    try {
      await adapter().postJournal({ text: "x", source: "typed" });
    } catch (e) {
      threw = true;
      expect((e as Error).message).toContain("locked");
    }
    expect(threw).toBe(true);
  });

  it("a synthetic click behind the gate writes nothing", async () => {
    // B8-01 at a lower level: `inert` is a browser affordance and a
    // dispatched event is not a browser gesture. The pointer, the keyboard
    // and `element.click()` all end up at the adapter, which is why the check
    // is there and not in the component.
    setLockSource(() => true);
    const before = JSON.stringify(dbGet());
    const a = adapter();
    await Promise.allSettled([
      a.postJournal({ text: "typed behind the gate", source: "typed" }),
      a.patchTask("t1", { status: "done" }),
      a.postActionVerb("c1", { verb: "approve", option: 1 }),
    ]);
    expect(JSON.stringify(dbGet())).toBe(before);
  });
});

describe("SH-09 · a device the server signed out", () => {
  it("the rig route emits a session event and the server refuses afterwards", async () => {
    const res = await handle({ method: "POST", path: "/__test__/revoke" } as TransportRequest);
    expect(res.status).toBe(200);
    // the server is locked now: /session is not on its unlocked list
    expect((await handle({ method: "GET", path: "/session" } as TransportRequest)).status).toBe(401);
  });

  it("the locked screen has a sentence for it that is not the passkey one", () => {
    // telling somebody to try a passkey that cannot work is a lie
    const screen = readFileSync(join(app, "components", "chrome", "LockedScreen.tsx"), "utf8");
    expect(screen).toContain("This device was signed out.");
    expect(screen).toContain("locked-signed-out");
    expect(screen).toContain("signedOut ?");
  });

  it("the handler clears the tokens as well as locking", () => {
    const events = readFileSync(join(app, "lib", "serverEvents.ts"), "utf8");
    expect(events).toContain("clearTokens");
    expect(events).toContain("signedOut: true");
  });
});

describe("SH-06 · EA-authored text is rendered as TEXT", () => {
  /** Every component file, so a new one cannot opt out by being new. */
  function componentFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) out.push(full);
      }
    };
    for (const d of ["components", "app", "layout", "theme"]) walk(join(app, d));
    return out;
  }

  it("nothing anywhere reaches for an HTML injection path", () => {
    // The EA writes `why`, `text`, `quote`, `report.body` and proposal text.
    // Every one of those is a string a model produced, and the only safe
    // thing to do with a string a model produced is to print it. `RichText`
    // exists so <b> can survive; it parses, it does not inject.
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      const text = readFileSync(file, "utf8");
      for (const pattern of [/dangerouslySetInnerHTML/, /\.innerHTML\s*=/, /insertAdjacentHTML/, /document\.write\s*\(/]) {
        if (pattern.test(text)) offenders.push(`${file.slice(app.length + 1)}: ${pattern.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the check is not vacuous — it reads a real number of files", () => {
    expect(componentFiles().length).toBeGreaterThan(60);
  });

  it("RichText parses a bounded set of tags rather than rendering markup", () => {
    const rich = readFileSync(join(app, "lib", "richText.tsx"), "utf8");
    // it must be a PARSER: a whitelist it walks, not a string it hands to a
    // renderer. The bold tag is the only one the EA is allowed.
    expect(rich).toMatch(/<b>|"b"|'b'/);
    expect(rich).not.toContain("dangerouslySetInnerHTML");
    expect(rich).not.toContain("innerHTML");
  });

  /**
   * B-11 — "printed, never interpreted" has a third option nobody asked for,
   * and C-4 shipped it: DELETED.
   *
   * `richRuns` ran every plain part through `stripTags`, which removes any
   * `<...>`. That was harmless while the only caller was Brain's proposals,
   * whose fixture text is prose with `<b>`. C-4 routed `TextBlock` — the
   * block an EA-proposed section is made of — through the same function to
   * bind its middle dots, and inherited the deletion with it. SH-06's e2e
   * caught it: a section whose text was `<img …> then <script>…</script>`
   * rendered as " then document.title=\"pwned\" and bold".
   *
   * Nothing ever executed; the string was still a string. But silently
   * dropping characters is worse than either of the two options the rule
   * names, because the reader cannot tell it happened — `a <b if x` loses
   * three characters and still reads like a sentence. Only `<b>…</b>` is
   * markup here; every other angle bracket is a character somebody typed.
   */
  it("a tag that is not <b> is PRINTED, not quietly deleted (B-11)", () => {
    expect(richRuns("<script>alert(1)</script>")).toEqual([{ text: "<script>alert(1)</script>", bold: false }]);
    expect(richRuns("a < b and c > d")).toEqual([{ text: `a < b and c > d`, bold: false }]);
    // the pair that IS markup still becomes weight, in the same string
    expect(richRuns("<i>keep</i> and <b>bold</b>")).toEqual([
      { text: "<i>keep</i> and ", bold: false },
      { text: "bold", bold: true },
    ]);
  });

  it("RichText binds the middle dot and an emphasised value to their neighbours (ux-review R3-04)", () => {
    // Two of Brain's four proposals broke at every width: "under Work /
    // · jstack" started a line with the separator, and "Saturday as /
    // Personal" left the weight-500 value alone on its line. README Content:
    // meta lines use the middle dot "with spaces" between two things on ONE
    // line; checklist 5: no single-word orphan. The runs carry the binding.
    const NB = " ";
    // the fixture's own shape: the dot is INSIDE the emphasised run — the
    // first cut bound plain runs only and the frames still broke after "·"
    expect(richRuns('File "Moz discovery call" under <b>Work · jstack</b>')).toEqual([
      { text: 'File "Moz discovery call" under' + NB, bold: false },
      { text: `Work${NB}·${NB}jstack`, bold: true },
    ]);
    expect(richRuns('File "Moz discovery call" under <b>Work</b> · <b>jstack</b>')).toEqual([
      { text: 'File "Moz discovery call" under' + NB, bold: false },
      { text: "Work", bold: true },
      { text: `${NB}·${NB}`, bold: false },
      { text: "jstack", bold: true },
    ]);
    expect(richRuns("Label 3 captures from Saturday as <b>Personal</b>")).toEqual([
      { text: "Label 3 captures from Saturday as" + NB, bold: false },
      { text: "Personal", bold: true },
    ]);
    // plain prose is untouched, and a dot inside a plain run still binds.
    // The trailing "$5,400" is now bound to the word before it — see C-4
    // below, and `02_ACCEPTANCE_TESTS_v22.md` §4 (A-07).
    expect(richRuns("Steve's villa deposit is <b>$4,500</b>, not $5,400")).toEqual([
      { text: "Steve's villa deposit is" + NB, bold: false },
      { text: "$4,500", bold: true },
      { text: `, not${NB}$5,400`, bold: false },
    ]);
    expect(richRuns("voice · 8:31 · Telegram")).toEqual([{ text: `voice${NB}·${NB}8:31${NB}·${NB}Telegram`, bold: false }]);
  });

  /**
   * C-4 / CD-04 (UX-D carried from V2.1) — the LAST value never sits alone.
   *
   * Money's footer wrapped as "… feed: Redbark, / V2.1" at 1024 and 1366, and
   * read fine at 393 and 1920, which is why three review rounds walked past it.
   * The orphan rule (README checklist 5) had only ever been applied to the word
   * before an emphasised span, because that is where somebody noticed it first.
   * The rule is about the end of the line, so it belongs at the end of the run.
   */
  it("binds the final value of a run, so a footer cannot orphan it (UX-D)", () => {
    const NB = " ";

    // The exact footer from the frames: the dots bind, the last value binds,
    // and the space after "feed:" stays breakable — binding every space would
    // make the whole line unwrappable, which is a worse bug than the orphan.
    expect(richRuns(" · feed: Redbark, V2.1")).toEqual([{ text: `${NB}·${NB}feed: Redbark,${NB}V2.1`, bold: false }]);

    // a single-token run has nothing to bind, and must not gain a stray NBSP
    expect(richRuns("Personal")).toEqual([{ text: "Personal", bold: false }]);
    expect(richRuns("")).toEqual([]);

    // the binding is on the LAST run only — earlier runs keep their spaces,
    // or a long meta line would become one unbreakable string
    expect(richRuns("one two three four five")).toEqual([{ text: `one two three four${NB}five`, bold: false }]);
  });
});

describe("SH-10 · the two schema validators agree", () => {
  /**
   * There are two implementations of the same rules — `tools/schema-validate.mjs`
   * for the tools and `data/mock/schemaValidate.ts` for the app — because the
   * tools are dependency-free ES modules Metro cannot import and the app is
   * TypeScript a `.mjs` cannot import. Neither can use the other's.
   *
   * That duplication is only acceptable if something checks it. This runs both
   * over the same corpus and asserts they reach the same verdict; a
   * redundancy that is checked is a redundancy, and one that is not is a bug
   * waiting for the day they diverge.
   */
  const schemas = {
    Person: { type: "object", properties: { name: { type: "string" }, age: { type: "number" } }, required: ["name"] },
  };
  const corpus: [unknown, unknown][] = [
    [{ name: "a" }, { $ref: "#/components/schemas/Person" }],
    [{}, { $ref: "#/components/schemas/Person" }],
    [{ name: 1 }, { $ref: "#/components/schemas/Person" }],
    ["x", { type: "string" }],
    [5, { type: "string" }],
    ["open", { type: "string", enum: ["open", "done"] }],
    ["nope", { type: "string", enum: ["open", "done"] }],
    [[1, 2], { type: "array", items: { type: "number" } }],
    [[1], { type: "array", items: { type: "number" }, minItems: 2 }],
    [null, { type: "string", nullable: true }],
    [{ a: 1 }, {}],
    [{ a: 1, b: 2 }, { type: "object", properties: { a: { type: "number" } }, additionalProperties: false }],
    [{ verb: "later" }, { oneOf: [{ type: "object", properties: { verb: { enum: ["later"] } }, required: ["verb"] }, { type: "string" }] }],
  ];

  it("the same verdict on every case", () => {
    // one child process for the whole corpus, not one per case (B-20)
    const url = pathToFileURL(join(app, "tools", "schema-validate.mjs")).href;
    const script = [
      `const V = await import(${JSON.stringify(url)});`,
      `const corpus = ${JSON.stringify(corpus)};`,
      `const schemas = ${JSON.stringify(schemas)};`,
      `console.log(JSON.stringify(corpus.map(([v, s]) => V.validate(v, s, schemas))));`,
    ].join("");
    const fromTool = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: app, encoding: "utf8" })) as unknown[][];
    const fromApp = corpus.map(([value, schema]) => appValidate(value, schema, schemas));

    expect(fromApp).toEqual(fromTool);
    // and the corpus must contain both verdicts, or "they agree" is vacuous
    expect(fromApp.some((e) => e.length === 0)).toBe(true);
    expect(fromApp.some((e) => e.length > 0)).toBe(true);
  });
});

/**
 * Josh's A-0 row 5 (NEEDS_JOSH, SEC): two capabilities existed and nothing
 * called them. The emergency lock now wipes THIS DEVICE's local cache — the
 * encrypted store and the outbox queue — and only that: the server's records
 * are untouched, per the brief ("someone has my phone" is a device problem).
 * The gate now asks whether the browser can do a passkey at all before it
 * offers one.
 */
describe("AG-12 / SEC · the emergency lock wipes this device's cache, and nothing else", () => {
  beforeEach(async () => {
    // the mock's lock is module state that SH-09's revoke above leaves set and
    // `reset()` does not touch: recover through the server's own route first
    await handle({ method: "POST", path: "/recover", body: { recoveryKey: "k", nonce: "n", biometricAssertion: "b" } } as TransportRequest);
    useSessionStore.setState({ locked: false, emergency: false, online: true });
  });
  afterEach(async () => {
    useSessionStore.setState({ locked: false, emergency: false, online: true });
    await AsyncStorage.clear();
  });

  it("after POST /lock succeeds: the local store is empty, the queue is empty, the server's records are what they were", async () => {
    await AsyncStorage.setItem("jstack.some.cache", "bytes that live on the device");
    useSessionStore.setState({ locked: false, online: false });
    const res = await getAdapter().postBrainDump({ text: "captured, then the phone was stolen", source: "typed" });
    expect(isQueued(res)).toBe(true);
    expect(await getOutbox().entries()).toHaveLength(1);
    useSessionStore.setState({ online: true });
    const serverBefore = JSON.stringify(dbGet().brainItems);

    await useSessionStore.getState().lock("nonce-1", "assertion-1");

    expect(useSessionStore.getState()).toMatchObject({ locked: true, emergency: true });
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
    expect(await getOutbox().entries()).toEqual([]);
    expect(JSON.stringify(dbGet().brainItems)).toBe(serverBefore);
  });

  it("a lock the server refuses wipes nothing — the device is not emptied on a failed request", async () => {
    await AsyncStorage.setItem("jstack.some.cache", "still here");
    useSessionStore.setState({ locked: false, online: true });
    // 403 — the high-risk assertion is missing — not 401: the server was not locked
    await expect(useSessionStore.getState().lock("", "")).rejects.toMatchObject({ status: 403 });
    expect(await AsyncStorage.getAllKeys()).toEqual(["jstack.some.cache"]);
    expect(useSessionStore.getState().emergency).toBe(false);
  });

  /** polls: the retry runs from a subscription, after the call that triggered it has returned */
  async function until(done: () => boolean, ms = 3000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  it("WPF-4: a server that cannot be reached still locks this device at once, and wipes nothing", async () => {
    await AsyncStorage.setItem("jstack.some.cache", "bytes that stay until the server confirms");
    useSessionStore.setState({ locked: false, online: true });
    const post = jest.spyOn(getAdapter(), "postLock").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    try {
      await useSessionStore.getState().lock("nonce-1", "assertion-1");
      expect(useSessionStore.getState()).toMatchObject({ locked: true, emergency: true });
      expect(await AsyncStorage.getItem("jstack.some.cache")).toBe("bytes that stay until the server confirms");
      // remembered across a reload: the server has not been told
      expect(await encryptedGet("jstack.lock.unconfirmed")).toBe("1");
    } finally {
      post.mockRestore();
    }
  });

  it("WPF-4: the retry on reconnect tells the server with the press's own assertion, once, and only then wipes", async () => {
    await AsyncStorage.setItem("jstack.some.cache", "bytes that stay until the server confirms");
    useSessionStore.setState({ locked: false, online: false });
    const post = jest.spyOn(getAdapter(), "postLock").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const stop = installSync();
    try {
      await useSessionStore.getState().lock("nonce-1", "assertion-1");
      useSessionStore.setState({ online: true });
      await until(() => post.mock.calls.length === 2);
      await until(() => useSessionStore.getState().locked && post.mock.calls.length === 2);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(post).toHaveBeenLastCalledWith({ nonce: "nonce-1", biometricAssertion: "assertion-1" });
      expect(await AsyncStorage.getAllKeys()).toEqual([]);

      useSessionStore.setState({ online: false });
      useSessionStore.setState({ online: true });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      stop();
      post.mockRestore();
    }
  });

  // v2.3's WP-F merge into WP-A: WPF-4's lock retry and A-3b's tab reload are two subscriptions to the same
  // online edge in `lib/syncInstall.ts`. A merge that kept one and dropped the other would stay green in each
  // package's own file, and leave either the server untold or "· offline" on screen.
  it("WPF-4 and A-3b: one reconnect runs both — the lock the server was never told about is told, and the planning tabs reload", async () => {
    useSessionStore.setState({ locked: false, online: false });
    const post = jest.spyOn(getAdapter(), "postLock").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const today = jest.spyOn(getAdapter(), "getToday");
    const stop = installSync();
    try {
      await useSessionStore.getState().lock("nonce-1", "assertion-1");
      today.mockClear();
      useSessionStore.setState({ online: true });
      await until(() => post.mock.calls.length === 2 && today.mock.calls.length > 0);
      expect({ lockTold: post.mock.calls.length === 2, tabsReloaded: today.mock.calls.length > 0 }).toEqual({ lockTold: true, tabsReloaded: true });
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      stop();
      post.mockRestore();
      today.mockRestore();
    }
  });
  it("WPF-4: the wipe after a confirmed lock takes the refresh token and the access token too (finding 5)", async () => {
    // the keychain is the native half (SEC-05) — a web session is a cookie the server ends
    const os = Platform.OS;
    Platform.OS = "ios";
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const keychain = (require("expo-secure-store") as { __store: Map<string, string> }).__store;
      await setTokens({ accessToken: "an-access-token", refreshToken: "a-refresh-token", accessTtlSeconds: 900 });
      expect(keychain.get("jstack.auth.refresh")).toBe("a-refresh-token");
      useSessionStore.setState({ locked: false, online: true });
      await useSessionStore.getState().lock("nonce-1", "assertion-1");
      expect(keychain.has("jstack.auth.refresh")).toBe(false);
      expect(getAccessToken()).toBeNull();
    } finally {
      Platform.OS = os;
    }
  });

  it("WPA-14: the wipe counts itself before it clears the queue, so a capture still being sealed cannot land after the clear", async () => {
    const before = wipeCount();
    let countAtClear = before;
    const clear = jest.spyOn(getOutbox(), "clear").mockImplementation(async () => {
      countAtClear = wipeCount();
    });
    try {
      await wipeThisDevice();
    } finally {
      clear.mockRestore();
    }
    expect({ countedBeforeTheQueueWasCleared: countAtClear > before }).toEqual({ countedBeforeTheQueueWasCleared: true });
  });
});

describe("SEC-02 · the gate asks whether a passkey is possible before offering one", () => {
  const g = globalThis as { PublicKeyCredential?: unknown; navigator?: unknown };
  const saved = { pkc: g.PublicKeyCredential, nav: g.navigator };
  afterEach(() => {
    g.PublicKeyCredential = saved.pkc;
    g.navigator = saved.nav;
  });

  it("webAuthnAvailable is false with no PublicKeyCredential or no credentials API, true with both", async () => {
    delete g.PublicKeyCredential;
    g.navigator = {};
    expect(await webAuthnAvailable()).toBe(false);
    g.PublicKeyCredential = function () {};
    expect(await webAuthnAvailable()).toBe(false);
    g.navigator = { credentials: {} };
    expect(await webAuthnAvailable()).toBe(true);
  });

  it("the gate carries one honest sentence for it, and asks before any tap", () => {
    const gate = readFileSync(join(app, "components", "chrome", "Gate.tsx"), "utf8");
    expect(gate).toContain("webAuthnAvailable()");
    expect(gate).toContain("NO_PASSKEY_SUPPORT");
    expect(gate).toMatch(/useEffect\([\s\S]*webAuthnAvailable\(\)/);
  });
});
