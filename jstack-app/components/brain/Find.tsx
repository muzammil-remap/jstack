/**
 * Find — Brain's search field (BR-04, GS-05).
 *
 * N-1 (BN-01, ux N1-01): its OWN section, with a heading and a collapse state
 * like every other section on the tab. It used to render inside the capture
 * card, which left the app's one search surface unnamed — the only thing
 * saying "Find" was placeholder text that vanished on the first keystroke —
 * and uncollapsible while five of its neighbours were not, three rows after
 * H-1 made collapsing the rule.
 *
 * Empty on open (no search call); submit → an answer card (headline, synthesis,
 * source links, "confidence high · 0.4s") with the plain matches below it.
 *
 * K-1 CHANGED WHERE THE MATCHES COME FROM. The answer card is still
 * `/brain/search`'s — a synthesis is the EA's work and nothing else produces
 * one. The list under it is now `/search`'s, the same index the global Find
 * reads, because two lists of "things that mention this" built by two matchers
 * will eventually disagree and there is no way for a person to tell which one
 * is wrong. It is also the half that was silently NOT silo-scoped: the global
 * index applies the gate, and a second matcher over `brainItems` never did.
 */
import React, { useState } from "react";
import { Platform, View } from "react-native";
import { Card, Field, FieldButton, ListCard, Meta, Section, Txt } from "@/theme/ui";
import { Icon } from "@/components/chrome/Icon";
import { useBrainStore } from "@/stores/brain";
import { useSessionStore } from "@/stores/session";
import { openSearchResult } from "@/layout/openRef";
import { FindRow } from "@/components/chrome/FindRow";
import { useSearchStore } from "@/stores/search";
import { useRouter } from "expo-router";
import { space, type as typeScale } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { useLayout } from "@/theme/useLayout";

function confidenceLabel(v: number): string {
  return v >= 0.7 ? "high" : v >= 0.4 ? "medium" : "low";
}

export function Find() {
  const c = useTokens();
  // ux-review D5 (round 15, still open at Stage 4): the desktop placeholder
  // was sliced through its last letterform at the phone field's edge, no
  // ellipsis, butting the send button. A placeholder that does not fit says
  // something else — so the phone asks the shorter question. v2.3.2 WPR-4 puts a web field's text at 16 px, and the
  // longer question then ran 18 px past its field at 1366 (BR-04), so every web page asks the shorter one too.
  const { phone } = useLayout();
  const [q, setQ] = useState("");
  const answer = useBrainStore((s) => s.findAnswer);
  const response = useSearchStore((s) => s.response);
  const results = React.useMemo(() => (response?.groups ?? []).flatMap((g) => g.items), [response]);
  const openModal = useSessionStore((s) => s.openModal);
  const router = useRouter();
  const find = useBrainStore((s) => s.find);
  const setQuery = useSearchStore((s) => s.setQuery);
  const runSearch = useSearchStore((s) => s.run);

  // TWO calls, deliberately: the synthesis and the matches are two different
  // questions and a backend will answer them at two different speeds. The
  // answer card can take a second; the list should not have to wait for it.
  const submit = () => {
    void find(q);
    setQuery(q);
    void runSearch();
  };

  return (
    // No hint. Every other hint on this tab labels a card that cannot speak
    // for itself; this is the one card that carries its own instruction in its
    // placeholder, and a second one 24px above it is noise (ux round 2).
    <Section
      testID="brain-find"
      sectionId="brain-find"
      title="Find"
      style={{ gap: space[3], marginTop: space[4] }}
    >
      {/* handoff.md, Brain Column 1: "Find field (card, search icon,
          placeholder)" — the leading icon had no slot to live in until
          `Field` gained one (ux-review round 9). */}
      <Field
        testID="find-input"
        value={q}
        onChangeText={setQ}
        placeholder={phone || Platform.OS === "web" ? "Find · what did Andy say?" : "Find · what did Andy say about the memory layer?"}
        onSubmitEditing={submit}
        left={<Icon name="search" size={typeScale.icon.inline} color={c.muted} />}
        right={<FieldButton icon="arrow_forward" primary accessibilityLabel="Find" {...(q.trim() === "" ? { disabledReason: "Type something to search" } : { onPress: submit })} />}
      />
      {answer != null && (
        <Card testID="find-answer">
          <Txt kind="body" weight="emphasis">{answer.headline}</Txt>
          <Txt kind="meta" style={{ marginTop: 4 }}>{answer.synthesis}</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] }}>
            {answer.sources.map((s) => (
              <Txt key={s.ref} kind="meta" tone="accentInk">
                {s.label}
              </Txt>
            ))}
          </View>
          <Meta style={{ marginTop: space[2] }}>
            confidence {confidenceLabel(answer.confidence)} · {answer.seconds.toFixed(1)}s
          </Meta>
        </Card>
      )}
      {results.length > 0 && (
        // OP-01: the chevron was already there — the row just did not open. A
        // row that looks like a door and is not one is worse than a row that
        // does not (ADR-52). GS-05: the row is `FindRow` now, so a match here
        // and the same match in the global Find are one component with one
        // highlight rule and one blur rule.
        <ListCard testID="find-results">
          {results.map((r, i) => (
            <FindRow
              key={`${r.kind}:${r.id}`}
              result={r}
              last={i === results.length - 1}
              onOpen={(res) => openSearchResult(res.ref, router.navigate, openModal)}
            />
          ))}
        </ListCard>
      )}
    </Section>
  );
}
