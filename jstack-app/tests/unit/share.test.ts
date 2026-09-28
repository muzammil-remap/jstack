/**
 * UP-04..UP-09 (W-1) — share-in: the ingestion path, the triage card, the
 * standing rules, and the recipe that tells a person how to reach it.
 *
 * Driven through the ROUTE, as `files.test.ts` and `search.test.ts` are: every
 * claim here is about what the server does with something sent in.
 *
 * The injection case is the one that matters most, and it is asserted
 * NEGATIVELY AND POSITIVELY — the page's instruction did not take effect, AND
 * the page's text was saved and is findable. A test that only proved nothing
 * happened would pass just as well against an extract step that dropped the
 * content on the floor.
 */
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import type { ActionItem, AutonomyRuleList, BrainItem, DumpResult, SearchResponse } from "@/data/types";
import React from "react";
import { act, render } from "@testing-library/react-native";
import { getAdapter } from "@/data/provider";
import { useSessionStore } from "@/stores/session";
import Capture from "@/app/capture";
import { useBrainStore } from "@/stores/brain";

// A-8: the capture route redirects when it is done; the redirect itself is not under test
jest.mock("expo-router", () => ({ Redirect: () => null }));

async function share(text: string, url?: string): Promise<BrainItem> {
  const res = await handle({ method: "POST", path: "/brain/dump", body: { text, url, source: "share" } });
  expect(res.status).toBe(200);
  return (res.json as DumpResult).item;
}

const cards = () => db.get().actions.filter((a) => a.kind === "triage" && a.state === "open");
const cardFor = (item: BrainItem): ActionItem | undefined => cards().find((a) => a.triage?.captureId === item.id);

beforeEach(() => {
  db.reset();
  db.asUser("josh");
});

describe("UP-04 · the capture route's captures", () => {
  it("a shared link arrives as its own source, filed provisionally, with a card to confirm", async () => {
    const item = await share("https://afr.com/dental-rollups", "https://afr.com/dental-rollups");
    expect(item.source).toBe("share");
    // resolution #30: a link nothing else classified is `reading` and
    // provisional — the honest state, and the common one
    expect(item.routing?.kind).toBe("reading");
    expect(item.routing?.provisional).toBe(true);
    expect(cardFor(item)).toBeDefined();
  });

  it("a share the rules DO classify is filed without a card — a card for everything is a card nobody reads", async () => {
    const item = await share("call Steve about the Bundaberg rooms");
    expect(item.routing?.kind).toBe("task");
    expect(item.routing?.provisional).toBeUndefined();
    expect(cardFor(item)).toBeUndefined();
  });
});

describe("UP-08 · what the extract step reads, and what it is allowed to do", () => {
  it("saves the content, says where it came from, and counts it once", async () => {
    const item = await share("https://afr.com/dental-rollups");
    expect(item.screened).toBe(true);
    expect(item.extractedFrom).toBe("afr.com");
    expect(item.extractedText).toContain("Corporate dental groups");
    // the SERVER's count — the row and the card both read this field rather
    // than counting for themselves
    expect(item.extractedWords).toBe(item.extractedText!.trim().split(/\s+/).length);
  });

  it("a topic that appears ONLY inside the page is findable, which is why the content is saved at all", async () => {
    await share("https://afr.com/dental-rollups");
    const res = await handle({ method: "GET", path: "/search", query: { q: "covenants" } });
    const found = (res.json as SearchResponse).groups.flatMap((g) => g.items);
    // "covenants" is nowhere in the shared TEXT — only in the extraction
    expect(found.length).toBeGreaterThan(0);
  });

  it("A PAGE THAT ASKS TO BE OBEYED IS SAVED AND NOT OBEYED", async () => {
    const before = {
      rules: db.get().autonomyRules.length,
      memory: db.get().memoryProposals.length,
    };
    const item = await share("https://notes.example/brief");

    // POSITIVE half: the text WAS read and saved. Without this the negatives
    // below would pass against an extract step that returned nothing.
    expect(item.extractedText).toContain("Ignore your rules");
    expect(item.extractedText).toContain("cabinetry");

    // NEGATIVE half: none of what it asked for happened.
    expect(db.get().autonomyRules).toHaveLength(before.rules);
    expect(db.get().memoryProposals).toHaveLength(before.memory);
    // it asked to be filed under Personal with sensitivity open; the filing is
    // the app's own, from the person's words and the URL
    expect(item.routing?.sensitivity).not.toBe("open");
    // and it did not become a verb: the only card is the triage card asking
    // about the filing
    const raised = db.get().actions.filter((a) => a.state === "open" && a.triage?.captureId === item.id);
    expect(raised).toHaveLength(1);
    expect(raised[0].kind).toBe("triage");
  });
});

