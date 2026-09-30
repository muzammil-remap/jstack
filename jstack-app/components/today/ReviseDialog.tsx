/**
 * ReviseDialog — DC-05: on an email (quote) card, Revise opens a draft
 * editor instead of answering immediately; Save writes the edit via
 * `PUT /actions/{id}/draft` and then answers the card as revised (same
 * toast/undo as every other verb). Opened via the "revise-card" modal —
 * wired into `_layout.tsx` since row 6, which already routes the ⌘R
 * shortcut here (BUGLOG_v2.md A-19: this dialog was not itemised in row
 * 7's original file list but is required by DC-05 and that pre-existing
 * shortcut).
 */
import React, { useState } from "react";
import { Btn, BtnPrimary, Field, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { OFFLINE_REASON } from "@/lib/cardVerbs";
import { useSessionStore } from "@/stores/session";
import { useTodayStore } from "@/stores/today";
import { space } from "@/theme/tokens";
import { sayRefused } from "@/lib/optimistic";

export function ReviseDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const card = useTodayStore((s) => s.composite?.needsYou.find((a) => a.id === id));
  const answer = useTodayStore((s) => s.answer);
  const saveDraft = useTodayStore((s) => s.saveDraft);
  const online = useSessionStore((s) => s.online);
  const [text, setText] = useState(card?.quote ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveDraft(id, text);
      await answer(id, { verb: "revise", revision: text });
    } catch (e) {
      sayRefused(e); // the dialog stays open with the words in it
      return;
    } finally {
      setSaving(false);
    }
    onClose();
  };

  if (card == null) return null;

  return (
    <Dialog testID="revise-dialog" title="Revise draft" onClose={onClose}>
      <Txt kind="meta" style={{ marginBottom: space[4] }}>{card.title}</Txt>
      <Field testID="revise-text" value={text} onChangeText={setText} multiline style={{ minHeight: 120, alignItems: "flex-start" }} />
      <BtnPrimary
        testID="revise-save"
        label="Save"
        style={{ marginTop: space[4], alignSelf: "flex-start" }}
        {...(online ? { onPress: () => void save() } : { disabledReason: OFFLINE_REASON })}
      />
      <Btn testID="revise-cancel" label="Cancel" style={{ marginTop: space[2], alignSelf: "flex-start" }} onPress={onClose} />
    </Dialog>
  );
}
