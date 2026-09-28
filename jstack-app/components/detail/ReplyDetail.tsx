/**
 * ReplyDetail (R-1, RP-02/RP-03) — what a Replies row, Today's card and a
 * push all open.
 *
 * OPENING IS READING. There is no "mark as read" control, because a reply you
 * have just read on screen and then have to tell the app you read is a chore
 * the app invented for itself. Dismiss on the Today card does the same thing
 * from the other direction, for the case where the headline was the whole
 * answer.
 *
 * The sources are the half that makes a reply checkable. Each one opens the
 * record it names through the ONE `openRef` (resolution #31) — a source you
 * cannot follow is a citation you have to take on trust, which is the thing
 * an EA's answer most needs not to be. A ref nothing can open yet says so
 * rather than doing nothing, which is O-1's whole lesson.
 */
import React, { useEffect } from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { Icon } from "@/components/chrome/Icon";
import { Inset, Meta, Row, Txt } from "@/theme/ui";
import { openRef } from "@/layout/openRef";
import { formatWhen } from "@/lib/time";
import { useRepliesStore } from "@/stores/replies";
import { useSessionStore } from "@/stores/session";
import { useTokens } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

export function ReplyDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const reply = useRepliesStore((s) => s.replies.find((r) => r.id === id) ?? null);
  const markRead = useRepliesStore((s) => s.markRead);
  const openModal = useSessionStore((s) => s.openModal);
  const showToast = useSessionStore((s) => s.showToast);
  const c = useTokens();

  useEffect(() => {
    void markRead(id);
  }, [id, markRead]);

  return (
    <Dialog testID="reply" title="From your EA" onClose={onClose}>
      {reply == null ? (
        <Txt testID="reply-missing">That reply is no longer here.</Txt>
      ) : (
        <View style={{ gap: space[3] }}>
          <Txt testID="reply-text">{reply.text}</Txt>
          <Meta testID="reply-when">{formatWhen(reply.at)}</Meta>
          {reply.sources.length > 0 && (
            <View style={{ gap: space[2] }}>
              <Meta testID="reply-sources-heading">what this is based on</Meta>
              {/* S6-57 (ux round 3, carried at the A-3 cap): these rows OPEN the
                  record they cite, and mounted bare on the dialog's ground they
                  were painted exactly like the prose above them — the only way
                  to find out they were tappable was to tap one.
                  A-6 round, A6-05: the first fix put them in a `ListCard`, which
                  is a CARD INSIDE A CARD — a 30-level step against the pack's
                  10, with a shadow of its own. The pack's container for a block
                  inside a card is the `Inset`, and what says "this row opens
                  something" in this app is the muted chevron every other
                  opening row carries (`FindRow.tsx`, `TaskRow.tsx`). */}
              <Inset testID="reply-sources" style={{ paddingVertical: 0 }}>
                {reply.sources.map((s, i) => (
                  <Row
                    key={s.ref}
                    last={i === reply.sources.length - 1}
                    testID={`reply-source-${s.ref}`}
                    onPress={() => {
                      const opened = openRef(s.ref, (name, payload) => {
                        onClose();
                        openModal(name, payload);
                      });
                      if (!opened) showToast("Nothing to open for that source yet");
                    }}
                  >
                    <Txt kind="body" style={{ flex: 1 }}>{s.label}</Txt>
                    <Icon name="chevron_right" size={16} color={c.muted} />
                  </Row>
                ))}
              </Inset>
            </View>
          )}
        </View>
      )}
    </Dialog>
  );
}
