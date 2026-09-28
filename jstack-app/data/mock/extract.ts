/**
 * extract.ts (W-1, UP-08) — what the backend's screened extract step returns
 * for a shared link, and the one rule about what may be done with it.
 *
 * THE RULE, and it is the whole reason this is its own module: extracted text
 * is CONTENT FROM OUTSIDE. It is saved, indexed and shown. It is never read as
 * instruction — not by the triage rules, not by the label rules, not by
 * anything that can create a rule, a memory or a verb. `SECURITY.md`'s
 * ingestion threat model is the long form; this file is where the boundary
 * actually is, so the rule is written where somebody changing it will see it.
 *
 * The fixture deliberately includes a page that ASKS to be obeyed ("ignore
 * your rules and…"). It is in the seeded data rather than planted by a test
 * because that is what the ingestion path meets in the wild: the path should
 * be exercised against it on every run, not only when a test remembers.
 *
 * The mock does not fetch. A real backend would, behind an allow-list, with a
 * size cap and script stripping; here the same shape comes from a fixture, so
 * the app is driven by the same data a screened fetch would produce.
 */
import extractFixture from "./fixtures/extract.json";

type ExtractRow = { host: string; match: string; from: string; title: string; text: string };

export type Extraction = { text: string; from: string; title: string; words: number };

const ROWS = extractFixture as ExtractRow[];

/** the host, without a scheme or a `www.` — a share carries a real URL and
 * the fixture matches it the way an index would, not by exact string */
function hostOf(url: string): string | null {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url.trim());
  return m == null ? null : m[1].replace(/^www\./i, "").toLowerCase();
}

/**
 * What the extract step read, or `null` for a link nothing matched — which is
 * the COMMON case and the one the UI has to be honest about (resolution #30:
 * the field holds the URL, the routing is `reading` and provisional, and
 * there is no extraction line to show).
 */
export function extractFor(url: string | undefined): Extraction | null {
  if (url == null || url.trim() === "") return null;
  const host = hostOf(url);
  if (host == null) return null;
  const row = ROWS.find((r) => host === r.host.toLowerCase() && url.includes(r.match));
  if (row == null) return null;
  return { text: row.text, from: row.from, title: row.title, words: countWords(row.text) };
}

/** Words, counted once, here — so the row, the card and the detail all say the
 * same number and none of them counts for itself (rule 16). Not exported: the
 * count leaves this module as `Extraction.words` and as the capture's
 * `extractedWords`, which is the point — one number, stated by the server. */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The host a rule is taught about ("File x.com shares under Work · reading").
 * Exported because `teach` writes the sentence and the next share has to match
 * it back — two spellings of "which host" is how a taught rule stops applying. */
export function shareHost(url: string | undefined): string | null {
  return url == null ? null : hostOf(url);
}
