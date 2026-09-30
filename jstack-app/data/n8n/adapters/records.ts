/**
 * The configuration and the Life records, through the `records` webhook (JSTACK-DASH-records): a
 * versioned, append-only JSON store the app reads and writes key by key, with the mock's rules
 * (`data/mock/handlers/settings.ts`, `parameters.ts`, `life.ts`, `sections.ts`) and the contract's
 * statuses.
 *
 *  - a key with no record answers the default the n8n build already had (`data/n8n/defaults.ts`),
 *    so nothing changes until Josh saves something, and a save is the first version of that key;
 *  - every read-modify-write sends the version it read (`expectedVersion`): a record changed in
 *    between — on another device — is the store's `409`, never a silent overwrite;
 *  - habit logs are one key a day and habit, date first (`habitlog:<YYYY-MM-DD>:<habitId>`, ADR-87),
 *    so a month or a day of every habit is one prefix; the stats are computed here, as the mock does;
 *  - every key is under `N8N_RECORDS_NAMESPACE` when it is set — REMAP's test runs, never Josh's.
 *
 * Anything the store answers that is not a record is this section's 502.
 */
import { addDays, monthDays, now, todayKey } from "@/lib/time";
import { N8N_RECORDS_NAMESPACE } from "@/data/config";
import { parameterDef } from "@/data/parameters";
import type { AppLayout, AutonomyRule, Focus, Goal, GoalComposite, GoalStatus, Habit, HabitLog, HabitPeriod, HabitStats, Layout, NotificationGroup, Parameter, SectionConfig, Slicer, Task } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { validateSectionConfig } from "@/layout/validateSectionConfig";
import { callWebhook } from "@/data/n8n/client";
import { DEFAULTS, defaultSection } from "@/data/n8n/defaults";
import { inFocus, OWNER_SILOS } from "@/data/n8n/focus";
import type { Asked } from "@/data/n8n/registry";
import { tasksAnswers } from "./tasks";

type Rec<T> = { version: number; value: T | null };

/** A reply the section cannot use: the 502 is this section's, never a guess at what was meant. */
class UnexpectedReply extends Error {}

const keyOf = (name: string) => (N8N_RECORDS_NAMESPACE !== "" ? `${N8N_RECORDS_NAMESPACE}/${name}` : name);
const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);

async function getRecord<T>(name: string): Promise<Rec<T>> {
  const data = await callWebhook("records", { op: "get", key: keyOf(name) });
  if (!isObject(data) || typeof data.version !== "number") throw new UnexpectedReply(`no record for ${name}`);
  return { version: data.version, value: data.version > 0 ? (data.value as T) : null };
}

async function putRecord<T>(name: string, value: T, expectedVersion: number): Promise<T> {
  const data = await callWebhook("records", { op: "put", key: keyOf(name), value, expectedVersion, savedBy: "josh" }, { write: true });
  if (!isObject(data) || typeof data.version !== "number") throw new UnexpectedReply(`the store did not keep ${name}`);
  return data.value as T;
}

/** The latest value of every key under a prefix, keyed by the name after the prefix. */
async function listRecords<T>(prefix: string): Promise<Map<string, T>> {
  const data = await callWebhook("records", { op: "list", prefix: keyOf(prefix) });
  if (!isObject(data) || !Array.isArray(data.items)) throw new UnexpectedReply(`no list for ${prefix}`);
  if (data.truncated === true) console.warn(`n8n records: the list for ${prefix} is longer than the store answers; the oldest are shown`);
  const out = new Map<string, T>();
  for (const item of data.items) if (isObject(item) && typeof item.key === "string") out.set(item.key.slice(keyOf(prefix).length), item.value as T);
  return out;
}

async function answering(make: () => Promise<TransportResponse>): Promise<TransportResponse> {
  try {
    return await make();
  } catch (error) {
    if (error instanceof UnexpectedReply) return { status: 502, json: { reason: `the records store answered in an unexpected shape: ${error.message}` } };
    throw error;
  }
}

