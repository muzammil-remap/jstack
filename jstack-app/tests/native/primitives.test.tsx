/**
 * NR-04/NR-05 (spec §15.12) — every primitive in theme/ui.tsx mounts under
 * the jest-expo/ios preset and is walked for raw text/number rendered
 * outside a <Text> host: react-native-web silently swallows that bug (RCA
 * #2); native throws or, worse, renders nothing. This lane finds it by
 * inspecting the rendered tree itself rather than waiting for a crash.
 *
 * The walker (TEXT_TYPE probe + collectViolations) is ported verbatim from
 * v1.2's tests/native/surfaces.test.tsx (row 1 deleted that file — its
 * eighteen tab/modal/sheet surfaces no longer exist — but row 3's plan
 * explicitly keeps the walker). What changed is the surface list: v1.2
 * swept whole screens; row 3 sweeps the primitives screens are built from,
 * since no screen exists yet (row 6+ builds them, and gets this same
 * walker's benefit for free through the primitives it composes).
 */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet, Text as RNText } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Header } from "@/components/chrome/Header";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { light, type as typeScale } from "@/theme/tokens";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectViolations, probeTextType, type RTChild } from "./walker";
import { Tag as TagFromItsFile } from "@/theme/ui/tag";
import { Label as LabelFromItsFile } from "@/theme/ui/label";
import { Strong } from "@/theme/ui/text";
import { useButtonChrome } from "@/theme/ui/controls";
import { Btn, BtnPrimary, BtnSm, Card, CardTitle, Checkbox, Chip, DialogVerbs, Dot, Expiry, Field, Ghost, HabitChip, IconBtn, Inset, Label, ListCard, Meta, Row, Seg, Stat, Switch, Tag, Track } from "@/theme/ui";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>{children}</ThemeProvider>
    </GestureHandlerRootView>
  );
}

// ─── tree walk ───────────────────────────────────────────────────────────
// Imported, not copied: `tests/native/screens.test.tsx` runs the same walk over
// the tabs, dialogs and sheets, and two copies is how the next coverage gap
// starts (AUDIT_v2.md A-04 found the second lane missing altogether).

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

beforeAll(() => {
  probeTextType((node) => render(<Providers>{node}</Providers>));
});

// ─── surface registry: one entry per theme/ui.tsx primitive ──────────────

type Surface = { name: string; render: () => React.ReactElement };

