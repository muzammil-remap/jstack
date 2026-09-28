/**
 * Automated sweeps for the v1.1 harness (02 Part 2):
 *  - horizontal-scroll check + interactive-overlap + edge-clipping (RL-11)
 *  - touch-target floor at any width (GL-04 re-run per RL-09)
 * Each sweep RETURNS violations rather than asserting, so the rig
 * self-test can prove it detects planted defects (red-green per rig).
 */
import { Page } from "@playwright/test";

/**
 * AUDIT_v2.md A-02: this listed the roles the app happened to use, so a whole
 * class of control — 24 text links written as a bare `<Text onPress>`, which
 * RNW renders with NO role — was invisible to every sweep built on it. GL-05
 * read PASS while 24 controls sat at 13-14px against its 36px floor. `[role=
 * "link"]` is now in the selector, and any pressable that carries a hitSlop is
 * caught by `[data-hitslop]` whatever its role, so the next control class
 * cannot hide the same way.
 */
export const INTERACTIVE_SELECTOR =
  '[role="button"], button, [role="switch"], [role="checkbox"], [role="link"], [role="tab"], input, textarea, a[href], [data-hitslop]';

export type SweepViolation = { kind: string; detail: string };

/** RL-11: the page body must never scroll horizontally. */
export async function horizontalScrollViolations(page: Page): Promise<SweepViolation[]> {
  const over = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  return over.scrollWidth > over.clientWidth + 1
    ? [{ kind: "hscroll", detail: `scrollWidth ${over.scrollWidth} > clientWidth ${over.clientWidth}` }]
    : [];
}

/**
 * RL-11: no two visible interactive elements may overlap (unless one contains
 * the other), and none may be clipped by the viewport edges.
 */
