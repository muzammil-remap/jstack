/**
 * LearningDetail (O-1, OP-06) — what a Life › Learning row opens.
 *
 * `kind` decides which of two things happens, and that is the whole design:
 * something you READ opens its body here, in the app; something you WATCH or
 * LISTEN to lives somewhere else, so it goes through the external-link
 * confirmation rather than navigating away without asking (SEC — the app never
 * follows a link on your behalf without saying where).
 *
 * A row with neither a body nor a url is the one honest `static` case, and it
 * says so on the row rather than opening an empty dialog.
 */
import React from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { Btn, Meta, Txt } from "@/theme/ui";
import { useDetail } from "@/components/detail/useDetail";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { space } from "@/theme/tokens";

export function LearningDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { item, missing } = useDetail(id, (a, id) => a.getLearningItem(id));
  const openModal = useSessionStore((s) => s.openModal);

  return (
    <Dialog testID="learning" title="Learning" onClose={onClose}>
      {missing && <Txt testID="learning-missing">That item is no longer here.</Txt>}
      {item != null && (
        <View style={{ gap: space[3] }}>
          <Txt kind="title" testID="learning-title">
            {item.title}
          </Txt>
          <Meta testID="learning-meta">{item.meta}</Meta>
          {item.body != null && <Txt testID="learning-body">{item.body}</Txt>}
          {item.body == null && item.url != null && (
            <Btn
              testID="learning-open-external"
              label="Open it"
              onPress={() => {
                // the confirmation names where it goes; this never navigates
                // on its own
                openModal("external-link", packPayload(item.url, item.title));
                onClose();
              }}
            />
          )}
          {item.body == null && item.url == null && <Meta testID="learning-nothing">Nothing was saved for this one — it is a title and a note.</Meta>}
        </View>
      )}
    </Dialog>
  );
}