const SURFACES: Surface[] = [
  { name: "Card", render: () => <Card><RNText>content</RNText></Card> },
  { name: "ListCard", render: () => <ListCard><RNText>content</RNText></ListCard> },
  { name: "Row", render: () => <Row><RNText>content</RNText></Row> },
  { name: "Row (last)", render: () => <Row last><RNText>content</RNText></Row> },
  { name: "Label", render: () => <Label badge={3} hint="hint">Section</Label> },
  { name: "Btn (enabled)", render: () => <Btn label="Go" onPress={() => {}} /> },
  { name: "Btn (disabled)", render: () => <Btn label="Go" disabledReason="Not yet" /> },
  { name: "BtnPrimary", render: () => <BtnPrimary label="Go" onPress={() => {}} /> },
  { name: "BtnSm", render: () => <BtnSm label="Go" onPress={() => {}} /> },
  { name: "BtnSm (outlined)", render: () => <BtnSm label="Go" outlined onPress={() => {}} /> },
  { name: "IconBtn", render: () => <IconBtn icon="close" accessibilityLabel="Close" onPress={() => {}} /> },
  { name: "IconBtn (in card)", render: () => <IconBtn icon="edit" inCard accessibilityLabel="Edit" onPress={() => {}} /> },
  { name: "Chip", render: () => <Chip label="Filter" /> },
  { name: "Chip (selected)", render: () => <Chip label="Filter" selected onPress={() => {}} /> },
  {
    name: "Seg",
    render: () => (
      <Seg
        options={[
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ]}
        value="a"
        onChange={() => {}}
      />
    ),
  },
  { name: "Tag", render: () => <Tag label="EA" /> },
  { name: "Checkbox", render: () => <Checkbox checked={false} accessibilityLabel="Done" /> },
  { name: "Checkbox (checked)", render: () => <Checkbox checked accessibilityLabel="Done" /> },
  { name: "Checkbox (ea)", render: () => <Checkbox checked={false} ea accessibilityLabel="Done" /> },
  { name: "HabitChip", render: () => <HabitChip label="Exercise" done={false} /> },
  { name: "HabitChip (done, compact)", render: () => <HabitChip label="Exercise" done compact /> },
  { name: "Track", render: () => <Track value={0.6} /> },
  { name: "Track (over)", render: () => <Track value={1.1} over /> },
  { name: "Dot", render: () => <Dot /> },
  { name: "Dot (alert, feed)", render: () => <Dot kind="alert" feed /> },
  { name: "Inset", render: () => <Inset><RNText>content</RNText></Inset> },
  { name: "Ghost (string child)", render: () => <Ghost>Nothing here yet.</Ghost> },
  { name: "Field", render: () => <Field value="" onChangeText={() => {}} placeholder="Type…" /> },
  { name: "Switch", render: () => <Switch value={false} onValueChange={() => {}} accessibilityLabel="Toggle" /> },
  { name: "Switch (on)", render: () => <Switch value onValueChange={() => {}} accessibilityLabel="Toggle" /> },
  { name: "Meta", render: () => <Meta>meta text</Meta> },
  { name: "Expiry", render: () => <Expiry>in 2h</Expiry> },
  { name: "CardTitle", render: () => <CardTitle>Title</CardTitle> },
  { name: "Stat", render: () => <Stat>18</Stat> },
];

describe("NR-04 native-render lane: theme/ui.tsx primitives, no text outside <Text>", () => {
  it.each(SURFACES)("$name: no raw text/number outside <Text>", async (surface) => {
    const utils = render(<Providers>{surface.render()}</Providers>);
    await flush();

    const violations: string[] = [];
    collectViolations(utils.toJSON() as unknown as RTChild | RTChild[] | null, false, surface.name, violations);
    utils.unmount();

    expect(violations).toEqual([]);
  });
});

// GL-05: every primitive small enough to need it (below the 36/44px touch
// floor on its own) widens its real hit area with RN's own `hitSlop` prop,
// not just the `data-hitslop` marker the e2e sweep reads — this proves the
// prop itself reaches the underlying Pressable, on the native renderer
// where react-native-web's DOM attribute isn't even in the picture.
const HITSLOP_SURFACES: { name: string; expected: number; render: () => React.ReactElement }[] = [
  { name: "BtnSm", expected: 6, render: () => <BtnSm label="Go" onPress={() => {}} /> },
  { name: "IconBtn", expected: 4, render: () => <IconBtn icon="close" accessibilityLabel="Close" onPress={() => {}} /> },
  { name: "Chip (interactive)", expected: 4, render: () => <Chip label="Filter" onPress={() => {}} /> },
  { name: "Checkbox", expected: 11, render: () => <Checkbox checked={false} accessibilityLabel="Done" onPress={() => {}} /> },
  { name: "HabitChip", expected: 4, render: () => <HabitChip label="Exercise" done={false} onPress={() => {}} /> },
  { name: "Switch", expected: 6, render: () => <Switch value={false} onValueChange={() => {}} accessibilityLabel="Toggle" /> },
];

describe("GL-05 small primitives expose a real hitSlop, not just the marker", () => {
  it.each(HITSLOP_SURFACES)("$name: Pressable hitSlop === $expected", async ({ render: renderSurface, expected }) => {
    const utils = render(<Providers>{renderSurface()}</Providers>);
    await flush();
    const withHitSlop = utils.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) => node.props.hitSlop != null);
    expect(withHitSlop.length).toBeGreaterThan(0);
    expect(withHitSlop[0].props.hitSlop).toBe(expected);
    utils.unmount();
  });
});

