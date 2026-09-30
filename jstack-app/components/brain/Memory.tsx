/**
 * Memory — Brain's proposals card (BR-06..08) plus the hit-rate row
 * (BR-09), which mock v11 appends inside the SAME card rather than a
 * separate one. "fix" opens the hit-rate's `fixUrl` through the existing
 * outbound-link confirmation (`modal === "external-link"`) — the full
 * helped/misled report is CONTRACT_v2.md's own V2.1 line, so V2.0's "fix"
 * is a lightweight hop to it rather than an in-app report (A-26).
 */
import React from "react";
import { Text, View } from "react-native";
import { BtnSm, ListCard, Meta, Row, Section, Txt, useTxtStyle } from "@/theme/ui";
import { useBrainStore } from "@/stores/brain";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { RichText } from "@/lib/richText";
import { space } from "@/theme/tokens";
import { sayRefused } from "@/lib/optimistic";

/** "1 rule" / "2 rules", and an explicit plural where -s is wrong ("misses"). */
function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function Memory() {
  const bodyStyle = useTxtStyle("body");
  const proposals = useBrainStore((s) => s.proposals);
  const hitRate = useBrainStore((s) => s.hitRate);
  const resolveProposal = useBrainStore((s) => s.resolveProposal);
  const openModal = useSessionStore((s) => s.openModal);

  const fix = () => {
    if (hitRate?.fixUrl == null) return;
    openModal("external-link", packPayload(hitRate.fixUrl, "the wrong answers and their sources"));
  };

  return (
    /* No `fix` link on the section label. handoff.md, Brain Column 2 puts it
       on the HIT-RATE ROW and only there — "Hit-rate row: '27 of 30 test
       questions right last week' + `fix` link" — and the card was carrying
       the same word twice, ~230px apart, both wired to the same handler
       (ux-review R8). One control, where the pack puts it. */
    <Section
      testID="brain-memory-section"
      sectionId="memory"
      title="Memory"
      badge={proposals.length}
      // OP-03: the history behind the proposals. What the card shows is what
      // is still open; "all" is what was decided, and what it was before.
      right={
        <Txt testID="memory-all" kind="meta" tone="accentInk" onPress={() => openModal("memory-history")}>
          all
        </Txt>
      }
    >
      <ListCard style={{ marginTop: space[2] }}>
        {proposals.length === 0 ? (
          <Row testID="memory-empty">
            <Meta>All caught up. The Librarian runs again at 2:00.</Meta>
          </Row>
        ) : (
          proposals.map((p) => (
            <Row key={p.id} testID={`proposal-${p.id}`}>
              <View style={{ flex: 1 }}>
                <Text>
                  <RichText text={p.text} style={bodyStyle} />
                </Text>
                <Meta>{p.reason}</Meta>
              </View>
              <View style={{ flexDirection: "row", gap: space[2] }}>
                {/* D20: handoff.md Brain — "rows with `ok` (small primary) and
                    `edit` (small outlined)"; README Components lists ok/edit
                    under `.js-btn-sm`. As bare links they were the least
                    visible controls in the app's busiest queue. */}
                <BtnSm testID={`proposal-ok-${p.id}`} label="ok" onPress={() => void resolveProposal(p.id, "ok").catch(sayRefused)} />
                <BtnSm testID={`proposal-edit-${p.id}`} label="edit" outlined onPress={() => openModal("proposal-edit", p.id)} />
              </View>
            </Row>
          ))
        )}
        {hitRate != null && (
          <Row last testID="memory-hitrate">
            <View style={{ flex: 1 }}>
              <Txt kind="body">
                {hitRate.right} of {hitRate.total} test questions right last week
              </Txt>
              <Meta>
                {/* D28: "1 rules misled" — the one row in Brain whose job is
                    to be honest about the system's own accuracy read as a
                    number-agreement error (README Content: "Plain words"). */}
                {plural(hitRate.wrongSources, "wrong source")} · {plural(hitRate.misses, "miss", "misses")} · {plural(hitRate.rulesMisled, "rule")} misled
              </Meta>
            </View>
            <Txt kind="meta" tone="accentInk" testID="hitrate-fix" onPress={fix}>
              fix
            </Txt>
          </Row>
        )}
      </ListCard>
    </Section>
  );
}
