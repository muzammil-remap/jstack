/**
 * Rules — Settings' "Rules for my EA" card (ST-1, ST-02).
 *
 * The standing instructions Josh has given his EA, in one place, with the two
 * things a rule has to say about itself beside it: WHEN it applies and WHAT
 * the EA does about it. V2.1's list lived on Brain, said neither, and had its
 * own type and four routes; this reads `GET /settings/autonomy/rules`, which
 * is the list the mock actually obeys.
 *
 * It sits under Settings › Autonomy rather than beside it: the three-way
 * Ask/Propose/Auto controls above are the DEFAULT per card kind, and these are
 * the exceptions Josh has written by hand. Same subject, increasing specificity.
 */
import React from "react";
import { View } from "react-native";
import { Btn, Card, Label, Meta, Row, Txt } from "@/theme/ui";
import { ruleLine } from "@/components/settings/RulesEditDialog";
import { useRulesStore } from "@/stores/rules";
import { useSessionStore } from "@/stores/session";
import { space } from "@/theme/tokens";

export function Rules() {
  const rules = useRulesStore((s) => s.rules);
  const load = useRulesStore((s) => s.load);
  const openModal = useSessionStore((s) => s.openModal);

  // a rule can arrive while the app is open — answering a `rule` card writes
  // one server-side, and `RELOAD` has no `settings` kind to carry it back
  React.useEffect(() => {
    void load().catch(() => undefined); // unreadable: the card stays as it was
  }, [load]);

  return (
    // ST1-14: `marginTop`, because this card is inside the `onLayout`
    // wrapper the capture rig scrolls to, and a wrapper collapses the gap the
    // sheet's own `gap: space[4]` was providing — the label sat 3-5px under
    // Autonomy's card and 12-15px above its own, where every other section
    // label on the sheet is about 14/13.
    <View testID="settings-rules" style={{ marginTop: space[4] }}>
      <Label badge={rules.length}>Rules for my EA</Label>
      <Card style={{ marginTop: 8 }}>
        {/* ST1-09: rows straight onto the card, NOT a `ListCard` inside it. A
            list card on a card is two stacked surfaces — measured in dark as a
            30-step from the sheet, where every other card on the sheet is one
            visible layer. `Schedules` is the identical object and draws one
            surface with hairlines between its rows; this does the same. */}
        {rules.length === 0 ? (
          <Meta testID="settings-rules-empty">Nothing here yet</Meta>
        ) : (
          <View testID="settings-rules-list">
            {rules.map((rule, i) => (
              <Row key={rule.id} testID={`settings-rule-${rule.id}`} last={i === rules.length - 1} onPress={() => openModal("rules-edit", rule.id)}>
                <View style={{ flex: 1 }}>
                  {/* ST1-15: `pretty` so a rule never orphans its last word */}
                  <Txt style={{ textWrap: "pretty" } as never}>{rule.text}</Txt>
                  <Meta testID={`settings-rule-meta-${rule.id}`}>{ruleLine(rule)}</Meta>
                </View>
              </Row>
            ))}
          </View>
        )}
        <Meta style={{ marginTop: space[2] }}>Teach on any card adds a rule here. Every run reads them.</Meta>
        <Btn testID="settings-rules-edit" label="Edit rules" onPress={() => openModal("rules-edit")} style={{ marginTop: space[3], alignSelf: "flex-start" }} />
      </Card>
    </View>
  );
}
