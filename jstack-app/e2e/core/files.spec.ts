/**
 * FL-01..FL-06, UP-01..UP-03 (X-1) — files on the task card, in Brain, in the
 * archive, and the upload.
 *
 * The INDEX, the filters and the silo gate are `tests/unit/files.test.ts`:
 * what the server returns is a statement about a response, and asserting it
 * through a browser would be asserting that React renders. What is here is
 * what only a browser can answer — that a row opens the right thing, that the
 * viewer shows text and the link names Dropbox, that a chosen file appears as
 * a removable chip before it is sent, and that the offline paths say the two
 * different true things rather than one vague one.
 *
 * The upload is driven through a real `DataTransfer` on a real `<input
 * type=file>` (`setInputFiles`), not by calling the store: UP-01's claim is
 * that a person can pick a file, and a test that skipped the picker would
 * leave the only part that can break untested.
 */
import { assertCleanConsole, db, expect, gotoTab, openUnlocked, pickProject, test } from "../helpers";

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__ is test-only, untyped by design */
const rig = (page: Page) => ({
  goOffline: () => page.evaluate(() => (window as any).__JSTACK__.goOffline()),
  goOnline: () => page.evaluate(() => (window as any).__JSTACK__.goOnline()),
  outbox: () => page.evaluate(() => (window as any).__JSTACK__.outbox()) as Promise<{ offlineId: string; path: string }[]>,
});
/* eslint-enable @typescript-eslint/no-explicit-any */
import type { Page } from "@playwright/test";

async function openTask(page: Page, id: string, view: "list" | "done" = "list") {
  const log = await openUnlocked(page);
  await gotoTab(page, "tasks");
  if (view === "done") await page.getByTestId("task-seg").getByRole("tab", { name: "Done" }).click();
  await page.getByTestId(`task-open-${id}`).click();
  await expect(page.getByTestId("task-detail")).toBeVisible();
  return log;
}

/** the hidden input the attach control creates; `setInputFiles` drives it the
 * way a person's picker would, so the whole path is exercised */
async function attach(page: Page, trigger: string, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId(trigger).click();
  await (await chooser).setFiles(files);
}

const small = (name = "receipt.jpg") => ({ name, mimeType: "image/jpeg", buffer: Buffer.alloc(2 * 1024, 1) });
const huge = (name = "video.mp4") => ({ name, mimeType: "video/mp4", buffer: Buffer.alloc(11 * 1024 * 1024, 1) });

test.describe("FL-01/FL-02 the task card's files", () => {
  test("the task's files and its subtask's, each naming what it is and who added it", async ({ page }) => {
    const log = await openTask(page, "t1");
    const files = page.getByTestId("task-files");
    await expect(files).toBeVisible();

    await expect(files).toContainText("passport scan.pdf");
    // the subtask's file is here too, and the row says which subtask (FL-01)
    await expect(files).toContainText("Bali flights quote.pdf");
    await expect(files.getByTestId("task-file-f-t1-quote")).toContainText("EA");
    await expect(files.getByTestId("task-file-f-t1-passport")).toContainText("PDF");
    await expect(files.getByTestId("task-file-f-t1-passport")).toContainText("Josh");
    assertCleanConsole(log);
  });

  test("at 393 the longest meta — the one carrying a subtask — fits its row and clips nothing", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "w393-light", "a phone-width claim (hard rule 24)");
    await openTask(page, "t1");

    // The ux round asked for this and the capture pass could not answer it: no
    // frame carried the fifth `[subtask]` part, which is the longest the line
    // ever gets. Measured rather than eyeballed — a frame would show one file
    // name at one length, and this asserts the rule for whatever the fixture
    // holds.
    const row = page.getByTestId("task-file-f-t1-quote");
    await expect(row).toContainText("Bali flights"); // the subtask's file
    const box = await row.boundingBox();
    const meta = row.locator("div").last();
    const metaBox = await meta.boundingBox();
    expect(box).not.toBeNull();
    expect(metaBox).not.toBeNull();
    // inside its row, with nothing running past the edge
    expect(metaBox!.x + metaBox!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
    // and it wrapped rather than truncating: no ellipsis character anywhere
    await expect(row).not.toContainText("…");
  });

  test("a row opens the file, and one with extracted text opens the viewer rather than a link", async ({ page }) => {
    const log = await openTask(page, "t9", "done");
    await page.getByTestId("task-files").getByTestId("task-file-f-t9-notes").click();

    const dialog = page.getByTestId("file");
    await expect(dialog).toBeVisible();
    // the text is READ here — the whole point of an extracted preview
    await expect(dialog.getByTestId("file-viewer")).toContainText("duplicates merged");
    // and where it lives is named, because "the app has it" and "I can find it
    // again without the app" are different things
    await expect(dialog.getByTestId("file-folder")).toContainText("/JSTACK/");
    assertCleanConsole(log);
  });

  test("Open in Dropbox goes through the external-link confirmation, and the sheet names Dropbox", async ({ page }) => {
    await openTask(page, "t1");
    await page.getByTestId("task-files").getByTestId("task-file-f-t1-passport").click();
    await page.getByTestId("file-open-dropbox").click();

    const confirm = page.getByTestId("external-link-dialog");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("Dropbox");
  });
});

