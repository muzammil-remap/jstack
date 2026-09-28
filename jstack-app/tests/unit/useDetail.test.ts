/**
 * `components/detail/useDetail.ts` (P-3, F-68) — the one detail fetch, and the
 * live flag that six copies of it carried by hand.
 *
 * The third case is the flag's whole point, made observable: a slow response
 * for the first id must not overwrite the record of the id the dialog moved
 * on to. Unmount runs the same cleanup, so the same case covers a dialog
 * closed mid-flight.
 */
import { act, renderHook } from "@testing-library/react-native";
import { reset as resetDb } from "@/data/mock/db";
import { useDetail } from "@/components/detail/useDetail";
import type { DataProvider } from "@/data/DataProvider";
import type { Task } from "@/data/types";

const flush = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });

beforeEach(() => resetDb());

describe("useDetail", () => {
  it("holds the record the fetch resolves, keyed on the id", async () => {
    const { result } = renderHook(() => useDetail("t1", (a, id) => a.getTask(id)));
    expect(result.current).toEqual({ item: null, missing: false });
    await flush();
    expect(result.current.item?.id).toBe("t1");
    expect(result.current.missing).toBe(false);
  });

  it("says MISSING when the fetch fails, and holds nothing", async () => {
    const { result } = renderHook(() => useDetail("no-such-task", (a, id) => a.getTask(id)));
    await flush();
    expect(result.current).toEqual({ item: null, missing: true });
  });

  it("a response that lands after the id moved on is dropped — the flag is per run", async () => {
    let resolveSlow: (t: Task) => void = () => undefined;
    const slow = new Promise<Task>((r) => {
      resolveSlow = r;
    });
    const fetch = (a: DataProvider, id: string) => (id === "slow" ? slow : a.getTask(id));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useDetail(id, fetch), { initialProps: { id: "slow" } });
    rerender({ id: "t1" });
    await flush();
    expect(result.current.item?.id).toBe("t1");

    await act(async () => {
      resolveSlow({ id: "slow" } as Task);
      await Promise.resolve();
    });
    expect(result.current.item?.id).toBe("t1");
  });
});

describe("useDetail · a null id, and an id that changes (P-4)", () => {
  it("a null id shows nothing and asks nothing", async () => {
    const fetch = jest.fn((a: DataProvider, id: string) => a.getTask(id));
    const { result } = renderHook(() => useDetail(null, fetch));
    await flush();
    expect(result.current).toEqual({ item: null, missing: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a new id clears the old record while its own fetch is in flight, and null clears it for good", async () => {
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useDetail(id, (a, taskId) => a.getTask(taskId)), {
      initialProps: { id: "t1" as string | null },
    });
    await flush();
    expect(result.current.item?.id).toBe("t1");
    rerender({ id: "t3" });
    // synchronously: t1's record must not stand in for t3 while t3 loads
    expect(result.current.item).toBeNull();
    await flush();
    expect(result.current.item?.id).toBe("t3");
    rerender({ id: null });
    await flush();
    expect(result.current).toEqual({ item: null, missing: false });
  });
});
