/**
 * FindRow (K-1, GS-04/GS-07) — one search result, and what happens when it is
 * touched.
 *
 * Split from `FindDialog.tsx` because the dialog is a query field, two filters
 * and a list, and this is the part with two rules in it — the highlight and
 * the blur — that both want explaining.
 *
 * THE HIGHLIGHT COMES FROM THE SERVER. `matches` are character ranges in the
 * snippet the server returned, so what is lit up is what the index actually
 * matched. Re-running the match here would be a second matcher, and two
 * matchers that disagree give a person no way to answer "why is this row
 * here" — the same reason the groups are not re-sorted.
 *
 * A SENSITIVE ROW IS BLURRED, AND THE FIRST TAP REVEALS IT. Only under privacy
 * blur: with the setting off there is nothing to reveal and the first tap
 * opens, as every other row in the app does. Reveal is per row and per
 * session — revealing one sensitive result is not a decision about the rest,
 * and it is never written down.
 */
import React from "react";
import { Text, View } from "react-native";
import { Icon } from "@/components/chrome/Icon";
import { Sens } from "@/components/chrome/Sens";
import { Meta, Row, Tag, Txt } from "@/theme/ui";
import { useDeviceStore } from "@/stores/device";
import { useSearchStore } from "@/stores/search";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import type { SearchResult } from "@/data/types";

/**
 * One field's text, split into plain and matched runs. Returns one plain run
 * when nothing matched, so the caller never branches.
 *
 * `field` is not decoration. A result's `matches` carry ranges into the TITLE
 * and into the SNIPPET — two coordinate systems in one array — and applying a
 * title range to the snippet lights up characters the server never matched.
 */
export function fieldRuns(field: string, text: string, matches: SearchResult["matches"]): { text: string; hit: boolean }[] {
  const runs: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const m of matches) {
    if (m.field !== field) continue;
    if (m.start < at || m.end > text.length) continue; // overlapping or stale ranges are dropped, never trusted
    if (m.start > at) runs.push({ text: text.slice(at, m.start), hit: false });
    runs.push({ text: text.slice(m.start, m.end), hit: true });
    at = m.end;
  }
  if (at < text.length) runs.push({ text: text.slice(at), hit: false });
  return runs;
}

/**
 * K1-05: the reading measure a result title wraps at. Not a container width —
 * the rows are as wide as the panel and should be, because the tap target is
 * the row. This caps the TEXT, so a 139-character reply wraps at something a
 * person can read instead of running the full 1920 panel.
 */
const TITLE_MEASURE = 720;

export function FindRow({ result, last, onOpen }: { result: SearchResult; last: boolean; onOpen: (r: SearchResult) => void }) {
  const c = useTokens();
  /**
   * K1-07: the match is marked with a SOFT WASH, not with accent ink.
   *
   * Accent ink means "you can act on this" — links, verbs, section labels. A
   * highlight is none of those: the whole row is the tap target and the matched
   * word is not separately actionable. It showed as soon as a one-word title
   * matched: the People row's title is "Steve", the query matched all of it,
   * and the row rendered entirely in link colour with no ink anywhere in it.
   * A wash also carries better in dark, where the accent and the plain title
   * ink are about 1.4:1 apart in luminance and the whole distinction was hue.
   */
  const HIT = { backgroundColor: c.accentSoft };
  const privacy = useDeviceStore((s) => s.privacyBlur);
  const revealed = useSearchStore((s) => s.revealed);
  const reveal = useSearchStore((s) => s.reveal);

  const key = `${result.kind}:${result.id}`;
  const hidden = privacy && result.sensitivity === "sensitive" && !revealed.includes(key);
  const Body = hidden ? Sens : Txt;

  return (
    <Row
      key={key}
      last={last}
      testID={`find-row-${result.kind}-${result.id}`}
      onPress={() => (hidden ? reveal(key) : onOpen(result))}
    >
      {/* K1-05: a reply's "title" is the whole answer — 139 characters, which at
          1366 and 1920 ran to one 760px line, twice a comfortable measure, and
          made the longest row the first thing the eye landed on. Clamped to two
          lines and capped at a reading measure; a short title is unaffected
          ("Bali deposit to Steve" measures 115px). */}
      <View style={{ flex: 1, maxWidth: TITLE_MEASURE }}>
        {/* The title's runs are NESTED <Text>, not a row of siblings: a title
            wraps, and a flex row would break it at every run boundary instead
            of at a word. A blurred row renders the plain string — highlighting
            through a blur is a decoration on something nobody can read. */}
        <Body kind="body" numberOfLines={2}>
          {hidden
            ? result.title
            : fieldRuns("title", result.title, result.matches).map((run, i) => (
                <Text key={`t${i}-${run.text}`} style={run.hit ? HIT : undefined}>
                  {run.text}
                </Text>
              ))}
        </Body>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline" }}>
          {fieldRuns("snippet", result.snippet, result.matches).map((run, i) => (
            <Meta key={`s${i}-${run.text}`} style={run.hit ? HIT : undefined}>
              {run.text}
            </Meta>
          ))}
        </View>
      </View>
      {result.sensitivity === "sensitive" && <Tag label="sensitive" tone="alert" testID={`find-sens-${result.id}`} style={{ marginRight: space[2] }} />}
      <Icon name="chevron_right" size={16} color={c.muted} />
    </Row>
  );
}
