/**
 * The `Txt` kind tables (S-2b split of `theme/ui/text.tsx`, ADR-33/SM-04).
 *
 * Separated from the components that consume them for one reason: turning
 * `jstack/no-inline-font-size` on made this the app's only home for a font
 * size, so the table grew past the 250-line cap `tests/unit/sizes.test.ts`
 * enforces on the file it lived in. The split keeps the data (every kind's
 * size, family, weight and default colour) here and the components that
 * render it in `text.tsx`, which re-exports all of this so both
 * `@/theme/ui` and `@/theme/ui/text` keep their existing surface.
 */
import { TextStyle } from "react-native";
import { useTokens } from "@/theme/ThemeProvider";
import { fonts, type as typeScale } from "@/theme/tokens";

export type TxtKind =
  | "body"
  | "meta"
  | "small"
  | "label"
  | "title"
  | "stat"
  | "chip"
  | "heading"
  | "pageTitle"
  | "pageTitlePhone"
  | "sheetTitle"
  | "wordmark"
  | "wordmarkXl"
  | "tab"
  | "quote"
  | "statSm"
  | "micro"
  | "gridLabel"
  | "gridMicro";
export type TxtTone = "ink" | "muted" | "accentInk" | "alert";
export type TxtWeight = "regular" | "emphasis";

const KIND_STYLE: Record<TxtKind, TextStyle> = {
  body: { fontSize: typeScale.size.body },
  meta: { fontSize: typeScale.size.meta },
  small: { fontSize: typeScale.size.small },
  label: { fontSize: typeScale.size.label, letterSpacing: typeScale.tracking.label, textTransform: "uppercase" },
  title: {
    fontFamily: fonts.heading,
    fontSize: typeScale.size.cardTitle,
    lineHeight: typeScale.size.cardTitle * typeScale.lineHeight.title,
    fontWeight: String(typeScale.weight.emphasis) as TextStyle["fontWeight"],
  },
  stat: {
    fontFamily: fonts.heading,
    fontSize: typeScale.size.stat,
    lineHeight: typeScale.size.stat * typeScale.lineHeight.stat,
    fontWeight: String(typeScale.weight.emphasis) as TextStyle["fontWeight"],
  },
  chip: { fontSize: typeScale.size.chip },
  // A dialog/settings-sheet title. 20 is NOT in the pack's type scale (which
  // jumps 18 → 26) — both overlays have always used this literal, so S-2
  // gives it one home here in theme/ rather than hand-written copies out in
  // components/. No `fontWeight`: neither call site set one, and baking
  // emphasis in here would silently restyle every dialog title in the app.
  // design/DISCREPANCIES.md records the scale gap; if the pack later names a
  // size for it, this is the only line that changes.
  heading: { fontFamily: fonts.heading, fontSize: 20 },

  // --- S-2b: the roles that were still setting their own typography ---
  //
  // Turning `jstack/no-inline-font-size` on means a component cannot set a
  // size at all, so every distinct role in the app needs a home here. The
  // eleven below are the ones the pack's seven-step scale does not name.
  // Each keeps the exact value its call site used before the migration, so
  // S-2b is a refactor and not a restyle; `design/DISCREPANCIES.md` records
  // the ones that are genuinely off-scale.

  /** The page title in `chrome/Header.tsx`. Two kinds rather than one
   * responsive kind: `Txt` reads tokens, not layout, and the caller already
   * knows whether it is on a phone. Both are pack sizes. */
  pageTitle: {
    fontFamily: fonts.heading,
    fontSize: typeScale.size.titleDesktop,
    lineHeight: typeScale.size.titleDesktop * typeScale.lineHeight.tight,
    letterSpacing: typeScale.tracking.title,
  },
  pageTitlePhone: {
    fontFamily: fonts.heading,
    fontSize: typeScale.size.titlePhone,
    lineHeight: typeScale.size.titlePhone * typeScale.lineHeight.tight,
    letterSpacing: typeScale.tracking.title,
  },
  /** `chrome/Sheet.tsx`'s title. 18 is `size.stat`, but a sheet title is not
   * a stat: it takes no emphasis weight and no stat line-height, which is
   * why it is its own kind rather than `stat`. */
  sheetTitle: { fontFamily: fonts.heading, fontSize: typeScale.size.stat },
  /** The "JSTACK" wordmark in the desktop rail — the pack's wordmark weight
   * and tracking at 12. Off-scale (the scale has no wordmark step). */
  wordmark: {
    fontSize: 12,
    fontWeight: String(typeScale.weight.wordmark) as TextStyle["fontWeight"],
    letterSpacing: typeScale.tracking.wordmark,
  },
  /** The large wordmark and "Locked" heading on `chrome/LockedScreen.tsx`.
   * 34 is off-scale (the scale stops at 32) and deliberately so: the gate is
   * the one full-bleed screen in the app. */
  wordmarkXl: { fontFamily: fonts.heading, fontSize: 34 },
  /** `chrome/TabBar.tsx`'s label — `size.tab`, a pack size with no kind. */
  tab: { fontSize: typeScale.size.tab },
  /** EA-authored prose quoted inside a card (`today/DecisionCard.tsx`'s
   * `quote`, `tasks/EaReport.tsx`'s `report.body`): chip size at a looser
   * 1.45 line-height so a paragraph reads as prose rather than as UI. */
  quote: { fontSize: typeScale.size.chip, lineHeight: typeScale.size.chip * 1.45 },
  /** `today/Glance.tsx`'s cell value — one step above body (body + 1.5),
   * a smaller sibling of `stat`. Off-scale. */
  statSm: { fontSize: typeScale.size.body + 1.5 },
  /** 10px UI micro-text: the toast's undo countdown and a calendar event's
   * title. Below `meta`, above the grid's own labels. Off-scale. */
  micro: { fontSize: 10 },
  /** `today/CalendarGrid.tsx`'s axis and day labels (9.5) and its hour
   * marks (9). The densest surface in the app: the pack's scale bottoms out
   * at 10.5 (`meta`), which the grid cannot use without colliding. Both are
   * off-scale and recorded as such. */
  gridLabel: { fontSize: 9.5 },
  gridMicro: { fontSize: 9 },
};

