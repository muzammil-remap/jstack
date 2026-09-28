/**
 * WPS-1 (v2.3.2) — the Needs you schedule. Josh: "add 'needs you' schedule to be adjustable, in the settings
 * schedule like all the others."
 *
 * A field of quiet hours' record, `QuietHours.needsYou` at `GET/PUT /settings/quiet-hours`: the windows of the day
 * Needs you is raised in, whether these quiet hours hold it too, and paused. Today reads it — outside every window
 * the cards wait, the label keeps the count and the section says when they come; inside one, the stack is what it
 * was.
 *
 * The gate's instants are built with `atTime` on one fixed day, so each expectation names the same wall clock in
 * both zones the board runs (TD-01). The store's half is in `tests/unit/stores/settings.test.ts`; the Settings
 * entry and Today's stack are in `tests/native/screens.test.tsx`.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { keyableCard } from "@/lib/cardVerbs";
import { needsYouHold, parseWindows, raiseTimesText, windowsText } from "@/lib/needsYouSchedule";
import { atTime, now } from "@/lib/time";
import { useDeviceStore } from "@/stores/device";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTodayStore } from "@/stores/today";
import type { QuietHours } from "@/data/types";

type Schedule = NonNullable<QuietHours["needsYou"]>;

const DAY = "2026-09-16";
const NEXT_DAY = "2026-09-17";
const at = (hours: number, minutes = 0, key = DAY) => atTime(key, hours, minutes);
/** the fixture's quiet hours, with no schedule */
const QUIET: QuietHours = { start: "21:30", end: "07:00", exceptions: ["Security"] };
const schedule = (windows: [string, string][], over: Partial<Schedule> = {}): Schedule => ({
  windows: windows.map(([start, end]) => ({ start, end })),
  respectsQuietHours: true,
  paused: false,
  ...over,
});
/** those quiet hours, carrying a schedule */
const hours = (needsYou: Schedule): QuietHours => ({ ...QUIET, needsYou });
/** three windows, an hour each */
const THREE = schedule([["08:00", "09:00"], ["12:00", "13:00"], ["16:00", "17:00"]]);
const NOTHING_WAITS = { held: false, nextAt: null, changesAt: null };

describe("WPS-1 · when Needs you is raised", () => {
  it("inside a window nothing waits", () => {
    expect(needsYouHold(hours(THREE), at(8, 30)).held).toBe(false);
    expect(needsYouHold(hours(THREE), at(12, 0)).held).toBe(false);
  });

  it("outside every window the cards wait for the next window's start — a window's end is outside it", () => {
    expect(needsYouHold(hours(THREE), at(10, 30))).toEqual(expect.objectContaining({ held: true, nextAt: at(12, 0) }));
    expect(needsYouHold(hours(THREE), at(9, 0))).toEqual(expect.objectContaining({ held: true, nextAt: at(12, 0) }));
  });

  it("after the day's last window they wait for tomorrow's first", () => {
    expect(needsYouHold(hours(THREE), at(18, 0))).toEqual(expect.objectContaining({ held: true, nextAt: at(8, 0, NEXT_DAY) }));
  });

  it("paused raises them as they come, as before there was a schedule; so do quiet hours with no schedule, and no record at all", () => {
    expect(needsYouHold(hours({ ...THREE, paused: true }), at(10, 30))).toEqual(NOTHING_WAITS);
    expect(needsYouHold(QUIET, at(10, 30))).toEqual(NOTHING_WAITS);
    expect(needsYouHold(null, at(10, 30))).toEqual(NOTHING_WAITS);
  });

  it("quiet hours hold a window when the schedule respects them, and do not when it does not", () => {
    const evening = schedule([["21:00", "23:00"], ["08:00", "09:00"]]);
    expect(needsYouHold(hours(evening), at(21, 15)).held).toBe(false);
    expect(needsYouHold(hours(evening), at(22, 0))).toEqual(expect.objectContaining({ held: true, nextAt: at(8, 0, NEXT_DAY) }));
    expect(needsYouHold(hours({ ...evening, respectsQuietHours: false }), at(22, 0)).held).toBe(false);
  });

  it("a window whose end is before its start runs past midnight, as quiet hours do", () => {
    const night = schedule([["22:00", "02:00"]], { respectsQuietHours: false });
    expect(needsYouHold(hours(night), at(1, 0)).held).toBe(false);
    expect(needsYouHold(hours(night), at(3, 0))).toEqual(expect.objectContaining({ held: true, nextAt: at(22, 0) }));
  });

  it("a schedule that can never open holds nothing — no card is hidden for good", () => {
    expect(needsYouHold(hours(schedule([["22:00", "23:00"]])), at(12, 0))).toEqual(NOTHING_WAITS);
    expect(needsYouHold(hours(schedule([])), at(12, 0))).toEqual(NOTHING_WAITS);
  });

  it("the next moment the answer can change is the next edge, so a screen left open follows it", () => {
    expect(needsYouHold(hours(THREE), at(8, 30)).changesAt).toEqual(at(9, 0));
    expect(needsYouHold(hours(THREE), at(10, 30)).changesAt).toEqual(at(12, 0));
  });
});

