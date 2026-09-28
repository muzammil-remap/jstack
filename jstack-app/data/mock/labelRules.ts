/**
 * The label rules the SERVER owns (S-6, SM-08).
 *
 * `data/labels.ts` keeps the scheme — the silos, the types, their metadata,
 * and the two pure operations a client legitimately needs (`strictestSilo`
 * for comparing, `inheritLabels` for derived content). What lives here is
 * the half that decides what a NEW record gets labelled: the per-noun
 * defaults from DATA_LABELS.md §3 and the content rules that read a
 * record's own text.
 *
 * That is a server decision, not a client one. A client that can choose its
 * own labels can choose a wider silo than it should have, and the whole
 * point of the scheme (R1 fail-closed, R3 additive-only) is that it is
 * applied once, where the record is created. The mock IS the server in this
 * build, so the rules live under `data/mock/` with the handlers that call
 * them — and when a real backend arrives, this file is the specification it
 * implements and the client does not have to lose anything.
 *
 * `CONTRACT_v21.md` §3 carries the shapes; `tests/unit/labels.test.ts`
 * covers both halves.
 */
import type { CalendarSource } from "@/data/types";
import { UNLABELLED, type Labels, type LabelType } from "@/data/labels";

/** content rules (DATA_LABELS.md §3, additive, setBy stays whatever it was
 * unless nothing has been added yet): scans free text for the three
 * keyword classes and adds the matching type. Never removes a type — R3. */
export function applyContentRules(labels: Labels, text: string): Labels {
  const t = text.toLowerCase();
  const add = new Set(labels.types);
  let added = false;
  if (/\b(school|kids?|swim squad|passports?)\b/.test(t)) {
    added ||= !add.has("kids");
    add.add("kids");
  }
  if (/\$\d|\bdeposit\b|\btransfer\b|\bbill\b|\bbudget\b/.test(t)) {
    added ||= !add.has("money");
    add.add("money");
  }
  if (/\b(doctor|check-?up|scripts?|garmin)\b/.test(t)) {
    added ||= !add.has("health");
    add.add("health");
  }
  if (!added) return labels;
  return { silo: labels.silo, types: [...add], setBy: labels.setBy === "source" ? "content" : labels.setBy };
}

// ─── defaults at creation (DATA_LABELS.md §3) ────────────────────────────────

/** Task by project (§3). "any other / new project" is R1 fail-closed:
 * unlabelled until Josh sets it — never guess a silo for an unknown project. */
function taskDefaults(project: string): Labels {
  switch (project) {
    case "JSTACK":
    case "JSTACK build":
      return { silo: "work", types: ["jstack"], setBy: "source" };
    case "Hiring":
      return { silo: "work", types: ["coreasset", "confidential"], setBy: "source" };
    case "Website":
      return { silo: "work", types: ["coreasset"], setBy: "source" };
    case "Bali":
    case "Home":
      return { silo: "family1", types: ["open"], setBy: "source" };
    case "Health":
      return { silo: "personal:josh", types: ["health"], setBy: "source" };
    default:
      return UNLABELLED;
  }
}

/** Brain item by category (§3). Auto (librarian decides) is unlabelled
 * until reviewed — shown as "in review". */
function brainDefaults(category: string): Labels {
  if (category === "Journal") return { silo: "personal:josh", types: ["journal"], setBy: "source" };
  if (category === "Auto") return UNLABELLED;
  return { silo: "personal:josh", types: ["open"], setBy: "source" };
}

/** Calendar event by source (§3); `title` drives the +jstack content rule
 * for work events naming the JSTACK/Alex build. */
function eventDefaults(source: CalendarSource, title?: string): Labels {
  if (source === "personal") return { silo: "personal:josh", types: ["open"], setBy: "source" };
  if (source === "work") {
    const namesTheBuild = title != null && /\b(jstack|alex)\b/i.test(title);
    return { silo: "work", types: namesTheBuild ? ["open", "jstack"] : ["open"], setBy: "source" };
  }
  return applyContentRules({ silo: "family1", types: ["open"], setBy: "source" }, title ?? "");
}

/** Needs-you card by its EA-authored `type` string (ADR-13; the mock's
 * "Clash" | "Email" | "Bill" | "Report" | ...). Unrecognised types fall
 * back to the fail-open personal/open default rather than fail-closed —
 * unlike task/brain/event, a decision card is always EA-authored and never
 * carries the user's own free text at creation. */
function actionDefaults(type: string): Labels {
  switch (type) {
    case "Email":
      return { silo: "work", types: ["jstack"], setBy: "source" };
    case "Clash":
      return { silo: "family1", types: ["kids"], setBy: "content" };
    case "Bill":
      return { silo: "personal:josh", types: ["money"], setBy: "source" };
    default:
      return { silo: "personal:josh", types: ["open"], setBy: "source" };
  }
}

type LabelRequest =
  | { noun: "task"; project: string }
  | { noun: "brain"; category: string }
  | { noun: "event"; source: CalendarSource; title?: string }
  | { noun: "action"; type: string }
  | { noun: "financeMessage" };

/** the DATA_LABELS.md §3 defaults for every project/category (PL-02) —
 * tasks (quick-add, bug, dump-routed), dumps and bug reports call this at
 * creation. */
export function defaultLabelsFor(req: LabelRequest): Labels {
  switch (req.noun) {
    case "task":
      return taskDefaults(req.project);
    case "brain":
      return brainDefaults(req.category);
    case "event":
      return eventDefaults(req.source, req.title);
    case "action":
      return actionDefaults(req.type);
    case "financeMessage":
      return { silo: "personal:josh", types: ["money"], setBy: "source" };
  }
}
