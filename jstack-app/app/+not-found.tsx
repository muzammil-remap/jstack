/**
 * Unknown routes are DROPPED (spec §14.9 — SEC-11, LK-03): straight back to
 * Today with a toast, and the Face ID gate still fronts everything (it
 * overlays every route on launch, so a route opened while locked shows the
 * gate first).
 *
 * SEC-11's invariant is that no data is read from a URL QUERY STRING anywhere
 * in the app. It has exactly one stated exception, added by W-1 under ADR-64:
 * `/capture` reads `text`, `url` and `title` from the URL FRAGMENT. The
 * fragment is the half that does not travel — never sent to a server, never in
 * a proxy log, never in a Shortcut's run history, never in a Referer — which
 * is why the share flow uses it and a query string would not do. The values
 * land in Brain's capture field and go out through the same validation as
 * typed text, so a share reaches nothing a typed sentence could not, and the
 * lock gate still applies. `SECURITY.md`'s ingestion threat model is the long
 * form.
 */
import { Redirect } from "expo-router";
import React, { useEffect } from "react";
import { toast } from "@/components/chrome/Toast";

export default function NotFound() {
  useEffect(() => {
    toast("Link dropped — unknown route");
  }, []);
  return <Redirect href="/" />;
}