test.describe("FL-06 no fabricated Dropbox link", () => {
  test("the task card has no Dropbox folder button — its files carry the real links", async ({ page }) => {
    await openTask(page, "t1");
    await expect(page.getByTestId("task-link-dropbox")).toHaveCount(0);
    // the positive half: what replaced it is there and populated
    await expect(page.getByTestId("task-files")).toContainText("passport scan.pdf");
  });
});

test.describe("FL-03/FL-04 Brain › Files and the archive", () => {
  test("the section lists what arrived, newest first, with who added each", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "brain");
    const section = page.getByTestId("brain-files-section");
    await expect(section).toBeVisible();
    await expect(section).toContainText("coaching brief.docx");
    await expect(section).toContainText("EA");
    assertCleanConsole(log);
  });

  test("all opens the archive; the filters and the search narrow it", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "brain");
    await page.getByTestId("files-verb").click();

    const rows = page.getByTestId("files-archive-rows");
    await expect(page.getByTestId("files-archive-dialog")).toBeVisible();
    await expect(rows).toContainText("passport scan.pdf");

    // the text search reaches the EXTRACTED text, not only the name
    await page.getByTestId("files-archive-search").fill("duplicates merged");
    await expect(rows).toContainText("reconciliation notes.md");
    await expect(rows).not.toContainText("passport scan.pdf");

    // and who narrows: clear the query first so the two filters are not
    // confounded, then pick a person who did not add that file
    await page.getByTestId("files-archive-search").fill("");
    await expect(rows).toContainText("passport scan.pdf");
    await page.getByTestId("files-archive-who").getByText("EA", { exact: true }).click();
    await expect(rows).not.toContainText("passport scan.pdf");
    await expect(rows).toContainText("reconciliation notes.md");
  });

  test("an archive row opens the same viewer the task card opens", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "brain");
    await page.getByTestId("files-verb").click();
    await page.getByTestId("files-archive-row-f-t9-notes").click();
    await expect(page.getByTestId("file")).toBeVisible();
    await expect(page.getByTestId("file-viewer")).toContainText("duplicates merged");
  });
});

test.describe("UP-01/UP-02 attaching a file", () => {
  test("a chosen file shows as a removable chip before it is sent, and removing it drops it", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "brain");

    await attach(page, "dump-attach", [small(), small("second.jpg")]);
    const chips = page.getByTestId("dump-attachments");
    await expect(chips).toContainText("receipt.jpg");
    await expect(chips).toContainText("second.jpg");

    await page.getByTestId("attach-remove-second.jpg").click();
    await expect(chips).not.toContainText("second.jpg");
    await expect(chips).toContainText("receipt.jpg");
    assertCleanConsole(log);
  });

  test("sending the capture uploads the file, and it appears in Brain › Files as mine", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "brain");

    await attach(page, "dump-attach", [small("scan of the lease.jpg")]);
    await page.getByTestId("dump-input").fill("The lease, for the file");
    await page.getByTestId("dump-send").click();

    await expect(page.getByTestId("brain-files-section")).toContainText("scan of the lease.jpg");
    const state = await db(page);
    const stored = state.files.find((f: { name: string }) => f.name === "scan of the lease.jpg");
    expect(stored.addedBy).toBe("josh");
    expect(stored.folder.startsWith("/JSTACK/")).toBe(true);
    // ADR-64: the capture and the file know about each other
    expect(stored.captureId).toBeTruthy();
  });

  test("attaching from the task card puts it on that task", async ({ page }) => {
    await openTask(page, "t1");
    await attach(page, "task-files-attach", [small("insurance.jpg")]);
    await expect(page.getByTestId("task-files")).toContainText("insurance.jpg");

    const state = await db(page);
    expect(state.files.find((f: { name: string }) => f.name === "insurance.jpg").taskId).toBe("t1");
  });
});

