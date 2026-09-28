/**
 * cards.ts (F-04, P-11) — the shape every EA proposal card shares.
 *
 * Three handlers built a card by hand — `parameters.ts` `proposeParameter`,
 * `sections.ts` `proposeSection`, `settings.ts` `postAutonomyPropose` — and
 * agreed on everything but their subject: open, rank 3, expiring at 5pm on
 * the third day (B3R2-07: a card whose expiry disagrees with its own sentence
 * is a card that lies about itself), the Approve verb, an empty history, the
 * fail-closed labels a card about the app's own behaviour carries (no
 * content type, the default silo), and the receipt every card shows (GL-06).
 * Each handler passes what is its own: id, type, kind, title, why, sources,
 * toast, silence, focus, its payload, and a receipt where its cost differs.
 *
 * The " · then" in `thenWhat` is load-bearing, not decoration: `shortExpiry`
 * splits on it to get the waiting row's short form, and a `thenWhat` written
 * any other way arrives in that row at full length, takes the whole row and
 * squeezes the title beside it to zero width — a card you cannot open, from
 * a copy change (found by CB-05 timing out on a click).
 */
import * as db from "@/data/mock/db";
import { addDays, atTime, dayKey, weekdayLong } from "@/lib/time";
import type { ActionItem } from "@/data/types";

type ProposalBase = Pick<ActionItem, "id" | "type" | "kind" | "title" | "why" | "sources" | "toast" | "silence"> &
  Partial<Pick<ActionItem, "focus" | "receipt" | "parameter" | "section" | "rule">>;

export function proposalCard(own: ProposalBase, now: Date = db.now()): ActionItem {
  const expires = atTime(addDays(dayKey(now), 3), 17);
  return {
    state: "open",
    rank: 3,
    expiresAt: expires.toISOString(),
    thenWhat: `expires ${weekdayLong(dayKey(expires))} 5pm · then it goes away`,
    verb: "Approve",
    history: [],
    receipt: { cost: 0.01, model: "haiku", sources: 1, seconds: 2 },
    labels: { silo: "personal:josh", types: ["unlabelled"], setBy: "review" },
    setAt: now.toISOString(),
    focus: "all",
    ...own,
  };
}
