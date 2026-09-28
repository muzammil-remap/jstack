/**
 * SectionPreview (S-7) — the read-only preview a `kind: "section"` decision
 * card carries (B-3, CB-05).
 *
 * Split out of `layout/SectionRenderer.tsx`, which was 248 lines against a 250
 * cap. It belongs in its own file on its own merits, not only for the room: the
 * renderer draws a section a person HAS, and this draws one they are being
 * offered. Same blocks, same components, and everything about it — the cap, the
 * missing handlers, the caption outside the frame — follows from that one
 * difference.
 */
import React from "react";
import { View } from "react-native";
import { Blocks } from "@/layout/SectionRenderer";
import { tabLabel } from "@/layout/tabRoutes";
import { endpointLabel } from "@/lib/enumLabels";
import { Ghost, Meta } from "@/theme/ui";
import { space } from "@/theme/tokens";
import type { SectionConfig } from "@/data/types";

/**
 * The read-only preview a `kind: "section"` decision card carries (B-3,
 * CB-05). Same blocks, same components, nothing tappable.
 *
 * It renders the REAL thing rather than a description of it, because the
 * question the card asks is "do you want this on your tab?" and a list of
 * block names does not answer that. Bound blocks show live data, so the
 * preview shows Josh's own rows, not a mock of them.
 *
 * `act` and `onLink` are deliberately not passed: `RowsBlock` renders a verb
 * button only when it has a handler, so an un-approved section cannot offer
 * an action, and the NC-01 sweep does not find a dead control. Items are
 * capped — a preview that scrolls is a section, not a preview.
 *
 * `flat`: no surfaces. The section's own Label is dropped too — the card's
 * title already reads "New section: Reading", and repeating the word forty
 * pixels below it in the same token was the reviewer's B3R1-09.
 *
 * ux S6-25: IN THE GHOST DRESS, AND SAID TO BE A PREVIEW. The frame was an
 * `Inset` painted Accent soft — the same fill as the Approve button beneath
 * it and the recommended option on a Clash card — so the picture of a section
 * read as a section that had escaped into a card, and one fill meant three
 * things on one card. The pack's Ghost ("a section without a feed": 1px
 * dashed Hairline, radius 10) already means "not real yet", costs no new
 * token, and leaves Accent soft to mean "act". The 10.5 Muted line above it
 * says what it is.
 */
export function SectionPreview({ config, max = 3 }: { config: SectionConfig; max?: number }) {
  return (
    <View style={{ gap: space[2] }}>
      <Meta>a preview</Meta>
      <Ghost testID={`decision-section-${config.id}`}>
        <Blocks blocks={config.blocks} max={max} flat />
      </Ghost>
      {/* the caption sits OUTSIDE the frame, on the card (ux-review B3R2-05):
          the pack allows 10.5 Muted "on Card or Ground", and on the inset's
          own fill the same three lines measured ~3.0:1 against 3.56 on the
          card. It also stops the caption reading as a fourth row of the
          preview it is describing (B3R2-06).

          ux S6-07: the source is named as a NOUN — "reads Learning", never
          "reads /learning" — and the column number is gone: a reader cannot
          see a column 3, and the preview already shows what goes where. */}
      <Meta>
        goes on {tabLabel(config.tab)} · reads {endpointLabel(config.source.endpoint)}
      </Meta>
    </View>
  );
}
