/**
 * FL-01, FL-04, FL-06, UP-02 — the files table, the archive's filters and the
 * upload's refusals.
 *
 * Driven through the ROUTE (`handle`) rather than by calling the handlers,
 * for the reason `search.test.ts` gives: every claim here is about what the
 * SERVER returns, and calling the handler directly would assert the same
 * function twice.
 *
 * The negative assertions are each paired with a positive one that proves the
 * query would otherwise have matched — a "does not come back" that passes
 * against a server returning nothing at all is not a guard (hard rule 14).
 */
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { FILE_KIND_LABELS, MAX_UPLOAD_BYTES, formatSize, kindForFile, matchesFileFilter } from "@/data/files";
import type { Attachment, AttachmentKind, AttachmentList } from "@/data/types";

async function files(query: Record<string, string> = {}): Promise<Attachment[]> {
  const res = await handle({ method: "GET", path: "/files", query });
  expect(res.status).toBe(200);
  return (res.json as AttachmentList).attachments;
}

const names = (rows: Attachment[]) => rows.map((f) => f.name);

beforeEach(() => {
  db.reset();
  db.asUser("josh");
});

describe("FL-01 · the task's files, and every subtask's", () => {
  it("returns the task's own files and the ones hanging off its subtasks, newest first", async () => {
    const res = await handle({ method: "GET", path: "/tasks/t1/files" });
    expect(res.status).toBe(200);
    const rows = (res.json as AttachmentList).attachments;

    // t1 carries one of its own and one on subtask t1s2 — the join is the
    // claim, so both halves are named rather than only the count.
    expect(names(rows)).toContain("passport scan.pdf");
    expect(names(rows)).toContain("Bali flights quote.pdf");
    expect(rows.find((f) => f.name === "Bali flights quote.pdf")?.subtaskId).toBe("t1s2");

    const times = rows.map((f) => Date.parse(f.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("a task with no files answers with an empty list, not a 404", async () => {
    const res = await handle({ method: "GET", path: "/tasks/t5/files" });
    expect(res.status).toBe(200);
    expect((res.json as AttachmentList).attachments).toEqual([]);
  });

  it("a task that does not exist is a 404 — an empty list would say it had none", async () => {
    expect((await handle({ method: "GET", path: "/tasks/nope/files" })).status).toBe(404);
  });
});

describe("FL-04 · the offline cache applies the server's predicate, range included (P-10, F-19)", () => {
  it("matchesFileFilter narrows by task, person, kind, range and text the way GET /files does", () => {
    const file = { id: "f", name: "Quote.pdf", kind: "pdf", addedBy: "josh", at: "2026-09-01T00:00:00.000Z", taskId: "t1", previewText: "twelve panels" } as unknown as Attachment;
    expect(matchesFileFilter(file, {}, "2026-09-10")).toBe(true);
    expect(matchesFileFilter(file, { range: "week" }, "2026-09-10")).toBe(false);
    expect(matchesFileFilter(file, { range: "month" }, "2026-09-10")).toBe(true);
    expect(matchesFileFilter(file, { q: "PANELS" }, "2026-09-10")).toBe(true);
    expect(matchesFileFilter(file, { kind: "image" }, "2026-09-10")).toBe(false);
    expect(matchesFileFilter(file, { addedBy: "all", taskId: "t1" }, "2026-09-10")).toBe(true);
  });
});

describe("FL-04 · the archive's filters", () => {
  it("q matches the NAME", async () => {
    expect(names(await files({ q: "passport" }))).toEqual(["passport scan.pdf"]);
  });

  it("q matches the EXTRACTED TEXT, which is the half that makes it worth having", async () => {
    // "reconciliation" appears in the preview of a file whose NAME says
    // nothing about it. The pair below is the point: the same query finds it,
    // and a name-only search would not.
    const rows = await files({ q: "duplicates merged" });
    expect(names(rows)).toEqual(["reconciliation notes.md"]);
    expect(rows[0].name).not.toMatch(/duplicates/i);
  });

  it("addedBy narrows to one person, and the others were there to be excluded", async () => {
    const all = await files();
    expect(new Set(all.map((f) => f.addedBy)).size).toBeGreaterThan(1);
    const mine = await files({ addedBy: "josh" });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((f) => f.addedBy === "josh")).toBe(true);
    expect(mine.length).toBeLessThan(all.length);
  });

  it("kind narrows, and taskId narrows", async () => {
    const sheets = await files({ kind: "sheet" });
    expect(sheets.every((f) => f.kind === "sheet")).toBe(true);
    expect(sheets.length).toBeGreaterThan(0);

    const t9 = await files({ taskId: "t9" });
    expect(t9.every((f) => f.taskId === "t9")).toBe(true);
    expect(t9.length).toBeGreaterThan(0);
  });

  it("range is a BACKWARD window: last 7 days excludes a file from six days ago's neighbours", async () => {
    const all = await files();
    const week = await files({ range: "week" });
    expect(week.length).toBeGreaterThan(0);
    // the fixture spreads files across six days, so the narrow window must
    // actually drop some — otherwise this test would pass on a no-op filter
    expect(week.length).toBeLessThan(all.length);
    expect(week.every((f) => all.some((a) => a.id === f.id))).toBe(true);
  });
});

describe("FL-04 · the silo gate", () => {
  it("a file in a silo the session cannot see never comes back, though the query matches it", async () => {
    // Josh sees it; Joce does not. Both halves, so the negative is not just an
    // empty server (MU-02).
    db.asUser("josh");
    expect(names(await files({ q: "Core Asset" }))).toEqual(["Core Asset board deck.pdf"]);

    db.asUser("joce");
    expect(await files({ q: "Core Asset" })).toEqual([]);
  });

  it("GET /files/{id} is a 404 for a file outside the session's silos, not a 403", async () => {
    // 404, deliberately: a 403 would confirm the file exists to somebody who
    // may not know that.
    db.asUser("joce");
    expect((await handle({ method: "GET", path: "/files/f-coreasset-deck" })).status).toBe(404);
    db.asUser("josh");
    expect((await handle({ method: "GET", path: "/files/f-coreasset-deck" })).status).toBe(200);
  });
});

describe("UP-02 · the upload", () => {
  const part = (size: number, filename = "receipt.jpg") => ({
    file: { filename, contentType: "image/jpeg", size, data: "blob:test" },
    fields: {} as Record<string, string | undefined>,
  });

  it("stores the file, files it under /JSTACK/, and it appears in the list", async () => {
    const res = await handle({ method: "POST", path: "/files", multipart: part(2048) });
    expect(res.status).toBe(200);
    const stored = res.json as Attachment;
    expect(stored.folder.startsWith("/JSTACK/")).toBe(true);
    expect(stored.addedBy).toBe("josh");
    expect(stored.dropboxUrl).toContain("dropbox.com");
    expect(names(await files())).toContain("receipt.jpg");
  });

  it("a file attached to a task lands in that task's deliverables folder and on its list", async () => {
    const res = await handle({ method: "POST", path: "/files", multipart: { ...part(1024, "notes.md"), fields: { taskId: "t9" } } });
    expect(res.status).toBe(200);
    expect((res.json as Attachment).folder).toContain("/t9");

    const onTask = await handle({ method: "GET", path: "/tasks/t9/files" });
    expect(names((onTask.json as AttachmentList).attachments)).toContain("notes.md");
  });

  it("over the server's ceiling is a 413 that names the limit", async () => {
    const res = await handle({ method: "POST", path: "/files", multipart: part(MAX_UPLOAD_BYTES + 1) });
    expect(res.status).toBe(413);
    // the SIZE, not "too large": a refusal a person can act on says what the
    // limit is (resolution #13), and this is the sentence the store turns into
    // "Too big · 25 MB is the limit"
    expect((res.json as { reason: string }).reason).toBe("25 MB is the limit");
    expect((res.json as { field: string }).field).toBe("file");
  });

  it("no file part at all is a 422 naming the field", async () => {
    const res = await handle({ method: "POST", path: "/files" });
    expect(res.status).toBe(422);
    expect((res.json as { field: string }).field).toBe("file");
  });
});

describe("FL-06 · nothing fabricates a Dropbox link any more", () => {
  it("nothing composes a Dropbox URL from a task field any more", () => {
    // `dropboxUrlFor(project)` built `https://dropbox.example/<project>` and
    // rendered it as a working button on every task card. What FL-06 removes
    // is the COMPOSITION — a link the app invented rather than one the backend
    // indexed — so the guard looks for the function and for any code that
    // still builds a dropbox host out of a template.
    const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
    /**
     * The CLIENT's directories. `data/mock/` is deliberately excluded and the
     * exclusion is asserted below rather than assumed: the mock IS the server
     * for these tests, and composing a `dropboxUrl` for a file it has just
     * stored is exactly what the backend does. What FL-06 removes is the app
     * inventing one.
     *
     * The distinction, because it is the whole of B-53: `dropboxUrlFor(project)`
     * composed a link from a field of an EXISTING record to a file it knew
     * nothing about, and rendered it as a working button. `postFile` composes
     * from the folder it just filed into and the name of the file it just
     * received. One invents a destination; the other reports one. Every one of
     * the ten fixture attachments carries its own `dropboxUrl` and the read
     * routes take it straight off the record — the upload is the only place a
     * URL is made, because it is the only file that did not exist a moment ago.
     */
    // `:(exclude)` rather than a `data/*.ts` pathspec: git's default pathspec
    // matching is fnmatch WITHOUT FNM_PATHNAME, so `*` crosses directory
    // separators and `data/*.ts` happily matched `data/mock/handlers/files.ts`.
    const CLIENT = ["app", "components", "layout", "lib", "stores", "theme", "data", ":(exclude)data/mock"];
    const grep = (pattern: string, paths: string[] = CLIENT): string[] => {
      try {
        return execFileSync("git", ["grep", "-lE", pattern, "--", ...paths], { cwd: process.cwd(), encoding: "utf8" })
          .split("\n")
          .filter((l) => l.trim() !== "");
      } catch {
        // `git grep` exits 1 when it matches nothing, which is the PASSING
        // case here. Distinguished from a real failure by the canary below.
        return [];
      }
    };

    // The grep works, and it can see the files this row ADDED. Without this
    // the assertions below would pass against a broken pattern (B-08) — and,
    // as CI proved on the first push, `git grep` only searches TRACKED files,
    // so a guard written in the same commit as its subject is blind to it
    // locally and fires on the runner.
    expect(grep("dropboxUrl").length).toBeGreaterThan(0);
    expect(grep("Attachment", ["data", ":(exclude)data/mock"]).length).toBeGreaterThan(0);

    expect(grep("dropboxUrlFor", [...CLIENT, "data/mock"])).toEqual([]);
    // a dropbox URL COMPOSED with an interpolation — the shape of the thing
    // that was removed, rather than the one host it happened to use
    expect(grep("dropbox[^\"'\\s]*/[$][{]")).toEqual([]);
    // and the exclusion is REAL, not a hole: the mock composes one, because
    // that is the server's job and the app is meant to read it rather than
    // build it. If this ever goes empty, the line above is guarding nothing.
    expect(grep("dropbox[^\"'\\s]*/[$][{]", ["data/mock"]).length).toBeGreaterThan(0);
  });

  it("every fixture attachment is stored in Dropbox and says where", async () => {
    const rows = await files();
    expect(rows.length).toBeGreaterThan(5);
    for (const f of rows) {
      expect(f.storage).toBe("dropbox");
      expect(f.folder.startsWith("/JSTACK/")).toBe(true);
      expect(f.dropboxUrl).toBeDefined();
      // FL-05's rule, from the other end: a LIST never carries a signed url.
      expect(f.url).toBeUndefined();
    }
  });
});

describe("the vocabulary", () => {
  // LV-08's pattern, and the reason T2-1's self-check cites this one: the union
  // is SPELLED OUT rather than read off the map. Reading the keys off the thing
  // under test compares it with itself (R-02) and passes whatever it holds.
  it("every AttachmentKind has a label — a wire enum never reaches a row (rule 21)", () => {
    // The union, spelled out. Reading the keys off the map would compare it
    // with itself and pass whatever it held (hard rule 14, R-02).
    const kinds: AttachmentKind[] = ["pdf", "doc", "sheet", "image", "text", "link"];
    for (const k of kinds) expect(FILE_KIND_LABELS[k]).toBeTruthy();
    expect(Object.keys(FILE_KIND_LABELS).sort()).toEqual([...kinds].sort());
  });

  it("formatSize reads the way a person would say it", () => {
    expect(formatSize(undefined)).toBeUndefined();
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(48213)).toBe("47 KB");
    expect(formatSize(1842004)).toBe("1.8 MB");
  });

  it("kindForFile reads the extension, and an unknown one is a doc rather than a guess", () => {
    expect(kindForFile("export.csv")).toBe("sheet");
    expect(kindForFile("scan.pdf")).toBe("pdf");
    expect(kindForFile("receipt.heic")).toBe("image");
    expect(kindForFile("photo", "image/png")).toBe("image");
    expect(kindForFile("notes.md")).toBe("text");
    expect(kindForFile("thing.wibble")).toBe("doc");
  });
});
