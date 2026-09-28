/**
 * CB-01 (B-1) — the eight block types render under `jest-expo/ios` from a
 * config record, using only `theme/ui` primitives.
 *
 * The iOS lane, not the web one, because that is where the bug this whole
 * lane exists for is visible: react-native-web swallows a raw string
 * rendered outside a `<Text>` host, and native does not (NR-04). A block
 * catalogue is exactly the kind of code that grows that bug — eight small
 * components, each interpolating strings a config supplied — so every one
 * of them is walked here, and `SectionRenderer` is mounted over the real
 * fixture on top of that.
 */
import React from "react";
import { act, render } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { collectViolations, probeTextType, type RTChild } from "./walker";
import { BarsBlock, ChipsBlock, GhostBlock, GridBlock, LinksBlock, RowsBlock, StatsBlock, TextBlock, type BlockProps } from "@/layout/catalogue";
import { SectionRenderer } from "@/layout/SectionRenderer";
import { SectionPreview } from "@/layout/SectionPreview";
import * as db from "@/data/mock/db";
import { useLifeStore } from "@/stores/life";
import { useSettingsStore } from "@/stores/settings";
import sectionsFixture from "@/data/mock/fixtures/sections.json";
import type { SectionConfig } from "@/data/types";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>{children}</ThemeProvider>
    </GestureHandlerRootView>
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

beforeAll(() => {
  probeTextType((node) => render(<Providers>{node}</Providers>));
});

type Case = { name: string; render: () => React.ReactElement };

const props = (items: unknown[], extra: Partial<BlockProps> = {}): BlockProps => ({ idPrefix: "b", items, ...extra });

const CASES: Case[] = [
  {
    name: "rows",
    render: () => <RowsBlock {...props([{ id: "r1", name: "Andy", item: "call back", meta: "3 days" }, { id: "r2", name: "Jo", item: "invoice", verb: { label: "Draft", action: "draft" } }], { act: () => {} })} />,
  },
  { name: "rows (empty)", render: () => <RowsBlock {...props([])} /> },
  { name: "stats", render: () => <StatsBlock {...props([{ id: "s1", value: "12", label: "open" }, { id: "s2", value: "$4,120", label: "spent", sens: true }])} /> },
  { name: "bars", render: () => <BarsBlock {...props([{ id: "b1", label: "Food", value: 40, max: 100, amount: "$420" }, { id: "b2", label: "Fuel", value: 130, max: 100, amount: "$310", over: true }])} /> },
  { name: "bars (zero max)", render: () => <BarsBlock {...props([{ id: "b1", label: "New", value: 0, max: 0, amount: "$0" }])} /> },
  { name: "chips", render: () => <ChipsBlock {...props([{ id: "c1", label: "Walk", on: true }, { id: "c2", label: "Read", on: false }], { act: () => {} })} /> },
  { name: "grid", render: () => <GridBlock {...props([{ id: "g1", name: "Xero", purpose: "invoices", url: "https://xero.com" }, { id: "g2", name: "Notes", purpose: "scratch" }], { onLink: () => {} })} /> },
  { name: "text", render: () => <TextBlock {...props([{ id: "t1", accent: "RACQ home insurance due 19 Sep", text: " · feed: Redbark, V2.1" }, { id: "t2", text: "no accent here" }])} /> },
  { name: "ghost", render: () => <GhostBlock {...props([{ id: "g", text: "Appointments appear when the health source is gated in." }])} /> },
  { name: "links", render: () => <LinksBlock {...props([{ id: "l1", label: "Redbark", url: "https://example.com" }], { onLink: () => {} })} /> },
];

describe("CB-01 · every block type mounts on native", () => {
  it.each(CASES.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const tree = render(<Providers>{c.render()}</Providers>);
    await flush();
    const out: string[] = [];
    collectViolations(tree.toJSON() as RTChild, false, c.name, out);
    expect(out).toEqual([]);
    tree.unmount();
  });

  it("the catalogue has a case here for every type it publishes", () => {
    // a guard against the quiet failure mode of a table-driven test: a
    // ninth block type added to the catalogue with no case added here
    // would leave this file green while covering eight-ninths of it.
    const covered = new Set(CASES.map((c) => c.name.split(" ")[0]));
    expect([...covered].sort()).toEqual(["bars", "chips", "ghost", "grid", "links", "rows", "stats", "text"]);
  });
});

