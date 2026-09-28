/**
 * RP-01, RP-06 — the wire and the row's own two lines.
 *
 * The mock's triage and the meta line are pure functions over a capture, so
 * they are tested here rather than through eight browser projects: what a
 * question capture reads as before and after its answer is a claim about a
 * string, and asserting it in a browser would be asserting that React renders.
 * The BEHAVIOUR — a "?" producing a reply, the row opening, the card — is
 * `e2e/core/brain.spec.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captureTags, routingLine } from "@/lib/routingLine";
import { triage } from "@/data/mock/triage";
import type { BrainItem } from "@/data/types";
import { useRepliesStore } from "@/stores/replies";
import { loadWhileUnreachable } from "./stores/failingLoad";

const app = join(__dirname, "..", "..");

const capture: BrainItem = {
  id: "x1",
  text: "",
  at: "2026-09-09T08:31:00.000Z",
  meta: "voice · Telegram",
  source: "voice",
  routed: ["→ filing · Librarian"],
  labels: { silo: "personal:josh", types: ["open"], setBy: "source" },
  setAt: "2026-09-09T08:31:00.000Z",
  focus: "personal",
};

describe("RP-01 · the route is published, both ways", () => {
  const openapi = () => readFileSync(join(app, "openapi.yaml"), "utf8");

  it("GET /brain/replies and PATCH /brain/replies/{id} are in the contract", () => {
    const yaml = openapi();
    // the generator quotes its keys — asserting the unquoted form would pass
    // for ever against a file that had never been regenerated
    expect(yaml).toContain('"/brain/replies":');
    expect(yaml).toContain('"/brain/replies/{id}":');
    expect(yaml).toContain('"operationId": "getReplies"');
    expect(yaml).toContain('"operationId": "patchReply"');
    expect(yaml).toContain("ReplyList");
    expect(yaml).toContain("ReplyPatch");
  });
});

describe("RP-01 · the mock's triage", () => {
  it("a question is decided by the question mark, before any verb in it", () => {
    // "book" is a task word and this is still a question — answering it and
    // doing it are not the same act, which is why the punctuation wins
    expect(triage("Can you book the flights?").kind).toBe("question");
  });

  it("nothing matching is PROVISIONAL and says why, rather than guessing a kind", () => {
    const r = triage("Buy new hiking boots before the trip");
    expect(r.kind).toBe("note");
    expect(r.provisional).toBe(true);
    expect(r.reason).toContain("Librarian");
  });

  it("the content rules that label every other record label a capture too", () => {
    const r = triage("Renew Ella's passport before the school holidays");
    expect(r.kind).toBe("task");
    expect(r.labels).toContain("kids");
    // R1 restated for sensitivity: a restricted type is `sensitive`, and the
    // bare default is `normal` rather than `open` — `open` is a positive
    // claim that this is fine to spread around
    expect(r.sensitivity).toBe("sensitive");
    expect(triage("Call Steve about the deck").sensitivity).toBe("normal");
  });

  it("`open` survives alone and is dropped once something specific joins it", () => {
    expect(triage("Call Steve about the deck").labels).toEqual(["open"]);
    expect(triage("Call the school about swim squad").labels).toEqual(["kids"]);
  });
});

describe("RP-06 · the row's meta line", () => {
  it("a question says 'question', and 'replied' once the answer exists", () => {
    const item = { ...capture, routing: triage("What did Andy say?") };
    expect(routingLine(item, false)).toBe("question");
    expect(routingLine(item, true)).toBe("question · replied");
  });

  it("a provisional filing says so, in the sentence V2.1 used", () => {
    expect(routingLine({ ...capture, routing: triage("Buy new hiking boots") }, false)).toBe("→ filing · Librarian");
  });

  it("a decided filing names the kind and where it went, then its extras", () => {
    const item = {
      ...capture,
      routing: { kind: "task" as const, silos: ["family1"], labels: ["kids"], sensitivity: "sensitive" as const, storage: "twenty" as const, also: ["reminder Fri"] },
    };
    expect(routingLine(item, false)).toBe("task → Twenty · reminder Fri");
  });

  it("a record written before R-1 still renders — its `routed` line is read", () => {
    expect(routingLine(capture, false)).toBe("→ filing · Librarian");
  });
});

describe("RP-06 · the tags", () => {
  it("silo in accent, content labels neutral, sensitivity only when it is sensitive", () => {
    const sensitive = {
      ...capture,
      routing: { kind: "task" as const, silos: ["family1"], labels: ["kids", "legal"], sensitivity: "sensitive" as const, storage: "twenty" as const },
    };
    expect(captureTags(sensitive)).toEqual([
      { label: "family", tone: "accent" },
      { label: "kids", tone: "neutral" },
      { label: "legal", tone: "neutral" },
      { label: "sensitive", tone: "alert" },
    ]);

    const normal = { ...capture, routing: { kind: "note" as const, silos: ["personal:josh"], labels: ["open"], sensitivity: "normal" as const, storage: "dropbox" as const } };
    expect(captureTags(normal).map((t) => t.label)).toEqual(["personal", "open"]);
  });

  it("the silo renders as its short name, not its id", () => {
    // `personal:josh` on a row would be the database talking
    expect(captureTags(capture)[0]).toEqual({ label: "personal", tone: "accent" });
  });

  it("`unlabelled` is shown, not hidden — it is the answer to 'has anyone looked at this'", () => {
    const item = { ...capture, labels: { silo: "personal:josh" as const, types: ["unlabelled" as const], setBy: "review" as const } };
    expect(captureTags(item).map((t) => t.label)).toEqual(["personal", "unlabelled"]);
  });
});

/**
 * A-2b (WP-A, v2.3) — QA on A-2: Today and Brain fire the replies load beside their own, fire-and-forget, and
 * offline it still rejected with nobody to hear it. It is recorded now, and settles, as the tabs' own loads do.
 */
describe("A-2b · the replies load is recorded, not thrown at the tab", () => {
  it("a failed replies load settles and records loadError, and the next one that gets through clears it", async () => {
    const { settled } = await loadWhileUnreachable("getReplies", () => useRepliesStore.getState().load());
    const failed = { settled, loadError: useRepliesStore.getState().loadError };
    await useRepliesStore.getState().load();
    expect({ failed, cleared: useRepliesStore.getState().loadError }).toEqual({
      failed: { settled: "resolved", loadError: "Network request failed" },
      cleared: null,
    });
  });
});
