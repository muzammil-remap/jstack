/**
 * WorkMark — "an agent is on this right now" (T-5, WK-02/WK-03, ADR-42).
 *
 * Four surfaces draw it: the list row, the task card, the board card and the
 * Gantt bar. That is the whole point of it being a component and of the LINE
 * living in `lib/taskMeta.ts` — a marker that says "EA working · since 2:14am"
 * on the list and something else on the board is two markers, and a person
 * would have to learn both.
 *
 * The pulse is the pack's own 1.4s ring at 8px (`Pulse`, shared with the live
 * mic orb), and only while the state is `running`: a queued agent is not doing
 * anything, and a dot that pulses whenever an agent is merely assigned would
 * make the animation mean "there is an agent" rather than "it is working now".
 * `blocked` is the alert tone, because it is the one state that wants a person.
 *
 * `null` when there is no `work` and when the state is `done` — the finished
 * run is in the activity list with its usage line (WK-04), which is where a
 * past event belongs.
 */
import React from "react";
import { View } from "react-native";
import { Pulse } from "@/components/chrome/LiveMicOrb";
import { Txt } from "@/theme/ui";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { workLine } from "@/lib/taskMeta";
import { webData } from "@/lib/webData";
import type { Work } from "@/data/types";

/** the pack's 8px dot. The ring grows by 6 rather than the orb's 14: at 8px a
 * 14px ring is three times the dot and reads as a target, not a pulse. */
const DOT = 8;
const RING_GROWTH = 6;

export function WorkMark({ work, taskId }: { work: Work | undefined; taskId: string }) {
  const c = useTokens();
  if (work == null) return null;
  const line = workLine(work);
  if (line == null) return null;

  const tone = work.state === "blocked" ? c.alert : c.accentInk;

  return (
    <View testID={`work-mark-${taskId}`} {...webData({ "work-state": work.state })} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      {work.state === "running" ? (
        <Pulse size={DOT} growth={RING_GROWTH} color={tone} testID={`work-pulse-${taskId}`} />
      ) : (
        // the same 8px circle without the animation, so the line does not shift
        // sideways when a run starts or stops
        <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: tone }} />
      )}
      <Txt kind="meta" style={{ color: tone }}>
        {line}
      </Txt>
    </View>
  );
}
