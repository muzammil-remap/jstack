/**
 * LatestIn — Brain's "Latest in" (BR-05, RP-06): title, ONE meta line
 * (what the Librarian decided, then the source and the time), then the
 * record's data labels as tags. "edit" opens the item editor (root-mounted,
 * `modal === "item-editor"` keyed by the item id).
 *
 * The row reads the REPLIES store for one reason only: a question capture
 * says "replied" once its answer has arrived, and the reply is a separate
 * record on a separate endpoint. That is a lookup, not a second copy — the
 * text of the answer is never rendered here.
 */
import { webHitArea } from "@/lib/webData";
import React from "react";
import { Text, View } from "react-native";
import { LINK_SLOP, ListCard, Meta, Row, Section, Tag, Txt } from "@/theme/ui";
import { captureTags, routingLine } from "@/lib/routingLine";
import { noOrphan } from "@/lib/richText";
import { useRepliesStore } from "@/stores/replies";
import { useBrainStore } from "@/stores/brain";
import { formatWhen } from "@/lib/time";
import { useSessionStore } from "@/stores/session";
import { queuedDumps } from "@/data/transport/outbox";
import { useSyncStore } from "@/stores/sync";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";

/**
 * README Content's separator, bound to both neighbours with NBSP so a wrap
 * can never leave it leading or ending a line (hard rule 24) — the same
 * binding `richRuns` gives a meta line's dots.
 */
const BOUND_DOT = " · ";

export function LatestIn() {
  const c = useTokens();
  const latestIn = useBrainStore((s) => s.latestIn);
  const openModal = useSessionStore((s) => s.openModal);
  // O-2: captures that have not reached the server yet sit at the top of the
  // same list, because that is where the person just put them. They are the
  // QUEUE, not shadow copies of it — when it drains they vanish and the
  // reload brings the real rows (OF-02).
  //
  // The SUBSCRIPTION is to `entriesNow`, which is a stable reference, and the
  // mapping happens outside it. Selecting `queuedDumps(s.entriesNow)` returns
  // a fresh array every call, and zustand compares with Object.is — so the
  // component re-rendered forever and the native lane would not mount.
  const entries = useSyncStore((s) => s.entriesNow);
  const replies = useRepliesStore((s) => s.replies);
  const answered = React.useMemo(() => new Set(replies.map((r) => r.toCaptureId)), [replies]);
  const queued = React.useMemo(() => queuedDumps(entries), [entries]);
  const rows = [...queued, ...latestIn];

  return (
    <Section testID="latest-in" style={{ gap: space[3] }} sectionId="latest-in" title={"Latest in"} hint="what came in, where it went">
      {rows.length === 0 ? (
        <Meta>Nothing captured yet.</Meta>
      ) : (
        <ListCard>
          {queued.map((item, i) => (
            // OP-02: a QUEUED row opens its local text. There is no server
            // record to fetch yet — that is what queued means — so the row
            // opens what it has rather than pretending to have more.
            <Row
              key={item.id}
              last={latestIn.length === 0 && i === queued.length - 1}
              testID={`queued-open-${item.id}`}
              onPress={() => openModal("queued-item", item.id)}
            >
              <View style={{ flex: 1 }}>
                <Txt kind="body">{noOrphan(item.text)}</Txt>
                <Meta testID={`queued-meta-${item.id}`}>{item.meta}</Meta>
              </View>
            </Row>
          ))}
          {latestIn.map((item, i) => {
            const routing = routingLine(item, answered.has(item.id));
            return (
              // OP-02: the row opens the item. `edit` below still opens the
              // editor — a row with two destinations needs the inner one to
              // stop the press, which `Text onPress` does.
              <Row key={item.id} last={i === latestIn.length - 1} testID={`latest-open-${item.id}`} onPress={() => openModal("brain-item", item.id)}>
                <View style={{ flex: 1 }}>
                  <Txt kind="body">{noOrphan(item.text)}</Txt>
                  {/* D-1: the WHEN is the app's to write. The server used to
                      compose "voice · 8:31 · Telegram" and the 8:31 was its own
                      zone's hour, which is only ever right by coincidence.
                      RP-06: the routing, the source and the time are one line,
                      so the tags below are the second and not the fourth. */}
                  {/* RL-08: `edit` is a SIBLING of the meta text, not a nested
                      <Text> after an explicit {" "}. React Native Web renders a
                      Text as `white-space: pre-wrap`, so an explicit space
                      immediately before an inline child is preserved AT the wrap
                      point and hangs 5px past the box — which is a hard clip with
                      no affordance as far as the sweep is concerned, and it is
                      right about that. As a wrapping flex row each part wraps as
                      a unit and nothing overhangs. */}
                  {/* X1-07 (N-1, B-56): `columnGap` on the PARENT, and the edit
                      link keeps `webHitArea`'s padding untouched — it used to
                      carry `paddingLeft: 4` on top of `webHitArea(LINK_SLOP)`,
                      which sets a matched padding/negative-margin pair, and
                      overriding one side left the link's ink 10px left of its
                      box, over the end of the meta line (same family as B-49).
                      The link reads "edit", not "· edit": a wrap between the
                      line and the verb would put a middle dot at the START of a
                      line (hard rule 24), so the gap does the separating. */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8, marginTop: 2 }}>
                    {/* ux N-1 / N2-01: TWO RUNS in two tones — the routing in
                        accent ink (BR-05, `handoff.md` §Brain), the source and
                        the time muted, because a whole accent line made the
                        time read as tappable when only `edit` is (hard rule
                        20; DISCREPANCIES row 14). `e2e/matrix/brain-life.spec.ts`
                        measures the two colours on every row.

                        ux S6-12: ONE TEXT, JOINED ONCE. The runs were two
                        sibling Texts, the first ending in " ·" and the space
                        between them the row's 8px `columnGap` — so the join
                        carried a dot painted in the LEFT run's colour with 2.8×
                        the separator's own gap after it, and a capture with no
                        routing yet began its meta line with a dot and nothing
                        before it. The parts are runs of one Text now: an empty
                        routing produces no separator at all, a present one
                        exactly one, bound to both neighbours so it never leads
                        or ends a line. The testIDs stay on the runs. */}
                    <Txt kind="meta" style={{ flexShrink: 1 }}>
                      {routing !== "" && (
                        <Text testID={`latest-routing-${item.id}`} style={{ color: c.accentInk }}>
                          {routing}
                        </Text>
                      )}
                      {routing !== "" && BOUND_DOT}
                      <Text testID={`latest-meta-${item.id}`}>{`${item.meta} · ${formatWhen(item.at)}`}</Text>
                    </Txt>
                    <Txt
                      kind="meta"
                      tone="accentInk"
                      style={webHitArea(LINK_SLOP)}
                      testID={`edit-item-${item.id}`}
                      onPress={() => openModal("item-editor", item.id)}
                    >
                      edit
                    </Txt>
                  </View>
                  <View testID={`latest-tags-${item.id}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {captureTags(item).map((t) => (
                      <Tag key={`${t.tone}-${t.label}`} label={t.label} tone={t.tone} />
                    ))}
                  </View>
                </View>
              </Row>
            );
          })}
        </ListCard>
      )}
    </Section>
  );
}
