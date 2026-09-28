/**
 * QueuedItemDetail (O-1, OP-02) — what a QUEUED Latest in row opens.
 *
 * A queued capture has no server record: that is what queued means. So this
 * opens the text the device is holding, and says plainly that it has not been
 * filed yet — rather than fetching a `brain-item` that would 404 and read as
 * "that item is no longer here", which is the opposite of the truth.
 *
 * It is a separate dialog rather than a mode of the brain-item one because the
 * two answer different questions: "what did the EA do with this" and "is this
 * safe until the connection comes back".
 */
import React from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { Meta, Txt } from "@/theme/ui";
import { queuedDumps } from "@/data/transport/outbox";
import { useSyncStore } from "@/stores/sync";
import { space } from "@/theme/tokens";

export function QueuedItemDetail({ id, onClose }: { id: string; onClose: () => void }) {
  // the same projection Latest in renders, so the dialog and the row cannot
  // disagree about what is waiting (hard rule 16)
  const entries = useSyncStore((s) => s.entriesNow);
  const entry = queuedDumps(entries).find((q) => q.id === id);

  return (
    <Dialog testID="queued-item" title="Waiting to send" onClose={onClose}>
      {entry == null ? (
        // the happy ending: it synced while the dialog was open
        <Txt testID="queued-item-gone">That one has been sent.</Txt>
      ) : (
        <View style={{ gap: space[3] }}>
          <Txt testID="queued-item-text">{entry.text}</Txt>
          <Meta testID="queued-item-line">Kept on this device · syncs when you are back online. Nothing is lost.</Meta>
        </View>
      )}
    </Dialog>
  );
}
