/**
 * NR-07 (spec §15.12.2): `react-native/no-raw-text` and `jstack/no-numeric-and`
 * are proven to fire on a planted fixture (QA-03) — not just "configured",
 * actually reported by a real lint run. Type-aware rules can silently no-op
 * if parser services never resolve (e.g. `projectService` mis-wired); a
 * clean `pnpm lint` alone can't distinguish "no violations" from "the rule
 * never ran", so this test lints real planted files on disk (so
 * typescript-eslint's project service can resolve real type info) and
 * checks BOTH a violation fixture (reported) and a clean equivalent (not
 * reported, proving no false positives).
 *
 * Uses ESLint's `Linter.verify()` with an inline flat-config object rather
 * than the `ESLint` class: `ESLint` discovers and dynamically `import()`s
 * eslint.config.js, which needs --experimental-vm-modules under Jest's
 * module sandbox and throws otherwise. `Linter.verify()` takes the config
 * directly — no file-based config loading — and exercises the exact same
 * rule modules eslint.config.js wires up.
 */
import { Linter } from "eslint";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
// require, not import: @typescript-eslint/parser's internal "is this really
// us" identity check keys off the exact CJS exports object — an ES default
// import went through babel's interop wrapper and came back unrecognized
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsParser = require("@typescript-eslint/parser");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reactNativePlugin = require("eslint-plugin-react-native");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const noNumericAnd = require("../../eslint-rules/no-numeric-and.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const noColourLiteral = require("../../eslint-rules/no-colour-literal.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const noInlineFontSize = require("../../eslint-rules/no-inline-font-size.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const requirePurposeHeader = require("../../eslint-rules/require-purpose-header.js");

const root = join(__dirname, "..", "..");
const TEXT_WRAPPERS = ["DRow", "Eyebrow", "Footline", "Chip", "Btn", "Sens", "SensLine", "Tag", "FChip"];

const linter = new Linter();

function lint(filePath: string, code: string): string[] {
  const messages = linter.verify(
    code,
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          ecmaFeatures: { jsx: true },
          projectService: true,
          tsconfigRootDir: root,
        },
      },
      plugins: {
        "react-native": reactNativePlugin,
        jstack: { rules: { "no-numeric-and": noNumericAnd, "no-colour-literal": noColourLiteral, "no-inline-font-size": noInlineFontSize } },
      },
      rules: {
        "react-native/no-raw-text": ["error", { skip: TEXT_WRAPPERS }],
        "jstack/no-numeric-and": "error",
        "jstack/no-colour-literal": "error",
        "jstack/no-inline-font-size": "error",
      },
    },
    { filename: filePath },
  );
  return messages.map((m) => m.ruleId).filter((id): id is string => id != null);
}

/**
 * The same run without the project service, for a rule that needs no type
 * information — `jstack/no-inline-font-size` matches a property key and
 * nothing else (SM-04).
 *
 * That difference is what makes its *path* exemptions testable at all. The
 * rule exempts `theme/` and one named file, decided from the filename
 * relative to `process.cwd()`; asserting those with the on-disk helper
 * above would mean planting a fixture inside `theme/` and inside
 * `components/chrome/`, where `tests/unit/module-inventory.test.ts`'s
 * source walk would see it. With no project service, no file has to exist,
 * so the filename can simply be named.
 */
function lintNamed(filename: string, code: string): string[] {
  const messages = linter.verify(
    code,
    {
      // BOTH extensions. With `["**/*.tsx"]` alone, ESLint reports "no
      // matching configuration" for a `.ts` filename and returns no rule
      // messages at all — so every `.ts` case here passed for the wrong
      // reason, including two SM-04 exemption cases that were asserting
      // `not.toContain` against an empty list. Found by M-1's purpose-header
      // fixtures, which expect a rule to FIRE and so could not pass vacuously.
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { jstack: { rules: { "no-inline-font-size": noInlineFontSize, "require-purpose-header": requirePurposeHeader } } },
      rules: { "jstack/no-inline-font-size": "error", "jstack/require-purpose-header": "error" },
    },
    { filename },
  );
  return messages.map((m) => m.ruleId).filter((id): id is string => id != null);
}

