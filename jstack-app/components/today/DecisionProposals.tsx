/**
 * DecisionProposals — the bodies of the two cards the EA raises about ITS OWN
 * behaviour (W-1, ST-1). Split out of `DecisionBodies.tsx` at ST-1, which went
 * over its 250-line cap when the rule card arrived.
 *
 * The split is a seam and not a shelf. Everything left in `DecisionBodies` is a
 * body for a decision about the WORLD — three options, a quote, a bill, a
 * change to a tab, a change to a setting. These two are about what the EA
 * should do next time: where it filed something, and whether a thing it keeps
 * being told should become standing. They share a grammar because of that —
 * tags first, then the evidence — and a reader looking for one will want the
 * other.
 */
import React from "react";
import { View } from "react-native";
import { Tag, Txt } from "@/theme/ui";
import { siloShortName } from "@/data/labels";
import { space } from "@/theme/tokens";
import type { ActionItem } from "@/data/types";

/**
 * The triage body (W-1, UP-05/UP-09): where the EA put something shared in,
 * and what it read.
 *
 * TAGS FIRST, and that ordering is a security decision rather than a layout
 * preference. What the card is asking about is the FILING — which silo, which
 * labels, how sensitive — and those are the app's own conclusions about the
 * item. The extraction line comes after them, and the extracted text itself
 * never appears on the card at all; it lives in the `brain-item` detail,
 * rendered through `Txt` only. A card that led with a stranger's prose and
 * put the filing underneath would be inviting a person to read the page's
 * words as the app's (`SECURITY.md`, the ingestion threat model).
 *
 * The card renders ABOVE `why` (`DecisionCard.tsx:99`), so tags-first is true
 * on the screen and not just in this file.
 *
 * `content saved · 412 words` uses the count the SERVER made, from
 * `triage.extracted.words` — the renderer counting for itself would be a
 * second implementation of the same fact, and the two would disagree the day
 * one of them learned about punctuation.
 */
export function TriageBody({ card }: { card: ActionItem }) {
  if (card.kind !== "triage" || card.triage == null) return null;
  const { routing, extracted } = card.triage;
  return (
    <View testID={`decision-triage-${card.id}`} style={{ gap: space[2] }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        {/* ux S6-07: the silo's WORD, the one Brain's rows wear — never its key */}
        <Tag testID={`decision-triage-silo-${card.id}`} label={siloShortName(routing.silos[0])} />
        {routing.labels.map((l) => (
          <Tag key={l} testID={`decision-triage-label-${card.id}-${l}`} label={l} />
        ))}
        {/* the sensitivity is a tag like the others, not a colour: "sensitive"
            said in a word is legible to somebody who cannot tell two greys
            apart, and Alert already means three other things (hard rule 20) */}
        <Tag testID={`decision-triage-sensitivity-${card.id}`} label={routing.sensitivity} tone="neutral" />
      </View>
      {extracted != null && (
        <Txt kind="meta" testID={`decision-triage-extracted-${card.id}`}>
          {`content saved · ${extracted.words} words · ${extracted.from}`}
        </Txt>
      )}
    </View>
  );
}

/**
 * The rule body (ST-1, ST-03): the standing rule the EA is proposing, in the
 * words it would write.
 *
 * THE CARD SHOWS THE RULE ITSELF, not a description of one. Approve appends
 * exactly this text (`handlers/decisions.ts`), so what was agreed to and what
 * was stored cannot differ — the same reason a parameter card carries its
 * `current` and `proposed` rather than a sentence about them.
 *
 * When and how it would apply are tags, like a triage card's filing, because
 * they are the part a person is actually being asked to agree to: a rule that
 * acts without asking is a different proposition from one that asks first, and
 * "auto" buried in prose is a word nobody reads twice.
 */
export function RuleBody({ card }: { card: ActionItem }) {
  if (card.kind !== "rule" || card.rule == null) return null;
  const rule = card.rule;
  return (
    <View testID={`decision-rule-${card.id}`} style={{ gap: space[2] }}>
      <Txt testID={`decision-rule-text-${card.id}`}>{rule.text}</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        <Tag testID={`decision-rule-scope-${card.id}`} label={rule.scope === "all" ? "everything" : rule.scope} />
        <Tag testID={`decision-rule-mode-${card.id}`} label={rule.mode === "auto" ? "do it, tell me after" : "ask me first"} tone="neutral" />
      </View>
    </View>
  );
}
