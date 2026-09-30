/**
 * ConfigureDialog — the "configure" link on a section (LF-09, and B-2's
 * §4.10 half).
 *
 * TWO records can sit behind one section and the dialog edits both,
 * which is worth stating plainly rather than hiding behind one Save
 * button that means different things:
 *
 *   · the §4.10 `SectionConfig` — what the section IS: its title and its
 *     blocks. Saved through `PUT /sections/{id}`, versioned by the server.
 *   · the V2 `LifeSectionConfig` — per-section knobs the blocks cannot
 *     express (a budget threshold is a server-side computation of `over`,
 *     not a property of the bar that shows it). Unchanged from V2.
 *
 * Whichever exists is shown; Save writes both; Revert restores both to
 * the EA's originals.
 *
 * What you CANNOT do here is add a block or repoint one at different
 * data. That is not an oversight: a bound block reads a published data
 * source (ADR-39) and the set of those is the app's, not a text field's.
 * Editing what a section SAYS is a person's job; editing where it READS
 * is a release.
 */
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Btn, BtnPrimary, DialogVerbs, Field, ListCard, Meta, Row, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { BINDS } from "@/layout/sources";
import { OFFLINE_REASON } from "@/lib/cardVerbs";
import { useLifeStore } from "@/stores/life";
import { useSectionsStore } from "@/stores/sections";
import { useSessionStore } from "@/stores/session";
import { useTodayStore } from "@/stores/today";
import { space } from "@/theme/tokens";
import type { Block } from "@/data/types";
import { sayRefused } from "@/lib/optimistic";

/** one line saying what a block is and where its content comes from. */
const BLOCK_NOUN: Record<string, string> = {
  rows: "A list",
  stats: "Big numbers",
  bars: "Bars against their limits",
  chips: "Chips you tap",
  grid: "Tiles",
  text: "A line of text",
  ghost: "A placeholder card",
  links: "Links",
};

/** one line saying what a block is and where its content comes from. In
 * words, not in the type token: "rows · What you're reading" told a reader
 * nothing they could not see (ux-review B3R1-07). */
function describe(block: Block): string {
  const noun = BLOCK_NOUN[block.type] ?? block.type;
  if ("bind" in block && block.bind != null) return `${noun} · ${BINDS[block.bind]?.label ?? block.bind}`;
  return `${noun} · written here, and you can edit it`;
}

const editable = (block: Block): block is Extract<Block, { type: "text" | "ghost" }> =>
  (block.type === "text" || block.type === "ghost") && typeof block.text === "string";

