/**
 * /capture (W-1, UP-04, ADR-64) — where something shared from another app
 * lands.
 *
 * THE VALUES ARRIVE IN THE URL FRAGMENT, and that is a security decision, not
 * a routing convenience. `#text=…&url=…&title=…` is never sent to a server,
 * never written to a proxy log, never recorded in a Shortcut's run history and
 * never in the Referer of anything the page later loads. A query string is all
 * four. `CODEMAP.md`'s SEC-11 invariant — "no data is read from URL params" —
 * has this one stated exception and says so; the exception is the fragment
 * precisely because the fragment is the half that does not travel.
 *
 * WHAT IT DOES NOT DO. It does not bypass anything. The shared text lands in
 * Brain's capture field and goes out through `POST /brain/dump` with the same
 * validation as something typed, so a share cannot reach a rule, a memory or a
 * verb by a route typed words could not. The lock gate still fronts it: a
 * share arriving while the app is locked shows the gate, and the text is still
 * in the field afterwards.
 *
 * It also clears the fragment as soon as it has read it. A share sitting in
 * `location.hash` survives a reload, a screenshot and the browser's own
 * history UI, and nothing here needs it a second time.
 */
import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { toast } from "@/components/chrome/Toast";
import { useBrainStore } from "@/stores/brain";

/**
 * Read `text`, `url` and `title` out of the fragment. Native has no fragment,
 * so it reads nothing and redirects — the native share extension is the first
 * item of the native track (contract §8 Q22) and will call the same routes.
 */
function readShare(): { text?: string; url?: string; title?: string } {
  const hash = (globalThis as { location?: { hash?: string } }).location?.hash ?? "";
  if (!hash.startsWith("#")) return {};
  const p = new URLSearchParams(hash.slice(1));
  const pick = (k: string) => {
    const v = p.get(k);
    return v == null || v.trim() === "" ? undefined : v;
  };
  return { text: pick("text"), url: pick("url"), title: pick("title") };
}

/** `title — text`, with the URL on its own line. One composer so the field,
 * the capture and the Latest in row all show the same words. */
export function shareText(share: { text?: string; url?: string; title?: string }): string {
  const head = [share.title, share.text].filter((s) => s != null && s.trim() !== "").join(" — ");
  return [head, share.url].filter((s) => s != null && s.trim() !== "").join("\n");
}

export default function Capture() {
  const dump = useBrainStore((s) => s.dump);
  const setDumpDraft = useBrainStore((s) => s.setDumpDraft);
  const setShareDraft = useBrainStore((s) => s.setShareDraft);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const share = readShare();
    const text = shareText(share);

    // Clear the fragment before anything else touches it — a share left in
    // `location.hash` outlives the send, the reload and the screenshot. And
    // clear it IN PLACE: assigning `location.hash` pushed a history entry and
    // left the old one holding the share, so every Back returned to it and this
    // route filed the share again, with no press (A4R10-02).
    const g = globalThis as { location?: { pathname: string; search: string }; history?: { replaceState: (data: unknown, unused: string, url: string) => void } };
    if (g.location != null && g.history != null) g.history.replaceState(null, "", g.location.pathname + g.location.search);

    if (text === "") {
      toast("Nothing shared");
      setDone(true);
      return;
    }

    // The field is filled BEFORE the send, and deliberately.
    //
    // A LOCKED APP IS THE COMMON CASE, not the edge one: a share arrives from
    // another app, and JSTACK is almost always locked when it does. The gate
    // fronts everything and `lib/lockGate.ts` refuses the write — correctly —
    // so the send throws and this SWALLOWS it, leaving the words in the field
    // for the person to send once they are through the gate. A share that
    // vanished behind a lock screen would be the one thing a capture route
    // must never do, and an unhandled rejection here is a console error on the
    // most ordinary journey the feature has.
    setDumpDraft(text);
    // and remember WHAT IT IS. If the gate refuses the send below, the tap that
    // follows must still file a share rather than a typed note — the source is
    // what runs the extraction and raises the triage card.
    setShareDraft({ url: share.url, text });
    void dump("share", text, undefined, undefined, share.url)
      .then(() => {
        // sent: the words the field was holding for it are done with — left there,
        // one more tap filed the same share twice (A4R10-02)
        if (useBrainStore.getState().dumpDraft === text) {
          setDumpDraft("");
          setShareDraft(null);
        }
      })
      .catch(() => {
        // nothing to say: the gate is already on screen saying it, and a toast
        // behind a lock screen is a message nobody reads
      })
      .finally(() => setDone(true));
  }, [dump, setDumpDraft, setShareDraft]);

  // Brain either way: the shared item belongs in Latest in, and a person who
  // shared something wants to see where it went.
  return done ? <Redirect href="/brain" /> : null;
}