describe("NR-07 lint guards fire on planted fixtures", () => {
  // fixtures live under tests/ (tsconfig includes it, unlike e2e/tools) so
  // typescript-eslint's project service resolves real types — kept out of
  // components/ so tests/unit/module-inventory.test.ts's source walk never
  // sees them, even transiently while jest runs test files in parallel
  let scratch: string;

  beforeAll(() => {
    // CD-12: `afterAll`'s rmSync is best-effort against a transient Dropbox
    // lock, but a run that is KILLED (interrupted mid-suite, a crashed
    // process) never reaches `afterAll` at all — no cleanup step running
    // afterwards can fix that, only one running BEFOREHAND. Twenty of these
    // had accumulated from past interrupted runs with nothing ever sweeping
    // them, so every run now clears out any it finds left over first, and
    // errors here are still best-effort for the same Dropbox-lock reason.
    for (const name of readdirSync(join(root, "tests"))) {
      if (!name.startsWith("lint-guard-scratch-")) continue;
      try {
        rmSync(join(root, "tests", name), { recursive: true, force: true });
      } catch {
        // leave it — the next run's sweep gets another try
      }
    }
    scratch = mkdtempSync(join(root, "tests", "lint-guard-scratch-"));
  });

  afterAll(async () => {
    // CD-11: `projectService: true` (needed so type-aware rules resolve real
    // types, see the file header) makes `Linter.verify()` open each fixture
    // through a lazily-created, module-scope TS project service. Every
    // `lint()` call opens another client file, and TypeScript's own
    // `delayEnsureProjectForOpenFiles` (internal, not ours —
    // `--detectOpenHandles` traced it through
    // `_ProjectService.delayEnsureProjectForOpenFiles` in
    // `typescript-estree`'s `useProgramFromProjectService`) re-arms a 2500ms
    // throttled timeout each time, so it is essentially guaranteed to still
    // be pending when this file's last test finishes — the process tries to
    // exit before TypeScript's own timer fires, which is what Jest reports
    // as a worker failing to exit gracefully. `clearCaches()` alone does not
    // fix it: it only drops our reference to the service for the NEXT test
    // file, it cannot cancel a timeout already scheduled deep inside
    // TypeScript by the last one. Letting the throttle actually fire before
    // this hook returns does — see BUGLOG_v21.md B-02 for the measured
    // before/after reproduction rate.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    tsParser.clearCaches();
  });

  afterAll(() => {
    // best-effort: this directory lives inside the Dropbox-synced tree
    // (required so typescript-eslint's project service can resolve real
    // types — tsconfig excludes e2e/tools but not tests/), and Dropbox's
    // sync daemon can transiently hold a file open (the same class of
    // issue as BUGLOG B-7). A uniquely-suffixed leftover scratch dir is
    // harmless — the NEXT run gets its own — so a cleanup failure here
    // must never fail the suite.
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      // leave it — see comment above
    }
  });

  it("react-native/no-raw-text fires on literal text outside <Text>", () => {
    const file = join(scratch, "raw-text-bad.tsx");
    const code = `import React from "react";\nimport { View } from "react-native";\nexport function Bad() {\n  return <View>hello</View>;\n}\n`;
    writeFileSync(file, code, "utf8");
    expect(lint(file, code)).toContain("react-native/no-raw-text");
  });

  it("react-native/no-raw-text does not fire when the text is inside <Text>", () => {
    const file = join(scratch, "raw-text-good.tsx");
    const code = `import React from "react";\nimport { Text, View } from "react-native";\nexport function Good() {\n  return (\n    <View>\n      <Text>hello</Text>\n    </View>\n  );\n}\n`;
    writeFileSync(file, code, "utf8");
    expect(lint(file, code)).not.toContain("react-native/no-raw-text");
  });

  it("jstack/no-numeric-and fires on a numeric left operand ({count && <X/>})", () => {
    const file = join(scratch, "numeric-and-bad.tsx");
    const code = `import React from "react";\nimport { Text, View } from "react-native";\nexport function Bad({ count }: { count: number }) {\n  return <View>{count && <Text>items</Text>}</View>;\n}\n`;
    writeFileSync(file, code, "utf8");
    expect(lint(file, code)).toContain("jstack/no-numeric-and");
  });

  it("jstack/no-numeric-and does not fire on a boolean left operand ({count > 0 && <X/>})", () => {
    const file = join(scratch, "numeric-and-good.tsx");
    const code = `import React from "react";\nimport { Text, View } from "react-native";\nexport function Good({ count }: { count: number }) {\n  return <View>{count > 0 && <Text>items</Text>}</View>;\n}\n`;
    writeFileSync(file, code, "utf8");
    expect(lint(file, code)).not.toContain("jstack/no-numeric-and");
  });

  // DS-02: a colour literal outside theme/ and design/ fails lint.
  it("jstack/no-colour-literal fires on a hex literal outside theme/design", () => {
    const file = join(scratch, "colour-bad.tsx");
    const code = `import React from "react";\nimport { View } from "react-native";\nexport function Bad() {\n  return <View style={{ backgroundColor: "#1B1F17" }} />;\n}\n`;
    writeFileSync(file, code, "utf8");
    expect(lint(file, code)).toContain("jstack/no-colour-literal");
  });

  it("jstack/no-colour-literal fires on an rgba() literal outside theme/design", () => {
    const file = join(scratch, "colour-bad-rgba.tsx");
    const code = `import React from "react";\nimport { View } from "react-native";\nexport function Bad() {\n  return <View style={{ backgroundColor: "rgba(0,0,0,.5)" }} />;\n}\n`;
    writeFileSync(file, code, "utf8");
    expect(lint(file, code)).toContain("jstack/no-colour-literal");
  });

  it("jstack/no-colour-literal does not fire on a token reference", () => {
    const file = join(scratch, "colour-good.tsx");
    const code = `import React from "react";\nimport { View } from "react-native";\nimport { useTokens } from "@/theme/ThemeProvider";\nexport function Good() {\n  const c = useTokens();\n  return <View style={{ backgroundColor: c.ground }} />;\n}\n`;
    writeFileSync(file, code, "utf8");
    expect(lint(file, code)).not.toContain("jstack/no-colour-literal");
  });

  // SM-04 (ADR-33): a component may not set its own typography — size and
  // family come from a `Txt` kind. The planted fixture proves the rule
  // actually reports, the same way the four above do.
  it("jstack/no-inline-font-size fires on an inline fontSize outside theme/", () => {
    const file = join(scratch, "font-size-bad.tsx");
    const code = `import React from "react";\nimport { Text } from "react-native";\nexport function Bad() {\n  return <Text style={{ fontSize: 13 }}>hello</Text>;\n}\n`;
    writeFileSync(file, code, "utf8");
    expect(lint(file, code)).toContain("jstack/no-inline-font-size");
  });

  it("jstack/no-inline-font-size does not fire on a Txt kind call site", () => {
    const file = join(scratch, "font-size-good.tsx");
    const code = `import React from "react";\nimport { Txt } from "@/theme/ui";\nexport function Good() {\n  return <Txt kind="meta" tone="muted">hello</Txt>;\n}\n`;
    writeFileSync(file, code, "utf8");
    expect(lint(file, code)).not.toContain("jstack/no-inline-font-size");
  });
});

