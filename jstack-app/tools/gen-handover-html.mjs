/**
 * `REMAP_HANDOVER.html` — the handover as one page Josh can open (A-6).
 *
 * Josh reviews HTML, not markdown, before REMAP sees the pack (10 Sep), and
 * REMAP's first hour is "Run it" (v2.3.2: §2, since the whole handover
 * consolidated into one document) — so the page has two tabs: the
 * whole of `HANDOVER.md`, and that section on its own. Same argument as
 * `gen-wiring-html.mjs`: it opens from disk with no network and no
 * dependency, so the markdown is rendered here rather than by a library at
 * runtime, and the CSS is inline.
 *
 * WP-P (round v2.3.2, Josh's amendment): this is one of two renderings of
 * the same `HANDOVER.md` — the other is the REMAP pack's own Start-here tab
 * (`REMAP_v23/build_pack_v23.py`). Both must look the same quality: every
 * `##` section a collapsible `<details>`, §0 open and the rest closed, an
 * expand-all/collapse-all control, and the four diagrams inline in whichever
 * section names them (matched by keyword against the heading text, so a
 * later renumbering of `HANDOVER.md` keeps working without a code change
 * here — see `DIAGRAM_KEYWORDS`).
 *
 * The renderer is a SUBSET, deliberately: the headings, paragraphs, fenced
 * code, tables, lists, blockquotes and the inline run (`code`, **bold**,
 * *italic*, links) that `HANDOVER.md` actually uses. Anything else is left as
 * text rather than guessed at — a renderer that silently half-renders a
 * construct is worse than one that shows it plainly, because the page still
 * has to be TRUE.
 *
 * Kept fresh by `pnpm codemap` (so the pre-commit hook regenerates it with its
 * sources) and pinned by `tests/unit/handover.test.ts`: every `##` heading of
 * the sources appears in the page.
 *
 * Run: `node tools/gen-handover-html.mjs` (or `pnpm codemap`).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(app, "..");

const SOURCE = join(repo, "HANDOVER.md");
const OUT = join(repo, "REMAP_HANDOVER.html");
const DIAGRAMS_DIR = join(repo, "diagrams");

// WP-P (round v2.3.2): the four archify pictures, matched to whichever
// HANDOVER.md section talks about them. Keyword match, not a section
// number — WP-Q is still consolidating HANDOVER.md's sections, and a
// number pins to a heading that may move under it.
const DIAGRAMS = [
  {
    slug: "1-architecture-seams",
    title: "JStack system overview: the app, the backend REMAP builds, and the security boundary",
    keywords: ["architecture", "the app, the backend remap builds", "security boundary"],
  },
  {
    slug: "2-offline-capture",
    title: "Offline capture: what happens to a note when there is no network",
    keywords: ["offline capture", "offline"],
  },
  {
    slug: "3-lock-states",
    title: "Session security: what locks, what is wiped, and who confirms it",
    keywords: ["session security", "lock states", "emergency lock", "what locks, what is wiped"],
  },
  {
    slug: "4-stage2-plugin",
    title: "Stage 2 delivery plan: who does what, in what order, and the gates",
    keywords: ["stage 2", "stage-2", "delivery plan", "connect and run"],
  },
];

function b64png(slug) {
  const p = join(DIAGRAMS_DIR, `${slug}.png`);
  if (!existsSync(p)) return null;
  return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
}

function diagramFigure(d) {
  const data = b64png(d.slug);
  if (!data) return "";
  return `<figure class="dia"><a href="diagrams/${d.slug}.html"><img src="${data}" alt="${escapeHtml(d.title)}"></a><figcaption><b>${escapeHtml(d.title)}</b>. Open <code>diagrams/${d.slug}.html</code> for the live page; the spec is <code>diagrams/${d.slug}.json</code>.</figcaption></figure>`;
}

function diagramForHeading(headingText, used) {
  const t = headingText.toLowerCase();
  return DIAGRAMS.find((d) => !used.has(d.slug) && d.keywords.some((k) => t.includes(k)));
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** the inline run: code first, so nothing inside backticks is re-read as markup */
function inline(text) {
  const code = [];
  let s = String(text).replace(/`([^`]+)`/g, (_m, body) => {
    code.push(body);
    return `\u0000${code.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => `<a href="${href}">${label}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, "$1<em>$2</em>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${escapeHtml(code[Number(i)])}</code>`);
  return s;
}

/** `| a | b |` → cells, with the `|---|` rule dropped */
const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const isTableRule = (line) => /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/.test(line) && line.includes("-");

