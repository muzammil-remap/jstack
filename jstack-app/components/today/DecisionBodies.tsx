/**
 * The bodies a decision card can carry (S-7, SM-03).
 *
 * `DecisionCard.tsx` was 242 lines against SM-03's 250 cap with three of its
 * four body shapes written inline, and B-3 adds a fourth (`section`, the
 * catalogue preview). Splitting first means that row adds a case here rather
 * than pushing the card over the limit.
 *
 * One component per `card.kind`, each owning its own testIDs, and a single
 * `DecisionBody` switch so the card does not carry the branching either.
 * Everything below is the existing markup moved verbatim — the comments
 * carrying B4-02, CD-15 and the ux-review round 10 reasoning move with the
 * code they explain, which is the point of keeping them.
 */
import React from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { Pressable, View } from "react-native";
import { Inset, Txt } from "@/theme/ui";
import { Sens } from "@/components/chrome/Sens";
import { toast } from "@/components/chrome/Toast";
import { useTodayStore } from "@/stores/today";
import { radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { SectionPreview } from "@/layout/SectionPreview";
import { RuleBody, TriageBody } from "@/components/today/DecisionProposals";
import type { ActionItem } from "@/data/types";

/** S-9: the copy itself is `lib/clipboard.ts`; the toast stays here, because
 * what to say about a copy that did not happen is the caller's call. Still
 * "Copied" either way for now — changing it is a copy change, not a refactor,
 * and it is written down in BUGLOG_v22.md rather than slipped in. */
async function copyAndToast(text: string): Promise<void> {
  await copyToClipboard(text);
  toast("Copied");
}

/** Renders whichever body `card.kind` names. A kind with no body renders
 * nothing, which is what the plain "go/later" cards want. */
export function DecisionBody({ card, pick }: { card: ActionItem; pick: 1 | 2 | 3 }) {
  return (
    <>
      <OptsBody card={card} pick={pick} />
      <QuoteBody card={card} />
      <BillBody card={card} />
      <SectionBody card={card} />
      <ParameterBody card={card} />
      <TriageBody card={card} />
      <RuleBody card={card} />
    </>
  );
}

function OptsBody({ card, pick }: { card: ActionItem; pick: 1 | 2 | 3 }) {
  const c = useTokens();
  const pickOption = useTodayStore((s) => s.pickOption);
  if (card.kind !== "opts" || card.options == null) return null;
  return (
      <View style={{ gap: space[1] }} testID={`decision-opts-${card.id}`}>
        {card.options.map((o, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const recommended = pick === n;
          return (
            <Pressable
              key={n}
              testID={`decision-opt-${card.id}-${n}`}
              accessibilityRole="button"
              accessibilityLabel={o.text}
              onPress={() => pickOption(card.id, n)}
              style={{
                flexDirection: "row",
                gap: space[4],
                paddingVertical: 7,
                paddingHorizontal: 9,
                borderRadius: radius.control,
                backgroundColor: recommended ? c.accentSoft : "transparent",
              }}
            >
              <Txt kind="meta" style={{ width: 14, color: recommended ? c.accentInk : c.muted }}>{n}</Txt>
              <View style={{ flex: 1 }}>
                <Txt>{o.text}</Txt>
                <Txt kind="meta">{o.why}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    
  );
}

function QuoteBody({ card }: { card: ActionItem }) {
  if (card.kind !== "quote") return null;
  return (
      <Inset testID={`decision-quote-${card.id}`} style={{ paddingVertical: 8, paddingHorizontal: 10 }}>
        <Txt kind="quote">{card.quote}</Txt>
      </Inset>
    
  );
}

function BillBody({ card }: { card: ActionItem }) {
  if (card.kind !== "bill" || card.bill == null) return null;
  return (
      <View style={{ gap: space[2] }} testID={`decision-bill-${card.id}`}>
        {card.bill.map((line) => (
          // The ROW carries the 36px height, not the copy link inside it —
          // otherwise the two rows with a link stand 20px taller than the
          // payee row without one, which is the "cluster that doesn't line up
          // row to row" class the reviewer was asked to hunt and is the one
          // instance of it no frame can show (ux-review round 10).
          <View key={line.k} style={{ flexDirection: "row", alignItems: "center", minHeight: 36, gap: space[5] }}>
            <Txt kind="meta" style={{ width: 44 }}>{line.k}</Txt>
            <Sens kind="body" style={{ flex: 1 }}>{line.v}</Sens>
            {line.copy === true && (
              <Pressable
                testID={`decision-copy-${card.id}-${line.k}`}
                accessibilityRole="button"
                accessibilityLabel={`Copy ${line.k}`}
                onPress={() => void copyAndToast(line.v)}
                // B4-02: 23 x 13 before — GL-05 only ever measured the
                // default open card, so a bill card's copy links were never
                // in a sweep. The height comes from the row above.
                // CD-15: the row's own `gap: space[5]` (10px) already
                // separates the value from this link, so an equal 8px
                // inset on the near (left) edge doubled up and read as too
                // much air before the word; the far (right) edge keeps the
                // full touch inset. paddingLeft can't drop below 6 without
                // taking the whole control under GL-05's 36px floor
                // (matrix/theme.spec.ts caught 4 at 35px wide — this row's
                // own core spec never measures the box, only the behaviour,
                // which is exactly how this slipped through at C-2).
                style={{ alignSelf: "stretch", justifyContent: "center", paddingLeft: 6, paddingRight: 8 }}
              >
                <Txt kind="meta" tone="accentInk">copy</Txt>
              </Pressable>
            )}
          </View>
        ))}
      </View>
    
  );
}

/**
 * The section body (B-3, CB-05): the proposal rendered as itself.
 *
 * `SectionPreview` owns the rules — real blocks, live data, nothing
 * tappable, items capped — because they belong beside the renderer whose
 * components it borrows, not here.
 */
function SectionBody({ card }: { card: ActionItem }) {
  if (card.kind !== "section" || card.section == null) return null;
  return <SectionPreview config={card.section} />;
}

/**
 * The parameter body (L-1, LK-04): what is being changed, from what, to what.
 *
 * Three lines and no cleverness. The reason is already the card's `why` line,
 * so repeating it here would be the same sentence twice on one card; what the
 * body has to answer is the question the title cannot fit — which setting, and
 * what is it now. `current` is the card's own copy, taken when the EA asked,
 * so a card left open for two days still shows what it was actually looking at.
 */
function ParameterBody({ card }: { card: ActionItem }) {
  const c = useTokens();
  if (card.kind !== "parameter" || card.parameter == null) return null;
  const p = card.parameter;
  return (
    <View testID={`decision-parameter-${card.id}`} style={{ gap: space[1] }}>
      <Txt kind="meta">{p.label}</Txt>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 36 }}>
        <Txt testID={`decision-parameter-current-${card.id}`} style={{ color: c.muted }}>
          {String(p.current)}
        </Txt>
        <Txt kind="meta" style={{ color: c.muted }}>{"→"}</Txt>
        <Txt testID={`decision-parameter-proposed-${card.id}`} weight="emphasis">
          {String(p.proposed)}
        </Txt>
      </View>
    </View>
  );
}
