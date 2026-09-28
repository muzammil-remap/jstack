/**
 * IssueDetail (O-1, OP-05) — what an Agents › Issues row opens.
 *
 * What failed, when it last worked, and the verb that does something about it.
 * "Last success" is the fact that turns an issue from an alarm into a
 * judgement: a calendar write-back that last worked three days ago is a
 * different problem from one that last worked in June.
 *
 * The verbs are V2.1's `renew | run | open` and deliberately not `mute`
 * (resolution #46): an issue you silence is an issue you meet again later,
 * with less warning.
 */
import React from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { Btn, Meta, Txt } from "@/theme/ui";
import { useDetail } from "@/components/detail/useDetail";
import { useAgentsStore } from "@/stores/agents";
import { formatWhen } from "@/lib/time";
import { space } from "@/theme/tokens";

export function IssueDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { item: issue, missing } = useDetail(id, (a, id) => a.getAgentIssue(id));
  const actIssue = useAgentsStore((s) => s.actIssue);

  return (
    <Dialog testID="issue" title="Issue" onClose={onClose}>
      {missing && <Txt testID="issue-missing">That issue is no longer here.</Txt>}
      {issue != null && (
        <View style={{ gap: space[3] }}>
          <Txt kind="title" testID="issue-title">
            {issue.title}
          </Txt>
          <Txt testID="issue-why">{issue.why}</Txt>
          {issue.detail != null && <Meta testID="issue-detail">{issue.detail}</Meta>}
          <Meta testID="issue-last-success">
            {issue.lastSuccessAt != null ? `last worked · ${formatWhen(issue.lastSuccessAt)}` : "no successful run recorded"}
          </Meta>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <Btn
              testID="issue-verb"
              label={issue.verb.label}
              onPress={() => {
                void actIssue(issue.id, issue.verb.action);
                onClose();
              }}
            />
          </View>
        </View>
      )}
    </Dialog>
  );
}