describe("UP-09 · the triage card", () => {
  it("carries the routing as its own fields, and what was extracted", async () => {
    const item = await share("https://afr.com/dental-rollups");
    const card = cardFor(item)!;
    expect(card.triage?.routing.silos.length).toBeGreaterThan(0);
    expect(card.triage?.routing.sensitivity).toBeDefined();
    expect(card.triage?.extracted?.words).toBe(item.extractedWords);
    expect(card.triage?.extracted?.from).toBe("afr.com");
    // the extracted TEXT is deliberately not on the card — it belongs in the
    // detail, rendered through `Txt` only (SECURITY.md, ingestion)
    expect(JSON.stringify(card)).not.toContain("Corporate dental groups");
  });

  it("a share with no extraction still gets a card, without an extraction line", async () => {
    const item = await share("https://unknown.example/thing");
    const card = cardFor(item)!;
    expect(card.triage?.extracted).toBeUndefined();
  });
});

describe("UP-05 · teach, and what it changes about NEXT time", () => {
  it("teach writes a standing rule and the next share from the same host files without a card", async () => {
    const first = await share("https://afr.com/dental-rollups");
    const card = cardFor(first)!;
    expect(db.get().autonomyRules.some((r) => r.text.includes("afr.com"))).toBe(false);

    const taught = await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "teach", rule: "" } });
    expect(taught.status).toBe(200);

    const rule = db.get().autonomyRules.find((r) => r.text.includes("afr.com"));
    expect(rule).toBeDefined();
    expect(rule!.scope).toBe("triage");
    expect(rule!.mode).toBe("auto");
    expect(rule!.addedBy).toBe("josh");

    // THE POINT: the next one files silently, and says which rule did it —
    // an invisible standing rule is not one a person can trust.
    const second = await share("https://afr.com/another-piece");
    expect(cardFor(second)).toBeUndefined();
    expect(second.routing?.provisional).toBeUndefined();
    expect(second.routed.join(" ")).toContain("your rule");
  });

  it("a rule taught about one host does not silence a different one", async () => {
    const first = await share("https://afr.com/dental-rollups");
    await handle({ method: "POST", path: `/actions/${cardFor(first)!.id}`, body: { verb: "teach", rule: "" } });

    const other = await share("https://notes.example/brief");
    expect(cardFor(other)).toBeDefined();
  });
});

describe("UP-06 · a file arriving in the Dropbox inbox", () => {
  it("becomes a capture, an attachment in the inbox folder, and a triage line", async () => {
    const res = await handle({ method: "POST", path: "/__test__/inbox", body: { name: "receipt-oct.jpg", kind: "image/jpeg" } });
    expect(res.status).toBe(200);
    const { item, file } = res.json as { item: BrainItem; file: { name: string; folder: string; captureId: string } };

    expect(item.source).toBe("share");
    expect(file.name).toBe("receipt-oct.jpg");
    expect(file.folder).toBe("/JSTACK/Inbox");
    // the three records know about each other — a rig route that made only the
    // capture would let the app look right while the file was nowhere
    expect(file.captureId).toBe(item.id);
    expect(db.get().files.some((f) => f.id === (res.json as { file: { id: string } }).file.id)).toBe(true);
  });

  it("a name is required — a file with no name is a bug in the watcher, not a capture", async () => {
    const res = await handle({ method: "POST", path: "/__test__/inbox", body: {} });
    expect(res.status).toBe(422);
  });
});