describe("WPS-1 · the windows as they are typed in Settings", () => {
  it("reads H:MM–H:MM with an en dash or a hyphen, comma-separated, and stores HH:MM", () => {
    expect(parseWindows("8:00–9:00, 12:30-13:30,16:00 – 17:00")).toEqual([
      { start: "08:00", end: "09:00" },
      { start: "12:30", end: "13:30" },
      { start: "16:00", end: "17:00" },
    ]);
  });

  it("a trailing comma is not a window", () => {
    expect(parseWindows("8:00–9:00, ")).toEqual([{ start: "08:00", end: "09:00" }]);
  });

  it("anything it cannot read is not a schedule, so nothing is saved", () => {
    for (const text of ["", " , ", "8:00", "8–9", "25:00–26:00", "8:60–9:00", "9:00–9:00", "8:00–9:00, 1"]) {
      expect({ text, windows: parseWindows(text) }).toEqual({ text, windows: null });
    }
  });

  it("writes them back the way the Schedules card writes a time", () => {
    expect(windowsText(THREE.windows)).toBe("8:00–9:00, 12:00–13:00, 16:00–17:00");
    expect(raiseTimesText(THREE.windows)).toBe("8:00 · 12:00 · 16:00");
  });
});

describe("WPS-1 · the mock keeps the schedule in quiet hours' record", () => {
  beforeEach(() => db.reset());

  it("the fixture ships it in quiet hours, paused, at 8am and 4pm, so nothing changes until it is resumed", async () => {
    const res = await handle({ method: "GET", path: "/settings/quiet-hours" });
    expect({ status: res.status, json: res.json }).toEqual({ status: 200, json: hours(schedule([["08:00", "09:00"], ["16:00", "17:00"]], { paused: true })) });
  });

  it("PUT accepts quiet hours with a schedule and echoes them, GET reads the same back, and a body with no schedule still stands", async () => {
    const next = hours(schedule([["09:30", "10:30"]], { respectsQuietHours: false }));
    const put = await handle({ method: "PUT", path: "/settings/quiet-hours", body: next });
    expect({ status: put.status, json: put.json }).toEqual({ status: 200, json: next });
    expect((await handle({ method: "GET", path: "/settings/quiet-hours" })).json).toEqual(next);
    expect((await handle({ method: "PUT", path: "/settings/quiet-hours", body: { start: "22:00", end: "07:00", exceptions: [] } })).status).toBe(200);
  });

  it("a schedule the contract does not allow is a 422 that names the field, as quiet hours' own fields are", async () => {
    const put = await handle({ method: "PUT", path: "/settings/quiet-hours", body: { ...QUIET, needsYou: { windows: "8:00–9:00", respectsQuietHours: true, paused: false } } });
    expect({ status: put.status, namesTheField: JSON.stringify(put.json).includes("windows") }).toEqual({ status: 422, namesTheField: true });
  });
});

type Schema = { properties?: Record<string, Schema>; required?: string[]; items?: Schema };

/** openapi.yaml's schemas, parsed by the tools' own reader in a child process, as `openapi.test.ts` does — the reader is ESM */
function openApiSchemas(): Record<string, Schema> {
  const app = join(__dirname, "..", "..");
  const reader = pathToFileURL(join(app, "tools", "yaml.mjs")).href;
  const target = join(app, "openapi.yaml");
  const script = [
    `const Y = await import(${JSON.stringify(reader)});`,
    `const fs = await import("node:fs");`,
    `console.log(JSON.stringify(Y.parse(fs.readFileSync(${JSON.stringify(target)}, "utf8")).components.schemas));`,
  ].join("");
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: app, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

describe("WPS-1 · the contract carries it", () => {
  it("openapi.yaml publishes quiet hours' optional needsYou: windows of a start and an end, respectsQuietHours, paused", () => {
    const record = openApiSchemas().QuietHours;
    const needsYou = record?.properties?.needsYou;
    const window = needsYou?.properties?.windows?.items;
    expect({
      optional: !(record?.required ?? []).includes("needsYou"),
      fields: Object.keys(needsYou?.properties ?? {}),
      required: needsYou?.required,
      window: Object.keys(window?.properties ?? {}),
      windowRequired: window?.required,
    }).toEqual({
      optional: true,
      fields: ["windows", "respectsQuietHours", "paused"],
      required: ["windows", "respectsQuietHours", "paused"],
      window: ["start", "end"],
      windowRequired: ["start", "end"],
    });
  });
});

describe("WPS-1 · the keys answer no card while Needs you waits", () => {
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  /** one window, from and to so many minutes from now, quiet hours aside */
  const around = (fromMinutes: number, toMinutes: number): Schedule => {
    const n = now().getTime();
    return schedule([[hhmm(new Date(n + fromMinutes * 60_000)), hhmm(new Date(n + toMinutes * 60_000))]], { respectsQuietHours: false });
  };

  beforeEach(async () => {
    db.reset();
    await useTodayStore.getState().load();
    useSessionStore.setState({ modal: null, sheet: null, settingsOpen: false, locked: false, online: true });
    useTodayStore.setState({ openDecisionId: "c1", picks: {} });
    useTaskCardStore.setState({ openTaskId: null });
    useDeviceStore.setState({ collapsed: {} });
  });

  afterEach(() => useSettingsStore.setState({ quietHours: null }));

  it("outside its windows the keys have no card; inside one, the open card as before", () => {
    useSettingsStore.setState({ quietHours: hours(around(120, 180)) });
    expect(keyableCard(true)).toBeNull();
    useSettingsStore.setState({ quietHours: hours(around(-60, 60)) });
    expect(keyableCard(true)?.id).toBe("c1");
  });
});
