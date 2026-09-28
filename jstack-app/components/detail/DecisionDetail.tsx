/**
 * DecisionDetail (O-1, OP-04) — what an Agents › History row opens.
 *
 * History listed what had been decided and gave you no way to see it. This is
 * the card AS ANSWERED: what was asked, the options it offered, which one was
 * taken and through which channel, and the receipt — model, cost, sources,
 * seconds. "The EA did this" is not an answer a person can check, and a cost
 * with no line behind it is a number to be argued with later.
 *
 * The same dialog opens from the history search (OP-04's second half): one
 * detail per record, not one per surface that happens to list it.
 */
import React from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { Meta, Txt } from "@/theme/ui";
import { useDetail } from "@/components/detail/useDetail";
import { formatWhen } from "@/lib/time";
import { VERB_LABEL, VIA_LABEL } from "@/lib/enumLabels";
import { money } from "@/lib/money";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";

export function DecisionDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const c = useTokens();
  const { item: action, missing } = useDetail(id, (a, id) => a.getAction(id));

  // the answer is the last entry that was not an undo — the ledger is the
  // record, so the dialog reads it rather than keeping a second copy
  const answered = action?.history.filter((h) => h.verb !== "undone").at(-1);

  return (
    <Dialog testID="decision" title="Decision" onClose={onClose}>
      {missing && <Txt testID="decision-missing">That decision is no longer here.</Txt>}
      {action != null && (
        <View style={{ gap: space[3] }}>
          <Txt kind="title" testID="decision-title">
            {action.title}
          </Txt>
          <Meta testID="decision-why">because: {action.why}</Meta>

          {action.options != null && (
            <View testID="decision-options" style={{ gap: space[2] }}>
              {action.options.map((o, i) => {
                const taken = answered?.option === i + 1;
                return (
                  <View key={i} testID={`decision-option-${i + 1}`} style={{ gap: 2 }}>
                    <Txt style={taken ? { color: c.accentInk } : undefined}>
                      {taken ? "✓ " : ""}
                      {o.text}
                    </Txt>
                    <Meta>{o.why}</Meta>
                  </View>
                );
              })}
            </View>
          )}

          {answered != null ? (
            <Meta testID="decision-answer">
              {VERB_LABEL[answered.verb]} · {formatWhen(answered.at)} · via {VIA_LABEL[answered.via]}
            </Meta>
          ) : (
            <Meta testID="decision-answer">not answered yet</Meta>
          )}

          {/* the receipt. ADR-43's reason, applied to a decision: a number
              nobody can trace is a number nobody can check. */}
          <Meta testID="decision-receipt">
            {action.receipt.model} · {money(action.receipt.cost)} · {action.receipt.sources} sources · {action.receipt.seconds}s
          </Meta>
        </View>
      )}
    </Dialog>
  );
}
