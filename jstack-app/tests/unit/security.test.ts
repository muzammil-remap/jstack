/**
 * SEC-05, SEC-06, SEC-08 — the three security mechanisms named "Jest" in
 * `02_ACCEPTANCE_TESTS_v2.md` as their own proof, none of which had a test
 * before this row (found via a `QA_REPORT_v2.md` evidence pass: each
 * mechanism's own source-file comment claimed a test existed; none did).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/authTokens";
import { encryptedGet, encryptedSet } from "@/lib/encryptedStore";
import { guardTransport, registerPinVerifier, SPKI_PINS } from "@/data/pins";

const ORIGINAL_OS = Platform.OS;
afterEach(() => {
  Platform.OS = ORIGINAL_OS;
  registerPinVerifier(null);
  jest.useRealTimers();
});

describe("SEC-05 refresh token via SecureStore; access token in memory only", () => {
  it("native: setTokens writes the refresh token to SecureStore, not AsyncStorage", async () => {
    Platform.OS = "ios";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as { __store: Map<string, string> };
    await setTokens({ accessToken: "acc-1", refreshToken: "ref-1", accessTtlSeconds: 900 });
    expect(SecureStore.__store.get("jstack.auth.refresh")).toBe("ref-1");
    expect(await AsyncStorage.getItem("jstack.auth.refresh")).toBeNull();
    await clearTokens();
  });

  it("native: getRefreshToken reads it back from SecureStore", async () => {
    Platform.OS = "ios";
    await setTokens({ accessToken: "acc-2", refreshToken: "ref-2", accessTtlSeconds: 900 });
    expect(await getRefreshToken()).toBe("ref-2");
    await clearTokens();
    expect(await getRefreshToken()).toBeNull();
  });

  it("web: getRefreshToken always returns null (session-cookie auth, §9)", async () => {
    Platform.OS = "web";
    await setTokens({ accessToken: "acc-3", accessTtlSeconds: 900 });
    expect(await getRefreshToken()).toBeNull();
  });

  it("the access token is readable until its TTL, then gone — never persisted", async () => {
    jest.useFakeTimers();
    await setTokens({ accessToken: "acc-4", accessTtlSeconds: 60 });
    expect(getAccessToken()).toBe("acc-4");
    jest.advanceTimersByTime(61_000);
    expect(getAccessToken()).toBeNull();
  });

  it("clearTokens drops the in-memory access token immediately", async () => {
    Platform.OS = "ios";
    await setTokens({ accessToken: "acc-5", refreshToken: "ref-5", accessTtlSeconds: 900 });
    await clearTokens();
    expect(getAccessToken()).toBeNull();
  });
});

describe("SEC-08 pinning scaffold rejects a host whose certificate pin does not match", () => {
  it("blocks cleartext to a non-loopback host", async () => {
    await expect(guardTransport("http://jstack.example.com/api/v1/today")).rejects.toThrow(/cleartext blocked/);
  });

  it("allows cleartext to loopback (dev)", async () => {
    await expect(guardTransport("http://127.0.0.1:8787/api/v1/today")).resolves.toBeUndefined();
    await expect(guardTransport("http://localhost:8787/api/v1/today")).resolves.toBeUndefined();
  });

  it("allows https to an unpinned host (no SPKI_PINS entry) without a verifier", async () => {
    await expect(guardTransport("https://unpinned.example.com/api/v1/today")).resolves.toBeUndefined();
  });

  it("rejects when the injected verifier reports a pin mismatch", async () => {
    SPKI_PINS.push({ host: "jstack.example.com", pins: ["sha256/AAAA"] });
    try {
      registerPinVerifier(async () => false);
      await expect(guardTransport("https://jstack.example.com/api/v1/today")).rejects.toThrow(/certificate pin mismatch/);
    } finally {
      SPKI_PINS.length = 0;
    }
  });

  it("succeeds when the injected verifier confirms the pin", async () => {
    SPKI_PINS.push({ host: "jstack.example.com", pins: ["sha256/AAAA"] });
    try {
      registerPinVerifier(async () => true);
      await expect(guardTransport("https://jstack.example.com/api/v1/today")).resolves.toBeUndefined();
    } finally {
      SPKI_PINS.length = 0;
    }
  });

  it("D-6: fails closed when a host is pinned but no verifier is registered — never quietly unpinned", async () => {
    // The bug this guards: `if (pinned && nativeVerifier)` skipped enforcement
    // entirely when nativeVerifier was null, so a pinned host with no
    // verifier registered (every web build; a native build before the go-live
    // dev wiring runs) looked checked and was not.
    SPKI_PINS.push({ host: "jstack.example.com", pins: ["sha256/AAAA"] });
    try {
      // registerPinVerifier(null) is afterEach's own state, and is the state
      // under test here too — asserted, not merely assumed
      await expect(guardTransport("https://jstack.example.com/api/v1/today")).rejects.toThrow(/no pin verifier registered/i);
    } finally {
      SPKI_PINS.length = 0;
    }
  });
});

describe("SEC-06 persistent store encrypted; sens records unreadable at rest", () => {
  it("encryptedStore is the ONLY caller of AsyncStorage anywhere in the app", () => {
    const root = join(__dirname, "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (["node_modules", "dist", ".expo", "e2e", "tests", "tools", "evidence"].includes(entry)) continue;
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        if (p.replace(root, "").replace(/\\/g, "/") === "/lib/encryptedStore.ts") continue;
        const text = readFileSync(p, "utf8");
        if (/\bAsyncStorage\.(setItem|getItem|removeItem|multiRemove|getAllKeys)\(/.test(text)) offenders.push(p);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("a round trip through encryptedSet/encryptedGet returns the plaintext, but the raw stored bytes never contain it", async () => {
    const plain = "auto"; // themeMode's own value shape
    await encryptedSet("jstack.themeMode", plain);
    const raw = await AsyncStorage.getItem("jstack.themeMode");
    expect(raw).not.toBeNull();
    expect(raw).not.toContain(plain);
    expect(await encryptedGet("jstack.themeMode")).toBe(plain);
  });

  it("a corrupted/undecryptable payload reads back as absent, not a crash", async () => {
    await AsyncStorage.setItem("jstack.corrupt", "jstack-enc-v1:not-real-ciphertext");
    await expect(encryptedGet("jstack.corrupt")).resolves.toBeNull();
  });
});

/**
 * No control characters in source — AUDIT_v2.md AA-02, and the second time
 * this bit.
 *
 * Twice in this build a regex was written with a `\b` word boundary that got
 * eaten into a literal 0x08 BACKSPACE byte on its way into the file. Both
 * times the result LOOKED right in every editor and diff, and both times the
 * regex could never match: once in `data/ApiAdapter.ts`'s SEC-15 guard (caught
 * by its own test going red), and once in `tests/unit/contract.test.ts`'s
 * SEC-15 greps, where it made two security checks pass unconditionally and
 * nothing noticed until the auditor planted a forbidden route.
 *
 * That is the worst shape a defect can take here: a guard reporting green over
 * exactly the thing it was written to catch. A byte-level check is the only
 * thing that sees it, because every other tool renders 0x08 as `\b`.
 *
 * Tab, newline and carriage return are the only control characters a source
 * file has any business containing.
 */
