/**
 * dialogKit.tsx (O-1) — the dialog registry's TYPES and its factory.
 *
 * Split out of `layout/dialogs.tsx` when that file reached its 250-line cap
 * (hard rule 3: split before you exceed). It has to be a separate module
 * rather than a section of that one: `layout/dialogs.tsx` builds `DIALOGS`
 * with `dialog()`, and the components it registers reach for `packPayload`
 * and the types here — inside the registry that would be a cycle evaluated
 * while the table is still being built.
 *
 * Nothing about how a dialog behaves lives here — only what an entry IS.
 */
import React from "react";
import { Pressable, type ViewStyle } from "react-native";
import { Icon } from "@/components/chrome/Icon";
import { ScreenSurface } from "@/components/chrome/ScreenSurface";
import { frostedStyle } from "@/theme/ui";
import { misc } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";

/**
 * How a dialog presents. `screen` is a full-screen surface that replaces
 * the tab bar and the rail while it is open — nothing uses it yet; V-2's
 * `TalkScreen` is the first. `app/(tabs)/_layout.tsx` reads
 * `screenDialogOpen()` so the behaviour exists the moment an entry claims
 * the kind, rather than the kind being a label with nothing behind it.
 */
type DialogKind = "modal" | "sheet" | "settings" | "screen";

/** Which piece of state says this dialog is open. */
type DialogSource = "modal" | "sheet" | "settings" | "task";

/**
 * The width a dialog takes on a desktop, by the KIND of surface it is
 * (S6-26). Every dialog was 900 — the pack's ceiling for the SETTINGS SHEET
 * (README Components; handoff.md "sheet max-width 900") — so a one-sentence
 * confirm and a nine-card grid wore the same slab, two-thirds of it empty. A
 * width is a property of a kind, not of a dialog: the entry says which kind
 * it is, `Dialog` reads it from context, and no dialog's own file carries a
 * number.
 *
 *   confirm  480  a question and two buttons — the completion confirm, the
 *                 emergency confirm, the external-link confirm
 *   panel    640  a dialog that opens INSIDE the Settings sheet (Sync,
 *                 Devices, a focus, the rules), which at 900 was a band cut
 *                 out of the 900 sheet beneath it (S6-05). At 1024 every
 *                 dialog is already 66% = 676, so nothing is laid out for
 *                 more than this
 *   sheet    900  the pack's own number, and RL-06's recorded desktop
 *                 dialog ("66vw, max 900" — `02_ACCEPTANCE_TESTS_v2.md`,
 *                 amended at V2.1 §4 R-14; `e2e/matrix/layout.spec.ts`
 *                 measures Help against it). The DEFAULT, and the Settings
 *                 sheet and the task card by name.
 *
 * The ux round proposes `panel` for every detail, list and editor. That is a
 * change to RL-06's recorded number, so it waits on a §4 expectation change
 * and the matrix test's own line; the mechanism is here, and flipping the
 * rest is `DialogHost`'s one fallback word.
 */
type SurfaceKind = "confirm" | "panel" | "sheet";
export const SURFACE_WIDTH: Record<SurfaceKind, number> = { confirm: 480, panel: 640, sheet: 900 };

/** Which kind the dialog being rendered is — provided by `DialogHost` around
 * each entry it mounts, read by `Dialog`. The recorded `sheet` for anything
 * mounted outside the registry (a test rendering a Dialog bare). */
export const DialogSurfaceContext = React.createContext<SurfaceKind>("sheet");

/**
 * S6-41 (ux round 2): does this overlay paint the scrim? `DialogHost` gives it
 * to the FIRST open entry and to nothing above it — the delegate picker over the
 * task card painted a second one and took the card 111 levels below the ground,
 * S6-05's class on a surface the settings-only exemption never reached. One
 * scrim, the outermost. A dialog mounted outside the host paints its own.
 */
export const DialogScrimContext = React.createContext<boolean>(true);

export type DialogEntry = {
  name: string;
  kind: DialogKind;
  /** S6-26: the surface KIND, which is the only thing that decides a
   * dialog's desktop width (`SURFACE_WIDTH`). Absent means the recorded
   * `sheet` width. */
  surface?: SurfaceKind;
  /** the surface this entry uses on a DESKTOP, when that differs from `kind`
   * (JQ-2). `delegate-picker` is the only one so far: a short list of choices
   * is a sheet on a phone and a centred modal on a desktop, where a sheet is
   * a panel in a corner. Absent means the kind is the kind everywhere. */
  desktopKind?: DialogKind;
  /** TS-01 / UX-J: how a `screen` presents on a desktop — `panel` is a centred
   * 880px column over a dimmed scrim with the rail visible, `full` (default)
   * is edge-to-edge. Meaningless on any other kind. */
  presentation?: "full" | "panel";
  source: DialogSource;
  /** kept alongside `render` so the registry can be inspected and tested by
   * component identity, not only by calling it */
  component: React.ComponentType<never>;
  /** whether the dialog is meaningless without a payload (an id to edit) */
  requiresPayload: boolean;
  render: (payload: string, onClose: () => void) => React.ReactElement;
};

