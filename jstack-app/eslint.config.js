const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const reactNative = require("eslint-plugin-react-native");
const noNumericAnd = require("./eslint-rules/no-numeric-and.js");
const noColourLiteral = require("./eslint-rules/no-colour-literal.js");
const noWindowDimensions = require("./eslint-rules/no-window-dimensions.js");
const noInlineFontSize = require("./eslint-rules/no-inline-font-size.js");
const requirePurposeHeader = require("./eslint-rules/require-purpose-header.js");

// spec §15.12.2: wrappers that already normalise their children into <Text>
// (theme/ui's Txt/Label/Meta/Expiry/CardTitle/Stat/Chip/Btn/BtnPrimary/
// BtnSm/Tag, chrome/Sens) — raw text/expressions inside these are fine;
// no-raw-text only needs to gate everything else.
const TEXT_WRAPPERS = ["Txt", "Label", "Meta", "Expiry", "CardTitle", "Stat", "Chip", "Btn", "BtnPrimary", "BtnSm", "Sens", "Tag"];

const jstackPlugin = {
  rules: {
    "no-numeric-and": noNumericAnd,
    "no-colour-literal": noColourLiteral,
    "no-window-dimensions": noWindowDimensions,
    "no-inline-font-size": noInlineFontSize,
    "require-purpose-header": requirePurposeHeader,
  },
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "node_modules/*", ".expo/*"],
  },
  {
    // type-aware linting for jstack/no-numeric-and (needs the checker);
    // layered on top of eslint-config-expo's own typescript parser config
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    // ADR-03: no colour literal outside theme/ or design/ — every other
    // file reads its colours from theme/tokens.ts (useTokens()).
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      jstack: jstackPlugin,
    },
    rules: {
      "jstack/no-colour-literal": "error",
      "jstack/no-window-dimensions": "error",
      // S-2b turns this on, in the same commit that finishes migrating the
      // last of the ~194 call sites it flags. Registered here now (S-2a) so
      // the rule and its planted-fixture test ship with the split that makes
      // migration possible, rather than landing a rule the tree can't pass.
      "jstack/no-inline-font-size": "error",
      // M-1/ADR-35: CODEMAP.md section 2 is generated from these headers, so
      // a file without one leaves a blank where an agent expects a
      // description — and the map is read INSTEAD of the file.
      "jstack/require-purpose-header": "error",
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: {
      "react-native": reactNative,
      jstack: jstackPlugin,
    },
    rules: {
      "react-native/no-raw-text": ["error", { skip: TEXT_WRAPPERS }],
      "jstack/no-numeric-and": "error",
    },
  },
]);