const APP_ROOT = join(__dirname, "..", "..");

/**
 * The control bytes a source file or a delivery document may never contain:
 * every C0 code point except tab, newline and carriage return.
 *
 * Built with String.fromCharCode rather than written as a character class,
 * on purpose. The class literal was mistyped through a shell heredoc twice
 * while this very file was being edited, and both times it arrived as a
 * range of RAW control bytes that matched a newline — a check for invisible
 * characters, broken by invisible characters, reporting every file in the
 * repository as an offender. There is no escape here to lose.
 */
const CONTROL_BYTES = new RegExp(
  "[" +
    [...Array(32).keys()]
      .filter((n) => n !== 9 && n !== 10 && n !== 13)
      .map((n) => String.fromCharCode(n))
      .join("") +
    "]",
);

describe("no invisible control characters in source", () => {
  it("every source file is free of control bytes that silently break an escape", () => {
    const CONTROL = CONTROL_BYTES;
    const roots = ["app", "components", "data", "e2e", "layout", "lib", "stores", "theme", "tests", "tools"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx|mjs|cjs|js|json)$/.test(entry.name)) continue;
        const text = readFileSync(full, "utf8");
        const hit = CONTROL.exec(text);
        if (hit != null) {
          const line = text.slice(0, hit.index).split("\n").length;
          offenders.push(`${full.slice(APP_ROOT.length + 1)}:${line} contains U+${hit[0].charCodeAt(0).toString(16).padStart(4, "0")}`);
        }
      }
    };
    for (const r of roots) walk(join(APP_ROOT, r));
    expect({ filesWithControlCharacters: offenders }).toEqual({ filesWithControlCharacters: [] });
  });

  // B10-03: the check above walks `jstack-app/` source and only source
  // extensions, so it could not see four 0x08 bytes sitting in three of the
  // repo's DELIVERY documents — each one inside the very sentence about the
  // eaten-escape defect, where they rendered as a pair of empty backticks.
  //
  // Which is the joke the auditor did not have to make: the paragraphs
  // explaining that this build kept losing its word boundaries to a shell
  // heredoc had lost one of their own. A document is delivered, read and
  // quoted from;
  // an invisible control byte in one is no more acceptable than in a regex,
  // and is harder to notice, because nothing compiles it.
  it("the delivery documents are free of them too", () => {
    const CONTROL = CONTROL_BYTES;
    const repo = join(APP_ROOT, "..");
    const offenders: string[] = [];
    for (const name of readdirSync(repo)) {
      if (!name.endsWith(".md")) continue;
      const text = readFileSync(join(repo, name), "utf8");
      const hit = CONTROL.exec(text);
      if (hit != null) {
        const line = text.slice(0, hit.index).split("\n").length;
        offenders.push(`${name}:${line} contains U+${hit[0].charCodeAt(0).toString(16).padStart(4, "0")}`);
      }
    }
    expect({ docsWithControlCharacters: offenders }).toEqual({ docsWithControlCharacters: [] });
  });
});

