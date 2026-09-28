/**
 * §4.10 Sections — the config records the EA proposes and Josh edits.
 *
 * The server validates with `layout/validateSectionConfig.ts`, the same
 * function the app runs, so a config the configure dialog accepts is a
 * config the server accepts and there is no third opinion in between.
 * The 422 body is `{ field, reason }` — the dialog puts that sentence
 * under the control it names.
 *
 * `sectionsOriginal` is the revert source, seeded from the fixture and
 * never written by PUT (the pattern `lifeSectionConfigsOriginal` set in
 * B-21: reverting restores the record, it does not merely un-set the
 * fields the last edit touched).
 */
import * as db from "@/data/mock/db";
import { proposalCard } from "@/data/mock/cards";
import { created, err, ok } from "@/data/mock/util";
import { catalogue } from "@/layout/catalogue";
import { validateSectionConfig } from "@/layout/validateSectionConfig";
import type { ActionItem, SectionConfig } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";


export function getSectionCatalogue(_req: TransportRequest): TransportResponse {
  return ok(catalogue());
}

export function getSections(req: TransportRequest): TransportResponse {
  const tab = req.query?.tab;
  const active = db.get().sections.filter((s) => s.state === "active");
  return ok(tab == null || tab === "" ? active : active.filter((s) => s.tab === tab));
}

export function getSection(_req: TransportRequest, id: string): TransportResponse {
  const found = db.get().sections.find((s) => s.id === id);
  return found ? ok(found) : err(404, "no such section");
}

export function putSection(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.sections.findIndex((s) => s.id === id);
  if (idx === -1) return err(404, "no such section");

  const body = req.body as Partial<SectionConfig> | undefined;
  if (body == null) return err(422, "invalid config", { field: "config", reason: "missing" });

  // the id, version, state and changedAt are the SERVER's, never the
  // client's: a PUT that could set its own version could overwrite an
  // edit made from another device and call it the same version.
  const next: SectionConfig = {
    ...state.sections[idx],
    ...body,
    id,
    version: state.sections[idx].version + 1,
    state: state.sections[idx].state,
    managedBy: "josh",
    changedAt: db.now().toISOString(),
  };

  const v = validateSectionConfig(next);
  if (!v.ok) return err(422, "invalid config", { field: v.field, reason: v.reason });

  state.sections = state.sections.map((s, i) => (i === idx ? next : s));
  return ok(next);
}

export function revertSection(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.sections.findIndex((s) => s.id === id);
  const original = state.sectionsOriginal.find((s) => s.id === id);
  if (idx === -1 || original == null) return err(404, "no such section");

  const restored: SectionConfig = { ...JSON.parse(JSON.stringify(original)) as SectionConfig, version: state.sections[idx].version + 1, changedAt: db.now().toISOString() };
  state.sections = state.sections.map((s, i) => (i === idx ? restored : s));
  return ok(restored);
}

/** DELETE retires; it never removes. A retired section keeps its history
 * so "never" can be enforced later (CB-08: a retired id is not proposed
 * again), which a deleted row could not answer. */
export function deleteSection(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.sections.findIndex((s) => s.id === id);
  if (idx === -1) return err(404, "no such section");
  const retired: SectionConfig = { ...state.sections[idx], state: "retired", changedAt: db.now().toISOString() };
  state.sections = state.sections.map((s, i) => (i === idx ? retired : s));
  return ok(retired);
}

/**
 * §4.10 `POST /sections/propose` — the EA's half.
 *
 * A proposal is NOT a section. The config is stored `state: "proposed"`,
 * which `GET /sections` filters out, and a decision card carries a copy so
 * the card can be previewed and revised without the tab changing under
 * anyone. Approving is what makes it real (see `decisions.postActionVerb`).
 *
 * The reason is required and cannot be blank. A section arriving on Josh's
 * Needs you with no account of why is a change he cannot judge, and "the EA
 * thought so" is not a reason — §4.10 makes it a 422 rather than a default.
 */
/**
 * §4.10 (B-3): a section card's verb is the ONLY thing that turns a proposal
 * into a section. Approve makes it active, Never retires the id for good
 * (CB-08), and Later/Teach leave it proposed — the tab does not change while
 * Josh has not decided. Applied by `handlers/decisions.ts` through its
 * `KIND_EFFECTS` table (F-06, P-11); the undo path stays in decisions.ts.
 */
export function applySectionVerb(action: ActionItem, verb: string, now: Date): void {
  if (action.section == null) return;
  const to = verb === "approve" ? "active" : verb === "never" ? "retired" : null;
  if (to == null) return;
  const state = db.get();
  state.sections = state.sections.map((sec) => (sec.id === action.section!.id ? { ...sec, state: to, changedAt: now.toISOString() } : sec));
}

export function proposeSection(req: TransportRequest): TransportResponse {
  const state = db.get();
  const body = (req.body ?? {}) as { config?: unknown; reason?: string };

  if (typeof body.reason !== "string" || body.reason.trim() === "") {
    return err(422, "invalid proposal", { field: "reason", reason: "a proposal needs a reason" });
  }
  const v = validateSectionConfig(body.config);
  if (!v.ok) return err(422, "invalid config", { field: v.field, reason: v.reason });

  const config = body.config as SectionConfig;

  // CB-08: "never" retires an id permanently. A retired id is not proposable
  // again — otherwise "never" means "not this week", which is the opposite of
  // what the word promises.
  const existing = state.sections.find((s) => s.id === config.id);
  if (existing?.state === "retired") {
    return err(422, "invalid config", { field: "id", reason: "this section was retired; it is not proposed again" });
  }

  const now = db.now();
  const proposed: SectionConfig = {
    ...config,
    state: "proposed",
    managedBy: "ea",
    reason: body.reason,
    version: (existing?.version ?? 0) + 1,
    changedAt: now.toISOString(),
  };
  state.sections = existing == null ? [...state.sections, proposed] : state.sections.map((s) => (s.id === config.id ? proposed : s));

  // the shared shape is `proposalCard`'s (F-04): open, rank 3, 5pm on the third
  // day (ux-review B3R2-07), the " · then" `shortExpiry` splits on (B3R1-14),
  // the fail-closed labels. GL-06: the receipt is the mock's stand-in for what
  // the EA will actually report — a section proposal is a small amount of
  // reasoning over the tab it is about.
  const card = proposalCard(
    {
      id: `sec-${config.id}-${proposed.version}`,
      type: "Section",
      kind: "section",
      title: `New section: ${config.title}`,
      section: proposed,
      why: body.reason,
      sources: [{ label: "your EA", ref: `section:${config.id}` }],
      silence: "silence leaves the tab as it is",
      toast: `Added · ${config.title}`,
      receipt: { cost: 0.01, model: "haiku", sources: 1, seconds: 4 },
    },
    now,
  );
  state.actions = [...state.actions.filter((a) => a.id !== card.id), card];
  return created(card);
}