/** `Txt`'s kind-level default weight — `title`/`stat` are already emphasis
 * via `KIND_STYLE`; every other kind defaults to regular unless `weight`
 * overrides it. */
const KIND_HAS_OWN_WEIGHT = new Set<TxtKind>(["title", "stat", "wordmark"]);

/**
 * The size/colour/weight style for a `kind`+`tone`+`weight` combination —
 * what `Txt` applies to its own `<Text>`, factored out so a component that
 * can't just render `<Txt>` (`Sens`, which must stay a thin wrapper so its
 * mount/blur registry keeps counting real usages) can apply the same rules
 * to its own `style` array instead of hand-writing a `fontSize` (SM-04).
 */
export function useTxtStyle(kind: TxtKind = "body", tone?: TxtTone, weight?: TxtWeight): TextStyle {
  const c = useTokens();
  const TONE_COLOR: Record<TxtTone, string> = { ink: c.ink, muted: c.muted, accentInk: c.accentInk, alert: c.alert };
  // Each kind's own colour when no `tone` overrides it. `label` is the one
  // that isn't reachable through `tone` at all: section labels have their
  // own token (`textLabel`), which is deliberately not one of the four
  // tones a caller can ask for.
  const KIND_DEFAULT_COLOR: Record<TxtKind, string> = {
    body: c.ink,
    meta: c.muted,
    small: c.muted,
    label: c.textLabel,
    title: c.ink,
    stat: c.ink,
    chip: c.muted,
    heading: c.ink,
    // S-2b's roles. Ink for the headings and wordmarks, muted for the
    // small/dense ones — each matching the colour its call site passed
    // before the migration, so the default is never a restyle.
    pageTitle: c.ink,
    pageTitlePhone: c.ink,
    sheetTitle: c.ink,
    wordmark: c.ink,
    wordmarkXl: c.ink,
    tab: c.muted,
    quote: c.muted,
    statSm: c.ink,
    micro: c.ink,
    gridLabel: c.muted,
    gridMicro: c.muted,
  };
  const color = tone != null ? TONE_COLOR[tone] : KIND_DEFAULT_COLOR[kind];
  const weightStyle: TextStyle = weight != null && !KIND_HAS_OWN_WEIGHT.has(kind) ? { fontWeight: String(typeScale.weight[weight]) as TextStyle["fontWeight"] } : {};
  // S-4/DS-02: every kind names a family, so no text falls through to
  // react-native-web's own default class. RNW puts `-apple-system, …` on a
  // CLASS that every <Text> without an explicit family carries, and a class
  // beats the `html, body` rule the export injects — which is exactly how
  // 127 of 129 text nodes on Today rendered in the OS UI font before, and
  // why `lib/webFonts.ts` used to rewrite that class at runtime. Declaring
  // the family here is what let that file be deleted. Kinds that set their
  // own family (the headings) override this.
  return { fontFamily: fonts.body, ...KIND_STYLE[kind], color, ...weightStyle };
}