/**
 * A-6 · one source for the unlock mechanism's NAME.
 *
 * The web runs a passkey ceremony; a phone unlocks with Face ID through
 * expo-local-authentication. Until this row the copy said "passkey" on both
 * platforms and the gate ANNOUNCED "Unlock with Face ID" on both, so the web
 * broke WCAG 2.5.3 (the accessible name did not contain the visible label) and
 * the phone named a mechanism it does not run. Fixing the two strings would
 * have left the next surface free to write its own: this sweep is the rule —
 * user-visible copy takes the word from `lib/unlockCopy.ts`, which decides it
 * per platform, and nothing else spells it.
 *
 * Comments are not swept: a comment explaining the mechanism is not copy.
 */
describe("A-6 · every user-visible mechanism word comes from lib/unlockCopy.ts", () => {
  /** file → why this literal is allowed to name a mechanism itself */
  const ALLOWED: Record<string, string> = {
    // both are shown ONLY inside Gate.tsx's `Platform.OS === "web"` branch, and
    // both are about the browser's own support for the ceremony — the one case
    // where the word is not a label but the subject of the sentence
    "components/chrome/Gate.tsx": "the two web-only messages about a browser with no passkey support (SEC-02)",
    // a SERVER cannot know which platform is calling it, and what it verifies
    // is the passkey/device key either way; this handler stands in for REMAP's
    // own (CONTRACT §4.1), so its wording is the wire's, not the screen's
    "data/mock/handlers/session.ts": "the mock server's 403 for a recovery missing its passkey assertion — a wire message, not app copy",
  };

  it("no other component, screen or store spells 'passkey' or 'Face ID' in a string", () => {
    const roots = ["app", "components", "layout", "stores", "theme", "data"];
    const found: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(full, relPath);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const lines = readFileSync(full, "utf8").split(/\r?\n/);
        lines.forEach((line, i) => {
          const code = line.trim();
          if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
          if (!/passkey|Face ID/i.test(code)) return;
          // the word has to be INSIDE a string to be copy
          if (!/["'`][^"'`]*(passkey|Face ID)/i.test(code)) return;
          if (ALLOWED[relPath] != null) return;
          found.push(`${relPath}:${i + 1} ${code.slice(0, 90)}`);
        });
      }
    };
    for (const root of roots) walk(join(APP_ROOT, root), root);
    expect({ copyThatSpellsTheMechanism: found }).toEqual({ copyThatSpellsTheMechanism: [] });
  });

  it("the allow-list is not stale: each file still names a mechanism", () => {
    for (const [rel, why] of Object.entries(ALLOWED)) {
      expect({ file: rel, reasonLength: why.length > 20 }).toEqual({ file: rel, reasonLength: true });
      expect(readFileSync(join(APP_ROOT, rel), "utf8")).toMatch(/passkey|Face ID/i);
    }
  });
});

/**
 * H-1(b) · the quarantine is a NUMBER OF MINUTES, and it has to be one.
 *
 * `.npmrc` read `minimum-release-age=3d` from H-1(b) until A-6. pnpm 10.33
 * takes this setting in minutes and does not parse a duration, so it refused a
 * version twenty-five days old: the rule as configured blocked every new
 * dependency rather than the ones inside three days. It failed CLOSED — no
 * unvetted package could enter — and no row added a dependency between H-1(b)
 * and A-6, which is why it went unnoticed until A-6 installed expo-updates.
 *
 * A guard rather than a comment, because the failure mode is silent in both
 * directions: a value pnpm cannot read blocks everything, and a value it reads
 * as a small number quarantines nothing while still looking deliberate.
 */
describe("H-1(b) · the supply-chain quarantine is three days, in the unit pnpm reads", () => {
  it(".npmrc sets minimum-release-age to 4320 minutes, not a duration string", () => {
    const npmrc = readFileSync(join(APP_ROOT, ".npmrc"), "utf8");
    const line = /^minimum-release-age=(.+)$/m.exec(npmrc);
    expect(line).not.toBeNull();
    const value = line![1].trim();
    // a duration string here is the defect: pnpm reads minutes
    expect(value).toMatch(/^\d+$/);
    expect(Number(value)).toBe(3 * 24 * 60);
  });
});
