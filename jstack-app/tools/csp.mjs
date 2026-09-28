/**
 * ONE content-security policy, read from `public/_headers` (SH-08, R-13).
 *
 * `tools/build-web.mjs` injects a `<meta http-equiv>` copy of the CSP into
 * `index.html` so the policy survives a host that strips headers. Until
 * Stage 4 the meta was a second hand-written string, and the two had
 * drifted: the meta had no `worker-src`, said `form-action 'none'` where the
 * headers said `'self'`, and nothing compared them. A second list is a list
 * that drifts (S-1's lesson, one file over).
 *
 * The meta is DERIVED here from the served policy: the same directives, less
 * the ones a `<meta>` cannot carry — `frame-ancestors` is ignored in a meta
 * and Chrome says so on the console, which GL-00 counts — and, in the test
 * flavour only, `connect-src` widened to the loopback origins the e2e rig and
 * the swap proof talk to.
 */

/** directives the CSP spec says a `<meta>` delivery must ignore */
const META_CANNOT_CARRY = new Set(["frame-ancestors", "report-uri", "report-to", "sandbox"]);

/** the `Content-Security-Policy:` value of the global (`/*`) block in a `_headers` file */
export function servedCsp(headersText) {
  const line = headersText.split(/\r?\n/).find((l) => /^\s+Content-Security-Policy:/i.test(l));
  if (line == null) throw new Error("public/_headers has no Content-Security-Policy line");
  return line.replace(/^\s+Content-Security-Policy:\s*/i, "").trim();
}

/** the meta CSP for a build flavour, derived from the served one */
export function metaCsp(served, { prod }) {
  const directives = served
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => !META_CANNOT_CARRY.has(d.split(/\s+/)[0]));
  return directives
    .map((d) => {
      if (prod || !d.startsWith("connect-src ")) return d;
      // the test flavour's serve rig (serve-web on a loopback port) and the
      // swap proof (the reference backend on 8787) are loopback only
      return `${d} http://127.0.0.1:* ws://127.0.0.1:* http://localhost:*`;
    })
    .join("; ");
}