const ok = (json: unknown): TransportResponse => ({ status: 200, json });
const refuse = (status: number, reason: string, field?: string): TransportResponse => ({ status, json: field != null ? { reason, field } : { reason } });
const bodyOf = <T>(asked: Asked) => (asked.req.body ?? {}) as T;
/** the default the n8n build answers before any record exists */
const fallback = <T>(name: keyof typeof DEFAULTS, asked: Asked) => (DEFAULTS[name](asked).json as T);

/** A whole-record document: its value (else the default) and the version it was read at. */
async function read<T>(name: string, dflt: () => T): Promise<{ value: T; version: number }> {
  const rec = await getRecord<T>(name);
  return { value: rec.value ?? dflt(), version: rec.version };
}

// ─── the whole-record settings (`data/mock/handlers/settings.ts`: a put replaces the record) ─────

const whole = <T>(name: string, dflt: keyof typeof DEFAULTS | (() => T), wrap?: (v: T) => unknown, unwrap?: (body: unknown) => T) => ({
  get: (asked: Asked) => answering(async () => {
    const { value } = await read<T>(name, typeof dflt === "function" ? dflt : () => fallback<T>(dflt, asked));
    return ok(wrap != null ? wrap(value) : value);
  }),
  put: (asked: Asked) => answering(async () => {
    const { version } = await getRecord<T>(name);
    const next = unwrap != null ? unwrap(asked.req.body) : (asked.req.body as T);
    const saved = await putRecord<T>(name, next, version);
    return ok(wrap != null ? wrap(saved) : saved);
  }),
});

const RULE_SCOPES: AutonomyRule["scope"][] = ["all", "opts", "quote", "bill", "section", "parameter", "triage", "rule"];

/** `data/mock/handlers/settings.ts` `putAutonomyRules`: the same refusals */
function rulesRefusal(body: { rules?: unknown }): TransportResponse | null {
  if (!Array.isArray(body.rules)) return refuse(422, "rules must be a list", "rules");
  const seen = new Set<string>();
  for (const r of body.rules as AutonomyRule[]) {
    if (typeof r?.id !== "string" || typeof r?.text !== "string" || r.text.trim() === "") return refuse(422, "every rule needs an id and something to say", "rules");
    if (!RULE_SCOPES.includes(r.scope)) return refuse(422, "no such scope", "scope");
    if (r.mode !== "auto" && r.mode !== "ask") return refuse(422, "a rule is either auto or ask", "mode");
    if (seen.has(r.id)) return refuse(422, `two rules share the id ${r.id}`, "rules");
    seen.add(r.id);
  }
  return null;
}

/** `data/mock/handlers/settings.ts` `PINNED`: sections a tab cannot hide */
const PINNED: Record<string, string[]> = { today: ["needs"], agents: ["needseyes", "checks", "lock"] };

const layoutDefault = (tab: string): Layout | null => {
  const res = DEFAULTS.getLayout({ req: { method: "GET", path: `/layout/${tab}` }, params: [tab] });
  return res.status === 200 ? (res.json as Layout) : null;
};

// ─── the Life records (`data/mock/handlers/life.ts`) ─────────────────────────────────────────────

const GOAL_STATUSES: GoalStatus[] = ["active", "behind", "done", "dropped"];
const isActive = (g: Goal) => g.status === "active" || g.status === "behind";
const isListed = (h: Habit) => h.archived !== true;
const archivedAt = (g: Goal) => g.history.at(-1)?.at ?? g.setAt;

const goalsDoc = () => read<Goal[]>("goals", () => []);
const habitsDoc = () => read<Habit[]>("habits", () => []);

/** `habitlog:<YYYY-MM-DD>:<habitId>` → the logs, for every key under the prefix */
async function logsUnder(prefix: string): Promise<HabitLog[]> {
  const rows = await listRecords<{ done?: unknown }>(`habitlog:${prefix}`);
  const logs: HabitLog[] = [];
  for (const [rest, value] of rows) {
    const full = `${prefix}${rest}`;
    const m = /^(\d{4}-\d{2}-\d{2}):(.+)$/.exec(full);
    if (m != null && isObject(value) && typeof value.done === "boolean") logs.push({ habitId: m[2], date: m[1], done: value.done });
  }
  return logs;
}

