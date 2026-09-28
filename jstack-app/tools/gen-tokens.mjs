#!/usr/bin/env node
/**
 * Generates theme/tokens.ts from design/tokens/{colors,typography,layout}.css
 * and design/tokens.json's `iconName` block (ADR-03). Run with no args to
 * write theme/tokens.ts; run with `--out <path>` to write elsewhere (used by
 * tests/unit/tokens.test.ts to regenerate into a temp path and diff against
 * the committed file, DS-01).
 *
 * The CSS is the pack's own truth (see design/DISCREPANCIES.md #1): this
 * script never reads tokens.json except for `iconName`, the one block that
 * is current there.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TOKENS_DIR = join(ROOT, "design", "tokens");

// ─── CSS custom-property parsing ───────────────────────────────────────────

/** Extract the `{ ... }` block following the first match of `selector` in `css`. */
function extractBlock(css, selector) {
  const at = css.indexOf(selector);
  if (at === -1) return null;
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

/** Parse `--js-name: value;` declarations (top-level only; no nested braces
 * in these files, so a plain `;`-split is safe even with commas/parens
 * inside values like `rgba(...)` or `cubic-bezier(...)`). */
function parseDecls(block) {
  const out = new Map();
  if (!block) return out;
  const re = /--js-([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block))) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

/** Resolve `var(--js-x)` references against `raw`, iterating to a fixed
 * point (aliases in colors.css are one level deep, but this tolerates more). */
function resolveVars(raw) {
  const resolved = new Map(raw);
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const [k, v] of resolved) {
      const m = /^var\(--js-([\w-]+)\)$/.exec(v);
      if (m && resolved.has(m[1])) {
        const target = resolved.get(m[1]);
        if (target !== v) {
          resolved.set(k, target);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return resolved;
}

function toCamel(kebab) {
  return kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function mapToCamelObject(map) {
  const obj = {};
  for (const [k, v] of map) obj[toCamel(k)] = v;
  return obj;
}

function px(value) {
  const n = parseFloat(String(value).replace("px", ""));
  if (Number.isNaN(n)) throw new Error(`not a px value: ${value}`);
  return n;
}

// ─── shadow: CSS string (web) + first-layer RN shadow props (native) ──────

function parseShadowLayers(cssValue) {
  // offsetX/offsetY may be unitless "0" (CSS omits units on zero lengths)
  const re = /(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+([\d.]+)px\s+(rgba?\(([^)]+)\))/g;
  const layers = [];
  let m;
  while ((m = re.exec(cssValue))) {
    layers.push({ offsetX: parseFloat(m[1]), offsetY: parseFloat(m[2]), blur: parseFloat(m[3]), color: m[4], components: m[5] });
  }
  return layers;
}

function nativeShadowFromCss(cssValue) {
  const [first] = parseShadowLayers(cssValue);
  if (!first) throw new Error(`unparsable shadow: ${cssValue}`);
  const parts = first.components.split(",").map((s) => s.trim());
  const [r, g, b, a] = parts;
  return {
    shadowColor: `rgb(${r}, ${g}, ${b})`,
    shadowOffset: { width: first.offsetX, height: first.offsetY },
    shadowOpacity: a != null ? parseFloat(a) : 1,
    shadowRadius: first.blur,
    // RN Android has no CSS-equivalent blur; this is an approximation (not
    // specified by the pack, which is web-first) so the primary layer's
    // softness still reads on Android — tune in row 6 if it looks wrong.
    elevation: Math.max(1, Math.round(first.blur / 3)),
  };
}

// ─── colors.css → light / dark Tokens ──────────────────────────────────────

function buildColorThemes() {
  const css = readFileSync(join(TOKENS_DIR, "colors.css"), "utf8");
  const lightRaw = parseDecls(extractBlock(css, ":root {") ?? extractBlock(css, ":root{"));
  const darkOverrides = parseDecls(extractBlock(css, ':root[data-theme="dark"]'));

  const lightResolved = resolveVars(lightRaw);
  const darkMerged = new Map(lightRaw);
  for (const [k, v] of darkOverrides) darkMerged.set(k, v);
  const darkResolved = resolveVars(darkMerged);

  return { light: mapToCamelObject(lightResolved), dark: mapToCamelObject(darkResolved) };
}

// ─── typography.css → type ──────────────────────────────────────────────

function buildType() {
  const css = readFileSync(join(TOKENS_DIR, "typography.css"), "utf8");
  const d = parseDecls(extractBlock(css, ":root {") ?? extractBlock(css, ":root{"));
  const num = (k) => parseFloat(d.get(k));
  return {
    family: {
      body: d.get("font-body"),
      heading: d.get("font-heading"),
      icon: d.get("font-icon"),
    },
    weight: {
      regular: num("weight-regular"),
      emphasis: num("weight-emphasis"),
      wordmark: num("weight-wordmark"),
    },
    size: {
      titleDesktop: px(d.get("size-title-desktop")),
      titlePhone: px(d.get("size-title-phone")),
      stat: px(d.get("size-stat")),
      cardTitle: px(d.get("size-card-title")),
      body: px(d.get("size-body")),
      chip: px(d.get("size-chip")),
      label: px(d.get("size-label")),
      small: px(d.get("size-small")),
      meta: px(d.get("size-meta")),
      tab: px(d.get("size-tab")),
      badge: px(d.get("size-badge")),
    },
    lineHeight: {
      tight: num("lh-tight"),
      stat: num("lh-stat"),
      title: num("lh-title"),
      body: num("lh-body"),
      row: num("lh-row"),
    },
    tracking: {
      title: num("tracking-title"),
      label: num("tracking-label"),
      wordmark: num("tracking-wordmark"),
    },
    icon: {
      tab: px(d.get("icon-tab")),
      rail: px(d.get("icon-rail")),
      header: px(d.get("icon-header")),
      inline: px(d.get("icon-inline")),
      chip: px(d.get("icon-chip")),
    },
  };
}

// ─── layout.css → space, radius, blur, motion, bp, grid, sizes ────────────

function buildLayout() {
  const css = readFileSync(join(TOKENS_DIR, "layout.css"), "utf8");
  const d = parseDecls(extractBlock(css, ":root {") ?? extractBlock(css, ":root{"));

  const space = {};
  for (let i = 1; i <= 10; i++) space[i] = px(d.get(`space-${i}`));

  // DISCREPANCIES.md #2: the vendored layout.css still carries the v1.0
  // phone page padding (16px 16px 120px). The mock and reference build win
  // — this is the one deliberate override gen-tokens.mjs makes.
  const pagePadPhone = { topBase: 22, sides: 20, bottom: 120 };
  const pagePadDesktopRaw = d.get("page-pad-desktop"); // "24px 32px 80px"
  const [padTop, padSides, padBottom] = pagePadDesktopRaw.split(/\s+/).map(px);
  const pagePadDesktop = { top: padTop, sides: padSides, bottom: padBottom };

  const radius = {
    card: px(d.get("radius-card")),
    control: px(d.get("radius-control")),
    tag: px(d.get("radius-tag")),
    seg: px(d.get("radius-seg")),
    round: d.get("radius-round"), // "50%" — not a px value
  };

  const blur = {
    card: px(d.get("blur-card").replace("blur(", "").replace(")", "")),
    bar: px(d.get("blur-bar").replace("blur(", "").replace(")", "")),
  };

  // DISCREPANCIES.md #3: the vendored layout.css still carries the v1.0
  // habit sizes (36/34). Reference wins: 34 on Life, 32 compact on Today.
  const sizes = {
    iconBtn: px(d.get("size-iconbtn")),
    iconBtnCard: px(d.get("size-iconbtn-card")),
    mic: px(d.get("size-mic")),
    micLive: px(d.get("size-mic-live")),
    habit: 34,
    habitCompact: 32,
    checkbox: px(d.get("size-checkbox")),
    dot: px(d.get("size-dot")),
    dotFeed: px(d.get("size-dot-feed")),
    badgeH: px(d.get("size-badge-h")),
    // DISCREPANCIES.md #20: the pack's 48 was sized for BILL, CLASH, EMAIL
    // and TASK. V2.1's SECTION is the widest label the catalogue can put in
    // the waiting row and it broke to "SECTIO / N" at 48 (ux-review R1-05);
    // 60 holds it at 11.5 / .08em with room. The pack file keeps its 48.
    labelCol: 60,
    ring: px(d.get("size-ring")),
    barTrack: px(d.get("size-bar-track")),
  };

  const grid = {
    three: d.get("grid-3"),
    two: d.get("grid-2"),
    one: d.get("grid-1"),
  };

  const motion = {
    fast: px(d.get("motion-fast")),
    base: px(d.get("motion-base")),
    open: px(d.get("motion-open")),
    ease: d.get("ease"),
    pulseDuration: px(d.get("pulse-duration").replace("s", "")) * 1000,
    undoSeconds: parseFloat(d.get("undo-seconds")),
  };

  const bp = { tablet: px(d.get("bp-tablet")), desktop: px(d.get("bp-desktop")) };

  const contentMax = px(d.get("content-max"));
  const railWidth = px(d.get("rail-width"));
  const barInset = px(d.get("bar-inset"));
  const barHeight = px(d.get("bar-height"));
  const hoverLift = parseFloat(d.get("hover-lift"));
  const pressedOpacity = parseFloat(d.get("pressed-opacity"));
  const disabledOpacity = parseFloat(d.get("disabled-opacity"));

  return { space, pagePadPhone, pagePadDesktop, radius, blur, sizes, grid, motion, bp, contentMax, railWidth, barInset, barHeight, hoverLift, pressedOpacity, disabledOpacity };
}

// ─── tokens.json → iconNames (the only current part of that file) ─────────

function buildIconNames() {
  const json = JSON.parse(readFileSync(join(ROOT, "design", "tokens.json"), "utf8"));
  const out = {};
  for (const [k, v] of Object.entries(json.iconName ?? {})) out[k] = v.$value;
  return out;
}

// ─── emit theme/tokens.ts ──────────────────────────────────────────────────

function ts(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return "undefined";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => ts(v)).join(", ")}]`;
  const entries = Object.entries(value)
    .map(([k, v]) => `${pad}  ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${ts(v, indent + 1)},`)
    .join("\n");
  return `{\n${entries}\n${pad}}`;
}

function generate() {
  const { light, dark } = buildColorThemes();
  const type = buildType();
  const layout = buildLayout();
  const iconNames = buildIconNames();

  const lightShadow = { css: light.shadow, native: nativeShadowFromCss(light.shadow) };
  const darkShadowFull = { css: dark.shadow, native: nativeShadowFromCss(dark.shadow) };
  const lightShadowSeg = { css: light.shadowSeg, native: nativeShadowFromCss(light.shadowSeg) };
  const darkShadowSeg = { css: dark.shadowSeg, native: nativeShadowFromCss(dark.shadowSeg) };

  const colorKeys = Object.keys(light).filter((k) => k !== "shadow" && k !== "shadowSeg");
  const lightColors = Object.fromEntries(colorKeys.map((k) => [k, light[k]]));
  const darkColors = Object.fromEntries(colorKeys.map((k) => [k, dark[k]]));

  return `/**
 * generated by tools/gen-tokens.mjs from design/tokens — do not edit
 * (see design/DISCREPANCIES.md for the three values this script overrides)
 */
import { Platform } from "react-native";

export type ThemeName = "light" | "dark";

export type ShadowToken = {
  css: string;
  native: { shadowColor: string; shadowOffset: { width: number; height: number }; shadowOpacity: number; shadowRadius: number; elevation: number };
};

export type Tokens = ${ts({ ...Object.fromEntries(colorKeys.map((k) => [k, ""])), shadow: "__SHADOW__", shadowSeg: "__SHADOW__" })
    .replace(/"": ""/g, "")
    .replace(/(\w+): "",/g, "$1: string;")
    .replace(/shadow: "__SHADOW__",/, "shadow: ShadowToken;")
    .replace(/shadowSeg: "__SHADOW__",/, "shadowSeg: ShadowToken;")
    .replace(/;\n}/, ";\n}")};

export const light: Tokens = ${ts({ ...lightColors, shadow: "__L__", shadowSeg: "__LS__" })
    .replace('"__L__"', ts(lightShadow, 1))
    .replace('"__LS__"', ts(lightShadowSeg, 1))};

export const dark: Tokens = ${ts({ ...darkColors, shadow: "__D__", shadowSeg: "__DS__" })
    .replace('"__D__"', ts(darkShadowFull, 1))
    .replace('"__DS__"', ts(darkShadowSeg, 1))};

/** Type scale, straight from design/tokens/typography.css. */
export const type = ${ts(type)} as const;

/** design/tokens/layout.css's --js-space-1..10 (px). */
export const space = ${ts(layout.space)} as const;

/**
 * Phone page padding. --js-page-pad-phone in the vendored CSS is still the
 * v1.0 value (design/DISCREPANCIES.md #2) — the mock and reference build
 * win: top = safe-area-inset-top + topBase, sides on both edges, bottom
 * clears the mic/tab bar. Callers add the device's safe-area inset to
 * \`topBase\` themselves (useSafeAreaInsets is a hook; this file is not).
 */
export const pagePadPhone = ${ts(layout.pagePadPhone)} as const;
export const pagePadDesktop = ${ts(layout.pagePadDesktop)} as const;

export const radius = ${ts(layout.radius)} as const;

/** Backdrop blur radius (web \`backdrop-filter: blur(Npx)\`; native has no
 * equivalent — components fall back to the surface's opacity alone). */
export const blur = ${ts(layout.blur)} as const;

/**
 * Fixed-size controls (px). \`habit\`/\`habitCompact\` are overridden from the
 * mock/reference (design/DISCREPANCIES.md #3) — the vendored CSS still says
 * 36/34 — and \`labelCol\` is 60 where the pack says 48, because V2.1's
 * SECTION label does not fit 48 (design/DISCREPANCIES.md #20).
 */
export const sizes = ${ts(layout.sizes)} as const;

/** CSS grid-template-columns strings — web \`<Columns>\` only; native computes
 * the same three ratios directly (flex has no grid-template equivalent). */
export const grid = ${ts(layout.grid)} as const;

export const motion = ${ts(layout.motion)} as const;

/** Breakpoints (px). Consumed only by theme/useLayout.ts (ADR-07) — no
 * other file may read these directly once the row-3 lint rule lands. */
export const bp = ${ts(layout.bp)} as const;

export const misc = ${ts({
    contentMax: layout.contentMax,
    railWidth: layout.railWidth,
    barInset: layout.barInset,
    barHeight: layout.barHeight,
    hoverLift: layout.hoverLift,
    pressedOpacity: layout.pressedOpacity,
    disabledOpacity: layout.disabledOpacity,
    // design/tokens/components.css line 96 (.js-toast .js-ring) — a literal
    // in the pack's own CSS, not a --js-* custom property, so it is
    // transcribed here by hand rather than parsed.
    toastRingBorder: "rgba(255,255,255,.4)",
    // design/handoff.md line 88 ("Opened from the rail... Scrim
    // rgba(28,26,22,.3) + blur 4") — a literal in the pack's prose, not a
    // --js-* custom property, so it is transcribed here by hand.
    scrim: "rgba(28,26,22,.3)",
    scrimBlur: 4,
    // README, Do and don't: "Scrollbars: 5px, thumb rgba(122,119,111,.3),
    // transparent track, thin on Firefox." The app shipped with none, so the
    // Tasks board's horizontal scroller had only Chromium's overlay bar —
    // invisible in a still frame and to a stationary reader (ux-review R2-02).
    scrollbarSize: 5,
    scrollbarThumb: "rgba(122,119,111,.3)",
  })} as const;

/** design/tokens.json's \`iconName\` block — the only part of that file that
 * is current (design/DISCREPANCIES.md #1). tools/gen-icons.mjs (row 3) adds
 * the mock's extra names on top of this set. */
export const iconNames = ${ts(iconNames)} as const;

export const fonts = {
  body: Platform.select({ web: type.family.body, default: "InstrumentSans_400Regular" }) as string,
  bodyMedium: Platform.select({ web: type.family.body, default: "InstrumentSans_500Medium" }) as string,
  bodySemiBold: Platform.select({ web: type.family.body, default: "InstrumentSans_600SemiBold" }) as string,
  heading: Platform.select({ web: type.family.heading, default: "SourceSerif4_400Regular" }) as string,
  headingMedium: Platform.select({ web: type.family.heading, default: "SourceSerif4_500Medium" }) as string,
  mono: Platform.select({ ios: "Menlo", web: "ui-monospace", default: "monospace" }) as string,
} as const;
`;
}

function main() {
  const outArgIdx = process.argv.indexOf("--out");
  const outPath = outArgIdx !== -1 ? process.argv[outArgIdx + 1] : join(ROOT, "theme", "tokens.ts");
  writeFileSync(outPath, generate());
  console.log(`wrote ${outPath}`);
}

main();
