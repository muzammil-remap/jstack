/**
 * TeachSheet — DC-08, ST-04: one line, becomes a standing rule. "Save as a
 * rule" appends it; "Just this once" saves nothing. Opened 150ms after Teach
 * answers the card (mock v11 `answer()` line 421, `acts.teachSheet()` 598).
 *
 * ST-1 moved where it lands. It used to `POST /rules`, a second write path to
 * a second list that lived on Brain and said nothing about when a rule applies
 * — so a rule taught from a card and a rule written in Settings were different
 * kinds of thing. Both are `AutonomyRule`s now, appended through the one route
 * the editor saves through, and both are visible in the same place.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Btn, BtnPrimary, Field, Txt } from "@/theme/ui";
import { Sheet } from "@/components/chrome/Sheet";
import { OFFLINE_REASON } from "@/lib/cardVerbs";
import { useRulesStore } from "@/stores/rules";
import { useSessionStore } from "@/stores/session";
import { unpackPayload } from "@/layout/dialogKit";
import { space } from "@/theme/tokens";
import { sayRefused } from "@/lib/optimistic";

export function TeachSheet({ payload, onClose }: { payload: string | undefined; onClose: () => void }) {
  const addAutonomyRule = useRulesStore((s) => s.add);
  const online = useSessionStore((s) => s.online);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [id, title] = unpackPayload(payload);

  const save = async () => {
    if (text.trim() === "" || saving) return;
    setSaving(true);
    try {
      await addAutonomyRule(text.trim(), id);
    } catch (e) {
      sayRefused(e); // the sheet stays open with the rule in it
      return;
    } finally {
      setSaving(false);
    }
    onClose();
  };

  return (
    <Sheet testID="teach-sheet" title="Teach it" onClose={onClose}>
      <Txt kind="meta" style={{ marginBottom: space[4] }}>
        One line. It becomes a standing rule under Settings, and every run reads it.{title ? ` From: ${title}` : ""}
      </Txt>
      <Field
        testID="teach-text"
        value={text}
        onChangeText={setText}
        placeholder="e.g. School pickup days are fixed; move the meeting."
        multiline
        style={{ marginBottom: space[4] }}
      />
      <View style={{ flexDirection: "row", gap: space[2] }}>
        <BtnPrimary testID="teach-save" label="Save as a rule" {...(online ? { onPress: () => void save() } : { disabledReason: OFFLINE_REASON })} />
        <Btn testID="teach-once" label="Just this once" onPress={onClose} />
      </View>
    </Sheet>
  );
}
