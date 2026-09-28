/**
 * The NR-04 tree walk, shared by both native lanes.
 *
 * Ported verbatim from v1.2's `tests/native/surfaces.test.tsx` at row 3, and
 * extracted here at row 23 so `primitives.test.tsx` and `screens.test.tsx`
 * cannot drift apart — AUDIT_v2.md A-04 found the second lane missing
 * entirely, and two copies of a walker is how the next gap starts.
 *
 * What it looks for: a raw string or number rendered OUTSIDE a `<Text>` host.
 * React Native Web swallows that silently (RCA #2); iOS throws, or renders
 * nothing. Every Playwright test in this repo runs on web, so web is precisely
 * where the bug is invisible — which is the whole argument for this lane.
 *
 * `TEXT_TYPE` is probed at runtime rather than hardcoded: the host component
 * name for `<Text>` is a preset detail, so the walker renders a marker and
 * reads back whatever host node ended up carrying it.
 */
import React from "react";
import { Text as RNText } from "react-native";

export type RTNode = { type: string; children: RTChild[] | null };
export type RTChild = RTNode | string;

let TEXT_TYPE = "";

export function collectViolations(node: RTChild | RTChild[] | null, insideText: boolean, path: string, out: string[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => collectViolations(n, insideText, `${path}[${i}]`, out));
    return;
  }
  if (typeof node === "string") {
    if (!insideText && node.trim() !== "") out.push(`${path}: raw ${JSON.stringify(node)} outside <Text>`);
    return;
  }
  const isText = node.type === TEXT_TYPE;
  if (node.children) collectViolations(node.children, insideText || isText, `${path}>${node.type}`, out);
}

/** Render a marker through the caller's own providers and learn the host node
 * name `<Text>` compiles to under this preset. */
export function probeTextType(renderWithProviders: (node: React.ReactElement) => { toJSON: () => unknown; unmount: () => void }): void {
  const PROBE_MARKER = "__TEXT_TYPE_PROBE__";
  const probe = renderWithProviders(<RNText>{PROBE_MARKER}</RNText>);
  function findMarkerHost(node: RTChild | RTChild[] | null): string | null {
    if (node == null || typeof node === "string") return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const found = findMarkerHost(n);
        if (found) return found;
      }
      return null;
    }
    if (node.children?.length === 1 && node.children[0] === PROBE_MARKER) return node.type;
    return findMarkerHost(node.children);
  }
  const found = findMarkerHost(probe.toJSON() as RTChild | RTChild[] | null);
  if (found == null) throw new Error("TEXT_TYPE probe failed to find the marker's host node");
  TEXT_TYPE = found;
  probe.unmount();
}