describe("CB-04 · SectionRenderer over the real fixture", () => {
  beforeEach(async () => {
    db.reset();
    await useLifeStore.getState().load();
  });

  it.each((sectionsFixture as SectionConfig[]).map((c) => [c.id, c] as const))("%s renders and its testIDs are derived", async (id, config) => {
    const tree = render(
      <Providers>
        <SectionRenderer config={config} />
      </Providers>,
    );
    await flush();

    const out: string[] = [];
    collectViolations(tree.toJSON() as RTChild, false, id, out);
    expect(out).toEqual([]);
    // T-4: `${config.tab}`, not "life". The fixture is no longer all one tab —
    // Agents › Usage is a configured section too, and a hard-coded prefix made
    // this case assert the renderer's rule for four sections and a typo for the
    // fifth.
    expect(tree.getByTestId(`${config.tab}-${id}-section`)).toBeTruthy();
    if (config.configure) expect(tree.getByTestId(`${id}-configure`)).toBeTruthy();
    if (config.verb != null) expect(tree.getByTestId(`${id}-verb`).props.children).toBe(config.verb.label);
    tree.unmount();
  });

  it("People's rows keep the testIDs the LF specs already use (CB-04)", async () => {
    const config = (sectionsFixture as SectionConfig[]).find((c) => c.id === "people")!;
    const tree = render(
      <Providers>
        <SectionRenderer config={config} />
      </Providers>,
    );
    await flush();
    const people = useLifeStore.getState().people;
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) {
      expect(tree.getByTestId(`person-${p.id}`)).toBeTruthy();
      expect(tree.getByTestId(`person-act-${p.id}`)).toBeTruthy();
    }
    tree.unmount();
  });

  it("Health shows its ghost while the feed is off, and nothing when it is on", async () => {
    const config = (sectionsFixture as SectionConfig[]).find((c) => c.id === "health")!;
    const tree = render(
      <Providers>
        <SectionRenderer config={config} />
      </Providers>,
    );
    await flush();
    expect(tree.getByTestId("health-ghost")).toBeTruthy();

    await act(async () => {
      useSettingsStore.setState({ capabilities: { ...useSettingsStore.getState().capabilities, healthFeed: true } });
    });
    expect(tree.queryByTestId("health-ghost")).toBeNull();
    tree.unmount();
  });
});

/**
 * SH-06's last clause — "`SectionRenderer` drops an unknown verb at render".
 * The validator refuses an unknown verb in a CONFIG (CB-02), but a bound
 * rows block takes its rows from the STORE, and `people.rows` passes the
 * server's `verb.action` straight through — so a backend that sent `zap`
 * put a live button on Josh's screen that would post `zap` back. The
 * renderer keeps only the five verbs the catalogue publishes (R-12).
 */
describe("SH-06 · an unknown verb from the server renders no button", () => {
  it("the known verb keeps its button, the unknown one loses it, the row stays", async () => {
    db.reset();
    await useLifeStore.getState().load();
    const people = useLifeStore.getState().people;
    expect(people.length).toBeGreaterThan(1);
    const [first, second] = people;
    useLifeStore.setState({
      people: [
        { ...first, verb: { label: "Draft", action: "draft" } },
        { ...second, verb: { label: "Zap", action: "zap" as never } },
        ...people.slice(2),
      ],
    });
    const config = (sectionsFixture as SectionConfig[]).find((c) => c.id === "people")!;
    const tree = render(
      <Providers>
        <SectionRenderer config={config} />
      </Providers>,
    );
    await flush();
    expect(tree.getByTestId(`person-act-${first.id}`)).toBeTruthy();
    expect(tree.queryByTestId(`person-act-${second.id}`)).toBeNull();
    expect(tree.getByTestId(`person-${second.id}`)).toBeTruthy();
    tree.unmount();
  });
});

/**
 * Stage 6 A-3 (S6-25, S6-07) — a proposed section is a PICTURE of one. The
 * preview's inset was Accent soft, the same fill as the Approve button under
 * it, so it read as a section that had escaped into a card; and its caption
 * printed the config's route and column number to the owner.
 */
describe("Stage 6 A-3 · a proposed section is a picture, not a live section", () => {
  const flat = (style: unknown): Record<string, unknown> => (Array.isArray(style) ? Object.assign({}, ...(style.flat(Infinity) as object[]).filter(Boolean)) : ((style as Record<string, unknown>) ?? {}));
  const config: SectionConfig = {
    id: "s6-preview",
    tab: "life",
    title: "Reading",
    column: 3,
    source: { endpoint: "/learning" },
    blocks: [{ type: "text", text: "Multi-agent orchestration patterns" }],
    version: 1,
    state: "proposed",
    managedBy: "ea",
    changedAt: "2026-09-10T00:00:00.000Z",
  };

  it("wears the pack's Ghost dress under a line that says so, and its caption names the source as a noun with no column number", async () => {
    const tree = render(
      <Providers>
        <SectionPreview config={config} />
      </Providers>,
    );
    await flush();
    const box = flat(tree.getByTestId("decision-section-s6-preview").props.style);
    expect(box.borderStyle).toBe("dashed");
    expect(box.backgroundColor).toBeUndefined();
    expect(tree.getByText("a preview")).toBeTruthy();
    expect(tree.getByText("goes on Life · reads Learning")).toBeTruthy();
    expect(tree.queryAllByText(/column \d/).length).toBe(0);
    tree.unmount();
  });
});
