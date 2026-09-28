/**
 * SectionHeaderRight (X-1) — the controls beside a configured section's
 * heading.
 *
 * Split out of `layout/SectionRenderer.tsx`, which has sat at its 250-line cap
 * since S-7 and went over when this slot's reasoning grew. It is a real seam
 * rather than a place to put lines: the renderer's job is to turn a config
 * into blocks, and this is the heading's chrome, which has its own hook
 * (`SECTION_VERBS[...].use()`) and its own layout rule.
 *
 * TWO controls at most, in this order — the section's own verb ("all", "Copy
 * as CSV") and then `configure`. The verb is what the reader came for;
 * `configure` is maintenance.
 *
 * THE GAP IS `2 * LINK_SLOP`, AND IT HAS TO BE (B-49). A `Txt onPress` takes
 * `webHitArea(LINK_SLOP)` — 14px of padding to make a real tap target on the
 * web, with -14px of margin so the layout does not move. So the visual gap
 * between two links is NOT the gap between their boxes: at `space[3]` (8px)
 * the two boxes overlapped by 20px, the one later in the DOM won every pointer
 * event in the overlap, and `configure` swallowed the whole of a three-letter
 * verb — visible, enabled, unclickable. Files is the first section to carry
 * both controls, so this was latent from T-4 until X-1. Written as the
 * expression rather than as 28 so a change to `LINK_SLOP` cannot put it back.
 */
import React from "react";
import { View } from "react-native";
import { LINK_SLOP, Txt } from "@/theme/ui";
import { SECTION_VERBS } from "@/layout/sources";
import { useSessionStore } from "@/stores/session";
import type { SectionConfig } from "@/data/types";

/** A component of its own because `SECTION_VERBS[...].use()` is a HOOK, and a
 * hook cannot be called from inside a ternary in another component's body. */
function SectionVerb({ id, verb }: { id: string; verb: NonNullable<SectionConfig["verb"]> }) {
  const run = SECTION_VERBS[verb.action].use();
  return (
    <Txt testID={`${id}-verb`} onPress={run} kind="meta" tone="accentInk">
      {verb.label}
    </Txt>
  );
}

/** `undefined` when the section has neither control — `Label`'s `right` slot
 * takes nothing rather than an empty row, so the heading does not reserve
 * space for chrome that is not there. */
export function sectionHeaderRight(config: SectionConfig): React.ReactNode | undefined {
  if (config.verb == null && config.configure !== true) return undefined;
  return <SectionHeaderRight config={config} />;
}

function SectionHeaderRight({ config }: { config: SectionConfig }) {
  const openModal = useSessionStore((s) => s.openModal);
  return (
    <View style={{ flexDirection: "row", gap: 2 * LINK_SLOP }}>
      {config.verb != null && <SectionVerb id={config.id} verb={config.verb} />}
      {config.configure === true && (
        <Txt testID={`${config.id}-configure`} onPress={() => openModal("life-config", config.id)} kind="meta" tone="accentInk">
          configure
        </Txt>
      )}
    </View>
  );
}