/**
 * SM-04's exemptions. These are the half of the rule a clean `pnpm lint`
 * can never exercise: an exemption that stopped working would show up as
 * *more* errors somewhere else, and an exemption that grew too wide would
 * show up as none at all — silently, which is the failure mode hard rule 11
 * is about. Each case names the exact path the rule decides on.
 */
describe("SM-04 · no-inline-font-size exemptions", () => {
  const FONT_SIZE = `export const s = { fontSize: 13 };\n`;
  const FONT_FAMILY = `export const s = { fontFamily: "Whatever" };\n`;

  it("fires on fontSize in a component", () => {
    expect(lintNamed(join(root, "components", "today", "Made-up.tsx"), FONT_SIZE)).toContain("jstack/no-inline-font-size");
  });

  it("fires on fontFamily in a component", () => {
    expect(lintNamed(join(root, "components", "today", "Made-up.tsx"), FONT_FAMILY)).toContain("jstack/no-inline-font-size");
  });

  it("does not fire inside theme/ — where the primitives and tokens live", () => {
    expect(lintNamed(join(root, "theme", "ui", "textKinds.ts"), FONT_SIZE)).not.toContain("jstack/no-inline-font-size");
  });

  it("does not fire in the one exempt file, ErrorBoundary.tsx", () => {
    // the recovery screen deliberately imports no theme/ui component, so it
    // cannot route its type through a primitive — see the rule's own comment
    expect(lintNamed(join(root, "components", "chrome", "ErrorBoundary.tsx"), FONT_SIZE)).not.toContain("jstack/no-inline-font-size");
  });

  it("the exemption is that one file, not the whole chrome/ directory", () => {
    expect(lintNamed(join(root, "components", "chrome", "Header.tsx"), FONT_SIZE)).toContain("jstack/no-inline-font-size");
  });
});