/**
 * CD-17 — the pack's hover rule, and the proof `misc.hoverLift` is actually
 * applied rather than merely imported. `tests/unit/hover.test.ts` pins the
 * arithmetic; this pins that a real primitive runs it, through the props
 * react-native-web calls on a pointer device.
 *
 * The expected colour is written out rather than computed: `255,255,255` is
 * the light card token's own rgb and `0.08` is the pack's step, so the two
 * halves come from the design pack, not from the code under test.
 */
describe("CD-17 hover state on the pack's controls", () => {
  type Node = { props: Record<string, unknown> };

  /** The node that actually carries the hover props. On the native preset
   * `Pressable` does not forward `onHoverIn` to its host view, so a
   * `getByTestId` lookup finds an element that never sees them — the same
   * reason GL-05 above searches for `hitSlop` rather than reading it off a
   * testID. */
  const hoverNodes = (utils: { UNSAFE_root: { findAll: (p: (n: Node) => boolean) => Node[] } }) =>
    utils.UNSAFE_root.findAll((n) => typeof n.props.onHoverIn === "function");

  const surfaceOf = (node: Node) => {
    const s = node.props.style;
    const resolved = typeof s === "function" ? (s as (x: { pressed: boolean }) => unknown)({ pressed: false }) : s;
    const flat = StyleSheet.flatten(resolved as never) as { backgroundColor?: string } | undefined;
    return flat?.backgroundColor;
  };

  it("a Btn lifts one step on hover and returns on hover out", async () => {
    const utils = render(
      <Providers>
        <Btn testID="hover-btn" label="Do it" onPress={() => {}} />
      </Providers>,
    );
    await flush();
    const btn = () => hoverNodes(utils)[0];
    expect(btn()).toBeDefined();

    expect(surfaceOf(btn())).toBe("transparent");

    await act(async () => {
      (btn().props.onHoverIn as () => void)();
    });
    expect(surfaceOf(btn())).toBe("rgba(255,255,255,0.08)");

    await act(async () => {
      (btn().props.onHoverOut as () => void)();
    });
    expect(surfaceOf(btn())).toBe("transparent");
    utils.unmount();
  });

  it("a Card with no onPress is not hoverable at all", async () => {
    const utils = render(
      <Providers>
        <Card testID="plain-card">
          <RNText>body</RNText>
        </Card>
      </Providers>,
    );
    await flush();
    // hover is a pointer affordance; a surface you cannot act on has none
    expect(hoverNodes(utils)).toHaveLength(0);
    utils.unmount();
  });

  it("a Card given an onPress is hoverable, and lifts the card's own alpha", async () => {
    const utils = render(
      <Providers>
        <Card testID="tappable-card" onPress={() => {}} accessibilityLabel="Open">
          <RNText>body</RNText>
        </Card>
      </Providers>,
    );
    await flush();
    const card = () => hoverNodes(utils)[0];
    expect(card()).toBeDefined();
    // the light card token is rgba(255,255,255,.58); one step takes it to .66
    expect(surfaceOf(card())).toBe("rgba(255,255,255,.58)");
    await act(async () => {
      (card().props.onHoverIn as () => void)();
    });
    expect(surfaceOf(card())).toBe("rgba(255,255,255,0.66)");
    utils.unmount();
  });
});

/**
 * UX-01..03 — `Field` expands on focus. The e2e spec
 * (`e2e/core/textentry.spec.ts`) drives the real editor at 393/1024/1366;
 * these pin the decisions that depend only on the props a caller passes,
 * where a rendered-tree assertion is the honest test and a navigation one
 * would not be.
 */