/** heading id, so the page can be linked into and the tab-2 anchor works */
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function render(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (para.length > 0) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code — taken verbatim, never re-read as markup
    if (/^\s*```/.test(line)) {
      flushPara();
      const lang = line.trim().slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre${lang ? ` data-lang="${escapeHtml(lang)}"` : ""}><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      const level = heading[1].length;
      const text = heading[2].trim();
      out.push(`<h${level} id="${slug(text)}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    // table: a pipe row followed by the |---| rule
    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      flushPara();
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) body.push(cells(lines[i++]));
      out.push(
        `<div class="scroll"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
          body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") +
          `</tbody></table></div>`,
      );
      continue;
    }

    // lists — one level, which is all the sources use
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      flushPara();
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        i++;
        // a wrapped continuation line belongs to the item above it
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          item += " " + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara();
  return out.join("\n");
}

/** every `##` section as a collapsible `<details>`, the first open and the rest
 * closed; content before the first `##` (the `#` title and its intro) renders
 * plainly above them. A diagram whose keywords match a heading's text is
 * appended inside that section, once. The expand-all/collapse-all control is
 * a checkbox styled as a button, forcing every section but the first open with
 * pure CSS — this page opens from disk with no script (RM-06, handover.test.ts). */
function renderCollapsible(markdown, key) {
  const lines = markdown.split(/\r?\n/);
  const preface = [];
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      if (cur) sections.push(cur);
      cur = { title: m[1].trim(), lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      preface.push(line);
    }
  }
  if (cur) sections.push(cur);

  const used = new Set();
  const out = [];
  if (preface.join("\n").trim()) out.push(render(preface.join("\n")));
  const cbId = `show-all-${key}`;
  if (sections.length) {
    out.push(
      `<div class="expand-controls"><input type="checkbox" id="${cbId}" class="show-all"><label for="${cbId}" class="btn lbl-expand">Expand all</label><label for="${cbId}" class="btn lbl-collapse">Collapse all</label></div>`,
    );
  }
  sections.forEach((sec, idx) => {
    let body = render(sec.lines.join("\n"));
    const d = diagramForHeading(sec.title, used);
    if (d) {
      used.add(d.slug);
      body += "\n" + diagramFigure(d);
    }
    const cls = idx === 0 ? "sec sec-first" : "sec";
    out.push(
      `<details class="${cls}" id="${slug(sec.title)}"${idx === 0 ? " open" : ""}><summary>${inline(sec.title)}</summary>${body}</details>`,
    );
  });
  return out.join("\n");
}

/** The "Run it" section on its own: from its `## N. Run it` heading to the next `## `
 * (matched by title, not number — the section has been renumbered twice already as
 * WP-Q and WP-T reordered HANDOVER.md, and a number here would break again the next
 * time it moves; tab 2 follows whichever `##` heading contains "run it") */
function runIt(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+\d+\.\s.*run it/i.test(l));
  if (start === -1) throw new Error("HANDOVER.md has no '## N. Run it' section — tab 2 is that section; fix the source or this tool");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

const CSS = `
:root { color-scheme: light dark; --ground:#EDEBE5; --card:#FFFFFFA8; --ink:#262523; --muted:#6B6862; --line:#00000018; --accent:#4A5E70; --code:#00000010; }
@media (prefers-color-scheme: dark) { :root { --ground:#191815; --card:#FFFFFF0E; --ink:#E9E6DF; --muted:#A9A79F; --line:#FFFFFF1F; --accent:#9BB4C8; --code:#FFFFFF12; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--ground); color:var(--ink); font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
.wrap { max-width: 900px; margin: 0 auto; padding: 28px 20px 96px; }
header.page { padding-bottom: 8px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.01em; }
.sub { color: var(--muted); font-size: 13px; margin: 0; }
h2 { font-size: 20px; margin: 0; }
h3 { font-size: 16px; margin: 22px 0 6px; }
h4 { font-size: 14px; margin: 18px 0 4px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
p { margin: 10px 0; }
a { color: var(--accent); }
code { background: var(--code); border-radius: 4px; padding: 1px 4px; font: 13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
pre { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
pre code { background: none; padding: 0; font-size: 12.5px; }
blockquote { margin: 12px 0; padding: 8px 14px; border-left: 3px solid var(--line); color: var(--muted); }
ul, ol { margin: 10px 0; padding-left: 22px; }
li { margin: 4px 0; }
.scroll { overflow-x: auto; margin: 12px 0; }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th, td { border: 1px solid var(--line); padding: 7px 9px; text-align: left; vertical-align: top; }
th { background: var(--card); font-weight: 600; }
.expand-controls { display: flex; gap: 8px; margin: 16px 0 6px; }
.expand-controls input.show-all { position: absolute; opacity: 0; pointer-events: none; }
.expand-controls .btn { font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: var(--card); }
.expand-controls .btn:hover { color: var(--ink); border-color: var(--accent); }
.show-all:checked ~ .lbl-expand, .show-all:not(:checked) ~ .lbl-collapse { display: none; }
details.sec { border: 1px solid var(--line); border-radius: 10px; margin: 10px 0; padding: 0 16px; background: var(--card); }
details.sec[open] { padding-bottom: 14px; }
details.sec summary { list-style: none; cursor: pointer; font-size: 17px; font-weight: 700; padding: 14px 0; }
details.sec summary::-webkit-details-marker { display: none; }
details.sec summary::before { content: "▸"; display: inline-block; width: 1.1em; color: var(--muted); transition: transform .12s; }
details.sec[open] summary::before { transform: rotate(90deg); }
details.sec > :not(summary) { margin-left: 0; }
/* the master control forces every section but the first, pure CSS — no script */
.show-all:checked ~ details.sec { padding-bottom: 14px; }
.show-all:checked ~ details.sec > *:not(summary) { display: revert !important; }
.show-all:checked ~ details.sec > summary::before { transform: rotate(90deg); }
.show-all:not(:checked) ~ details.sec:not(.sec-first) { padding-bottom: 0; }
.show-all:not(:checked) ~ details.sec:not(.sec-first) > *:not(summary) { display: none !important; }
.show-all:not(:checked) ~ details.sec:not(.sec-first) > summary::before { transform: none; }
figure.dia { margin: 16px 0; background: var(--ground); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px 10px; }
figure.dia img { width: 100%; height: auto; display: block; border-radius: 6px; }
figure.dia figcaption { font-size: 12.5px; color: var(--muted); margin-top: 8px; }
nav.tabs { display: flex; gap: 6px; margin: 14px 0 0; }
nav.tabs label { cursor: pointer; font-size: 13px; font-weight: 600; padding: 7px 13px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: var(--card); }
input.tab { position: absolute; opacity: 0; pointer-events: none; }
#t1:checked ~ nav.tabs label[for="t1"], #t2:checked ~ nav.tabs label[for="t2"] { color: var(--ground); background: var(--ink); border-color: var(--ink); }
section.tab { display: none; }
#t1:checked ~ section.pane1, #t2:checked ~ section.pane2 { display: block; }
footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
`;

const source = readFileSync(SOURCE, "utf8");
// A FINGERPRINT of the source, not the date this ran: the pre-commit hook
// regenerates on every commit that touches the app, and a date would rewrite
// this file — and its diff — daily for no change anybody made. The fingerprint
// moves only when `HANDOVER.md` moves, which is also what makes it a drift
// test worth having: `tests/unit/handover.test.ts` recomputes it.
const fingerprint = createHash("sha256").update(source).digest("hex").slice(0, 12);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="jstack-handover-source" content="${fingerprint}">
<title>JSTACK V2.3 — handover for REMAP</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<input class="tab" type="radio" name="tab" id="t1" checked>
<input class="tab" type="radio" name="tab" id="t2">
<header class="page">
  <h1>JSTACK V2.3 — handover</h1>
  <p class="sub">Generated from <code>HANDOVER.md</code> (<code>${fingerprint}</code>) by <code>jstack-app/tools/gen-handover-html.mjs</code>. The markdown is the source of record; this page is the same words, laid out to read.</p>
</header>
<nav class="tabs">
  <label for="t1">The handover</label>
  <label for="t2">Run it</label>
</nav>
<section class="tab pane1">
${renderCollapsible(source, "p1")}
</section>
<section class="tab pane2">
${renderCollapsible(runIt(source), "p2")}
</section>
<footer>JSTACK V2.3 · this page opens from disk with no network and no dependency · <code>REMAP_HANDOVER.html</code></footer>
</div>
</body>
</html>
`;

writeFileSync(OUT, html);
const headings = source.split(/\r?\n/).filter((l) => /^##\s+/.test(l)).length;
console.log(`gen-handover-html: REMAP_HANDOVER.html — ${headings} '##' sections, ${(html.length / 1024).toFixed(0)} kB, two tabs, collapsible`);