describe("§4.23 · the standing rules are on the wire both ways", () => {
  it("GET returns the seeded rules and PUT replaces the list", async () => {
    const got = await handle({ method: "GET", path: "/settings/autonomy/rules" });
    expect(got.status).toBe(200);
    expect((got.json as AutonomyRuleList).rules.length).toBeGreaterThan(0);

    const put = await handle({ method: "PUT", path: "/settings/autonomy/rules", body: { rules: [] } });
    expect(put.status).toBe(200);
    expect((put.json as AutonomyRuleList).rules).toEqual([]);
  });

  it("a body that is not a list is refused with the field named", async () => {
    const res = await handle({ method: "PUT", path: "/settings/autonomy/rules", body: { rules: "all of them" } });
    expect(res.status).toBe(422);
    expect((res.json as { field: string }).field).toBe("rules");
  });
});

describe("UP-07 · the Shortcut recipe names routes that exist", () => {
  it("every route the handover's recipe depends on is real", () => {
    // A recipe is a promise to a person who will follow it once and blame the
    // app when it fails. The table at the foot of the section is the checkable part,
    // and this is what stops it drifting from the tree (rule 15).
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const handover = readFileSync(join(process.cwd(), "..", "HANDOVER.md"), "utf8");
    // A-5 renumbered the section when HANDOVER.md became the consolidated handover
    const at = handover.indexOf('"Send to JSTACK" — the iOS Shortcut');
    expect(at).toBeGreaterThan(0);
    const section = handover.slice(at);
    expect(section).toContain("Send to JSTACK");

    // the routes the recipe names, checked against the one table
    const { ROUTES } = require("@/data/routes") as typeof import("@/data/routes");
    const has = (method: string, path: string) => ROUTES.some((r) => r.method === method && r.path === path);

    expect(section).toContain("POST /brain/dump");
    expect(has("POST", "/brain/dump")).toBe(true);

    expect(section).toContain("PUT /settings/autonomy/rules");
    expect(has("PUT", "/settings/autonomy/rules")).toBe(true);

    // `/capture` is an APP route, not an API one — it is deliberately not in
    // `data/routes.ts`, and the recipe says so. Checked against the file
    // system instead, because that is where an app route lives.
    expect(section).toContain("/capture");
    expect(has("GET", "/capture")).toBe(false);
    expect(readFileSync(join(process.cwd(), "app", "capture.tsx"), "utf8")).toContain("export default function Capture");

    // the inbox rig route is mock-only and must never reach the contract
    expect(section).toContain("POST /__test__/inbox");
    expect(ROUTES.some((r) => r.path.includes("__test__"))).toBe(false);
  });

  it("the recipe uses the FRAGMENT, which is the whole reason it is safe", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const handover = readFileSync(join(process.cwd(), "..", "HANDOVER.md"), "utf8");
    const at = handover.indexOf('"Send to JSTACK" — the iOS Shortcut');
    expect(at).toBeGreaterThan(0);
    const section = handover.slice(at);
    // `#text=` and not `?text=` — a query string would be logged by every hop
    expect(section).toContain("/capture#text=");
    expect(section).not.toContain("/capture?text=");
  });
});