describe("UX-01 Field decides what expands from its own props", () => {
  /** The inner `TextInput`, not the `Field` composite around it — `Field`
   * also carries `onChangeText` and `placeholder`, so matching on those
   * alone finds the wrapper and every assertion below reads `undefined`
   * off it and passes for the wrong reason. `placeholderTextColor` is set
   * only on the real input. */
  const inputOf = (utils: { UNSAFE_root: { findAll: (p: (n: { props: Record<string, unknown> }) => boolean) => { props: Record<string, unknown> }[] } }) => {
    const found = utils.UNSAFE_root.findAll((n) => typeof n.props.onChangeText === "function" && n.props.placeholderTextColor !== undefined);
    expect(found.length).toBeGreaterThan(0);
    return found[0];
  };

  /**
   * E-1 changed the MEANS these two tests used, not the end they assert.
   *
   * They read `onFocus === undefined` as "this field cannot expand", which was
   * true while focus was wired only on the fields that expand. TE-05 puts a
   * focus ring on every field, so focus is now tracked on all of them and the
   * proxy is gone — but the claim is unchanged, and it is the claim that
   * matters: a single-line field, and a multiline field told not to expand,
   * still do not become the editor.
   *
   * So they assert the end instead: focus it, and see that the editor did not
   * open. `scrollEnabled` is set on the input only while `expanded`, so it is
   * the state itself rather than a stand-in for it. Recorded in
   * `02_ACCEPTANCE_TESTS_v22.md` §4 and `BUGLOG_v22.md` — this is exactly the
   * B-15/B-23 shape, a test that reached its subject through a control the row
   * changed.
   */
  it("a single-line field does not offer expansion", async () => {
    const utils = render(
      <Providers>
        <Field testID="one-line" value="" onChangeText={() => {}} placeholder="Name the focus" />
      </Providers>,
    );
    await flush();
    const input = inputOf(utils);
    expect(input.props.scrollEnabled).toBeUndefined();
    await act(async () => {
      fireEvent(utils.getByTestId("one-line"), "focus");
    });
    await flush();
    // focused, and still not the editor
    expect(inputOf(utils).props.scrollEnabled).toBeUndefined();
    utils.unmount();
  });

  it("a multiline field offers expansion", async () => {
    const utils = render(
      <Providers>
        <Field testID="many-lines" value="" onChangeText={() => {}} placeholder="What's on your mind?" multiline />
      </Providers>,
    );
    await flush();
    expect(typeof inputOf(utils).props.onFocus).toBe("function");
    utils.unmount();
  });

  it("a caller can force expansion off on a multiline field", async () => {
    const utils = render(
      <Providers>
        <Field testID="no-expand" value="" onChangeText={() => {}} placeholder="Notes" multiline expandOnFocus={false} />
      </Providers>,
    );
    await flush();
    await act(async () => {
      fireEvent(utils.getByTestId("no-expand"), "focus");
    });
    await flush();
    expect(inputOf(utils).props.scrollEnabled).toBeUndefined();
    utils.unmount();
  });
});

/**
 * Josh's A-0 row 2 — the three UX findings the B-3 review left (B3R2-04, -08,
 * -09). `Field` was transparent everywhere: invisible on an opaque card,
 * a window on a translucent sheet (the config dialog's Title input showed
 * the page through it). Three dialogs put their verbs in three grammars.
 */
describe("B3R2-04 · Field carries the pack's card fill", () => {
  it("the field's box paints the Card colour, on every field", async () => {
    const utils = render(
      <Providers>
        <Field testID="filled" value="" onChangeText={() => {}} placeholder="Title" />
      </Providers>,
    );
    await flush();
    const box = utils.getByTestId("filled-box");
    const flat = StyleSheet.flatten(box.props.style as never) as { backgroundColor?: string; borderWidth?: number };
    expect(flat.backgroundColor).toBe(light.card);
    expect(flat.borderWidth).toBe(1);
    utils.unmount();
  });
});

