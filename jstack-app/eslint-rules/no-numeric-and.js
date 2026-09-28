"use strict";

const { ESLintUtils } = require("@typescript-eslint/utils");
const ts = require("typescript");

/**
 * jstack/no-numeric-and (spec §15.12.2) — `{count && <X/>}` renders a bare
 * "0" on native (and react-native-web on the web) when `count` is a falsy
 * number; RN throws no dev warning for it, unlike a bare boolean/null/
 * undefined child, which React silently drops. Type-aware: flags a `&&`
 * used as JSX child content whose left operand's type includes number or
 * string (optionally nullable/unioned) — proven to fire on a planted
 * fixture (QA-03).
 */
function isRiskyType(type) {
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((t) => {
    const flags = t.getFlags();
    return (flags & ts.TypeFlags.NumberLike) !== 0 || (flags & ts.TypeFlags.StringLike) !== 0;
  });
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow {value && <JSX/>} where value's type includes number/string — 0 or \"\" renders as bare text on native instead of nothing",
    },
    schema: [],
    messages: {
      numericAnd:
        "'{{text}} && ...' can render a bare {{kind}} on native when {{text}} is falsy (e.g. 0 renders as the text \"0\"). Coerce to boolean first: !!{{text}} && ... or ({{text}} ? ... : null).",
    },
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context, true);
    if (!services.program) return {}; // no type info available — nothing to check
    const checker = services.program.getTypeChecker();

    return {
      "JSXExpressionContainer > LogicalExpression[operator='&&']": function (node) {
        // only JSX child-content position (`<View>{cond && <X/>}</View>`) —
        // not an attribute value (`disabled={cond && x}`), which never renders
        const container = node.parent;
        if (container.parent.type !== "JSXElement" && container.parent.type !== "JSXFragment") return;

        const tsNode = services.esTreeNodeToTSNodeMap.get(node.left);
        const type = checker.getTypeAtLocation(tsNode);
        if (!isRiskyType(type)) return;

        context.report({
          node: node.left,
          messageId: "numericAnd",
          data: {
            text: context.sourceCode.getText(node.left),
            kind: (type.getFlags() & ts.TypeFlags.NumberLike) !== 0 ? "number" : "string",
          },
        });
      },
    };
  },
};
