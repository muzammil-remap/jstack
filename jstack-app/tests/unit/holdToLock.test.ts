/**
 * AG-04, AG-06 — the press-and-hold that arms the emergency lock.
 *
 * THE BUG THIS ROW FIXES is the state the hint is left in AFTER a completed
 * hold. `complete()` nulled the timer before setting the hint, and `cancelHold`
 * only reset the hint when a timer was still pending — so the release that
 * follows every successful hold found nothing to cancel, and the control was
 * left reading "Locking…" forever. Cancelling the confirm dialog left it there
 * too. A control that says it is locking when it is not is the worst possible
 * lie for this particular control to tell.
 *
 * Driven through the HOOK with `renderHook`, and asserting DURATIONS and COUNTS
 * rather than only the sequence — R-06's lesson, where a state machine's
 * `speaking` lasted zero milliseconds and the sequence test was green.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { act, renderHook } from "@testing-library/react-native";
import { HOLD_MS, RESTING_HINT, useHoldToLock } from "@/lib/holdToLock";

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("AG-04 · the hold, and what the hint says at every step", () => {
  it("rests, then holds, then completes — and the completion takes the full duration", () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useHoldToLock(onComplete));

    expect(result.current.hint).toBe(RESTING_HINT);

    act(() => result.current.start());
    expect(result.current.hint).toBe("Keep holding…");

    // one millisecond short is NOT a lock: the duration is the control
    act(() => {
      jest.advanceTimersByTime(HOLD_MS - 1);
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.hint).toBe("Keep holding…");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.hint).toBe("Locking…");
  });

  it("an early release cancels it and says nothing happened", () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useHoldToLock(onComplete));

    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(HOLD_MS - 200);
    });
    act(() => result.current.cancelHold());

    // and the timer is really gone, not merely unwatched
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.hint).toBe(RESTING_HINT);
  });

  it("THE RELEASE AFTER A COMPLETED HOLD returns the hint to rest", () => {
    // the defect: `cancelHold` did nothing once the timer had fired, so the
    // finger coming off a successful hold left the control reading "Locking…"
    const onComplete = jest.fn();
    const { result } = renderHook(() => useHoldToLock(onComplete));

    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(HOLD_MS);
    });
    expect(result.current.hint).toBe("Locking…");

    act(() => result.current.cancelHold());
    expect(result.current.hint).toBe(RESTING_HINT);
    // and releasing must not arm anything a second time
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("cancelling the confirm dialog restores the resting hint", () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useHoldToLock(onComplete));

    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(HOLD_MS);
    });
    // the dialog is up and the finger is still down — `reset` is the path the
    // dialog's own cancel takes, and it is not the same event as a release
    act(() => result.current.reset());
    expect(result.current.hint).toBe(RESTING_HINT);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("resting → hold → complete → release → hold again works, twice over", () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useHoldToLock(onComplete));

    for (const round of [1, 2]) {
      act(() => result.current.start());
      act(() => {
        jest.advanceTimersByTime(HOLD_MS);
      });
      expect({ round, calls: onComplete.mock.calls.length }).toEqual({ round, calls: round });
      act(() => result.current.cancelHold());
      expect(result.current.hint).toBe(RESTING_HINT);
    }
  });

  it("a second start while one is already running does not arm two locks", () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useHoldToLock(onComplete));

    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(HOLD_MS + 400);
    });

    // one hold, one lock — a stray pointer event must not double-arm the one
    // control in the app whose completion revokes every session
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("AG-06 · one timer, and the resting words are declared once", () => {
  it("the resting hint is a constant, not a literal each caller retypes", () => {
    // `Appearance.tsx` compared the hint to a hand-typed copy of this sentence
    // to decide whether to show its own subtitle: two declarations of one
    // string, and the comparison silently stops matching the day either moves
    // (rule 16). Both callers import it now.
    expect(RESTING_HINT).toBe("Press and hold for 1.2 seconds.");
    expect(HOLD_MS).toBe(1200);
  });
});

/**
 * AG-06's grep half, which had an acceptance ID and no test until this row.
 *
 * The claim is "both emergency-lock controls share `lib/holdToLock.ts`; no
 * second timer implementation exists" — and a claim without a gate is a lie in
 * waiting (hard rule 15). It is proven the way rule 14 demands: the sweep is
 * shown to FIND both controls before it is asked to find nothing else, so a
 * pattern that matched neither would fail rather than pass silently.
 */
describe("AG-06 · one timer, and the sweep proves it can see", () => {
  const app = join(__dirname, "..", "..");

  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (["node_modules", "dist", ".expo", "e2e", "tests"].includes(entry.name)) return [];
      const p = join(dir, entry.name);
      if (entry.isDirectory()) return sources(p);
      return /\.tsx?$/.test(entry.name) ? [p] : [];
    });

  it("both hold-to-lock controls import the hook, and nobody rolls their own timer", () => {
    const files = sources(app);
    expect(files.length).toBeGreaterThan(50);

    // the POSITIVE half first: the sweep finds the two controls, so "nothing
    // else matched" below is a result and not an empty query
    const holders = files.filter((f) => /testID="(settings-)?hold-to-lock"/.test(readFileSync(f, "utf8")));
    expect(holders.map((f) => f.slice(app.length + 1).split(sep).join("/")).sort()).toEqual([
      "components/agents/EmergencyLock.tsx",
      "components/settings/Appearance.tsx",
    ]);
    for (const f of holders) expect(readFileSync(f, "utf8")).toContain("useHoldToLock");

    // and no second implementation: nothing outside the hook arms a timer with
    // the emergency hold's own duration, which is what a copy of it would do.
    //
    // The pattern is the BEHAVIOUR, not the name. A first cut also flagged any
    // `HOLD_MS =` and caught `GanttBar.tsx` and `GanttUnscheduled.tsx`, which
    // hold for 600ms to start a touch DRAG — a different gesture that happens
    // to have picked the same constant name. A guard that cannot tell those
    // apart would either be turned off or would push somebody to rename a
    // Gantt constant for no reason (rule 14: an exemption names a line and a
    // reason, and the honest fix here is a narrower question).
    const rogue = files
      .filter((f) => !f.endsWith(`lib${sep}holdToLock.ts`))
      .filter((f) => /setTimeout\([^)]*,\s*1200\s*\)/.test(readFileSync(f, "utf8")));
    expect(rogue.map((f) => f.slice(app.length + 1))).toEqual([]);
  });
});
