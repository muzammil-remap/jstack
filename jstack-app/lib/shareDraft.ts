/**
 * keptShare (A4R11-03) — a share's provenance lives exactly as long as its words do.
 *
 * A field still holding the share's text — with a note typed around it — is still
 * that share. A field that no longer holds it is the person's own capture, and
 * filing it as the share would give it the link, the extraction and a triage card
 * about a page they had thrown away.
 *
 * Out of `stores/brain.ts` at A-3 (v2.3), which needed the room under its cap.
 */
export function keptShare(share: { url?: string; text?: string } | null, draft: string): { url?: string; text?: string } | null {
  const words = share?.text?.trim() ?? "";
  if (share == null || words === "") return share;
  return draft.includes(words) ? share : null;
}

/**
 * shareKey (A-8, R11-REMAP-1) — a share's idempotency key, read off its words and its link.
 *
 * A share can be filed twice with nobody pressing anything twice: expo-router puts the
 * fragment back after the capture route clears it, so a reload inside the request re-reads
 * it and posts it again (A4R11-04), and the tap after the lock gate files what the route
 * could not. A key minted per attempt makes each of those a new capture; one derived from
 * the share is the same key every time the same share arrives, so the server's dedupe on
 * `offlineId` files it once. 53 bits (cyrb53) rather than 32, because a collision would
 * file a different share as a duplicate of this one — silently, which is the one outcome
 * a capture must never have.
 */
export function shareKey(text: string, url?: string): string {
  const s = `${text}\n${url ?? ""}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `share-${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}
