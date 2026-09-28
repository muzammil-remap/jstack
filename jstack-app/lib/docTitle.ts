/**
 * docTitle.ts (F-18, P-10) — the one writer of `document.title`.
 *
 * MC-03: "● Listening · JSTACK" while a microphone is open and "● Talking ·
 * JSTACK" while a Talk session runs, so a person with six tabs open can find
 * the one that is live. `stores/mic.ts` and `stores/voice.ts` each wrote the
 * title themselves with a purpose-based truce between them; the truce stays
 * in the mic store (a Talk microphone is the voice store's to name) and the
 * writing is here.
 */
type DocTitleState = "listening" | "talking" | null;

export function setDocTitle(state: DocTitleState): void {
  const doc = (globalThis as { document?: { title: string } }).document;
  if (doc == null) return;
  doc.title = state === "listening" ? "● Listening · JSTACK" : state === "talking" ? "● Talking · JSTACK" : "JSTACK";
}
