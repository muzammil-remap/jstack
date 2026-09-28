/**
 * ingest.ts (W-1, §4.23, ADR-64) — what happens to something sent in from
 * outside the app.
 *
 * TWO DOORS, ONE PATH. The capture route (`/capture#text=&url=&title=`, the
 * iOS Shortcut and the PWA share target) and the Dropbox inbox
 * (`POST /__test__/inbox`) arrive by different routes and are the same event:
 * a thing from elsewhere that has to be read, filed, and either accepted
 * quietly or asked about. Both land here, so the filing rules cannot differ by
 * how the thing got in.
 *
 * THE ORDER MATTERS AND IS THE POINT:
 *
 *   1. extract  — a screened, tool-less read of the link (`extract.ts`)
 *   2. triage   — the same keyword rules every typed capture goes through
 *   3. rules    — the standing instructions Josh has taught
 *   4. card     — ONLY if the filing is still provisional after all of that
 *
 * Step 3 before step 4 is what makes `teach` mean anything: a rule taught on
 * one share is why the next one from the same host files silently. Step 1
 * before step 2 is deliberate too, and it is the security-relevant half —
 * the extracted text is EVIDENCE, never INSTRUCTION. The triage rules read the
 * text a person wrote and the URL they shared; they never read what the page
 * says about how it would like to be filed. `SECURITY.md`'s ingestion threat
 * model is the long form, and `extract.json` seeds a page that asks to be
 * obeyed so the path meets one on every run rather than only in a test.
 */
import * as db from "@/data/mock/db";
import type { AnswerEffect } from "@/data/mock/db";
import { writeAnsweredRule } from "@/data/mock/handlers/settings";
import { extractFor, shareHost, type Extraction } from "@/data/mock/extract";
import { triage } from "@/data/mock/triage";
import { siloName, UNLABELLED } from "@/data/labels";
import { dayKey, addDays, atTime, weekdayLong } from "@/lib/time";
import type { ActionItem, BrainItem, CaptureRouting } from "@/data/types";

/** the URL in a shared capture, which the capture route puts on its own line */
function urlIn(text: string): string | undefined {
  return /(https?:\/\/[^\s]+)/i.exec(text)?.[1];
}

/**
 * Does a standing rule already cover this filing? If so the EA acts and does
 * not ask — which is exactly what Josh taught it to do, and the whole reason a
 * second share from the same place does not raise a second card.
 *
 * Matched on the HOST through `shareHost`, the same helper `teach` writes the
 * sentence with, so the two spellings of "which host" cannot drift.
 */
function ruleFor(url: string | undefined): { id: string; text: string } | null {
  const host = shareHost(url);
  if (host == null) return null;
  // WPF-11: the host as a whole hostname in the rule's words. A substring test let
  // the rule taught for afr.com cover fr.com, and one for dropbox.com cover x.com
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = new RegExp(`(^|[^a-z0-9.-])${escaped}($|[^a-z0-9-])`, "i");
  const rule = db
    .get()
    .autonomyRules.find((r) => r.on && r.mode === "auto" && (r.scope === "triage" || r.scope === "all") && named.test(r.text));
  return rule == null ? null : { id: rule.id, text: rule.text };
}

/** The sentence `teach` writes, and the one `ruleFor` matches back. One
 * composer, because a rule the app cannot re-recognise is a rule that silently
 * stops applying (rule 16). */
/**
 * §4.23 (W-1, UP-05): a triage card's verbs. The primary — "Keep it there",
 * the card's own question answered (ux S6-16: README Content's specific
 * primary; `ok` was the Memory row's verb promoted to a 12.5px button) —
 * keeps the filing as it is: the capture is already filed, so there is
 * nothing to apply. `teach`
 * writes a STANDING RULE, which is the only verb here that changes what
 * happens NEXT time: `ingestShare` reads the rules before it decides whether
 * to raise a card at all, so the next share from the same host files
 * silently and says which rule did it. The rule is written through
 * `taughtRuleText`, the same composer `ruleFor` matches back — two spellings
 * of "which host" is a rule that silently stops applying (rule 16). Applied by
 * `handlers/decisions.ts` through its `KIND_EFFECTS` table (F-06, P-11).
 */
export function applyTriageVerb(action: ActionItem, verb: string, now: Date): AnswerEffect | undefined {
  if (action.triage == null || verb !== "teach") return undefined;
  const state = db.get();
  const host = shareHost(urlIn(state.brainItems.find((b) => b.id === action.triage!.captureId)?.text ?? ""));
  if (host == null) return undefined;
  // A4R6-01: one rule per card, as `applyRuleVerb` — and A4R8-01: never over a
  // rule Josh rewrote after an earlier answer (`writeAnsweredRule`)
  return writeAnsweredRule({
    id: `ar-${action.id}`,
    text: taughtRuleText(host, action.triage.routing),
    scope: "triage",
    mode: "auto",
    on: true,
    // `josh`: he answered the card. A rule the EA wrote for itself is a
    // different thing and would say so.
    addedBy: "josh",
    addedAt: now.toISOString(),
  });
}

