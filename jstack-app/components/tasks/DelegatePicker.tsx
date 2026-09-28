/**
 * DelegatePicker — who takes the task (T-2, TK-07).
 *
 * It only exists when there is a choice. With one delegatee the card's verb
 * reads "Delegate to EA" and sends; a picker offering one name would be a tap
 * that asks a question with one answer.
 *
 * The default is pre-selected and one tap sends, which is the brief's rule for
 * every chooser in this app: the common case is a tap, not a tap plus a
 * confirm.
 *
 * **A sheet on the phone, a centred modal on a desktop** (JQ-2). Josh found it
 * "in the bottom right of the screen", which is what a sheet IS on a 1920px
 * window: the phone's grammar for a short list of choices, pinned to a corner
 * where nothing else is happening. The list is the same either way; only the
 * surface changes, and it changes because the surface is what carries the
 * meaning "this is the thing you are answering now".
 */
import React from "react";
import { View } from "react-native";
import { Meta, Row, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { Sheet } from "@/components/chrome/Sheet";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import { radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { useLayout } from "@/theme/useLayout";

export function DelegatePicker({ id, onClose }: { id: string; onClose: () => void }) {
  const roster = useTasksStore((s) => s.roster);
  const delegate = useTaskCardStore((s) => s.delegate);
  const takers = roster.filter((a) => a.canTakeTasks);
  const { phone } = useLayout();
  const c = useTokens();
  // one surface or the other, same content and the same testID: a test that had
  // to know which one it was looking at would be testing the breakpoint
  const Surface = phone ? Sheet : Dialog;

  return (
    <Surface testID="delegate-picker" title="Delegate to" onClose={onClose}>
      <View style={{ gap: space[2] }}>
        <Meta>Whoever takes it gets the whole task, and the card says so from the moment they do.</Meta>
        {takers.map((agent, i) => (
          <Row key={agent.id} testID={`delegate-to-${agent.id}`} last={i === takers.length - 1}>
            {/* S6-52: the default wears the recommended-option dress — Accent
                soft under Accent ink — and the alternative is Muted (README
                Components, Decision card); ink against ink said nothing */}
            <View style={{ flex: 1, paddingVertical: space[2], paddingHorizontal: space[4], borderRadius: radius.control, backgroundColor: i === 0 ? c.accentSoft : "transparent" }}>
              <Txt
                testID={`delegate-to-${agent.id}-pick`}
                style={{ color: i === 0 ? c.accentInk : c.muted }}
                onPress={() => {
                  void delegate(id, agent.id);
                  onClose();
                }}
              >
                {agent.name}
              </Txt>
            </View>
          </Row>
        ))}
      </View>
    </Surface>
  );
}
