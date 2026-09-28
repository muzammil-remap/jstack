/**
 * openFromUrl.ts (R-1, RP-04) — a notification click opens the thing it was
 * about.
 *
 * `public/sw.js` turns a push payload into `/<tab>?ref=<ref>` and focuses an
 * existing tab rather than opening a second copy of the app. Until this, the
 * app READ none of that: the click landed on the right tab and then sat
 * there, which is O-1's defect wearing a different hat — a control that
 * reports success and does nothing. The tab was right and the thing you were
 * notified about was still three taps away.
 *
 * TWO FORMS, deliberately:
 *
 *   `?ref=learning:l2`  — a "<kind>:<id>", resolved by the one `openRef`
 *                         (resolution #31). Any record with a kind.
 *   `?ref=r1`           — a bare id. Only replies send these (RP-04's payload
 *                         is `{ tab: "brain", ref: <replyId> }`), because a
 *                         reply is what the EA pushes about; a bare id is
 *                         read as a reply id and nothing else.
 *
 * The parameter is REMOVED once it has been acted on. Left in place, a
 * refresh — or restoring the tab tomorrow — reopens a dialog about a
 * notification from last week, and the person did not ask for it twice.
 */
import { openRef } from "@/layout/openRef";
import { useSessionStore } from "@/stores/session";

export function openFromUrl(): void {
  const loc = (globalThis as { location?: Location }).location;
  if (loc?.search == null) return;
  const params = new URLSearchParams(loc.search);
  const ref = params.get("ref");
  if (ref == null || ref === "") return;

  const open = (name: string, payload: string) => useSessionStore.getState().openModal(name, payload);
  if (ref.includes(":")) openRef(ref, open);
  else open("reply", ref);

  // Spent on the NEXT tick, not this one. expo-router syncs the address bar
  // from its own navigation state as it mounts, and a rewrite made during
  // boot is put straight back — the parameter survived, which a refresh
  // tomorrow would have acted on a second time.
  params.delete("ref");
  const rest = params.toString();
  const target = `${loc.pathname}${rest === "" ? "" : `?${rest}`}`;
  setTimeout(() => (globalThis as { history?: History }).history?.replaceState?.(null, "", target), 0);
}
