/**
 * Jest setup — GL-00 at the unit/component level: any console.error or
 * console.warn emitted during a test fails that test. The error/warning
 * budget is zero (build prompt hard rule).
 */

// Native-module mocks for the v1.1 additions. Reanimated's official mock keeps
// worklet-driven components renderable under Jest; the expo modules are mocked
// where a test needs behaviour (tests/mocks/), these bases just prevent
// native-binding errors on import.
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("expo-local-authentication", () => ({
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

import { setLockSource } from "@/lib/lockGate";

const forbidden: string[] = [];

beforeEach(() => {
  // CD-14 / H-1(d2): the adapter refuses every write while the session is
  // locked, and `stores/session.ts` starts locked — right for the app and
  // wrong as a default for a unit test. A store action that writes IS a user
  // acting, and a user acting means the gate is open; a test that asserts on
  // a write is describing an unlocked session whether it says so or not.
  // Tests that are ABOUT locking set it themselves.
  setLockSource(() => false);
  forbidden.length = 0;
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    forbidden.push(`console.error: ${args.map(String).join(" ")}`);
  });
  jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    forbidden.push(`console.warn: ${args.map(String).join(" ")}`);
  });
});

afterEach(() => {
  const captured = [...forbidden];
  forbidden.length = 0;
  if (captured.length > 0) {
    throw new Error(`Console error/warning budget is zero (GL-00). Captured:\n${captured.join("\n")}`);
  }
});
