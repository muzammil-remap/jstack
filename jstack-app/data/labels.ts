/**
 * Data labels — silos and types on every record (spec §15.10, `DATA_LABELS.md`,
 * contract §12.1). The offline copy of the scheme: PL-07's legend renders
 * from `SILO_META`/`TYPE_META` directly, and the swap proof asserts this
 * matches the live `GET /labels/scheme`. Defaults and inheritance implement
 * R1 (fail closed at creation) and R2 (derived content inherits the
 * strictest silo + union of types); R4–R7 are the backend's.
 */
import type { CalendarSource } from "./types";

export type Silo = "personal:josh" | "personal:joce" | "family1" | "family2" | "work";

export type LabelType =
  | "open"
  | "unlabelled"
  | "journal"
  | "health"
  | "money"
  | "identity"
  | "legal"
  | "kids"
  | "confidential"
  | "relationship"
  | "eo"
  | "cosol"
  | "coreasset"
  | "coaching"
  | "medical"
  | "deals"
  | "jstack";

/** provenance of the current labels (contract §12.1's label_set_by CHECK) */
type LabelSetBy = "source" | "review" | "pattern" | "content" | "folder" | "josh";

export type Labels = { silo: Silo; types: LabelType[]; setBy: LabelSetBy };

export const SILO_META: Record<Silo, { shortName: string; who: string; note?: string }> = {
  "personal:josh": { shortName: "personal", who: "JO only", note: "the fail-closed default (R1)" },
  "personal:joce": { shortName: "joce", who: "Joce (JO admin)", note: "mirrors personal:josh when she joins" },
  family1: { shortName: "family", who: "JO and Joce" },
  family2: { shortName: "family+kids", who: "JO, Joce and kids", note: "kids get limited access later" },
  work: { shortName: "work", who: "JO only", note: "current and historical work; a domain type says which business" },
};

/** R2 "strictest wins": personal:josh = personal:joce = work (one person) >
 * family1 (two) > family2 (household). Higher number = stricter. */
const SILO_STRICTNESS: Record<Silo, number> = {
  "personal:josh": 3,
  "personal:joce": 3,
  work: 3,
  family1: 2,
  family2: 1,
};

/** ties keep the first source's silo (a), per DATA_LABELS.md §2 */
export function strictestSilo(a: Silo, b: Silo): Silo {
  return SILO_STRICTNESS[b] > SILO_STRICTNESS[a] ? b : a;
}

/** R3: moving to a less-strict silo (more people can see it) is a declassify. */
export function isWideningSilo(from: Silo, to: Silo): boolean {
  return SILO_STRICTNESS[to] < SILO_STRICTNESS[from];
}

/** R3: dropping a restricted type is a declassify, whatever silo it lands in. */
export function removesRestrictedType(from: LabelType[], to: LabelType[]): boolean {
  return from.some((t) => TYPE_META[t].tier === "restricted" && !to.includes(t));
}

/** UI tier — what the label chip/dot actually renders as (spec §15.10):
 * open = muted grey; review = amber "in review"; restricted = amber with a
 * dot; identity = red. `domain` is an orthogonal work-silo-only dimension
 * (which business), not itself a visual tier beyond what `tier` says. */
type LabelTier = "open" | "review" | "restricted" | "identity";

export const TYPE_META: Record<LabelType, { covers: string; setBy: LabelSetBy; tier: LabelTier; domain?: boolean }> = {
  open: { covers: "reviewed, nothing sensitive — the default for most items", setBy: "source", tier: "open" },
  unlabelled: { covers: "never classified; nothing can read it until the review queue clears it (R1)", setBy: "review", tier: "review" },
  journal: { covers: "journal, therapy, coaching JO receives, personal growth, goals", setBy: "source", tier: "restricted" },
  health: { covers: "records, scripts, results, medical transcripts, Garmin, weight, sleep", setBy: "source", tier: "restricted" },
  money: { covers: "accounts, investing, spending, tax, super, budgets", setBy: "source", tier: "restricted" },
  identity: { covers: "ID documents, account numbers, credentials — numbers stripped, the fact and expiry stored", setBy: "pattern", tier: "identity" },
  legal: { covers: "contracts, deeds, titles, mortgages, insurance, wills, disputes, legal advice", setBy: "content", tier: "restricted" },
  kids: { covers: "about the children: school, activities, their health, notes about them", setBy: "content", tier: "restricted" },
  confidential: { covers: "owed to someone else: client data, NDA material, employee/HR matters, patient records, a mate's confidence", setBy: "content", tier: "restricted" },
  relationship: { covers: "JO and Joce as a couple: counselling, intimacy, disagreements, plans for the two of us", setBy: "content", tier: "restricted" },
  eo: { covers: "forum material", setBy: "source", tier: "restricted" },
  // `covers` is user-facing copy — it is printed verbatim in the legend, so
  // it reads as a description of the label, not as a note about the build.
  // (V2 has no surface that can ADD a label of this type at all: the v1.2
  // Labels dialog and its NOT_ADDABLE list were deleted with PL-04..07, so the
  // rule is enforced by there being nowhere to break it, not by a list. The
  // comment used to point at that deleted file, which left the rule looking as
  // though it lived somewhere it did not — AUDIT_v2.md A-17.)
  cosol: { covers: "a business JO has moved on from — kept so archived records still have a home", setBy: "source", tier: "open", domain: true },
  coreasset: { covers: "Core Asset Co", setBy: "source", tier: "open", domain: true },
  coaching: { covers: "coaching JO delivers as a business", setBy: "source", tier: "open", domain: true },
  medical: { covers: "medical practice; patient data carries health + confidential + medical", setBy: "source", tier: "restricted", domain: true },
  deals: { covers: "acquisitions, due diligence, valuations, offers", setBy: "folder", tier: "restricted", domain: true },
  jstack: { covers: "this build — shareable with REMAP by definition", setBy: "source", tier: "open", domain: true },
};

/** R1 fail-closed placeholder: nothing classified yet. */
export const UNLABELLED: Labels = { silo: "personal:josh", types: ["unlabelled"], setBy: "review" };

/** R2: derived content inherits the strictest silo + union of types of
 * everything it was built from. No sources → the R1 fail-closed default. */
export function inheritLabels(...sources: Labels[]): Labels {
  if (sources.length === 0) return UNLABELLED;
  let silo = sources[0].silo;
  const types = new Set<LabelType>();
  for (const s of sources) {
    silo = strictestSilo(silo, s.silo);
    for (const t of s.types) types.add(t);
  }
  return { silo, types: [...types], setBy: "content" };
}

/**
 * The word a silo's key shows as (ux S6-07, ST1-10): `personal:josh` on a
 * screen is the database talking. Brain's tags and the triage card both read
 * through here. A key the scheme does not know is shown as it came —
 * inventing a word for it would be worse than showing the value.
 */
export function siloShortName(silo: string): string {
  return SILO_META[silo as Silo]?.shortName ?? silo;
}

/** The same word for a SENTENCE — "Filed afr.com under Personal · reading",
 * the form UP-05 writes and Find's chips use (Everything · Personal · Family ·
 * Work). */
export function siloName(silo: string): string {
  const short = siloShortName(silo);
  return short.charAt(0).toUpperCase() + short.slice(1);
}
