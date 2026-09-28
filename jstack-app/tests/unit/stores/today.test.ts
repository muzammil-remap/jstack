/** stores/today.ts — load() populates the composite; answer() mutates
 * through the adapter, reloads, and pushes an undo ledger entry. */
import { get as dbGet, reset as resetDb } from "@/data/mock/db";
import { getAdapter } from "@/data/provider";
import { handle } from "@/data/mock/server";
import { useRulesStore } from "@/stores/rules";
import { useSessionStore } from "@/stores/session";
import { currentParameter, useParametersStore } from "@/stores/parameters";
import { defaultParameters } from "@/data/parameters";
import { toastFor, verbLabel, whyRuns } from "@/lib/decisionCopy";
import type { ActionItem, ActionSource, Parameter } from "@/data/types";
import { shortExpiry, useTodayStore } from "@/stores/today";
import { loadWhileUnreachable } from "./failingLoad";

/** what the SERVER holds, read the long way round so the client store cannot
 *  answer for it — the whole point of the LK-04 case below */
const serverValue = async (): Promise<number | boolean | undefined> =>
  ((await handle({ method: "GET", path: "/parameters" })).json as Parameter[]).find((p) => p.key === "lock.afterMinutes")?.value;

beforeEach(() => {
  resetDb();
  useParametersStore.setState({ parameters: defaultParameters(), invalid: null });
  useSessionStore.setState({ undo: { entries: [] }, toast: null });
  useTodayStore.setState({ composite: null, openDecisionId: null, picks: {}, journalDraft: "", threeDay: null, history: [] });
});

