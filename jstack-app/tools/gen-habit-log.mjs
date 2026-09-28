/**
 * Generates `data/mock/fixtures/habits-log.json` — 184 days of habit logs for
 * the nine fixture habits, as a COMPACT DAY STRING per habit rather than ~1000
 * dated rows.
 *
 * Deterministic: a fixed-seed mulberry32 and NO reference to the wall clock, so
 * re-running on any day produces the identical file and the fixture is
 * reviewable as a diff.
 *
 * There is deliberately no weekend leaning. It was written and taken out: a
 * lean baked in at GENERATION time is measured against the weekends of the day
 * the file was made, while the app replays these strings against whatever today
 * is — so within a week the pattern no longer falls on weekends, and a grid
 * would show a rhythm that is not there. A fixture may be arbitrary; it may not
 * be misleading.
 *
 * Index 0 is TODAY, index n is TODAY-n. Characters:
 *   1  logged, done
 *   0  logged, not done
 *   .  not logged at all (the "realistic gap")
 *
 * TODAY is pinned by hand to exactly h1, h3, h5 and h9 done — `today.spec.ts`
 * asserts the glance reads "4/9", `life.spec.ts` toggles h2 from off and h4
 * from off, so today's row is a fixture CONTRACT and not something to generate.
 */
import { writeFileSync } from "node:fs";

const DAYS = 184;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per habit: how often it is logged at all and how often a logged day is a
 * hit. Different rates on purpose — the whole point of the month and year
 * grids is that nine habits do NOT look alike. */
const HABITS = [
  { id: "h1", logRate: 0.92, doneRate: 0.76, seed: 1001 },
  { id: "h2", logRate: 0.78, doneRate: 0.48, seed: 1002 },
  { id: "h3", logRate: 0.95, doneRate: 0.88, seed: 1003 },
  { id: "h4", logRate: 0.7, doneRate: 0.6, seed: 1004 },
  { id: "h5", logRate: 0.82, doneRate: 0.64, seed: 1005 },
  { id: "h6", logRate: 0.6, doneRate: 0.55, seed: 1006 },
  { id: "h7", logRate: 0.75, doneRate: 0.52, seed: 1007 },
  { id: "h8", logRate: 0.55, doneRate: 0.34, seed: 1008 },
  { id: "h9", logRate: 0.9, doneRate: 0.79, seed: 1009 },
];

/** Two stretches where nothing was logged at all — a week away in each. A
 * fixture with no gaps makes a grid that cannot show one. */
const AWAY = [
  { from: 47, to: 54 },
  { from: 121, to: 126 },
];

/** Today is the four the specs pin. */
const DONE_TODAY = new Set(["h1", "h3", "h5", "h9"]);

const out = {};
for (const h of HABITS) {
  const rand = mulberry32(h.seed);
  const chars = [];
  // a streak memory, so a hit is likelier the day after a hit — runs are what
  // a habit grid is for, and independent coin flips produce noise instead
  let last = true;
  for (let n = 0; n < DAYS; n++) {
    if (n === 0) {
      chars.push(DONE_TODAY.has(h.id) ? "1" : ".");
      last = DONE_TODAY.has(h.id);
      continue;
    }
    if (AWAY.some((a) => n >= a.from && n <= a.to)) {
      chars.push(".");
      continue;
    }
    if (rand() > h.logRate) {
      chars.push(".");
      continue;
    }
    const p = Math.min(0.97, Math.max(0.03, h.doneRate + (last ? 0.12 : -0.12)));
    const hit = rand() < p;
    chars.push(hit ? "1" : "0");
    last = hit;
  }
  out[h.id] = chars.join("");
}

const doc = {
  _comment:
    "LH-1: 184 days of habit logs, one string per habit, so the month grid, the year grid and the all-time bars have real shape to show. INDEX 0 IS TODAY and index n is TODAY-n; `1` is logged and done, `0` is logged and missed, `.` is not logged at all. A compact encoding rather than ~1000 rows carrying `{{TODAY-n}}`: the tokens would be a thousand chances to drift and about 60 KB of the entry bundle, which has ten per cent of headroom (F-2). `data/mock/db.ts` expands it at seed time, so nothing here is a literal date. Generated deterministically by tools/gen-habit-log.mjs — re-run it rather than hand-editing, and today's row is pinned by hand to the four habits the specs assert.",
  days: DAYS,
  logs: out,
};

const path = process.argv[2];
writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");

const total = Object.values(out).join("");
console.log(
  `habits-log.json: ${DAYS} days x ${HABITS.length} habits · ` +
    `${[...total].filter((c) => c === "1").length} hits, ` +
    `${[...total].filter((c) => c === "0").length} misses, ` +
    `${[...total].filter((c) => c === ".").length} not logged · ` +
    `${Buffer.byteLength(JSON.stringify(doc))} bytes`,
);