/**
 * Builds one entry. The generic is what makes the registry type-safe: `props`
 * must return exactly the props `component` takes, minus `onClose`, so a
 * dialog whose signature changes fails `pnpm check` at its entry rather than
 * at runtime. The single cast below is the erasure that lets twenty-three
 * differently-typed entries share one array — it is checked on the way in.
 */
export function dialog<P extends { onClose: () => void }>(d: {
  name: string;
  kind: DialogKind;
  desktopKind?: DialogKind;
  /** TS-01 / UX-J: how a `screen` presents on a DESKTOP. `panel` is a centred
   * 880px column over a dimmed scrim with the rail still visible; `full`
   * (the default) is edge-to-edge, which is what a phone wants. One flag,
   * because Josh's open item was "panel or edge-to-edge" and the answer has
   * to be changeable in one place. Meaningless on any other kind. */
  presentation?: "full" | "panel";
  /** S6-26: `confirm` for a question and two buttons, `panel` for a dialog
   * opened inside the Settings sheet, `sheet` for the pack's 900; absent is
   * the recorded `sheet`. The width is the table's, never the dialog's. */
  surface?: SurfaceKind;
  source: DialogSource;
  component: React.ComponentType<P>;
  props?: (payload: string) => Omit<P, "onClose">;
  requiresPayload?: boolean;
}): DialogEntry {
  return {
    name: d.name,
    kind: d.kind,
    ...(d.desktopKind != null ? { desktopKind: d.desktopKind } : {}),
    ...(d.presentation != null ? { presentation: d.presentation } : {}),
    ...(d.surface != null ? { surface: d.surface } : {}),
    source: d.source,
    component: d.component as React.ComponentType<never>,
    requiresPayload: d.requiresPayload ?? false,
    render: (payload, onClose) => {
      const el = React.createElement(d.component, { ...(d.props?.(payload) ?? {}), onClose } as P);
      // a `screen` is rendered ON its surface: the kind owns the opaque,
      // viewport-filling ground, the way `Dialog` and `Sheet` own their
      // backdrops — not the component (ux-review R1-01, `ScreenSurface.tsx`)
      return d.kind === "screen" ? React.createElement(ScreenSurface, { presentation: d.presentation }, el) : el;
    },
  };
}


/** A payload that may be absent. The store hands every dialog a string and ""
 * is how "opened with nothing" arrives (F-31); an entry whose component takes
 * `payload?: string` maps it here rather than repeating the ternary. */
export function optionalPayload(payload: string): { payload: string | undefined } {
  return { payload: payload === "" ? undefined : payload };
}

/**
 * The one codec for a payload with more than one part (F-63): a URL and its
 * label, an id and its title. `|` is the separator every site already used;
 * a missing part packs as "" and unpacks as "" — never as the word
 * "undefined" on a button.
 */
export function packPayload(...parts: Array<string | null | undefined>): string {
  return parts.map((p) => p ?? "").join("|");
}

export function unpackPayload(payload: string | undefined): string[] {
  return (payload ?? "").split("|");
}

/**
 * The pack's overlay recipe (F-43, P-8 — `Dialog` and `Sheet` each carried it
 * with the same paragraph): a BLURRED SCRIM under a BAR surface — README
 * Surfaces ("Bar … blur 24px"), handoff.md Settings ("Scrim rgba(28,26,22,.3)
 * + blur 4 … Bar surface"). Painting `card` (alpha .58) with no backdrop
 * filter, as Dialog did until the ux-reviewer's D1, leaves the page
 * underneath fully legible through the overlay.
 *
 * `scrim: false` is the backdrop with the recipe left off (S6-05): a dialog
 * opened from inside the Settings sheet already sits on the sheet's scrim,
 * and painting a second one over it put the sheet's own card 70 levels
 * darker than the ground — README Components, "scrim + ONE frosted sheet".
 * The box still fills the viewport, so the tap-to-close Pressable inside it
 * still has the whole screen to catch.
 */
export function overlayBackdrop(zIndex: number, scrim = true): ViewStyle {
  const fill: ViewStyle = { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex };
  return scrim ? { ...fill, backgroundColor: misc.scrim, ...frostedStyle(misc.scrimBlur) } : fill;
}

/** The 36px close control in a surface's header row; the surface forwards
 * its own `${testID}-close` so every dialog's close is findable by name. */
export function CloseButton({ testID, onClose, size = 20 }: { testID: string; onClose: () => void; size?: number }) {
  const c = useTokens();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={{ minHeight: 36, minWidth: 36, alignItems: "center", justifyContent: "center" }}>
      <Icon name="close" size={size} color={c.muted} />
    </Pressable>
  );
}