describe("B3R2-08 · DialogVerbs: primary first, at least the secondary's width", () => {
  it("renders the primary before the secondary and grows it to the secondary's measured width", async () => {
    const utils = render(
      <Providers>
        <DialogVerbs primary={<BtnPrimary testID="verb-save" label="Save" onPress={() => {}} />} secondary={<Btn testID="verb-revert" label="Revert to the EA's" onPress={() => {}} />} />
      </Providers>,
    );
    await flush();
    const primaryWrap = utils.getByTestId("dialog-verbs-primary");
    const secondaryWrap = utils.getByTestId("dialog-verbs-secondary");
    // render order IS document order: the primary's testID serialises first
    const tree = JSON.stringify(utils.toJSON());
    expect(tree.indexOf("dialog-verbs-primary")).toBeGreaterThan(-1);
    expect(tree.indexOf("dialog-verbs-primary")).toBeLessThan(tree.indexOf("dialog-verbs-secondary"));
    expect((StyleSheet.flatten(primaryWrap.props.style as never) as { minWidth?: number } | undefined)?.minWidth).toBeUndefined();
    await act(async () => {
      secondaryWrap.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 119, height: 36 } } });
    });
    expect((StyleSheet.flatten(utils.getByTestId("dialog-verbs-primary").props.style as never) as { minWidth?: number }).minWidth).toBe(119);
    utils.unmount();
  });
});

describe("R1-07 · the header's delta line is Muted; only the link carries accent ink", () => {
  it("renders the delta at the meta kind's own Muted, with 'Review the week' in accent", () => {
    // handoff Shell: "Today adds a delta line beneath (11.5 muted)". The line
    // rendered at `c.textExpiry` — measured Accent-adjacent by three review
    // rounds (D2, R1-07; DISCREPANCIES row 14) — with the one tappable phrase
    // in the same hue as the twelve words before it.
    const utils = render(
      <Providers>
        <Header title="Today" subtitle="Mon 8 Sep" deltaLine="3 new since yesterday · 1 resolved." onReviewWeek={() => {}} />
      </Providers>,
    );
    const delta = StyleSheet.flatten(utils.getByTestId("header-delta").props.style as never) as { color?: string };
    const link = StyleSheet.flatten(utils.getByTestId("review-week-link").props.style as never) as { color?: string };
    expect({ delta: delta.color, link: link.color }).toEqual({ delta: light.muted, link: light.accentInk });
    utils.unmount();
  });
});

describe("Stage 5d P-9 · the Tag (K1-08, N1-07)", () => {
  const flat = (style: unknown): Record<string, unknown> => (Array.isArray(style) ? Object.assign({}, ...(style.flat(Infinity) as object[]).filter(Boolean)) : ((style as Record<string, unknown>) ?? {}));

  it("every tone sets one text size at the body floor and one border width, so a sensitive tag is no taller than its neighbours", () => {
    const utils = render(
      <Providers>
        <>
          <Tag label="accent-tag" tone="accent" testID="tag-accent" />
          <Tag label="neutral-tag" tone="neutral" testID="tag-neutral" />
          <Tag label="alert-tag" tone="alert" testID="tag-alert" />
        </>
      </Providers>,
    );
    for (const tone of ["accent", "neutral", "alert"]) {
      const box = flat(utils.getByTestId(`tag-${tone}`).props.style);
      const text = flat(utils.getByText(`${tone}-tag`).props.style);
      // 10.5 is README Type's floor ("body never below 10.5px"); a border on
      // every tone is what keeps the alert one the same height as the rest
      expect({ tone, fontSize: text.fontSize, borderWidth: box.borderWidth }).toEqual({ tone, fontSize: 10.5, borderWidth: 1 });
    }
    utils.unmount();
  });
});

/**
 * Stage 5d P-7 (F-35, F-36, F-37, F-38, F-62, F-46) — theme/ui with margin.
 * The moves are guarded by where a primitive LIVES and what the callers
 * stopped writing by hand, since every one of them renders the same pixels.
 */
