/**
 * triage.ts (R-1, §1.19, resolution #50) — what the default agent decides
 * about a capture, and the EA's answer when the capture was a question.
 *
 * A SERVER decision, for the same reason `labelRules.ts` is: the app never
 * triages, it renders. Every route into the app — typed, dictated, shared,
 * the Shortcut — lands on `POST /brain/dump`, so a capture is classified once
 * here rather than four times in four callers that would drift.
 *
 * The rules are keyword rules and they are meant to look like it. A mock that
 * pretended to be a model would be a second, worse model: what this has to
 * demonstrate is the SHAPE the real Librarian returns and what the app does
 * with each part of it — a kind, where it went, secondary destinations, the
 * silo and labels, a sensitivity, and whether the filing is provisional.
 *
 * NOTHING MATCHING IS THE COMMON CASE, and it is the one the UI has to be
 * honest about: an unmatched capture comes back `provisional` with a reason,
 * which is what the Latest in row renders as "-> filing . Librarian". A mock
 * that guessed a kind for everything would have hidden the state the person
 * actually sees most often.
 */
import { applyContentRules } from "@/data/mock/labelRules";
import { UNLABELLED, type Labels } from "@/data/labels";
import type { CaptureRouting, Reply, Sensitivity } from "@/data/types";

/** where each kind is stored (§1.19). One map, so the two places that need
 * it cannot disagree about where a journal entry goes. */
const STORAGE: Record<CaptureRouting["kind"], CaptureRouting["storage"]> = {
  task: "twenty",
  journal: "journal",
  memory: "memory",
  question: "memory",
  note: "dropbox",
  reading: "dropbox",
};

/** A question is the only kind decided by punctuation rather than words —
 * and it is decided FIRST, because "can you book the flights?" is a question
 * with a task's verb in it and answering it is not the same as doing it. */
function kindOf(text: string): CaptureRouting["kind"] | null {
  const t = text.trim().toLowerCase();
  if (t.endsWith("?")) return "question";
  if (/\b(journal|felt|feeling|energy|mood|tired)\b/.test(t)) return "journal";
  if (/\b(remember|prefers|always|never|note that)\b/.test(t)) return "memory";
  if (/\b(call|email|book|send|renew|lodge|chase|reply to)\b/.test(t)) return "task";
  if (/\b(read|article|watch|podcast|episode)\b/.test(t)) return "reading";
  return null;
}

/**
 * R1 fail-closed, restated for sensitivity: an unclassified capture is
 * `normal`, not `open`. `open` is a positive statement that this is fine to
 * spread around, and nothing here is in a position to make it.
 */
function sensitivityOf(labels: Labels): Sensitivity {
  const restricted = ["identity", "legal", "kids", "health", "confidential", "relationship"];
  return labels.types.some((t) => restricted.includes(t)) ? "sensitive" : "normal";
}

export function triage(text: string): CaptureRouting {
  const kind = kindOf(text);
  // the content rules are the SAME ones every other record creation uses —
  // a capture labelled by a second copy of them is a capture labelled
  // differently from the task it becomes
  const labels = applyContentRules({ silo: "personal:josh", types: ["open"], setBy: "source" }, text);
  const shared = {
    silos: [labels.silo as string],
    // `open` is dropped only once a content rule has added something more
    // specific: "open . kids" claims both that nothing sensitive is here and
    // that a child is named in it, and only one of those can be true.
    labels: (labels.types.length > 1 ? labels.types.filter((t) => t !== "open") : labels.types) as string[],
    sensitivity: sensitivityOf(labels),
  };
  if (kind == null) {
    return { kind: "note", ...shared, storage: STORAGE.note, provisional: true, reason: "no rule matched — the Librarian has it" };
  }
  return { kind, ...shared, storage: STORAGE[kind] };
}

/**
 * RP-05 — the same answer, from the OTHER door. A Dictate turn is an answer
 * to something Josh asked, so it belongs in Replies with everything else the
 * EA has said; without this, half his answers are only findable by reopening
 * the dialog he asked in, which is the one place he will not look tomorrow.
 *
 * `read: true`, and that is the rule the whole feature turns on: he was
 * looking at the thread when it arrived. Only a question he asked and walked
 * away from should arrive unread (resolution #28) — an app that badges you
 * for something you just read is an app you stop believing.
 */
export function replyToTurn(turnId: string, text: string, sources: { label: string; ref: string }[], at: string): Reply {
  return { id: `rp-${turnId}`, toCaptureId: turnId, text, sources, at, read: true, labels: UNLABELLED, setAt: at, focus: "personal" };
}

/** The EA's answer to a question capture. `read: false` only here: a reply
 * created from a Dictate turn is already on screen when it is made
 * (resolution #28, RP-05). */
export function replyTo(captureId: string, text: string, at: string): Reply {
  return {
    id: `rp-${captureId}`,
    toCaptureId: captureId,
    text: `I don't have an answer to hand yet — I've put it to the Librarian and I'll come back. You asked: ${text.trim()}`,
    sources: [],
    at,
    read: false,
    labels: UNLABELLED,
    setAt: at,
    focus: "personal",
  };
}