/** the months the stats read: back from today until a month with no logs, past the view's own window, 24 at most */
async function logsForStats(period: HabitPeriod, anchor: string, today: string): Promise<HabitLog[]> {
  const oldestNeeded = period === "year" ? `${anchor.slice(0, 4)}-01` : period === "month" ? anchor.slice(0, 7) : addDays(today, -6).slice(0, 7);
  const logs: HabitLog[] = [];
  let month = today.slice(0, 7);
  for (let i = 0; i < 24; i++) {
    const found = await logsUnder(month);
    logs.push(...found);
    if (found.length === 0 && month <= oldestNeeded) break;
    const [y, m] = month.split("-").map(Number);
    month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  }
  // the anchor's month, when paging back past the run read above
  if (period === "month" && !logs.some((l) => l.date.startsWith(anchor.slice(0, 7)))) logs.push(...(await logsUnder(anchor.slice(0, 7))));
  return logs;
}

/** `data/mock/handlers/life.ts` `windowKeys` */
function windowKeys(period: HabitPeriod, anchor: string, today: string): string[] {
  if (period === "week") return [6, 5, 4, 3, 2, 1, 0].map((n) => addDays(today, -n));
  if (period === "month") return monthDays(anchor);
  if (period === "year") {
    const first = `${anchor.slice(0, 4)}-01-01`;
    const keys: string[] = [];
    for (let k = first; k.slice(0, 4) === first.slice(0, 4); k = addDays(k, 1)) keys.push(k);
    return keys;
  }
  return [];
}

