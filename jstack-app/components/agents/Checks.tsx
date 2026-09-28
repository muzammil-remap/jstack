/**
 * Checks — Agents' "Security checks (cannot be hidden)" card (AG-06/07):
 * the fixed seven; a failing check's status carries an accent-ink
 * "· see agent issues" suffix and an alert dot (AG-06). "schedules"
 * (AG-08) opens the Settings sheet scrolled to Schedules.
 *
 * ux S6-22: WHEN a check last ran is the app's to write. The fixture composed
 * five time forms into `status` — "last run today", "passed 3 September",
 * "7 days stale", "8 September" — beside a feed saying "9 h ago", on one
 * tab. `status` is descriptive now and `lastRun` is an instant, and this card
 * writes the time through `formatWhen` like every other surface (TD-06). A
 * check that ran inside the last minute says so in the words AG-07 pins
 * ("ran just now"), decided from the instant rather than sent as prose. A
 * failing check keeps its own line — "7 days stale" is what the issue says
 * about it, not a date — with "see agent issues" after it (AG-06).
 */
import React from "react";

import { Dot, ListCard, Meta, Row, Section, Txt } from "@/theme/ui";
import { valueLine } from "@/lib/richText";
import { formatAgo, formatWhen } from "@/lib/time";
import { useAgentsStore } from "@/stores/agents";
import { useSessionStore } from "@/stores/session";
import { useTokens } from "@/theme/ThemeProvider";
import type { SecurityCheck } from "@/data/types";

/**
 * The check's line: its status, then when it ran — never a server-composed
 * clock.
 *
 * It is CONCATENATED, so it gets none of the line-break rules `richRuns` gives
 * a proposal's runs, and it needed two rounds to get right. Round 3 measured
 * the shipping frames and found two rows ending a line on a stranded
 * separator, and `Sat 5` / `Sep, 2:00am` — half a date on each line. Binding
 * every separator to both neighbours fixed those and caused A64-01: with no
 * break point left between values, the line broke INSIDE one, and Canaries
 * read `6 planted · none` / `tripped · Yesterday 6:00am`.
 *
 * `valueLine` is the answer to both, and the reason it is in `lib/richText.tsx`
 * rather than here is that this card is not the only line in the app built by
 * concatenation. The column is 164px at 1366 and this row is 205px, so it MUST
 * take two lines; what a wrap may not do is split a value or open a line with
 * a separator.
 */
function statusLine(check: SecurityCheck): string {
  // the fixture's own status is itself a line of values ("3 devices · all
  // short-lived · vault brokered"), so it is split back into them rather than
  // carried along as one opaque string — otherwise the values inside it are
  // the only places the line can break, which is A64-01 exactly
  const values = check.status.split(" · ");
  if (!check.ok) return valueLine([...values, "see agent issues"]);
  if (check.lastRun == null) return valueLine(values);
  const when = formatAgo(check.lastRun) === "just now" ? "ran just now" : formatWhen(check.lastRun);
  return valueLine([...values, when]);
}

export function Checks() {
  const c = useTokens();
  const checks = useAgentsStore((s) => s.checks);
  const openSettings = useSessionStore((s) => s.openSettings);

  return (
    <Section testID="agents-checks-section" sectionId="agents-checks" title={"Security checks"} right={
          <Txt testID="checks-schedules" kind="meta" tone="accentInk" onPress={() => openSettings("schedules")}>
            schedules
          </Txt>
        }>
      <ListCard style={{ marginTop: 8 }}>
        {checks.map((check, i) => (
          <Row key={check.id} testID={`check-${check.id}`} last={i === checks.length - 1}>
            {/* D22 — handoff.md, Agents Column 3: "dot (ok / alert), name,
                status 10.5 right-aligned (muted when ok, accent-ink with
                'needs eyes' when not)". Stacked under the name, the seven
                rows stopped reading as a status column at a glance, which is
                the whole point of the card. */}
            <Dot kind={check.ok ? "ok" : "alert"} />
            {/* R3-03: the name gets the room first. With both flexible, a
                313px column at 1366 shrank "Blocked-action tests" onto three
                lines with the hyphen leading line 2 while the status kept its
                width. */}
            <Txt kind="body" numberOfLines={2} style={{ flex: 1, minWidth: 96 }}>{check.name}</Txt>
            <Meta style={[{ textAlign: "right", flexShrink: 1, maxWidth: "58%" }, !check.ok ? { color: c.accentInk } : null]}>
              {statusLine(check)}
            </Meta>
          </Row>
        ))}
      </ListCard>
    </Section>
  );
}
