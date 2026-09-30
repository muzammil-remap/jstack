/**
 * ItemEditor — BR-05's "edit" dialog for a Latest-in capture: saving
 * appends a version (`PUT /brain/items/{id}`, `GET
 * /brain/items/{id}/versions` grows). Root-mounted, keyed by
 * `modalPayload` (the item id).
 */
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { BtnPrimary, Field, Meta, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { useBrainStore } from "@/stores/brain";
import { formatWhen } from "@/lib/time";
import { personLabel } from "@/lib/taskMeta";
import { space } from "@/theme/tokens";
import { sayRefused } from "@/lib/optimistic";

export function ItemEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const latestIn = useBrainStore((s) => s.latestIn);
  const itemVersions = useBrainStore((s) => s.itemVersions);
  const openItemEditor = useBrainStore((s) => s.openItemEditor);
  const saveItemEdit = useBrainStore((s) => s.saveItemEdit);
  const item = latestIn.find((i) => i.id === id);
  const [text, setText] = useState(item?.text ?? "");

  useEffect(() => {
    void openItemEditor(id);
    return () => void openItemEditor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (item == null) return null;

  return (
    <Dialog testID="item-editor" title="Edit capture" onClose={onClose}>
      <Field testID="item-editor-input" accessibilityLabel="Edit this capture" value={text} onChangeText={setText} multiline style={{ minHeight: 80, alignItems: "flex-start" }} />
      <BtnPrimary
        testID="item-editor-save"
        label="Save"
        style={{ marginTop: space[4], alignSelf: "flex-start" }}
        {...(text.trim() === "" ? { disabledReason: "Write something first" } : { onPress: () => void saveItemEdit(id, text).then(onClose, sayRefused) })}
      />
      {itemVersions.length > 0 && (
        <View testID="item-editor-versions" style={{ marginTop: space[5] }}>
          <Txt kind="label">Versions</Txt>
          {itemVersions.map((v, i) => (
            // P-1 (F-54): the instant and the editor are the wire's; the words
            // are the app's (rules 19 and 21) — it printed both raw
            <Meta key={i} style={{ marginTop: 4 }}>
              {`${formatWhen(v.at)} · ${personLabel(v.editor)} · ${v.text}`}
            </Meta>
          ))}
        </View>
      )}
    </Dialog>
  );
}