test.describe("UP-03 offline", () => {
  test("a small file queues with its capture, in that order, and replays on reconnect", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "brain");

    // the app's OWN offline flag, not `context.setOffline`. Without a service
    // worker the page cannot fetch at all once the context is offline, which
    // proves nothing about the queue and breaks every later assertion — the
    // same reason OF-06 reloads instead (offline.spec.ts:46).
    await rig(page).goOffline();

    await attach(page, "dump-attach", [small("train receipt.jpg")]);
    await page.getByTestId("dump-input").fill("Bought a ticket");
    await page.getByTestId("dump-send").click();

    // BOTH are queued, and the FILE is first: the capture names the file by
    // id, so replaying the capture before its upload would reference a file
    // the server has never seen (UP-02, ADR-64).
    await expect.poll(async () => (await rig(page).outbox()).map((e) => e.path)).toEqual(["/files", "/brain/dump"]);

    await rig(page).goOnline();
    await expect.poll(async () => (await rig(page).outbox()).length, { timeout: 15000 }).toBe(0);
    await expect(page.getByTestId("brain-files-section")).toContainText("train receipt.jpg");
  });

  test("a file over the queue's ceiling is refused with the line that says what to do", async ({ page }) => {
    await openTask(page, "t1");
    await rig(page).goOffline();
    await attach(page, "task-files-attach", [huge()]);

    // the two refusals are different sentences on purpose: this one is the
    // QUEUE declining to hold 11 MB, and the remedy is a connection rather
    // than a smaller file
    await expect(page.getByTestId("task-files-error")).toContainText("Needs a connection");
    await expect(page.getByTestId("task-files-error")).toContainText("10 MB");

    // and it is genuinely not queued — a promise not made rather than one
    // made and broken
    expect(await rig(page).outbox()).toEqual([]);
  });
});

/**
 * Stage 6 A-3 (S6-31) — the archive never said how many files there were or
 * that the list had ended, its rows had no open affordance where the same
 * rows on the tab do, the meta omitted the parent, and the who-chips were a
 * literal four that could not filter for the file Dev added.
 */
test.describe("Stage 6 A-3 · the archive says how many, ends, and opens", () => {
  test("a count line under the list, an open on every row, the parent in the meta, and Dev among the who-chips", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "brain");
    await page.getByTestId("files-verb").click();
    const rows = page.getByTestId("files-archive-rows");
    await expect(rows).toContainText("passport scan.pdf");
    const n = await rows.locator('[data-testid^="files-archive-row-"]').count();
    expect(n).toBeGreaterThan(1);
    await expect(page.getByTestId("files-archive-count")).toHaveText(`${n} files · that's all`);
    await expect(page.locator('[data-testid^="archive-open-"]')).toHaveCount(n);
    await expect(page.getByTestId("files-archive-row-f-t1-quote")).toContainText("on a subtask");

    // the who-chips are the roster, so the file Dev added can be filtered for
    await page.getByTestId("files-archive-who").getByText("Dev", { exact: true }).click();
    await expect(rows).toContainText("runbook");
    await expect(page.getByTestId("files-archive-count")).toHaveText("1 file · that's all");

    // and the row's own open opens the same viewer the row does
    await page.getByTestId("archive-open-f-dev-runbook").click();
    await expect(page.getByTestId("file")).toBeVisible();
  });
});

/**
 * S6-54, the Files half (ux round 3, carried at the A-3 cap; fixed at A-6).
 *
 * Seven segments — "Any kind" through "Link" — in the card's 354 px at 393, so
 * "Document", "Spreadsheet" and "Image" printed through their neighbours; clean
 * at 1024 and up. B-171 fixed the OTHER half of S6-54, the Voice card's Speed,
 * by giving that control its whole row; this one already spans its row, so
 * width is not the answer and the labels have to take two rows.
 *
 * The assertion is the defect itself rather than the shape of the fix: a
 * label wider than the segment holding it is a label printing over its
 * neighbour, at any width and for any `Seg` in the app.
 */
test.describe("S6-54 the kind filter holds its own labels", () => {
  test("no segment's label is wider than the segment (393)", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 768, "the segments fit from 1024 up; 393 is where they overprint");
    const log = await openUnlocked(page);
    await gotoTab(page, "brain");
    await page.getByTestId("files-verb").click();
    await expect(page.getByTestId("files-archive-dialog")).toBeVisible();

    const overflowing = await page.getByTestId("files-archive-kind").evaluate((root) => {
      const out: string[] = [];
      for (const seg of Array.from(root.querySelectorAll('[role="tab"]'))) {
        const segBox = seg.getBoundingClientRect();
        // the label element inside the segment (RNW renders <Text> as a div)
        const label = (seg.firstElementChild ?? seg) as HTMLElement;
        const labelBox = label.getBoundingClientRect();
        if (labelBox.width > segBox.width + 1) {
          out.push(`${(label.textContent ?? "").trim()}: label ${Math.round(labelBox.width)} > segment ${Math.round(segBox.width)}`);
        }
      }
      return out;
    });
    expect({ labelsWiderThanTheirSegment: overflowing }).toEqual({ labelsWiderThanTheirSegment: [] });
    assertCleanConsole(log);
  });
});
