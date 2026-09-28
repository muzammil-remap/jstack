"use strict";

const path = require("node:path");

/**
 * jstack/no-inline-font-size (ADR-33, S-2/SM-04) — a `fontSize:` or
 * `fontFamily:` property outside theme/ means a component set its own
 * typography instead of reading it through `Txt`/a text primitive
 * (`theme/ui/text.tsx`'s `KIND_STYLE`) or `theme/tokens.ts` directly, and
 * will not follow the pack's scale if it ever changes. theme/ (where the
 * primitives and the generated tokens themselves legitimately set these) is
 * exempt, the same way `no-colour-literal` exempts it for colour.
 */
const FONT_KEYS = new Set(["fontSize", "fontFamily"]);

/**
 * The one file-level exemption, and why: `ErrorBoundary.tsx`'s recovery
 * screen is what renders when the app has crashed — including when the
 * crash came from the UI primitive layer itself. It deliberately imports
 * no `theme/ui` component (only `useColors`), so routing its three literals
 * through `Txt` would couple the recovery screen to the exact layer it
 * exists to recover from. Its sizes are also genuinely off-scale (a
 * monospace debug line, a 14.5 button label), so there is nothing for the
 * pack's scale to give it.
 */
const EXEMPT_FILES = new Set(["components/chrome/ErrorBoundary.tsx"]);

function isExempt(filename) {
  const rel = path.relative(process.cwd(), filename).split(path.sep).join("/");
  return rel.startsWith("theme/") || rel.includes("/theme/") || EXEMPT_FILES.has(rel);
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow inline fontSize/fontFamily properties outside theme/ — use Txt or a theme/ui text primitive instead",
    },
    schema: [],
    messages: {
      inlineFontSize: "'{{key}}' set outside theme/. Use <Txt kind=\"...\"> or an existing theme/ui text primitive (Meta, Label, CardTitle, Stat...) instead of setting typography inline.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isExempt(filename)) return {};

    return {
      Property(node) {
        const keyName = node.key.type === "Identifier" ? node.key.name : node.key.type === "Literal" ? String(node.key.value) : null;
        if (keyName == null || !FONT_KEYS.has(keyName)) return;
        context.report({ node, messageId: "inlineFontSize", data: { key: keyName } });
      },
    };
  },
};