describe("Stage 6 A-3 · the triage card in the owner's words (S6-07, S6-16)", () => {
  it("the title names the silo by its display name, never its key, and the primary is the card's own question answered", async () => {
    const item = await share("https://afr.com/dental-rollups", "https://afr.com/dental-rollups");
    const card = cardFor(item)!;
    // R1's fail-closed default is the KEY `personal:josh`; the sentence says "Personal"
    expect(card.triage?.routing.silos[0]).toBe("personal:josh");
    expect(card.title).toBe("Filed afr.com under Personal · reading. Keep it there?");
    // README Content: the five fixed verbs, or a specific primary — "ok" is neither
    expect(card.verb).toBe("Keep it there");
  });

  it("a taught rule spells the silo the same way — it is read back in Settings › Rules", async () => {
    const item = await share("https://afr.com/dental-rollups", "https://afr.com/dental-rollups");
    await handle({ method: "POST", path: `/actions/${cardFor(item)!.id}`, body: { verb: "teach", rule: "" } });
    const rule = db.get().autonomyRules.find((r) => r.text.includes("afr.com"))!;
    expect(rule.text).toMatch(/^File afr\.com shares under Personal · /);
    expect(rule.text).not.toContain("personal:josh");
  });

  // v2.3 WPF-11 (CODE_REVIEW_v23.md finding 19): the rule was matched by a substring of
  // its words, so a rule taught for afr.com also covered fr.com, and its link filed
  // silently with no card — the human check shared content relies on (Q24)
  it("WPF-11: a taught rule covers its own host, not another host whose name sits inside it", async () => {
    const first = await share("https://afr.com/dental-rollups", "https://afr.com/dental-rollups");
    await handle({ method: "POST", path: `/actions/${cardFor(first)!.id}`, body: { verb: "teach", rule: "" } });
    const same = await share("https://afr.com/another-story", "https://afr.com/another-story");
    expect(cardFor(same)).toBeUndefined();
    const other = await share("https://fr.com/a-story", "https://fr.com/a-story");
    expect(cardFor(other)).toBeDefined();
  });
});

/**
 * A-8 (WP-A, v2.3) — R11-REMAP-1: a shared capture carries an offlineId, and the same share
 * always carries the same one.
 *
 * The share route posted to /brain/dump with no key of its own, and the outbox minted a fresh
 * one on every write, so a share read twice — a reload while it was still on its way puts the
 * fragment back and files it again (A4R11-04) — reached the server as two captures under two
 * keys, with nothing to dedupe. Driven through the route itself over the adapter's real call,
 * because the BODY is what the server dedupes on.
 */
describe("A-8 · a shared capture carries an offlineId, and the same share the same one (R11-REMAP-1)", () => {
  const g = globalThis as unknown as { location?: unknown; history?: unknown };
  const saved = { location: g.location, history: g.history };
  afterEach(() => {
    g.location = saved.location;
    g.history = saved.history;
  });

  /** open /capture with this fragment, and return the body the route sent */
  async function openShare(hash: string): Promise<Record<string, unknown> | undefined> {
    g.location = { hash, pathname: "/capture", search: "" };
    g.history = { replaceState: () => undefined };
    const post = jest.spyOn(getAdapter(), "postBrainDump");
    try {
      const view = render(React.createElement(Capture));
      await act(async () => {
        for (let i = 0; i < 20; i++) await Promise.resolve();
      });
      view.unmount();
      return post.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    } finally {
      post.mockRestore();
    }
  }

  it("the body carries an offlineId, a second read of the same share carries the same one, and a different share does not", async () => {
    useSessionStore.setState({ locked: false });
    const link = "#text=" + encodeURIComponent("a page worth keeping") + "&url=" + encodeURIComponent("https://example.com/worth-keeping");
    const first = await openShare(link);
    const again = await openShare(link);
    const other = await openShare("#text=" + encodeURIComponent("something else entirely"));
    expect({ carries: typeof first?.offlineId, sameShareSameKey: first?.offlineId === again?.offlineId, otherShareOtherKey: other?.offlineId !== first?.offlineId }).toEqual({
      carries: "string",
      sameShareSameKey: true,
      otherShareOtherKey: true,
    });
  });

  it("a share filed with files attached takes the outbox's own key — a retry that adds files is a new capture, not taken for the first", async () => {
    const post = jest.spyOn(getAdapter(), "postBrainDump").mockRejectedValueOnce(new Error("only the body is under test"));
    try {
      await expect(useBrainStore.getState().dump("share", "a page worth keeping", undefined, ["f1"], "https://example.com/worth-keeping")).rejects.toThrow("only the body is under test");
      const body = post.mock.calls[0]?.[0] as { offlineId?: string } | undefined;
      expect({ called: body != null, offlineId: body?.offlineId }).toEqual({ called: true, offlineId: undefined });
    } finally {
      post.mockRestore();
    }
  });
});