describe("stores/today.ts", () => {
  it("load() populates the composite from GET /today", async () => {
    await useTodayStore.getState().load();
    const composite = useTodayStore.getState().composite;
    expect(composite).not.toBeNull();
    expect(composite!.needsYou.length).toBeGreaterThan(0);
  });

  it("answer() approves a card, reloads, and pushes an undo entry", async () => {
    await useTodayStore.getState().load();
    const before = useTodayStore.getState().composite!.needsYou.find((c) => c.id === "c1");
    expect(before?.state).toBe("open");

    await useTodayStore.getState().answer("c1", { verb: "approve", option: 1 });

    const after = useTodayStore.getState().composite!.needsYou.find((c) => c.id === "c1");
    expect(after).toBeUndefined(); // answered — dropped from the open (needsYou) list
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
  });

  it("setJournalDraft/submitJournal clears the draft and reloads", async () => {
    useTodayStore.getState().setJournalDraft("Good day.");
    expect(useTodayStore.getState().journalDraft).toBe("Good day.");
    await useTodayStore.getState().submitJournal("typed");
    expect(useTodayStore.getState().journalDraft).toBe("");
  });

  it("DC-02: approve substitutes the picked option into the card's own toast template", async () => {
    await useTodayStore.getState().load();
    useTodayStore.getState().pickOption("c1", 2);
    await useTodayStore.getState().answer("c1", { verb: "approve", option: 2 });
    expect(useSessionStore.getState().toast).toMatchObject({ message: "Went with option 2 · Dev call" });
  });

  it("DC-06/UN-01: later still pushes an undo entry (no verb exception)", async () => {
    await useTodayStore.getState().load();
    await useTodayStore.getState().answer("c1", { verb: "later" });
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
    // The card's title is READ from the card, not restated here. It used to be
    // written out by hand — and CD-18 makes the weekday derive from
    // `expiresAt`, so the literal was only ever right one day in seven
    // (A-05). What DC-06 is actually about is that the toast NAMES the card.
    const title = dbGet().actions.find((a) => a.id === "c1")?.title;
    expect(title).toContain("overlaps school pickup");
    expect(useSessionStore.getState().toast).toMatchObject({ message: `Later · returns Mon 8am · ${title}` });
  });

  it("UN-01: undo restores the card as open and reopens it", async () => {
    await useTodayStore.getState().load();
    await useTodayStore.getState().answer("c1", { verb: "approve", option: 1 });
    expect(useTodayStore.getState().composite!.needsYou.find((c) => c.id === "c1")).toBeUndefined();

    await useSessionStore.getState().undoLatest();

    expect(useTodayStore.getState().composite!.needsYou.find((c) => c.id === "c1")?.state).toBe("open");
    expect(useTodayStore.getState().openDecisionId).toBe("c1");
  });

  it("LK-04 (A4-02): a parameter card's approve AND its undo reach the device, not just the server", async () => {
    // The audit drove this on the running app and found the device holding 25
    // minutes for as long as it stayed open, after the person had undone the
    // change and the server had gone back to 10 — i.e. the device auto-locked
    // fifteen minutes LATER than the person chose, silently, until a reload.
    // The server half was always right; nothing refetched the store the card
    // changes, the way a `section` card refetches the section list.
    const card = (await getAdapter().proposeParameter("lock.afterMinutes", 25, "You unlock four times an hour.")) as ActionItem;
    await useParametersStore.getState().load();
    expect(currentParameter("lock.afterMinutes")).toBe(10);

    await useTodayStore.getState().load();
    await useTodayStore.getState().answer(card.id, { verb: "approve", option: 1 });
    expect(await serverValue()).toBe(25);
    expect(currentParameter("lock.afterMinutes")).toBe(25); // the device agrees

    await useSessionStore.getState().undoLatest();
    expect(await serverValue()).toBe(10);
    expect(currentParameter("lock.afterMinutes")).toBe(10); // and agrees again
  });

  it("FS-02: load(focus) narrows needsYou and resets the open card to the first survivor", async () => {
    await useTodayStore.getState().load();
    useTodayStore.getState().openDecision("c1"); // family-focus card
    await useTodayStore.getState().load("work");
    const ids = useTodayStore.getState().composite!.needsYou.map((c) => c.id);
    expect(ids).not.toContain("c1");
    expect(useTodayStore.getState().openDecisionId).toBe(ids[0] ?? null);
  });

  it("shortExpiry() takes the first clause of thenWhat", () => {
    expect(shortExpiry("expires Wed 5pm · then proposes option 1")).toBe("expires Wed 5pm");
  });

  it("shortExpiry() abbreviates a long weekday to the row's short form (ux-review R1-08)", () => {
    // CD-18 composes "expires {{WEEKDAY:expiresAt}} 5pm" from the field it
    // describes, and the weekday it writes is the long one — right in the
    // card's prose, wrong beside "expires Fri 5pm" and "expires Sat 7am" in
    // the same waiting rows (handoff: "expiry short form").
    expect(shortExpiry("expires Thursday 5pm · then proposes 1")).toBe("expires Thu 5pm");
    expect(shortExpiry("expires Wednesday 9am")).toBe("expires Wed 9am");
    expect(shortExpiry("expires 19 Sep · then reminds you")).toBe("expires 19 Sep");
  });

  it("DC-08 / ST-04: Teach's rule lands in the EA's standing rules", async () => {
    // ST-1 retired `POST /rules` and Brain's parallel list with it. A rule
    // taught from a card and a rule written in Settings are the same kind of
    // thing now — appended through the one route the editor saves through —
    // and this is the assertion that says so.
    const before = (await getAdapter().getAutonomyRules()).rules;
    await useRulesStore.getState().load();
    await useRulesStore.getState().add("School pickup days are fixed.", "c1");

    const after = (await getAdapter().getAutonomyRules()).rules;
    expect(after.length).toBe(before.length + 1);
    const taught = after.at(-1)!;
    expect(taught.text).toBe("School pickup days are fixed.");
    // `josh` because he typed it, and the card it came off is traceable in the id
    expect(taught.addedBy).toBe("josh");
    // A4R4-04 (recorded in 02_ACCEPTANCE_TESTS_v22.md §4): the card's OWN rule
    // keeps `ar-${cardId}` because its undo removes it by that derived id; the
    // rule the person types in the Teach sheet gets its own, or two different
    // rules share one id and one of them cannot be edited or deleted.
    expect(taught.id.startsWith("ar-c1-taught-")).toBe(true);
    expect(taught.id).not.toBe("ar-c1");
    expect(taught.on).toBe(true);
  });
});

describe("the calendar card's three days, the history dialog and the revised draft (P-4, F-47)", () => {
  it("loadThreeDay() fills the second window from the composite's own day", async () => {
    await useTodayStore.getState().load();
    expect(useTodayStore.getState().threeDay).toBeNull();
    await useTodayStore.getState().loadThreeDay();
    const threeDay = useTodayStore.getState().threeDay;
    expect(threeDay).not.toBeNull();
    expect(threeDay!.events.length).toBeGreaterThan(0);
  });

  it("loadHistory() asks the server, so a query that matches nothing comes back empty", async () => {
    await useTodayStore.getState().loadHistory();
    expect(useTodayStore.getState().history.length).toBeGreaterThan(0);
    await useTodayStore.getState().loadHistory("zzzz-no-such-card");
    expect(useTodayStore.getState().history).toEqual([]);
  });

  it("saveDraft() writes the revised body onto the card before it is answered (DC-05)", async () => {
    await useTodayStore.getState().saveDraft("c2", "the revised body");
    expect(dbGet().actions.find((a) => a.id === "c2")?.quote).toBe("the revised body");
  });
});

