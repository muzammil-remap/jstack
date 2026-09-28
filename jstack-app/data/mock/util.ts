/**
 * Shared helpers for data/mock/handlers/*.ts (kept out of server.ts and
 * every handler file to keep both under the row-4 200-line budget).
 */
import * as db from "@/data/mock/db";
import type { Silo } from "@/data/labels";
import type { TransportResponse } from "@/data/transport/Transport";

export function ok<T>(json: T): TransportResponse {
  return { status: 200, json: json as unknown };
}

export function created<T>(json: T): TransportResponse {
  return { status: 201, json: json as unknown };
}

export function noContent(): TransportResponse {
  return { status: 204, json: null };
}

export function err(status: number, reason: string, extra?: Record<string, unknown>): TransportResponse {
  return { status, json: { reason, ...extra } };
}

/**
 * CONTRACT_v2.md §7: "?focus= matches focus on every noun; 'all' means no
 * filter." Always returns a fresh array (never the caller's own `rows`
 * reference) — a PUT/PATCH handler mutates an item in place at its index (the
 * established pattern across every handler file), so a subsequent unfiltered
 * GET must hand back a new reference or zustand's set() sees no change and
 * skips the re-render (BUGLOG B-17).
 *
 * TWO filters, and the order matters (I-1, MU-02/MU-04):
 *
 * 1. **The silo gate**, always, before anything else. A labelled record the
 *    current session's user may not see does not come back, whatever was
 *    asked for. This is the SERVER's decision and it is applied HERE, at the
 *    one place every list read already passes through, rather than in each of
 *    the sixteen call sites — a gate each handler has to remember is a gate
 *    that will eventually be forgotten in exactly one of them.
 * 2. **The focus**, which for a labelled record RESOLVES TO SILOS (MU-04:
 *    `?focus=family` means "the family silos", not "rows whose focus string
 *    happens to read family"). Nouns with no labels — goals, people, learning
 *    — keep the string match, because that is all they carry.
 */
export function inFocus<T extends { focus?: string; labels?: { silo: Silo } }>(rows: T[], focus: string | undefined): T[] {
  const allowed = db.currentSilos();
  const visible = rows.filter((r) => r.labels == null || allowed.includes(r.labels.silo));

  if (focus == null || focus === "" || focus === "all") return visible;

  const wanted = db.get().focuses.find((f) => f.id === focus)?.filter.silos;
  if (wanted == null) return visible.filter((r) => r.focus === focus);
  return visible.filter((r) => (r.labels == null ? r.focus === focus : (wanted as string[]).includes(r.labels.silo)));
}

export function nextId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The `offlineId` gate every capture write passes through (O-1, §4.12).
 *
 * Three answers, and which one you get is the whole contract:
 *   409  the rig armed a conflict for this id — the record changed elsewhere
 *        and the server will not apply this write (OF-07)
 *   200  this id has been applied before: the FIRST answer, marked
 *        `duplicate`, and nothing new created (OF-04)
 *   null  go ahead — and call `remember` with what you produced
 *
 * Handlers call it rather than each inventing a dedupe: the mock had exactly
 * one hand-rolled version of this (brain dump's) and it was missing the
 * `duplicate` flag the contract promises, which W-2's conformance runner is
 * what noticed.
 */
export function replayed(body: unknown): TransportResponse | null {
  const offlineId = ((body ?? {}) as { offlineId?: string }).offlineId;
  if (typeof offlineId !== "string" || offlineId === "") return null;
  const state = db.get();
  if (state.conflicting.includes(offlineId)) {
    state.conflicting = state.conflicting.filter((id) => id !== offlineId);
    return err(409, "changed on the server since you captured this", { offlineId });
  }
  const previous = state.applied[offlineId];
  if (previous === undefined) return null;
  return ok({ ...(previous as Record<string, unknown>), duplicate: true });
}

/** Record what a capture produced, so a replay can be answered with it. */
export function remember<T>(body: unknown, produced: T): T {
  const offlineId = ((body ?? {}) as { offlineId?: string }).offlineId;
  if (typeof offlineId === "string" && offlineId !== "") db.get().applied[offlineId] = produced as unknown;
  return produced;
}

/** A high-risk write (a revoke, the emergency lock, the caps) carries the
 * nonce and the biometric assertion or is refused at the door — once, for
 * `session.ts` and `agents.ts` both (F-08, P-11). */
export function requireHighRisk(body: unknown): TransportResponse | null {
  const b = (body ?? {}) as { nonce?: string; biometricAssertion?: string };
  if (!b.nonce || !b.biometricAssertion) return err(403, "high-risk assertion required");
  return null;
}