export async function overlapViolations(page: Page, root?: string): Promise<SweepViolation[]> {
  return page.evaluate(({ SEL, ROOT }) => {
    const isVisible = (el: Element): boolean => {
      let node: Element | null = el;
      while (node) {
        const cs = getComputedStyle(node);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
        node = node.parentElement;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const describe = (el: Element): string => {
      const t = el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.tagName.toLowerCase();
      const r = el.getBoundingClientRect();
      return `${t}@${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    };
    // scope to one surface: expo-router keeps inactive tab scenes mounted
    // (BUGLOG B-5), so an unscoped sweep compares elements across stacked
    // screens; chrome-vs-content crossings are GL-05/GL-10's domain
    const scope = ROOT ? document.querySelector(ROOT) : document;
    if (!scope) return [{ kind: "scope", detail: `no element for ${ROOT}` }];
    const els = Array.from(scope.querySelectorAll(SEL)).filter(isVisible);
    const out: { kind: string; detail: string }[] = [];
    const vw = document.documentElement.clientWidth;
    const inHScroller = (el: Element): boolean => {
      let node: Element | null = el.parentElement;
      while (node) {
        const cs = getComputedStyle(node);
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && node.scrollWidth > node.clientWidth) return true;
        node = node.parentElement;
      }
      return false;
    };
    const isFloat = (el: Element): boolean => el.closest('[data-sweep="float"]') != null;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      // content inside a horizontal scroller extends past the viewport by
      // design — scrolling reaches it; that is not clipping
      if ((r.left < -1 || r.right > vw + 1) && !inHScroller(el)) {
        out.push({ kind: "clipped", detail: `${describe(el)} exceeds viewport width ${vw}` });
      }
    }
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i];
        const b = els[j];
        if (a.contains(b) || b.contains(a)) continue;
        // floating chrome (orb, FAB) sits over scrollable content by design —
        // scrolling moves the content out from under it (GL-05/GL-10 police
        // the true chrome collisions)
        if (isFloat(a) !== isFloat(b)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ix > 8 && iy > 8) {
          out.push({ kind: "overlap", detail: `${describe(a)} overlaps ${describe(b)} (${Math.round(ix)}x${Math.round(iy)})` });
        }
      }
    }
    return out;
  }, { SEL: INTERACTIVE_SELECTOR, ROOT: root ?? null });
}

/**
 * S-7 removed `textClippingViolations` from here. It implemented RL-08 — no
 * text leaf horizontally clipped, no line left holding a single character —
 * and nothing imported it: `e2e/matrix/theme.spec.ts` has its own inline
 * version, which runs on every tab across all eight width x scheme
 * projects, excludes the two legitimate reasons a node measures
 * `scrollWidth > clientWidth`, and has its orphan threshold calibrated
 * against a real three-character word in this app.
 *
 * Worth recording where the deleted one was BETTER, since "it was a
 * duplicate" is not the whole truth: it counted actual non-space characters
 * per line with a Range per character, where theme.spec approximates with
 * the last line's rect width. That is more faithful to RL-08's wording. It
 * is also a Range per character on every text leaf on every tab in eight
 * projects, and the approximation is green and documented. If RL-08 ever
 * misses a real orphan, the precise version is in this file's history.
 */
/**
 * GL-04 floor at any width (RL-09): every visible interactive element's box
 * (plus 2× its declared data-hitslop) must meet the floor. Ported from the
 * v1 GL-04 sweep: inputs/textareas measure their styled parent box.
 */
export async function touchTargetViolations(page: Page, floor: number, root?: string): Promise<SweepViolation[]> {
  return page.evaluate(
    ({ SEL, FLOOR, ROOT }) => {
      const out: { kind: string; detail: string }[] = [];
      const scope = ROOT ? document.querySelector(ROOT) : document;
      if (!scope) return [{ kind: "scope", detail: `no element for ${ROOT}` }];
      const els = Array.from(scope.querySelectorAll(SEL));
      for (const el of els) {
        let hidden = false;
        let node: Element | null = el;
        while (node) {
          const cs = getComputedStyle(node);
          if (cs.display === "none" || cs.visibility === "hidden") {
            hidden = true;
            break;
          }
          node = node.parentElement;
        }
        if (hidden) continue;
        const target = el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? (el.parentElement ?? el) : el;
        const r = target.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // AUDIT_v2.md AA-01: this used to ADD `2 × data-hitslop` to the measured
        // box, on the belief that react-native-web honours `hitSlop`. It does
        // not — only the legacy Touchable components do — so the sweep credited
        // a hit area that did not exist and reported an 11 × 14 tap target as
        // 39 × 42. The credit is gone; the rect is the truth. A control that
        // needed a bigger target now has real padding (`webHitArea`), which
        // this rect already includes.
        //
        // PACK-SIZED COMPONENTS are exempt from the 36 floor, because the pack
        // FIXES their size and GL-05 cannot demand both: "Icon button: 32 or 36
        // square", "Checkbox: 15px", "Habit chip: min-height 34", "switches
        // 26 × 15", and Accessibility's own carve-out, "row verbs are 28px tall
        // but sit inside a 44px row that is also tappable". Removing the
        // phantom credit is what made that conflict visible — it had been
        // papered over rather than decided (02_ACCEPTANCE_TESTS_v2.md §4, A-46).
        // EVERY one of them is asserted against the pack by "GL-05 pack-fixed
        // component sizes" in e2e/matrix/theme.spec.ts, which measures the
        // RENDERED box of each exempt class at phone width — a stricter check
        // than a floor. (It covered four of the eight until AUDIT_v2.md B5-04;
        // the exemption is only honest while the assertion is complete.) (This comment used to cite tokens.test.ts and
        // primitives.test.tsx, which assert a constant and a prop and measure
        // nothing: AUDIT_v2.md AAA-03, and its round-4 note B4-05.)
        const packSized =
          target.hasAttribute("data-iconbtn") ||
          target.hasAttribute("data-checkbox") ||
          target.hasAttribute("data-habit") ||
          target.hasAttribute("data-switch") ||
          target.hasAttribute("data-chip") ||
          target.hasAttribute("data-btn-sm") ||
          target.hasAttribute("data-field-io") || // handoff.md: "30px buttons"

          target.getAttribute("role") === "tab";
        if (packSized) continue;
        const w = r.width;
        const h = r.height;
        if (w < FLOOR || h < FLOOR) {
          const t = el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.tagName.toLowerCase();
          out.push({ kind: "touch", detail: `${t} ${Math.round(w)}x${Math.round(h)} < ${FLOOR}` });
        }
      }
      return out;
    },
    { SEL: INTERACTIVE_SELECTOR, FLOOR: floor, ROOT: root ?? null },
  );
}

/**
 * WCAG 2.5.3 Label in Name — a control's accessible NAME must contain the
 * words it VISIBLY shows, so that "tap Unlock with passkey" reaches the
 * control a person is looking at.
 *
 * QB-04's sweep proves a control has *a* name; it cannot see a name that
 * contradicts the label beside it. The planner found the pair on the lock
 * screen at 393 (12 Sep): the button reads "Unlock with passkey" and the
 * control announced "Unlock with Face ID", so speech input had no way in and
 * a screen-reader user heard a mechanism the web build does not use.
 * The same argument as B4-04's: one sweep, or the next mismatch is found by
 * whoever happens to look.
 */
export async function labelInNameViolations(page: Page, root?: string): Promise<SweepViolation[]> {
  return page.evaluate(
    ({ SEL, ROOT }) => {
      // WCAG 2.5.3 compares the words a person SAYS to the words a machine
      // hears, so the comparison is on words: case folded, punctuation and the
      // middle dots this app joins meta with reduced to spaces.
      const words = (s: string): string =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const out: { kind: string; detail: string }[] = [];
      const scope = ROOT ? document.querySelector(ROOT) : document;
      if (!scope) return [{ kind: "scope", detail: `no element for ${ROOT}` }];
      for (const el of Array.from(scope.querySelectorAll(SEL))) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const name = words(el.getAttribute("aria-label") ?? "");
        if (name === "") continue; // named by its own text: 2.5.3 cannot be broken
        // text NODE by text node, joined with a space: `textContent` runs a
        // title straight into the meta line under it ("Habits" + "4/9" reads
        // as "Habits4/9"), which is a difference the reader never hears
        const runs: string[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const t = (node.textContent ?? "").trim();
          if (t !== "") runs.push(t);
        }
        const visible = words(runs.join(" "));
        if (visible === "") continue; // nothing visible to say
        // One must contain the other. A composite row names itself by its
        // TITLE and shows more beneath it ("Reply to Andy…" over "expires Sun
        // 5pm"), and a state row shows a word and announces the state with it
        // ("Sync" / "Sync · needs attention") — both are 2.5.3-sound, because
        // what a person says is on the screen in front of them. What is NOT
        // sound is a name that shares no ground with the label at all: the
        // gate said "Unlock with Face ID" over a button reading "Unlock with
        // passkey", and neither contained the other.
        if (name.includes(visible) || visible.includes(name)) continue;
        const id = el.getAttribute("data-testid") ?? el.tagName.toLowerCase();
        out.push({
          kind: "label-in-name",
          detail: `${id}: says "${runs.join(" ").slice(0, 80)}", hears "${el.getAttribute("aria-label")}"`,
        });
      }
      return out;
    },
    { SEL: INTERACTIVE_SELECTOR, ROOT: root ?? null },
  );
}

/**
 * QB-04 — every interactive control has an accessible NAME.
 *
 * AUDIT_v2.md B4-04: the names were being added by hand to whichever controls
 * someone had looked at, so three dialog inputs still had none. A sweep is the
 * only way that stops recurring — the same argument as GL-07's date sweep and
 * GL-05's own floor.
 *
 * A control is named if it carries `aria-label`, or wraps text of its own, or
 * is an input with an associated label. Text content counts because that is how
 * a screen reader names a link or a button in practice.
 */
export async function unnamedControlViolations(page: Page, root?: string): Promise<SweepViolation[]> {
  return page.evaluate(
    ({ SEL, ROOT }) => {
      const out: { kind: string; detail: string }[] = [];
      const scope = ROOT ? document.querySelector(ROOT) : document;
      if (!scope) return [{ kind: "scope", detail: `no element for ${ROOT}` }];
      for (const el of Array.from(scope.querySelectorAll(SEL))) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const aria = el.getAttribute("aria-label") ?? el.getAttribute("aria-labelledby");
        const text = (el.textContent ?? "").trim();
        const placeholder = el.getAttribute("placeholder") ?? (el.querySelector("input,textarea")?.getAttribute("placeholder") ?? "");
        if ((aria == null || aria === "") && text === "" && placeholder === "") {
          const id = el.getAttribute("data-testid") ?? el.tagName.toLowerCase();
          out.push({ kind: "unnamed", detail: `${id} has no accessible name` });
        }
      }
      return out;
    },
    { SEL: INTERACTIVE_SELECTOR, ROOT: root ?? null },
  );
}