describe("Stage 5d P-7 · theme/ui with margin", () => {
  const root = join(__dirname, "..", "..");
  const src = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("Tag and Label live in their own files, and the barrel hands out the same components (F-36, F-37)", () => {
    expect(TagFromItsFile).toBe(Tag);
    expect(LabelFromItsFile).toBe(Label);
    expect(src("theme/ui/chips.tsx")).not.toMatch(/export function Tag\b/);
    expect(src("theme/ui/text.tsx")).not.toMatch(/export function Label\b/);
  });

  it("the five buttons share one chrome hook — no button patches aria-disabled or toasts the reason by hand (F-35)", () => {
    expect(typeof useButtonChrome).toBe("function");
    const files = ["theme/ui/controls.tsx", "theme/ui/fieldButton.tsx", "theme/ui/iconButton.tsx"];
    // call sites only — the definition in controls.tsx is `function useAriaDisabledPatch(`
    const patches = files.flatMap((f) => (src(f).match(/(?<!function )useAriaDisabledPatch\(/g) ?? []).map(() => f));
    // the one call is the hook's own
    expect(patches).toEqual(["theme/ui/controls.tsx"]);
    const toasts = files.flatMap((f) => (src(f).match(/toast\(action\.disabledReason/g) ?? []).map(() => f));
    expect(toasts).toEqual(["theme/ui/controls.tsx"]);
    // and the markers GL-05 measures by are still on the buttons
    expect(src("theme/ui/controls.tsx")).toMatch(/"btn-sm": "1"/);
    expect(src("theme/ui/controls.tsx")).toMatch(/btn-primary/);
  });

  it("<Strong> is the inline emphasis, and the three spans that cast the weight by hand read it (F-62)", () => {
    const utils = render(
      <ThemeProvider>
        <RNText testID="strong-host">
          plain <Strong testID="strong">bold</Strong>
        </RNText>
      </ThemeProvider>,
    );
    expect(StyleSheet.flatten(utils.getByTestId("strong").props.style)).toMatchObject({ fontWeight: String(typeScale.weight.emphasis) });
    utils.unmount();
    for (const f of ["components/agents/History.tsx", "components/life/Goals.tsx", "components/agents/EmergencyLock.tsx"]) {
      expect(src(f)).not.toMatch(/fontWeight: String\(typeScale\.weight\.emphasis\)/);
    }
  });

  it("fields.tsx no longer promises a sweep that already happened, and Columns parses its grid strings once (F-38, F-46)", () => {
    expect(src("theme/ui/fields.tsx")).not.toMatch(/noted for the Stage 5d pass/);
    const columns = src("components/chrome/Columns.tsx");
    const body = columns.slice(columns.indexOf("export function Columns"));
    expect(body).not.toMatch(/\.split\(" "\)/);
  });
});

/**
 * Stage 6 A-3 (S6-19) — at 393 Sync's "COULD NOT BE APPLIED" hint ran off the
 * viewport and was cut mid-word. The label row can wrap now and the hint can
 * shrink: a hint that fits stays beside its label, one that does not takes the
 * next line whole. Asserted on the styles the wrap depends on — this lane has
 * no layout engine to measure the wrap itself; `e2e/core/offline.spec.ts`
 * measures it at 393.
 */
describe("Stage 6 A-3 · a section label's hint can wrap under the label (S6-19)", () => {
  const flat = (style: unknown): Record<string, unknown> => (Array.isArray(style) ? Object.assign({}, ...(style.flat(Infinity) as object[]).filter(Boolean)) : ((style as Record<string, unknown>) ?? {}));

  it("the hint may shrink, and the group it sits in may wrap", () => {
    const utils = render(
      <Providers>
        <Label hint="the server would not take these — your words are kept here">Could not be applied</Label>
      </Providers>,
    );
    const hint = utils.getByText("the server would not take these — your words are kept here");
    expect(flat(hint.props.style).flexShrink).toBe(1);
    let group = hint.parent;
    while (group != null && group.type !== "View") group = group.parent;
    expect(group).not.toBeNull();
    expect(flat(group!.props.style).flexWrap).toBe("wrap");
    utils.unmount();
  });
});
