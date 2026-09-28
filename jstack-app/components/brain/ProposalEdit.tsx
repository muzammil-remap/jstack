/**
 * ProposalEdit — BR-07's "edit" dialog for a Memory proposal: "Save my
 * version" posts `{verb:"edit", text}`, which also teaches the Librarian.
 * Root-mounted, keyed by `modalPayload` (the proposal id).
 */
import React, { useState } from "react";
import { BtnPrimary, Field, Meta, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { useBrainStore } from "@/stores/brain";
import { stripTags } from "@/lib/richText";
import { space } from "@/theme/tokens";

export function ProposalEdit({ id, onClose }: { id: string; onClose: () => void }) {
  const proposals = useBrainStore((s) => s.proposals);
  const resolveProposal = useBrainStore((s) => s.resolveProposal);
  const proposal = proposals.find((p) => p.id === id);
  const [text, setText] = useState(stripTags(proposal?.text ?? ""));

  if (proposal == null) return null;

  return (
    <Dialog testID="proposal-edit" title="Edit the proposal" onClose={onClose}>
      <Meta style={{ marginBottom: space[3] }}>{proposal.reason}</Meta>
      <Field testID="proposal-edit-input" accessibilityLabel="Edit this memory proposal" value={text} onChangeText={setText} multiline style={{ minHeight: 80, alignItems: "flex-start" }} />
      <BtnPrimary
        testID="proposal-edit-save"
        label="Save my version"
        style={{ marginTop: space[4], alignSelf: "flex-start" }}
        {...(text.trim() === ""
          ? { disabledReason: "Write something first" }
          : { onPress: () => void resolveProposal(id, "edit", text.trim()).then(onClose) })}
      />
      <Txt kind="meta" style={{ marginTop: space[3] }}>Your edit also teaches the Librarian.</Txt>
    </Dialog>
  );
}
