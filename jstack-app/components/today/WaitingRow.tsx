/**
 * WaitingRow — an undecided card that isn't the one currently open
 * (mock v11 `wrow()`, design/handoff.md "Today" column 1). Tapping the
 * title opens it (closing whichever was open); tapping the small primary
 * verb answers it without opening (DC-10).
 *
 * UX-H (carried from V2.1, row C-5): on the phone the row is TWO lines, with
 * the expiry under the title. At 393 the one-line row left the title about
 * ninety pixels — "Dev call Thur…", "Gym Wednes…" — and two clash cards
 * truncated to the same twelve characters, so the list could not be read
 * without opening every row, which is the one thing a waiting list is for.
 * On a rail width there is room for one line, and one line is what the pack
 * draws, so the two-line form is phone-only.
 */
import React from "react";
import { Pressable, View } from "react-native";
import { BtnSm, Txt } from "@/theme/ui";
import { touchSlop } from "@/lib/webData";
import { shortExpiry, useTodayStore } from "@/stores/today";
import { verbLabel } from "@/lib/decisionCopy";
import { approveCard, OFFLINE_REASON } from "@/lib/cardVerbs";
import { useSessionStore } from "@/stores/session";
import { LABEL_COL_MIN } from "@/lib/labelColumn";
import { space } from "@/theme/tokens";
import { useLayout } from "@/theme/useLayout";
import { useTokens } from "@/theme/ThemeProvider";
import type { ActionItem } from "@/data/types";

export function WaitingRow({ card, last = false, labelWidth = LABEL_COL_MIN }: { card: ActionItem; last?: boolean; labelWidth?: number }) {
  const c = useTokens();
  const { phone } = useLayout();
  const pick = useTodayStore((s) => s.picks[card.id]) ?? card.recommended ?? 1;
  const openDecision = useTodayStore((s) => s.openDecision);
  const online = useSessionStore((s) => s.online);
  const verb = verbLabel(card, pick);

  const expiry = (
    <Txt testID={`waiting-expiry-${card.id}`} kind="meta" style={{ color: c.textExpiry }}>
      {shortExpiry(card.thenWhat)}
    </Txt>
  );

  return (
    <View
      testID={`waiting-row-${card.id}`}
      style={{
        flexDirection: "row",
        alignItems: phone ? "flex-start" : "center",
        gap: space[5],
        paddingVertical: 9,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.hairline,
      }}
    >
      <Txt testID={`waiting-type-${card.id}`} kind="label" style={{ width: labelWidth, paddingTop: phone ? 2 : 0 }}>
        {card.type}
      </Txt>
      <Pressable
        testID={`waiting-open-${card.id}`}
        accessibilityRole="button"
        accessibilityLabel={card.title}
        onPress={() => openDecision(card.id)}
        {...touchSlop(11, { "waiting-open": "1" })}
        style={{ minHeight: 36, justifyContent: "center", flex: 1, minWidth: 0 }}
      >
        <Txt testID={`waiting-title-${card.id}`} numberOfLines={1}>
          {card.title}
        </Txt>
        {phone ? expiry : null}
      </Pressable>
      {phone ? null : expiry}
      {/* A4R10-04: the card's own approve, and like the card's buttons it waits for a connection (OF-08) */}
      <BtnSm testID={`waiting-verb-${card.id}`} label={verb} {...(online ? { onPress: () => void approveCard(card) } : { disabledReason: OFFLINE_REASON })} />
    </View>
  );
}
