"use strict";

const path = require("node:path");

/**
 * jstack/no-window-dimensions (ADR-07) — `useWindowDimensions()` and
 * `Dimensions` read the window width directly, bypassing the pack's
 * breakpoints. Every layout decision goes through theme/useLayout.ts, the
 * one file allowed to import either.
 */
function isExempt(filename) {
  const rel = path.relative(process.cwd(), filename).split(path.sep).join("/");
  return rel.endsWith("theme/useLayout.ts") || rel.endsWith("/theme/useLayout.ts") || rel === "useLayout.ts";
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow useWindowDimensions/Dimensions outside theme/useLayout.ts (ADR-07)",
    },
    schema: [],
    messages: {
      windowDimensions: "'{{name}}' bypasses theme/useLayout.ts's breakpoints. Use useLayout() instead.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isExempt(filename)) return {};

    function checkImport(node) {
      for (const spec of node.specifiers) {
        const imported = spec.type === "ImportSpecifier" ? spec.imported.name : null;
        if (imported === "useWindowDimensions" || imported === "Dimensions") {
          context.report({ node: spec, messageId: "windowDimensions", data: { name: imported } });
        }
      }
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value === "react-native") checkImport(node);
      },
      Identifier(node) {
        // catches `Dimensions.get(...)` / `useWindowDimensions()` reached via
        // a namespace import or React Native's own re-exports, not just a
        // named import from "react-native"
        if (node.name !== "useWindowDimensions" && node.name !== "Dimensions") return;
        // avoid double-reporting the import specifier itself (handled above)
        if (node.parent.type === "ImportSpecifier") return;
        context.report({ node, messageId: "windowDimensions", data: { name: node.name } });
      },
    };
  },
};
