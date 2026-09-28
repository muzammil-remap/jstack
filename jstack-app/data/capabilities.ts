/**
 * Capabilities (CONTRACT_v2.md §4.9 `GET /capabilities`, ADR-16). Every
 * screen that would otherwise fake a live feature reads this instead of
 * guessing: Brain's Talk with EA sheet (`liveVoice`), the calendar's Week/
 * Month segments (`calendarViews`), Settings › Export (`export`), Life ›
 * Health (`healthFeed`). `speech` is the one flag decided on-device, not by
 * the backend (browser `speechSynthesis`, ADR-14) — everything else has a
 * conservative local fallback so a fresh app with no session yet still
 * renders an honest "not available" instead of crashing on `undefined`.
 */
import { Platform } from "react-native";
import { getAdapter } from "./provider";
import type { Capabilities } from "./types";

/** Used before the first `GET /capabilities` resolves, and if it fails. */
export function localCapabilitiesFallback(): Capabilities {
  const web = Platform.OS === "web";
  const hasSpeechSynthesis = web && typeof globalThis !== "undefined" && "speechSynthesis" in globalThis;
  return {
    liveRouting: false,
    liveVoice: false,
    speech: hasSpeechSynthesis,
    fileStore: false,
    calendarWrite: false,
    moneyFeed: false,
    healthFeed: false,
    export: false,
    // design/DISCREPANCIES.md / V2_DECISIONS.md "Inputs checked": the brief
    // says week/month calendar views ship on by default in V2.0 — the flag
    // exists so Help › "what works in this build" can still list it
    // (BUGLOG_v2.md A-07: not itself named in CONTRACT_v2.md §3's Capabilities
    // list, which the contract calls "extended" from v1.2, not exhaustive).
    calendarViews: true,
  };
}

export async function getCapabilities(): Promise<Capabilities> {
  try {
    return await getAdapter().getCapabilities();
  } catch {
    return localCapabilitiesFallback();
  }
}
