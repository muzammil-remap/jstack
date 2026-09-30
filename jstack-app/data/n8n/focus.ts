/**
 * Who may see what, and what a focus narrows to, on the n8n build (ADR-76) — the rule the mock's
 * `inFocus` applies (`data/mock/util.ts`), copied because `data/n8n/` may not import `data/mock/`
 * (CT-03).
 *
 * The session is always the owner (`data/n8n/defaults.ts` `getSession`), so the silo gate lets
 * through every silo the owner holds; a focus then keeps the records whose silo it names. A focus
 * this build does not know falls back to comparing the record's own `focus`, as the mock does.
 */
import type { Silo } from "@/data/labels";
import type { Focus } from "@/data/types";

/** `data/mock/db.ts` `USERS.josh` — the owner, and every silo the owner may see. */
export const OWNER_SILOS: Silo[] = ["personal:josh", "family1", "family2", "work"];

/** `data/mock/fixtures/focuses.json` — the four focuses, Everything fixed. */
export const FOCUSES: Focus[] = [
  { id: "all", name: "Everything", fixed: true, filter: {} },
  { id: "personal", name: "Personal", filter: { silos: ["personal:josh", "personal:joce"] } },
  { id: "family", name: "Family", filter: { silos: ["family1", "family2"] } },
  { id: "work", name: "Work", filter: { silos: ["work"] } },
];

export function inFocus<T extends { focus?: string; labels?: { silo: Silo } }>(rows: T[], focus: string | undefined): T[] {
  const visible = rows.filter((r) => r.labels == null || OWNER_SILOS.includes(r.labels.silo));
  if (focus == null || focus === "" || focus === "all") return visible;
  const wanted = FOCUSES.find((f) => f.id === focus)?.filter.silos;
  if (wanted == null) return visible.filter((r) => r.focus === focus);
  return visible.filter((r) => (r.labels == null ? r.focus === focus : wanted.includes(r.labels.silo)));
}
