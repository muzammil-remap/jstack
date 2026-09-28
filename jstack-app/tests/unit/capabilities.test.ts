/**
 * CT-05/SE-08 — data/capabilities.ts. `getCapabilities()` reads
 * `GET /capabilities` through the active adapter and falls back to
 * `localCapabilitiesFallback()` (a conservative, all-off shape except the
 * on-device `speech` flag) if that call throws — so a fresh session with no
 * backend reachable still renders an honest "not available" instead of
 * crashing on `undefined`.
 */
import { getCapabilities, localCapabilitiesFallback } from "@/data/capabilities";
import { getAdapter } from "@/data/provider";
import type { Capabilities } from "@/data/types";

jest.mock("@/data/provider", () => ({ getAdapter: jest.fn() }));

const FULL: Capabilities = {
  liveRouting: true,
  liveVoice: true,
  speech: true,
  fileStore: true,
  calendarWrite: true,
  moneyFeed: true,
  healthFeed: true,
  export: true,
  calendarViews: true,
};

describe("getCapabilities()", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("returns the adapter's GET /capabilities response when it resolves", async () => {
    (getAdapter as jest.Mock).mockReturnValue({ getCapabilities: () => Promise.resolve(FULL) });
    await expect(getCapabilities()).resolves.toEqual(FULL);
  });

  it("falls back to localCapabilitiesFallback() when the adapter call throws", async () => {
    (getAdapter as jest.Mock).mockReturnValue({ getCapabilities: () => Promise.reject(new Error("offline")) });
    await expect(getCapabilities()).resolves.toEqual(localCapabilitiesFallback());
  });
});

describe("localCapabilitiesFallback()", () => {
  it("every backend-owned flag is off; calendarViews is on by default (V2_DECISIONS.md)", () => {
    const fallback = localCapabilitiesFallback();
    expect(fallback.liveRouting).toBe(false);
    expect(fallback.liveVoice).toBe(false);
    expect(fallback.fileStore).toBe(false);
    expect(fallback.calendarWrite).toBe(false);
    expect(fallback.moneyFeed).toBe(false);
    expect(fallback.healthFeed).toBe(false);
    expect(fallback.export).toBe(false);
    expect(fallback.calendarViews).toBe(true);
  });

  it("speech reflects this device's own speechSynthesis support, not the backend", () => {
    // jest-expo's "unit" project runs on Platform.OS "ios" by default (no
    // "web" here) — speech must read false without a backend call
    expect(localCapabilitiesFallback().speech).toBe(false);
  });
});