/**
 * M-1 (ADR-35, CM-08) — the purpose header rule. `pnpm lint` is green on
 * this tree, which is exactly why these matter: a rule that never fires
 * cannot be told apart from a rule that does not work. Each case names the
 * file path the rule decides on, since the exemptions are path-based.
 */
describe("CM-08 · require-purpose-header", () => {
  const withHeader = `/**
 * Does a specific job worth describing in a sentence.
 */
export const x = 1;
`;
  const noHeader = `export const x = 1;
`;
  const shortHeader = `/** Toast. */
export const x = 1;
`;
  const lineComment = `// not a block comment, so not a header
export const x = 1;
`;

  it("fires on a file with no header at all", () => {
    expect(lintNamed(join(root, "lib", "made-up.ts"), noHeader)).toContain("jstack/require-purpose-header");
  });

  it("fires on a header too short to say anything", () => {
    // the point of the rule is a SENTENCE, not a restated filename
    expect(lintNamed(join(root, "lib", "made-up.ts"), shortHeader)).toContain("jstack/require-purpose-header");
  });

  it("fires when the only comment is a line comment", () => {
    expect(lintNamed(join(root, "lib", "made-up.ts"), lineComment)).toContain("jstack/require-purpose-header");
  });

  it("does not fire on a real header", () => {
    expect(lintNamed(join(root, "lib", "made-up.ts"), withHeader)).not.toContain("jstack/require-purpose-header");
  });

  it("does not fire on a generated file or a route — both exempt, with reasons", () => {
    expect(lintNamed(join(root, "components", "chrome", "icons.generated.ts"), noHeader)).not.toContain("jstack/require-purpose-header");
    expect(lintNamed(join(root, "app", "(tabs)", "life.tsx"), noHeader)).not.toContain("jstack/require-purpose-header");
  });
});

/**
 * CD-12 / GL-A (audit A-7) — every spec runs under the console guard.
 *
 * `e2e/helpers.ts` wraps Playwright's `test` with a fixture that fails a spec
 * on a console error. A spec importing `test` straight from the package gets a
 * bare fixture and silently opts out of that budget — which is how `pwa.spec.ts`
 * ran outside it for a whole build. `helpers.ts` and `e2e/lib/*` import the
 * package on purpose: they are the wrapper and its utilities.
 */
describe("CD-12 · no spec bypasses the console guard (GL-A)", () => {
  const e2e = join(__dirname, "..", "..", "e2e");

  const specs = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) return specs(p);
      return entry.name.endsWith(".spec.ts") ? [p] : [];
    });

  it("every .spec.ts imports `test` from the helpers, not from @playwright/test", () => {
    const files = specs(e2e);
    // the sweep must actually find specs, or it proves nothing
    expect(files.length).toBeGreaterThan(10);

    const offenders = files
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"@playwright\/test"/.test(text);
      })
      .map((file) => file.slice(e2e.length + 1).split(sep).join("/"));

    expect({ specsOutsideTheConsoleGuard: offenders }).toEqual({ specsOutsideTheConsoleGuard: [] });
  });

  it("the matcher catches a planted import — otherwise its silence proves nothing", () => {
    const bad = 'import { expect, test } from "@playwright/test";';
    const good = 'import { expect, test } from "../helpers";';
    const typeOnly = 'import type { Page } from "@playwright/test";';
    const re = /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"@playwright\/test"/;
    expect(re.test(bad)).toBe(true);
    expect(re.test(good)).toBe(false);
    expect(re.test(typeOnly)).toBe(false);
  });
});
