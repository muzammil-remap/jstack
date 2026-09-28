"use strict";

const path = require("node:path");

/**
 * jstack/no-colour-literal (ADR-03) — a hex or rgb(a)() colour string
 * literal outside theme/ or design/ means a component drew its own colour
 * instead of reading a token from theme/tokens.ts, and will not repaint
 * when the pack's palette changes or the theme flips. theme/ (tokens.ts
 * itself, and the handful of row-1/row-3 compile shims that map v1.2 colour
 * names onto new tokens) and design/ (the vendored pack's own CSS/JSON,
 * plus tools/gen-tokens.mjs's output before it lands in theme/) are exempt.
 */
const COLOUR_RE = /#[0-9a-f]{3,8}\b|rgba?\(/i;

function isExempt(filename) {
  const rel = path.relative(process.cwd(), filename).split(path.sep).join("/");
  return rel.startsWith("theme/") || rel.startsWith("design/") || rel.includes("/theme/") || rel.includes("/design/");
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow hex/rgb(a)() colour string literals outside theme/ and design/ — read a token from theme/tokens.ts instead",
    },
    schema: [],
    messages: {
      colourLiteral: "'{{text}}' looks like a colour literal. Read it from theme/tokens.ts (useTokens()) instead of writing it here.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isExempt(filename)) return {};

    function check(node, raw) {
      if (typeof raw !== "string") return;
      if (!COLOUR_RE.test(raw)) return;
      context.report({ node, messageId: "colourLiteral", data: { text: raw } });
    }

    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateLiteral(node) {
        if (node.expressions.length > 0) return; // only static templates
        check(node, node.quasis.map((q) => q.value.cooked).join(""));
      },
    };
  },
};
