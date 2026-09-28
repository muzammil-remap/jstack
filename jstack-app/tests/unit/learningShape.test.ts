/**
 * LL-01, `02_ACCEPTANCE_TESTS_v22.md` — `LearningItem` carries `kind`, and
 * either `url` or `body`; `GET /learning?q=` and `GET /learning/{id}` exist
 * in the route table.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { ROUTES } from "@/data/routes";
import type { LearningItem } from "@/data/types";

const app = join(__dirname, "..", "..");

async function learning(query: Record<string, string> = {}): Promise<LearningItem[]> {
  const res = await handle({ method: "GET", path: "/learning", query });
  expect(res.status).toBe(200);
  return res.json as LearningItem[];
}

describe("LL-01 · LearningItem's shape, and its two routes", () => {
  it("LearningItem carries kind, url and body (data/types.ts)", () => {
    const src = readFileSync(join(app, "data", "types.ts"), "utf8");
    const m = /export type LearningItem = \{[^}]*\}/.exec(src);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/kind\?:\s*"read"\s*\|\s*"watch"\s*\|\s*"listen"/);
    expect(m![0]).toMatch(/url\?:\s*string/);
    expect(m![0]).toMatch(/body\?:\s*string/);
  });

  it("GET /learning (with ?q=) and GET /learning/{id} are both in the route table", () => {
    const list = ROUTES.find((r) => r.method === "GET" && r.path === "/learning");
    const item = ROUTES.find((r) => r.method === "GET" && r.path === "/learning/{id}");
    expect(list?.response).toBe("LearningList");
    expect(item?.response).toBe("LearningItem");
  });

  describe("GET /learning?q= actually filters (C-7c — the row was moved to PASS without this)", () => {
    beforeEach(() => {
      db.reset();
      db.asUser("josh");
    });

    it("q= narrows to rows whose title matches, not the whole list", async () => {
      const all = await learning();
      expect(all.length).toBeGreaterThan(1);
      const narrowed = await learning({ q: "orchestration" });
      expect(narrowed.length).toBeGreaterThan(0);
      expect(narrowed.length).toBeLessThan(all.length);
      for (const row of narrowed) expect(row.title.toLowerCase()).toContain("orchestration");
    });

    it("q= is case-insensitive and matches nothing for a word no row carries", async () => {
      const upper = await learning({ q: "ORCHESTRATION" });
      expect(upper.length).toBeGreaterThan(0);
      const none = await learning({ q: "xyzzy-not-a-real-word" });
      expect(none).toEqual([]);
    });

    /**
     * WPG-1c — LL-03's own acceptance wording: "'podcast' finds the listen
     * item". `le2`'s "podcast" sits in its META ("podcast · half listened,
     * queued for the drive"), not its title, body or kind, so this is the
     * case that would have caught title/body/kind-only search never
     * matching it — the route answered `[]` for this exact query until meta
     * joined the searched fields.
     */
    it("q=podcast finds exactly the listen item, by its meta", async () => {
      const found = await learning({ q: "podcast" });
      expect(found.map((r) => r.id)).toEqual(["le2"]);
      expect(found[0].kind).toBe("listen");
    });
  });
});
