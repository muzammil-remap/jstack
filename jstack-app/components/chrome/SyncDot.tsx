/**
 * SyncDot (SY-02..SY-04) — one dot, in the two places the chrome has room for
 * one: the bottom of the rail above the health line on desktop, and inside the
 * header's health line on a phone.
 *
 * ONE component rather than two copies, for the reason `saturated-fill.test.ts`
 * has already had to record twice about the health dot beside it: the rail and
 * the phone header are one statement in two places, and a second copy is a
 * second thing to remember (rule 16). The status itself is not decided here at
 * all — `lib/syncStatus.ts` does that, from facts, with a table test.
 *
 * WHY THE RAIL'S CARRIES A WORD AND THE PHONE'S DOES NOT. A 6px dot alone,
 * with no text within reach of it, is a control nobody can name: there is
 * nothing to read and nothing to guess from, and its `aria-label` is a thing
 * only a screen reader is given. The rail has 200px and a whole line to spend,
 * so it spends it on the noun. The phone's sits INSIDE the health line, whose
 * words are right beside it — and where the same word would push a 393px line
 * that already carries "offline · captures queue" into a second row.
 *
 * The word is "Sync" and not the state, deliberately. The state is in the
 * colour, in the `aria-label`, and in the sheet the dot opens; putting it in
 * the rail as well would print "offline" directly above a health line that
 * already says "offline · captures queue".
 */
import React from "react";
import { Pressable, View } from "react-native";
import { Txt } from "@/theme/ui";
import { syncLabel, syncStatus } from "@/lib/syncStatus";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { useTokens } from "@/theme/ThemeProvider";
import { webHitArea } from "@/lib/webData";

export function SyncDot({ withLabel = false }: { withLabel?: boolean }) {
  const c = useTokens();
  const openModal = useSessionStore((s) => s.openModal);
  const online = useSessionStore((s) => s.online);
  const queued = useSyncStore((s) => s.queued);
  const syncing = useSyncStore((s) => s.syncing);
  const conflicts = useSyncStore((s) => s.conflicts.length);
  const lastError = useSyncStore((s) => s.lastError);
  const persistent = useSyncStore((s) => s.persistent);

  const facts = { online, queued, syncing, conflicts, lastError, persistent };
  const status = syncStatus(facts);

  return (
    <Pressable
      testID="sync-dot"
      accessibilityRole="button"
      // SY-02: the label IS the state. A static "sync status" would name the
      // control and withhold the one thing it exists to say, to the reader
      // least able to see the colour that would otherwise carry it.
      accessibilityLabel={syncLabel(facts)}
      // SY-04: Settings › Sync is where the queue, the conflicts and the last
      // sync time already live — the dot is a way in, not a second telling.
      onPress={() => openModal("sync")}
      style={
        withLabel
          ? // `minHeight`, not padding arithmetic: the row is a 6px dot beside
            // an 11px word, so 10 either side comes to 31 against GL-04's 36
            // floor — the same one-pixel trap `LINK_SLOP` records paying for
            // ("12 left at 35"). The floor is stated rather than computed, so
            // a change to the type scale cannot quietly walk under it.
            { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 38, paddingVertical: 8 }
          : // GL-04's floor on a bare 6px dot: real padding out to 36 and an
            // equal negative margin, so the tap area exists (`webHitArea`; a
            // bare `hitSlop` is a claim RNW does not honour, AUDIT_v2 AA-01).
            //
            // EXACTLY 36, and the health line around it is `minHeight: 36` so
            // this box fills its row rather than spilling out of it. At 38 it
            // reached a pixel past the line's top edge into the delta line
            // above and swallowed `review-week-link`'s centre — the board's
            // TD-08 failed with "sync-dot … intercepts pointer events". A tap
            // area that grows over a control the person was aiming at is a
            // worse defect than the small target it was fixing.
            webHitArea(15)
      }
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          // SY-03. `warn` is the token this row added, and it is here rather
          // than a third state drawn as a shape because the health dot beside
          // it is read the same way — one colour, one meaning (rule 20).
          backgroundColor: status === "attention" ? c.alert : status === "pending" ? c.warn : c.ok,
        }}
      />
      {withLabel ? <Txt kind="small">Sync</Txt> : null}
    </Pressable>
  );
}