/** `data/mock/handlers/life.ts` `streakFor` */
function streakFor(doneByDay: Map<string, boolean>, today: string, earliest: string): { current: number; longest: number } {
  let current = 0;
  let from = doneByDay.get(today) === true ? today : addDays(today, -1);
  while (from >= earliest && doneByDay.get(from) === true) {
    current += 1;
    from = addDays(from, -1);
  }
  let longest = 0;
  let run = 0;
  for (let k = earliest; k <= today; k = addDays(k, 1)) {
    run = doneByDay.get(k) === true ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return { current, longest };
}

/** `data/mock/handlers/life.ts` `getHabitStats`, over the logs read */
function statsOf(habits: Habit[], logs: HabitLog[], period: HabitPeriod, anchor: string, today: string): HabitStats {
  const earliest = logs.map((l) => l.date).sort()[0] ?? today;
  return {
    period,
    earliest,
    habits: habits.map((h) => {
      const doneByDay = new Map<string, boolean>();
      for (const l of logs) if (l.habitId === h.id) doneByDay.set(l.date, l.done);
      const keys = period === "all" ? [...doneByDay.keys()].sort() : windowKeys(period, anchor, today);
      const days: Record<string, boolean> = {};
      for (const k of keys) if (doneByDay.has(k)) days[k] = doneByDay.get(k)!;
      const past = keys.filter((k) => k <= today);
      return { id: h.id, name: h.name, archived: h.archived === true, days, streak: streakFor(doneByDay, today, earliest), done: past.filter((k) => days[k] === true).length, possible: past.length };
    }),
  };
}

// ─── sections (`data/mock/handlers/sections.ts`): an override over the default config ────────────

const sectionDefault = defaultSection;

export const recordsAnswers = {
  quietHours: whole("settings:quietHours", "getQuietHours"),
  autonomy: whole("settings:autonomy", "getAutonomy"),
  voice: whole("settings:voice", "getVoiceSettings"),
  focuses: whole<Focus[]>("focuses", "getFocuses", undefined, (body) => (body as { focuses: Focus[] }).focuses),
  slicers: whole<Slicer[]>("slicers", "getSlicers", undefined, (body) => (body as { slicers?: Slicer[] }).slicers ?? (body as Slicer[])),
  rules: {
    get: whole<AutonomyRule[]>("settings:autonomyRules", () => [], (rules) => ({ rules })).get,
    put: (asked: Asked) => answering(async () => {
      const refused = rulesRefusal(bodyOf<{ rules?: unknown }>(asked));
      if (refused != null) return refused;
      const { version } = await getRecord<AutonomyRule[]>("settings:autonomyRules");
      return ok({ rules: await putRecord("settings:autonomyRules", bodyOf<{ rules: AutonomyRule[] }>(asked).rules, version) });
    }),
  },

  notificationGroups: {
    get: whole<NotificationGroup[]>("settings:notificationGroups", () => []).get,
    /** `putNotificationGroup`: 404 unknown, 423 a locked group, else its devices merged */
    put: (asked: Asked) => answering(async () => {
      const { value: groups, version } = await read<NotificationGroup[]>("settings:notificationGroups", () => []);
      const group = groups.find((g) => g.id === asked.params[0]);
      if (group == null) return refuse(404, "not found");
      if (group.locked) return refuse(423, "security notifications are always on, by design");
      const next = { ...group, devices: { ...group.devices, ...bodyOf<{ devices?: NotificationGroup["devices"] }>(asked).devices } };
      await putRecord("settings:notificationGroups", groups.map((g) => (g.id === group.id ? next : g)), version);
      return ok(next);
    }),
  },

  appLayout: {
    get: whole<AppLayout>("layout:app", "getAppLayout").get,
    /** `putAppLayout`: merged over what is there */
    put: (asked: Asked) => answering(async () => {
      const { value, version } = await read<AppLayout>("layout:app", () => fallback<AppLayout>("getAppLayout", asked));
      return ok(await putRecord("layout:app", { ...value, ...bodyOf<Partial<AppLayout>>(asked) }, version));
    }),
  },

  layout: {
    get: (asked: Asked) => answering(async () => {
      const tab = asked.params[0];
      const dflt = layoutDefault(tab);
      if (dflt == null) return refuse(404, "not found");
      return ok((await read<Layout>(`layout:${tab}`, () => dflt)).value);
    }),
    /** `putLayout`: a pinned section cannot be hidden (422); else merged, managed by Josh */
    put: (asked: Asked) => answering(async () => {
      const tab = asked.params[0];
      const dflt = layoutDefault(tab);
      if (dflt == null) return refuse(404, "not found");
      const { value: current, version } = await read<Layout>(`layout:${tab}`, () => dflt);
      const body = bodyOf<Partial<Layout>>(asked);
      const pinnedHidden = (PINNED[tab] ?? []).filter((id) => (body.hidden ?? current.hidden).includes(id));
      if (pinnedHidden.length > 0) return refuse(422, `cannot hide pinned section(s): ${pinnedHidden.join(", ")}`, "hidden");
      return ok(await putRecord(`layout:${tab}`, { ...current, ...body, managedBy: "josh", changedAt: now().toISOString() }, version));
    }),
    /** `revertLayout`: back to the tab's own arrangement */
    revert: (asked: Asked) => answering(async () => {
      const tab = asked.params[0];
      const dflt = layoutDefault(tab);
      if (dflt == null) return refuse(404, "not found");
      const { version } = await getRecord<Layout>(`layout:${tab}`);
      const { reason: _reason, ...original } = dflt;
      return ok(await putRecord(`layout:${tab}`, { ...original, managedBy: "josh", changedAt: now().toISOString() }, version));
    }),
  },

  parameters: {
    get: whole<Parameter[]>("parameters", "getParameters").get,
    /** `putParameter`: 404 unknown, 422 outside its range (the mock's words), else stored */
    put: (asked: Asked) => answering(async () => {
      const key = asked.params[0];
      const { value: params, version } = await read<Parameter[]>("parameters", () => fallback<Parameter[]>("getParameters", asked));
      const record = params.find((p) => p.key === key);
      if (record == null || parameterDef(key) == null) return refuse(404, "no such parameter");
      const value = bodyOf<{ value: unknown }>(asked).value;
      const reason = rangeError(record, value);
      if (reason != null) return refuse(422, reason, "value");
      const { refused: _refused, ...kept } = record;
      const next = { ...kept, value } as Parameter;
      await putRecord("parameters", params.map((p) => (p.key === key ? next : p)), version);
      return ok(next);
    }),
  },

  goals: {
    list: (asked: Asked) => answering(async () => ok(inFocus((await goalsDoc()).value.filter(isActive), asked.req.query?.focus))),
    history: (asked: Asked) => answering(async () => ok(inFocus([...(await goalsDoc()).value.filter((g) => !isActive(g))].sort((a, b) => archivedAt(b).localeCompare(archivedAt(a))), asked.req.query?.focus))),
    /** `getGoal`: the goal, its tasks (from Twenty) and its deliverables (none are filed yet) */
    byId: (asked: Asked) => answering(async () => {
      const goal = inFocus((await goalsDoc()).value, undefined).find((g) => g.id === asked.params[0]);
      if (goal == null) return refuse(404, "not found");
      const all = await tasksAnswers.all();
      const tasks = all.status === 200 ? (all.json as Task[]).filter((t) => goal.taskIds.includes(t.id)) : [];
      return ok({ goal, tasks, deliverables: [] } satisfies GoalComposite);
    }),
    /** `putGoals`: the same checks; an active goal left out is dropped, and one archived now gets its history line */
    put: (asked: Asked) => answering(async () => {
      const next = bodyOf<{ goals?: unknown }>(asked).goals;
      if (!Array.isArray(next)) return refuse(422, "a list of goals is required", "goals");
      for (const g of next as Goal[]) {
        if (typeof g?.id !== "string" || typeof g?.text !== "string" || g.text.trim() === "") return refuse(422, "every goal needs an id and a title", "goals");
        if (!GOAL_STATUSES.includes(g.status)) return refuse(422, "no such status", "status");
      }
      const { value: current, version } = await goalsDoc();
      const submitted = next as Goal[];
      for (const g of submitted) {
        if (!current.some((e) => e.id === g.id) && g.labels != null && !OWNER_SILOS.includes(g.labels.silo)) return refuse(403, "a new goal is filed in one of your own silos", "labels.silo");
      }
      const at = now().toISOString();
      const wasActive = new Map(current.filter(isActive).map((g) => [g.id, g]));
      const removed = [...wasActive.values()].filter((g) => !submitted.some((n) => n.id === g.id)).map((g) => ({ ...g, status: "dropped" as const }));
      const merged = [...submitted, ...removed].map((g) => (wasActive.get(g.id) == null || isActive(g) ? g : { ...g, history: [...g.history, { at, event: g.status }] }));
      const untouched = current.filter((g) => !wasActive.has(g.id) && !submitted.some((n) => n.id === g.id));
      const saved = await putRecord<Goal[]>("goals", [...merged, ...untouched], version);
      return ok(inFocus(saved.filter(isActive), asked.req.query?.focus));
    }),
  },

  habits: {
    list: (asked: Asked) => answering(async () => {
      const all = (await habitsDoc()).value;
      return ok(asked.req.query?.includeArchived === "true" ? all : all.filter(isListed));
    }),
    /** `putHabits`: a habit cannot be removed, only archived (422); sorted as sent, archivedAt kept */
    put: (asked: Asked) => answering(async () => {
      const next = bodyOf<{ habits?: unknown }>(asked).habits;
      if (!Array.isArray(next)) return refuse(422, "a list of habits is required", "habits");
      for (const h of next as Habit[]) {
        if (typeof h?.id !== "string" || typeof h?.name !== "string" || h.name.trim() === "") return refuse(422, "every habit needs an id and a name", "habits");
      }
      const { value: current, version } = await habitsDoc();
      const submitted = next as Habit[];
      const missing = current.filter((h) => !submitted.some((n) => n.id === h.id));
      if (missing.length > 0) return refuse(422, `${missing[0].name} cannot be removed — archive it instead, and it keeps its history`, "habits");
      const at = now().toISOString();
      const was = new Map(current.map((h) => [h.id, h]));
      const kept = submitted.map((h, i) => {
        const archived = h.archived === true;
        return { ...h, sort: i + 1, archived, archivedAt: archived ? (was.get(h.id)?.archived === true ? was.get(h.id)!.archivedAt : at) : undefined };
      });
      return ok((await putRecord<Habit[]>("habits", kept, version)).filter(isListed));
    }),
    /** `postHabitLog`: one day of one habit */
    log: (asked: Asked) => answering(async () => {
      const { date, done } = bodyOf<{ date: string; done: boolean }>(asked);
      const habitId = asked.params[0];
      const { version } = await getRecord(`habitlog:${date}:${habitId}`);
      await putRecord(`habitlog:${date}:${habitId}`, { done }, version);
      return ok({ habitId, date, done } satisfies HabitLog);
    }),
    stats: (asked: Asked) => answering(async () => {
      const today = todayKey();
      const period = (asked.req.query?.period ?? "week") as HabitPeriod;
      const anchor = asked.req.query?.anchor != null && asked.req.query.anchor !== "" ? asked.req.query.anchor : today;
      const [habits, logs] = await Promise.all([habitsDoc(), logsForStats(period, anchor, today)]);
      return ok(statsOf(habits.value, logs, period, anchor, today));
    }),
  },

  sections: {
    /** `putSection`: the patch over the section, validated, managed by Josh, as an override record */
    put: (asked: Asked) => answering(async () => {
      const id = asked.params[0];
      const dflt = sectionDefault(id);
      if (dflt == null) return refuse(404, "no such section");
      const body = asked.req.body as Partial<SectionConfig> | undefined;
      if (body == null) return refuse(422, "invalid config", "config");
      const { value: current, version } = await read<SectionConfig>(`section:${id}`, () => dflt);
      const next: SectionConfig = { ...current, ...body, id, version: current.version + 1, state: current.state, managedBy: "josh", changedAt: now().toISOString() };
      const v = validateSectionConfig(next);
      if (!v.ok) return { status: 422, json: { reason: "invalid config", field: v.field } };
      return ok(await putRecord(`section:${id}`, next, version));
    }),
    /** `revertSection`: the section as it was first configured */
    revert: (asked: Asked) => answering(async () => {
      const id = asked.params[0];
      const dflt = sectionDefault(id);
      if (dflt == null) return refuse(404, "no such section");
      const { value: current, version } = await read<SectionConfig>(`section:${id}`, () => dflt);
      return ok(await putRecord(`section:${id}`, { ...dflt, version: current.version + 1, changedAt: now().toISOString() }, version));
    }),
  },
};

/** `data/mock/handlers/parameters.ts` `rangeError` */
function rangeError(record: Parameter, value: unknown): string | null {
  if (record.unit === "boolean") return typeof value === "boolean" ? null : "this parameter is on or off";
  if (typeof value !== "number" || !Number.isFinite(value)) return `${record.label} is a number of ${record.unit}`;
  if (!Number.isInteger(value)) return `${record.label} is a whole number of ${record.unit}`;
  if (value < record.min! || value > record.max!) return `${record.label} must be between ${record.min} and ${record.max} ${record.unit}`;
  return null;
}

/** For the composites: the Life records Today and Life show, read once each. */
export async function lifeRecords(focus: string | undefined): Promise<{ goals: Goal[]; habits: Habit[]; logsToday: HabitLog[] }> {
  const [goals, habits, logsToday] = await Promise.all([goalsDoc(), habitsDoc(), logsUnder(todayKey())]);
  return { goals: inFocus(goals.value.filter(isActive), focus), habits: habits.value.filter(isListed), logsToday };
}

/** `PUT /actions/{id}/draft`'s record: the revised draft, kept beside the card as `draft:<id>`. */
export const saveDraftRecord = (id: string, draft: { subject?: string; body: string }) =>
  answering(async () => {
    const { version } = await getRecord(`draft:${id}`);
    return ok(await putRecord(`draft:${id}`, draft, version));
  });

/** `GET /sections` and `/sections/{id}`: the default configs, each with Josh's saved override. */
export const sectionReads = {
  list: (asked: Asked) => answering(async () => {
    const res = DEFAULTS.getSections(asked);
    const saved = await listRecords<SectionConfig>("section:");
    return ok((res.json as SectionConfig[]).map((s) => saved.get(s.id) ?? s));
  }),
  byId: (asked: Asked) => answering(async () => {
    const dflt = sectionDefault(asked.params[0]);
    if (dflt == null) return refuse(404, "not found");
    return ok((await read<SectionConfig>(`section:${asked.params[0]}`, () => dflt)).value);
  }),
};
