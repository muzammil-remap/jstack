/**
 * FindDialog (K-1, GS-02..GS-07) — the app's one global search.
 *
 * ONE COMPONENT, TWO REGISTRY ENTRIES. `find` is a `modal` and `find-phone` is
 * a `screen`, because an entry declares a single kind and a full-screen
 * surface is a design decision rather than a width test hidden inside a
 * component (`dialogs.tsx`). Both entries render THIS file: a second component
 * would be a second copy of the filters, and a copy is what drifts. The two
 * surfaces are chosen in one place, `layout/find.ts`, so no caller has to know
 * which it is asking for.
 *
 * THE FILTERS GO TO THE SERVER. The focus chips are the app's own
 * (`FocusChips`, the same control as every tab's) and the sensitivity segment
 * is Find's; changing either re-runs the query rather than filtering rows in
 * hand. That is not a round-trip wasted — the silo gate and the clearance gate
 * are the server's, and a client that filtered a full result set would be
 * showing a filter while the network carried the rows it was hiding (MU-02).
 *
 * THE CAP IS A SENTENCE, NOT A SILENCE. `search.maxResults` limits the TOTAL,
 * each group still reports its own full count, and when the cap bites the list
 * says so and says what to do about it. A search that quietly stops at fifty
 * teaches you it has looked at everything.
 */
import React, { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Dialog } from "@/components/chrome/Dialog";
import { FindRow } from "@/components/chrome/FindRow";
import { FocusChips } from "@/components/chrome/FocusChips";
import { Icon } from "@/components/chrome/Icon";
import { Field, IconBtn, Label, ListCard, Meta, Seg, Txt } from "@/theme/ui";
import { openSearchResult } from "@/layout/openRef";
import { shownCount, useSearchStore } from "@/stores/search";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { pagePadPhone, space, type as typeScale } from "@/theme/tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTokens } from "@/theme/ThemeProvider";
import { useLayout } from "@/theme/useLayout";
import { KIND_LABEL } from "@/lib/enumLabels";

const SENSITIVITY = [
  { key: "all" as const, label: "All" },
  { key: "normal" as const, label: "Not sensitive" },
  { key: "sens" as const, label: "Sensitive only" },
];

export function FindDialog({ onClose }: { onClose: () => void }) {
  const c = useTokens();
  const { phone } = useLayout();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useSearchStore((s) => s.q);
  const setQuery = useSearchStore((s) => s.setQuery);
  const run = useSearchStore((s) => s.run);
  const clear = useSearchStore((s) => s.clear);
  const response = useSearchStore((s) => s.response);
  const sensitivity = useSearchStore((s) => s.sensitivity);
  const setSensitivity = useSearchStore((s) => s.setSensitivity);
  const setFocus = useSearchStore((s) => s.setFocus);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  const openModal = useSessionStore((s) => s.openModal);

  // The focus chips are the APP's, and they write `activeFocus`. Find follows
  // it rather than keeping a second one: two focus states would let the chips
  // say Work while the results were Everything.
  useEffect(() => {
    setFocus(activeFocus);
  }, [activeFocus, setFocus]);

  // Find is a place you leave, not a page you come back to. Closing it with a
  // query still in the box would mean the next Cmd+K answers a question from
  // an hour ago before you have typed anything.
  useEffect(() => () => clear(), [clear]);

  const groups = response?.groups ?? [];
  const shown = shownCount(response);

  const body = (
    <View style={{ gap: space[3], flex: 1 }}>
      <Field
        testID="find-query"
        value={q}
        autoFocus
        onChangeText={setQuery}
        placeholder={phone ? "Find anything" : "Find anything — a task, a capture, a file, a person"}
        onSubmitEditing={() => void run()}
        left={<Icon name="search" size={typeScale.icon.inline} color={c.muted} />}
      />
      {/* K1-10: the two filter rows sit on the parent's `gap` and nothing else.
          `FocusChips` carried its own `marginBottom: 8` on top of it, which put
          9 between the field and the chips and 17 between the chips and the
          segment — and 17 is not on the spacing scale at all. */}
      <View style={{ marginBottom: -space[3] }}>
        <FocusChips />
      </View>
      <Seg testID="find-sensitivity" options={SENSITIVITY} value={sensitivity} onChange={setSensitivity} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space[3], paddingBottom: space[4] }}>
        {response == null ? (
          <Meta testID="find-empty">Type what you are looking for.</Meta>
        ) : groups.length === 0 ? (
          <Meta testID="find-none">Nothing matched “{response.q}”.</Meta>
        ) : (
          groups.map((g, gi) => (
            // K1-06: the pack asks 16 above a section label and 8 below it — a
            // 2:1 ratio, which is what makes a label belong to the card UNDER
            // it. This stack was 8 above and 10 below, close enough to equal
            // that an eye cannot resolve it, and five groups read as one list.
            <View key={g.kind} testID={`find-group-${g.kind}`} style={{ marginTop: gi === 0 ? 0 : space[3] }}>
              {/* K1-11 (P-9): the count is the section label's Marker badge, as
                  every other counted label in the app — it was inline text */}
              <Label badge={g.count}>{KIND_LABEL[g.kind]}</Label>
              <ListCard style={{ marginTop: space[3] }}>
                {g.items.map((r, i) => (
                  <FindRow
                    key={`${r.kind}:${r.id}`}
                    result={r}
                    last={i === g.items.length - 1}
                    onOpen={(res) => {
                      onClose();
                      openSearchResult(res.ref, router.navigate, openModal);
                    }}
                  />
                ))}
              </ListCard>
            </View>
          ))
        )}
        {/* K1-04: the list says when it has ENDED, not only when it was cut
            short. At 1024 the panel is short enough that the last row is half
            below the fold, and a search that stops without a word leaves a
            person unable to tell whether that was the last group or the first
            of five more — the one thing a result list has to be honest about. */}
        {response != null && groups.length > 0 && (
          <Meta testID="find-cap">
            {response.truncated ? `Showing ${shown} · refine your search` : `${shown} ${shown === 1 ? "result" : "results"} · that's all`}
          </Meta>
        )}
      </ScrollView>
    </View>
  );

  if (!phone) {
    return (
      <Dialog testID="find" title="Find" onClose={onClose}>
        {body}
      </Dialog>
    );
  }

  // The phone's `screen`: `ScreenSurface` (the registry's, not this file's)
  // already owns the opaque ground and the tab bar is hidden while it is open,
  // so all this adds is the title row and the way out.
  return (
    <View style={{ flex: 1, paddingTop: insets.top + pagePadPhone.topBase, paddingHorizontal: pagePadPhone.sides, gap: space[3] }} testID="find">
      {/* K1-02: the APP's phone page padding, not a raw space token and a magic
          44. `space[4]` is 9, so every card on this screen ran 9→383 while every
          other phone screen runs 20→373, and the header sat 22px lower than the
          rest of the app. Opening Find made the whole page jump. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt kind="heading">Find</Txt>
        {/* K1-09: `inCard` is the 36px cut. This is the ONLY way out of a
            full-screen surface — no backdrop, no tab bar — and it was 32. */}
        <IconBtn icon="close" inCard accessibilityLabel="Close" onPress={onClose} testID="find-close" />
      </View>
      {body}
    </View>
  );
}
