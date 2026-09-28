/**
 * Settings › Sync (O-2, OF-05/OF-07) — what is waiting, when it last went,
 * and anything the server would not take.
 *
 * The conflict list is the reason this screen exists. A capture that cannot
 * be applied is the one case where the promise "your words are not lost"
 * needs a place to be kept: the server has already decided, repeating will
 * not change its mind, and the local text would otherwise be dropped on the
 * floor. So it is shown, with the server's reason beside it and a copy
 * button, and it stays until the person clears it themselves.
 *
 * Root-mounted (`modal === "sync"`).
 */
import React from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { View } from "react-native";
import { BtnSm, Label, ListCard, Meta, Row, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { QUEUED_META } from "@/data/transport/outbox";
import { pathToPattern, ROUTES } from "@/data/routes";
import { webData } from "@/lib/webData";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { formatTime12 } from "@/lib/time";
import { space } from "@/theme/tokens";
import type { OutboxEntry } from "@/data/types";

/**
 * ux S6-07: what a queued entry IS, in words. The row printed `e.path` —
 * `/brain/dump` in body size, on the one screen whose job is to tell a
 * person their words are safe. A capture and a task carry the person's own
 * words in their body, so the row shows the first line of them; an upload
 * has its file's name; anything else names its kind. The map is keyed by the
 * route table's own names and covers every `offline: true` row — the queue
 * can hold nothing else (`isQueueable`). The route stays reachable for a
 * test through the row's `data-path`, never through its text.
 */
export const QUEUED_KIND: Record<string, string> = {
  postJournal: "a journal line",
  postTask: "a new task",
  patchTask: "a task edit",
  patchSubtask: "a subtask edit",
  postTaskComplete: "a task marked done",
  postBrainDump: "a capture",
  postHabitLog: "a habit tick",
  postPersonAct: "a note about someone",
  postFile: "a file",
  putParameter: "a setting",
};

const OFFLINE_ROUTES = ROUTES.filter((r) => r.offline === true).map((r) => ({ name: r.name, method: r.method, pattern: pathToPattern(r.path) }));

export function queuedTitle(e: OutboxEntry): string {
  const body = (e.body ?? {}) as Record<string, unknown>;
  for (const key of ["text", "title"]) {
    const v = body[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim().split("\n")[0];
  }
  const filename = (e.multipart as { file?: { filename?: string } } | undefined)?.file?.filename;
  if (typeof filename === "string" && filename !== "") return filename;
  const route = OFFLINE_ROUTES.find((r) => r.method === e.method && r.pattern.test(e.path));
  return route != null ? QUEUED_KIND[route.name] : "a change";
}

export function Sync({ onClose }: { onClose: () => void }) {
  const online = useSessionStore((s) => s.online);
  const showToast = useSessionStore((s) => s.showToast);
  const secureStore = useSessionStore((s) => s.secureStoreStatus);
  const queued = useSyncStore((s) => s.queued);
  const entriesNow = useSyncStore((s) => s.entriesNow);
  const conflicts = useSyncStore((s) => s.conflicts);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const syncing = useSyncStore((s) => s.syncing);
  const persistent = useSyncStore((s) => s.persistent);
  const syncNow = useSyncStore((s) => s.syncNow);
  const dismissConflict = useSyncStore((s) => s.dismissConflict);

  /** S-9: `lib/clipboard.ts` does the copying; the toast is this screen's. */
  const copy = async (text: string) => {
    await copyToClipboard(text);
    showToast("Copied");
  };

  return (
    <Dialog testID="sync-dialog" title="Sync" onClose={onClose}>
      <View style={{ gap: space[3] }}>
        <Txt kind="body" testID="sync-state">
          {online ? (queued === 0 ? "Everything is on the server." : `${queued} capture${queued === 1 ? "" : "s"} waiting to send.`) : `Offline · ${queued} waiting`}
        </Txt>
        <Meta testID="sync-last">{lastSyncAt == null ? "Nothing has synced this session." : `Last sync ${formatTime12(lastSyncAt)}`}</Meta>
        {secureStore.status === "unavailable" ? (
          // WPI-2: no secure storage on this device — why the queue is in memory, said once in place of A-7's line
          <Txt kind="body" tone="alert" testID="sync-secure-unavailable">
            Secure storage is unavailable on this device — captures are sent live and held in memory only; nothing is saved offline
          </Txt>
        ) : (
          !persistent && (
            // A-7: the memory fallback, said here where the queue is listed as well as on the dot
            <Txt kind="body" tone="alert" testID="sync-not-persistent">
              Captures are not being saved on this device · anything waiting is lost when the app closes
            </Txt>
          )
        )}

        {queued > 0 && (
          <ListCard>
            {entriesNow.map((e, i) => (
              <Row key={e.offlineId} testID={`sync-queued-${e.offlineId}`} last={i === entriesNow.length - 1}>
                <View style={{ flex: 1 }} {...webData({ path: e.path })}>
                  <Txt kind="body">{queuedTitle(e)}</Txt>
                  <Meta>{QUEUED_META}</Meta>
                </View>
              </Row>
            ))}
          </ListCard>
        )}

        <BtnSm
          testID="sync-now"
          label={syncing ? "Syncing…" : "Sync now"}
          outlined
          onPress={() => void syncNow()}
        />

        {conflicts.length > 0 && (
          <View style={{ gap: space[2] }}>
            <Label hint="the server would not take these — your words are kept here">Could not be applied</Label>
            <ListCard>
              {conflicts.map((c, i) => (
                <Row key={c.offlineId} testID={`sync-conflict-${c.offlineId}`} last={i === conflicts.length - 1}>
                  <View style={{ flex: 1, gap: space[1] }}>
                    <Txt kind="body">{c.localText}</Txt>
                    <Meta>{c.serverReason}</Meta>
                    <View style={{ flexDirection: "row", gap: space[2], marginTop: space[1] }}>
                      <BtnSm testID={`sync-copy-${c.offlineId}`} label="Copy" outlined onPress={() => void copy(c.localText)} />
                      <BtnSm testID={`sync-dismiss-${c.offlineId}`} label="Dismiss" outlined onPress={() => dismissConflict(c.offlineId)} />
                    </View>
                  </View>
                </Row>
              ))}
            </ListCard>
          </View>
        )}
      </View>
    </Dialog>
  );
}
