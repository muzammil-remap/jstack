/**
 * The locked-session write gate (H-1 d2, CD-14).
 *
 * When the app is locked, no write may leave — and the check belongs at the
 * ONE boundary every write already passes through, not in each of forty store
 * actions. `data/ApiAdapter.ts` cannot import `stores/session.ts` (the store
 * imports the provider, and that is a cycle), so the store registers its
 * answer here, the same way `lib/time.ts` takes its clock offset.
 *
 * Why it matters, and it is not theoretical: the gate covers the app with an
 * opaque view and `inert`, but `inert` is a browser affordance and a
 * synthetic `element.click()` from script is not a browser gesture. B8-01 is
 * the row where the keyboard walked behind the gate and wrote through the
 * adapter. This is the same hole closed one level lower — the pointer, the
 * keyboard and a dispatched event all end up here.
 *
 * Reads are allowed: a locked screen that cannot re-read its own state is a
 * locked screen that cannot tell you why it locked. The auth and recovery
 * routes are allowed for the same reason — they are how it stops being locked.
 */
import { pathToPattern, ROUTES } from "@/data/routes";

/** What works while locked: the rows `data/routes.ts` marks `whileLocked` —
 * how a locked session stops being locked (the nonce, registration, refresh,
 * the passkey ceremony, recovery) and the emergency lock itself. WPF-3: this
 * was a hand-kept list beside `data/mock/server.ts`'s own, the two had
 * already drifted (`/lock` in one and not the other), and neither held the
 * passkey ceremony, so a locked app refused the request that unlocks it. Both
 * halves read the flag now. */
const ALLOWED_WHILE_LOCKED = ROUTES.filter((r) => r.whileLocked === true).map((r) => pathToPattern(r.path));

let isLocked: () => boolean = () => false;

/** `stores/session.ts` calls this once at module load. */
export function setLockSource(source: () => boolean): void {
  isLocked = source;
}

export class LockedError extends Error {
  constructor(readonly path: string) {
    super(`refused: the session is locked (${path})`);
    this.name = "LockedError";
  }
}

/**
 * Throws if this write must not happen. Returns silently otherwise.
 *
 * The refusal is a throw rather than a silent no-op on purpose: a caller that
 * believes its write succeeded will tell the person it did.
 */
export function assertUnlocked(method: string, path: string): void {
  if (method === "GET") return;
  if (!isLocked()) return;
  if (ALLOWED_WHILE_LOCKED.some((pattern) => pattern.test(path))) return;
  throw new LockedError(path);
}