describe("toastFor · a table over the closed verb union (F-14)", () => {
  it("every verb has its sentence, and approve fills the card's own template with the pick", async () => {
    await useTodayStore.getState().load();
    const card = useTodayStore.getState().composite!.needsYou[0];
    expect(toastFor(card, { verb: "approve", option: 2 }, 2)).toBe(card.toast.replace("{n}", "2"));
    expect(toastFor(card, { verb: "revise", revision: "x" }, 1)).toBe(`Sent back to revise · ${card.title}`);
    expect(toastFor(card, { verb: "later" }, 1)).toBe(`Later · returns Mon 8am · ${card.title}`);
    expect(toastFor(card, { verb: "never" }, 1)).toBe(`Never · rule offered · ${card.title}`);
    expect(toastFor(card, { verb: "teach", rule: "x" }, 1)).toBe(`Teach · one line to the EA · ${card.title}`);
  });
});

describe("decisionCopy · whyRuns and verbLabel (P-5, F-48 + F-74)", () => {
  const source = (label: string, i: number): ActionSource => ({ label, ref: `src-${i}`, url: `https://x.test/${i}` });

  it("links a source the sentence names in place, and appends one it never names (DC-09)", () => {
    const runs = whyRuns("Cheapest on Skyscanner · 2h layover", [source("Skyscanner", 0), source("Calendar", 1)]);
    expect(runs.map((r) => [r.text, r.sourceIndex])).toEqual([
      ["Cheapest on ", -1],
      ["Skyscanner", 0],
      [" · 2h layover", -1],
      [" · Calendar", 1],
    ]);
    expect(runs[1].source?.label).toBe("Skyscanner");
  });

  it("a why with no sources is one plain run, and the runs rejoin to the text", () => {
    expect(whyRuns("Just because", [])).toEqual([{ text: "Just because", source: null, sourceIndex: -1 }]);
    const why = "Two things · the first · the second";
    expect(whyRuns(why, [source("the second", 0)]).map((r) => r.text).join("")).toBe(why);
  });

  it("verbLabel appends the pick for an options card and only there (DC-02, DC-10)", () => {
    expect(verbLabel({ kind: "opts", verb: "Book" } as ActionItem, 2)).toBe("Book 2");
    expect(verbLabel({ kind: "bill", verb: "Pay" } as ActionItem, 2)).toBe("Pay");
  });
});

/**
 * A-2 (WP-A, v2.3) — Today's load, failing, is recorded rather than thrown at
 * a tab that cannot catch it. The tab calls it fire-and-forget, so offline with
 * nothing cached the rejection went nowhere and the tab rendered an empty shell.
 */
describe("A-2 · a failed load is recorded, not thrown at the tab", () => {
  it("a rejecting read leaves loadError set, composite as it was, and a load that resolves, so nothing is thrown at the tab", async () => {
    const { settled } = await loadWhileUnreachable("getToday", () => useTodayStore.getState().load());
    const s = useTodayStore.getState();
    expect({ loadError: s.loadError, composite: s.composite, settled }).toEqual({ loadError: "Network request failed", composite: null, settled: "resolved" });
  });

  it("the next load that gets through clears it", async () => {
    await loadWhileUnreachable("getToday", () => useTodayStore.getState().load());
    await useTodayStore.getState().load();
    const s = useTodayStore.getState();
    expect({ loadError: s.loadError, loaded: s.composite != null }).toEqual({ loadError: null, loaded: true });
  });
});

/**
 * A-9 (WP-A, v2.3) — A4R8-07: Close the day never wipes a line typed while the previous one
 * was still on its way. `submitJournal` cleared the draft after the write resolved, so over a
 * real network the words typed during the round trip were wiped by the previous line's clear —
 * under two milliseconds on the mock, which is why only a held write shows it.
 */
describe("A-9 · Close the day keeps a line typed while the previous one was on its way (A4R8-07)", () => {
  it("the words typed during the round trip are still in the field when the previous line lands", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const adapter = getAdapter();
    const real = adapter.postJournal.bind(adapter);
    const post = jest.spyOn(adapter, "postJournal").mockImplementation(async (body) => {
      await gate;
      return real(body);
    });
    try {
      useTodayStore.getState().setJournalDraft("the first line");
      const writing = useTodayStore.getState().submitJournal("typed");
      await Promise.resolve();
      useTodayStore.getState().setJournalDraft("and the next thought");
      release();
      await writing;
      const posted = post.mock.calls.map(([b]) => (b as { text: string }).text);
      expect({ draft: useTodayStore.getState().journalDraft, posted }).toEqual({ draft: "and the next thought", posted: ["the first line"] });
    } finally {
      post.mockRestore();
    }
  });

  it("a write that throws gives the words back to the field", async () => {
    const post = jest.spyOn(getAdapter(), "postJournal").mockRejectedValueOnce(new TypeError("Network request failed"));
    try {
      useTodayStore.getState().setJournalDraft("the words I do not want to lose");
      await expect(useTodayStore.getState().submitJournal("typed")).rejects.toThrow("Network request failed");
      expect(useTodayStore.getState().journalDraft).toBe("the words I do not want to lose");
    } finally {
      post.mockRestore();
    }
  });
});
