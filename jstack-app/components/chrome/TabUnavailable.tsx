/**
 * TabUnavailable (A-2, WP-A) — what a tab says when its load failed and there
 * is nothing from before to show.
 *
 * One sentence, the same on every tab, and the connection decides which. With
 * no connection it says captures still queue: the one thing that still works,
 * and the thing worth knowing on a plane. Otherwise the load failed, and it is
 * offered back as a retry. Both take the tap, because a phone has no `online`
 * event — the retry is how the tab finds out it can load again, and the
 * transport's answer is how the sync dot does (`data/transport/reachability.ts`).
 *
 * A dashed `Ghost` in muted ink, the frame the pack already gives "nothing
 * here" — never an alert, because nothing is wrong with the person's data.
 */
import React from "react";
import { Pressable } from "react-native";
import type { TabId } from "@/layout/tabRoutes";
import { useSessionStore } from "@/stores/session";
import { Ghost, Txt } from "@/theme/ui";

export function TabUnavailable({ tab, onRetry }: { tab: TabId; onRetry: () => void }) {
  const online = useSessionStore((s) => s.online);
  return (
    <Pressable testID={`tab-unavailable-${tab}`} accessibilityRole="button" onPress={onRetry}>
      <Ghost>
        <Txt tone="muted">{online ? "Couldn't load · tap to retry" : "You're offline · captures still queue"}</Txt>
      </Ghost>
    </Pressable>
  );
}