export function ConfigureDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const sectionConfigs = useLifeStore((s) => s.sectionConfigs);
  const loadSectionConfig = useLifeStore((s) => s.loadSectionConfig);
  const saveSectionConfig = useLifeStore((s) => s.saveSectionConfig);
  const revertSectionConfig = useLifeStore((s) => s.revertSectionConfig);
  const sections = useSectionsStore((s) => s.sections);
  const saveSection = useSectionsStore((s) => s.save);
  const revertSection = useSectionsStore((s) => s.revert);
  const proposeSection = useSectionsStore((s) => s.propose);
  const needsYou = useTodayStore((s) => s.composite?.needsYou);
  const answer = useTodayStore((s) => s.answer);
  const loadToday = useTodayStore((s) => s.load);
  const online = useSessionStore((s) => s.online);

  const config = sectionConfigs[id];
  // `id` is a section id from a "configure" link, or a CARD id when the EA
  // proposed one and Josh chose Revise (B-3). A proposal is not in
  // `GET /sections` — it is not a section yet — so it comes off the card.
  const proposalCard = needsYou?.find((c) => c.id === id && c.kind === "section");
  const section = sections.find((s) => s.id === id) ?? proposalCard?.section;

  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  const [showWithin, setShowWithin] = useState("");
  const [title, setTitle] = useState("");
  const [texts, setTexts] = useState<Record<number, string>>({});

  useEffect(() => {
    void loadSectionConfig(id);
  }, [id, loadSectionConfig]);

  useEffect(() => {
    if (config == null) return;
    setThresholds(Object.fromEntries(Object.entries(config.thresholds ?? {}).map(([k, v]) => [k, String(v)])));
    setShowWithin(config.showWithin != null ? String(config.showWithin) : "");
  }, [config]);

  useEffect(() => {
    if (section == null) return;
    setTitle(section.title);
    setTexts(Object.fromEntries(section.blocks.map((b, i) => [i, editable(b) ? b.text : ""]).filter(([, t]) => t !== "")));
  }, [section]);

  if (config == null && section == null) return null;

  const save = () => {
    const writes: Promise<unknown>[] = [];

    if (section != null) {
      const blocks = section.blocks.map((b, i) => (editable(b) && texts[i] != null ? { ...b, text: texts[i] } : b));
      // CB-07: a revised PROPOSAL is re-proposed, never PUT. It is not a
      // section yet, so there is nothing to update — and the EA gets to see
      // the edit come back as version + 1 rather than silently applied. The
      // card is answered in the same breath so a revision cannot leave the
      // old proposal sitting on Needs you.
      if (proposalCard != null) {
        // and reload Needs you afterwards: a proposal's entire effect is a
        // decision card, and this is the one write in the app that creates
        // one, so nothing else is going to notice it appear.
        writes.push(
          answer(proposalCard.id, { verb: "revise", revision: "" })
            .then(() => proposeSection({ ...section, title, blocks }, section.reason ?? "revised"))
            .then(() => loadToday()),
        );
      } else {
        writes.push(saveSection(id, { title, blocks }));
      }
    }
    if (config != null) {
      const patch: { thresholds?: Record<string, number>; showWithin?: number } = {};
      if (config.thresholds != null) patch.thresholds = Object.fromEntries(Object.entries(thresholds).map(([k, v]) => [k, Number(v) || 0]));
      if (config.showWithin != null) patch.showWithin = Number(showWithin) || 0;
      writes.push(saveSectionConfig(id, patch));
    }
    void Promise.all(writes).then(onClose, sayRefused);
  };

  const revert = () => {
    const writes: Promise<unknown>[] = [];
    // a proposal has nothing to revert TO — the EA's version is the only one
    // there has ever been — so Revert on one simply closes.
    if (section != null && proposalCard == null) writes.push(revertSection(id));
    if (config != null) writes.push(revertSectionConfig(id));
    void Promise.all(writes).then(onClose, sayRefused);
  };

  return (
    <Dialog testID="life-config" title="Configure this section" onClose={onClose}>
      <Meta style={{ marginBottom: space[4] }}>The EA proposes these, with a reason. Edit or revert; every change is logged.</Meta>

      {section != null && (
        <View style={{ marginBottom: space[4] }}>
          {section.reason != null && <Meta style={{ marginBottom: space[3] }}>{section.reason}</Meta>}
          {/* label ABOVE the field, not beside it (ux-review B3R1-06): a
              row with `space-between` put "Title" and its input at opposite
              ends of a 900px dialog, which is the v1.1 "amateur" read. */}
          <Txt kind="label" style={{ marginBottom: 6 }}>
            Title
          </Txt>
          <Field testID="config-title" accessibilityLabel="Section title" value={title} onChangeText={setTitle} style={{ marginBottom: space[4] }} />

          {/* and the blocks get a heading of their own, so the list reads as
              "what this section is made of" rather than as helper text under
              the field above it (B3R1-07). */}
          <Txt kind="label" style={{ marginBottom: 6 }}>
            What it shows
          </Txt>
          <ListCard style={{ marginBottom: space[3] }}>
            {section.blocks.map((b, i) => (
              <Row key={i} testID={`config-block-row-${i}`} last={i === section.blocks.length - 1}>
                <View style={{ flex: 1 }}>
                  <Txt>{describe(b)}</Txt>
                  {editable(b) && (
                    <Field
                      testID={`config-block-${i}`}
                      accessibilityLabel={`Block ${i + 1} text`}
                      value={texts[i] ?? ""}
                      onChangeText={(v) => setTexts((t) => ({ ...t, [i]: v }))}
                      multiline
                      style={{ marginTop: 6 }}
                    />
                  )}
                </View>
              </Row>
            ))}
          </ListCard>
          <Meta>Version {section.version} · last changed by {section.managedBy === "ea" ? "your EA" : "you"}</Meta>
        </View>
      )}

      {config?.categories != null && (
        <View style={{ marginBottom: space[4] }}>
          <Txt>Categories</Txt>
          <Meta>{config.categories.join(" · ")}</Meta>
        </View>
      )}
      {config?.thresholds != null &&
        Object.keys(config.thresholds).map((cat) => (
          <View key={cat} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space[2] }}>
            <Txt>Warn when {cat} passes</Txt>
            <Field
              testID={`config-threshold-${cat}`}
              accessibilityLabel={`Warn when ${cat} passes`} // AA-03
              value={thresholds[cat] ?? ""}
              onChangeText={(v) => setThresholds((t) => ({ ...t, [cat]: v }))}
              keyboardType="numeric"
              style={{ width: 80 }}
            />
          </View>
        ))}
      {config?.showWithin != null && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space[2] }}>
          <Txt>Show within (days)</Txt>
          <Field testID="config-show-within" accessibilityLabel="Show within, days" value={showWithin} onChangeText={setShowWithin} keyboardType="numeric" style={{ width: 80 }} />
        </View>
      )}
      <DialogVerbs
        style={{ marginTop: space[4] }}
        primary={<BtnPrimary testID="config-save" label="Save" {...(online ? { onPress: save } : { disabledReason: OFFLINE_REASON })} />}
        secondary={<Btn testID="config-revert" label="Revert to the EA's" onPress={revert} />}
      />
    </Dialog>
  );
}