function taughtRuleText(host: string, routing: CaptureRouting): string {
  // ux S6-07: the silo by its word — the rule is read back in Settings › Rules
  return `File ${host} shares under ${siloName(routing.silos[0])} · ${routing.labels[0] ?? routing.kind}`;
}

type Ingested = { item: BrainItem; card: ActionItem | null };

/**
 * File something shared in. Returns the capture and the triage card, if the
 * filing warranted one.
 *
 * `provisional` is the EA saying it is not sure. A confident filing is simply
 * filed — a card for every share would be a card nobody reads, which is worse
 * than no card because it teaches a person to dismiss the pile.
 */
export function ingestShare(input: { text: string; url?: string; title?: string; id: string; at: string }): Ingested {
  const state = db.get();
  const url = input.url ?? urlIn(input.text);
  const extraction = extractFor(url);

  // The triage rules see the person's own words and the URL — NOT the page.
  // Passing `extraction.text` in here is the injection, and it is the one line
  // in this file that would matter if it were wrong.
  const routing = triage(input.text);

  // resolution #30: a share that is only a link, or one nothing matched, is
  // `reading` and provisional — the honest state, and the common one.
  const shared: CaptureRouting =
    url != null && routing.kind === "note"
      ? { ...routing, kind: "reading", storage: "dropbox", provisional: true, reason: "a link — the Librarian has not read it yet" }
      : routing;

  const item: BrainItem = {
    id: input.id,
    text: input.text,
    at: input.at,
    meta: "share",
    source: "share",
    routed: ["→ filing · Librarian"],
    routing: shared,
    ...(extraction != null ? { extractedText: extraction.text, extractedFrom: extraction.from, extractedWords: extraction.words, screened: true } : {}),
    labels: UNLABELLED,
    setAt: input.at,
    focus: "personal",
  };
  state.brainItems = [item, ...state.brainItems];

  const covered = ruleFor(url);
  if (covered != null) {
    // A standing rule decided it, so the filing is NO LONGER PROVISIONAL —
    // that is the whole difference `teach` makes. Clearing the flag is what
    // makes the row stop saying "filing · Librarian", and the reason names the
    // rule: "the EA did this because you told it to" is the only thing that
    // makes a standing rule safe to have.
    item.routing = { ...shared, provisional: undefined, reason: `your rule: ${covered.text}` };
    item.routed = [`→ filed · your rule: ${covered.text}`];
    return { item, card: null };
  }
  if (!shared.provisional) return { item, card: null };

  return { item, card: triageCard(item, shared, extraction, url) };
}

/** The card, built the way every other proposal is (`handlers/sections.ts`). */
function triageCard(item: BrainItem, routing: CaptureRouting, extraction: Extraction | null, url: string | undefined): ActionItem {
  const state = db.get();
  const now = db.now();
  // 5pm three days out, as every other proposal expires (sections.ts:126)
  const expires = atTime(addDays(dayKey(now), 3), 17);
  const host = shareHost(url) ?? "this";
  const card: ActionItem = {
    id: `tr-${item.id}`,
    type: "Triage",
    kind: "triage",
    // UP-05's sentence. The destination first, because that is the thing being
    // agreed to; the question second. ux S6-07: the silo by its display name —
    // `personal:josh` in a sentence is the database talking (ST1-10).
    title: `Filed ${host} under ${siloName(routing.silos[0])} · ${routing.kind}. Keep it there?`,
    state: "open",
    rank: 2,
    triage: {
      captureId: item.id,
      routing,
      why: routing.reason ?? "no rule matched",
      ...(extraction != null ? { extracted: { words: extraction.words, from: extraction.from } } : {}),
    },
    why: routing.reason ?? "no rule matched — the Librarian filed it provisionally",
    sources: [{ label: "your EA", ref: `brain:${item.id}` }],
    expiresAt: expires.toISOString(),
    // the " · then" is load-bearing — `shortExpiry` splits on it for the
    // waiting row's short form (sections.ts:150-158)
    thenWhat: `expires ${weekdayLong(dayKey(expires))} 5pm · then it stays where it is`,
    silence: "silence keeps the filing",
    verb: "Keep it there",
    toast: "Kept",
    history: [],
    receipt: { cost: 0.01, model: "haiku", sources: extraction == null ? 0 : 1, seconds: 3 },
    labels: UNLABELLED,
    setAt: now.toISOString(),
    focus: "personal",
  };
  state.actions = [...state.actions.filter((a) => a.id !== card.id), card];
  return card;
}
