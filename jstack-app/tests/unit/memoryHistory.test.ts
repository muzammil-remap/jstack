/**
 * MH-A, CONTRACT.md §4.18 — `GET /memory/history` answers `MemoryHistoryEntry[]`,
 * newest first, and "accepting or editing a memory proposal appends one". The
 * mock changed the proposal's own state and wrote nothing to memory history.
 */
import { get as dbGet, reset as resetDb } from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import type { MemoryHistoryEntry, MemoryProposal } from "@/data/types";

const proposals = () => dbGet().memoryProposals;
const history = () => dbGet().memoryHistory;
const openProposal = (): MemoryProposal => proposals().find((p) => p.state === "open")!;

beforeEach(() => resetDb());

describe("MH-A · accepting or editing a memory proposal appends a memory-history entry", () => {
  it("accept (verb: ok) appends one, newest first, decision accepted", async () => {
    const before = history().length;
    const p = openProposal();

    const res = await handle({ method: "POST", path: `/memory/proposals/${p.id}` as const, body: { verb: "ok" } } as never);

    expect(res.status).toBe(200);
    const h = history();
    expect(h.length).toBe(before + 1);
    expect(h[0]).toMatchObject({ text: p.text, decision: "accepted", by: "Josh" });
  });

  it("edit (verb: edit, text) appends one naming the value it replaced", async () => {
    const before = history().length;
    const p = openProposal();
    const original = p.text;

    const res = await handle({ method: "POST", path: `/memory/proposals/${p.id}`, body: { verb: "edit", text: "a corrected line" } } as never);

    expect(res.status).toBe(200);
    const h = history();
    expect(h.length).toBe(before + 1);
    expect(h[0]).toMatchObject({ text: "a corrected line", decision: "edited", by: "Josh", was: original });
  });

  it("GET /memory/history carries the new entry first — accepting is the same write the read reflects", async () => {
    const p = openProposal();
    await handle({ method: "POST", path: `/memory/proposals/${p.id}`, body: { verb: "ok" } } as never);

    const res = await handle({ method: "GET", path: "/memory/history" } as never);

    const list = res.json as MemoryHistoryEntry[];
    expect(list[0]?.id).toBe(history()[0]?.id);
    expect(list[0]?.decision).toBe("accepted");
  });
});
