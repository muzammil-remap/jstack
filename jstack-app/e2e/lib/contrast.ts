/**
 * WCAG 2.x contrast helper (DM-02). Pure math + rendered-node measurement:
 * ratios are computed from RENDERED computed colours, with the effective
 * background found by walking up the tree past transparent ancestors —
 * never from token constants alone.
 */
import { Page } from "@playwright/test";

export function parseColor(css: string): [number, number, number, number] {
  const hex = css.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    const a = hex[2] ? parseInt(hex[2], 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = css.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (!m) throw new Error(`unparseable colour: ${css}`);
  const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
}

/** alpha-composite fg over bg (both [r,g,b,a]) → opaque [r,g,b] */
export function composite(fg: [number, number, number, number], bg: [number, number, number]): [number, number, number] {
  const a = fg[3];
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a)),
  ];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(a: string | [number, number, number], b: string | [number, number, number]): number {
  const rgbA = Array.isArray(a) ? a : composite(parseColor(a), [255, 255, 255]);
  const rgbB = Array.isArray(b) ? b : composite(parseColor(b), [255, 255, 255]);
  const [l1, l2] = [relativeLuminance(rgbA), relativeLuminance(rgbB)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export type MeasuredPair = {
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  bar: number;
  pass: boolean;
};

/**
 * Measure the contrast of a rendered element's text colour against its
 * effective background (nearest non-transparent ancestor background,
 * alpha-composited).
 */
export async function measureContrast(page: Page, selector: string, label: string, bar: number): Promise<MeasuredPair> {
  const raw = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`measureContrast: no element for ${sel}`);
    const fg = getComputedStyle(el).color;
    const chain: string[] = [];
    let node: Element | null = el;
    while (node) {
      chain.push(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    return { fg, chain };
  }, selector);

  // composite the background chain bottom-up from an opaque white base
  let bg: [number, number, number] = [255, 255, 255];
  for (let i = raw.chain.length - 1; i >= 0; i--) {
    const c = parseColor(raw.chain[i]);
    if (c[3] > 0) bg = composite(c, bg);
  }
  const fgC = composite(parseColor(raw.fg), bg);
  const ratio = contrastRatio(fgC, bg);
  return { label, fg: raw.fg, bg: `rgb(${bg.join(",")})`, ratio: Math.round(ratio * 100) / 100, bar, pass: ratio >= bar };
}
