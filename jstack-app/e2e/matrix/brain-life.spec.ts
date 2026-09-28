/** Brain and Life render clean at every width and theme (LF-10: no per-category colour, verified visually here alongside the console budget). */
import { assertCleanConsole, expect, gotoTab, openUnlocked, test } from "../helpers";

test.describe("Brain and Life render clean at every width and theme", () => {
  test("Brain's entry/memory/files and Life's habits/money all mount without console noise", async ({ page }) => {
    const log = await openUnlocked(page);

    await gotoTab(page, "brain");
    await expect(page.getByTestId("brain-entry-section")).toBeVisible();
    await expect(page.getByTestId("brain-memory-section")).toBeVisible();
    // ST-1: `brain-rules-section` is GONE — the EA's standing rules live under
    // Settings › Autonomy now (§4, and `registry.test.ts` asserts the removal).
    // Files takes its place in the same column, so this still names three
    // sections and still proves the tab mounts whole rather than relaxing to
    // two: a smoke test that shrinks when a section moves stops being one.
    await expect(page.getByTestId("brain-files-section")).toBeVisible();

    await gotoTab(page, "life");
    await expect(page.getByTestId("life-habits-section")).toBeVisible();
    await expect(page.getByTestId("life-money-section")).toBeVisible();
    await expect(page.getByTestId("life-health-section")).toBeVisible();

    assertCleanConsole(log);
  });
});

/**
 * X1-07 (N-1) — Brain's Latest in must not print its meta line and its `edit`
 * link on top of each other.
 *
 * The ux round measured "8:31am" and "edit" occupying the same pixels at 1920,
 * 1366 and 393 in both schemes, and at 1024 the line breaking so the second
 * line OPENS with "· edit". It arrived with a later row — the N-0 record frame
 * shows it clean — and N-1 owns it because N-1 recomposes Brain.
 *
 * In the MATRIX suite, deliberately: an overprint that only one width catches
 * is not fixed, and the planner asked for all four widths in both schemes.
 * Measured as an intersection of two boxes rather than by eye, because the
 * text still READS at a glance and it is the geometry that is wrong.
 */
test.describe("X1-07 · Latest in's meta and its edit link never overlap", () => {
  // `theme/ui/text.tsx`'s LINK_SLOP. A literal, because a spec runs in node and
  // importing from `@/theme/ui` drags react-native into the Playwright process.
  const LINK_SLOP = 14;

  test("the two boxes are disjoint on every row, at every width and scheme", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "brain");

    const rows = page.locator("[data-testid^='latest-meta-']");
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);

    const overlaps: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const id = (await rows.nth(i).getAttribute("data-testid"))!.replace("latest-meta-", "");

      // THE LAST LINE, not the box. The meta wraps, so its bounding box is as
      // wide as its widest line and tells you nothing about where the text
      // actually ends — comparing against it reported a 300px "overlap" on a
      // row that merely wrapped. `getClientRects()` gives one rect per visual
      // line; the last one is where the reader's eye leaves the meta.
      const box = await page.getByTestId(`latest-meta-${id}`).evaluate((el) => {
        // A RANGE over the element's contents, not `el.getClientRects()`.
        // The meta renders as a block-level div, and a block's client rects
        // are its ONE full-width box however many lines the text takes — which
        // reported a 300px "overlap" on a row that merely wrapped. A range
        // gives one rect per LINE of text, which is what a reader sees.
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0);
        const last = rects[rects.length - 1] ?? el.getBoundingClientRect();
        return { right: last.right, top: last.top, bottom: last.bottom };
      });
      const edit = await page.getByTestId(`edit-item-${id}`).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        // THE INK, inset on ALL FOUR sides. `webHitArea` pads the box out to
        // make a real tap target and pulls the margin back so the layout does
        // not move, which means the box is 28px taller and wider than the
        // text. Comparing the BOX vertically against the INK horizontally said
        // a link that had wrapped onto the next line was overlapping the one
        // above it — the guard would have blocked a correct fix.
        return {
          inkLeft: r.left + parseFloat(cs.paddingLeft),
          inkTop: r.top + parseFloat(cs.paddingTop),
          inkBottom: r.bottom - parseFloat(cs.paddingBottom),
        };
      });

      const sameLine = edit.inkTop < box.bottom - 0.5 && edit.inkBottom > box.top + 0.5;
      if (sameLine && edit.inkLeft < box.right - 0.5) {
        overlaps.push(`${id}: meta's last line ends ${box.right.toFixed(1)}, edit ink starts ${edit.inkLeft.toFixed(1)}`);
      }
    }
    expect(overlaps).toEqual([]);
  });
});

/**
 * BR-05 (N-1, N2-01) — the routing chip is accent ink and the rest of the meta
 * line is not.
 *
 * BR-05 has said "rows with meta and routing chips in accent ink" since V2,
 * and `handoff.md` §Brain says the same, but nothing measured it: the ID's
 * only test drives the editor and its versions. So the line was entirely
 * accent for three releases — which made the source and the time read as
 * tappable when only `edit` is — and then, when N-1 muted it, entirely muted,
 * which broke the clause in the other direction. Neither was caught, because
 * a claim with no gate is a lie in waiting (hard rule 15).
 *
 * In the MATRIX suite because a colour is a token in both schemes.
 */
test.describe("BR-05 · the routing chip is the accent, and only it", () => {
  test("routing is accent ink, the meta beside it is muted, and edit is accent", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "brain");

    const rows = page.locator("[data-testid^='latest-routing-']");
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);

    const colourOf = (testId: string) => page.getByTestId(testId).evaluate((el) => getComputedStyle(el).color);

    for (let i = 0; i < n; i += 1) {
      const id = (await rows.nth(i).getAttribute("data-testid"))!.replace("latest-routing-", "");
      const routing = await colourOf(`latest-routing-${id}`);
      const meta = await colourOf(`latest-meta-${id}`);
      const edit = await colourOf(`edit-item-${id}`);

      // the three colours, compared with each other rather than to a literal:
      // the tokens differ per scheme, and what BR-05 claims is the RELATIONSHIP
      expect(routing).not.toBe(meta);
      expect(edit).toBe(routing);
    }
  });
});
