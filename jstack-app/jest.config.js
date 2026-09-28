/** Jest config — L2 unit (stores, lib, data) + L2n native lane (v1.2 §15.12, NR-05). */

/**
 * TZ-01 (S-5): run the whole suite somewhere that is NOT Brisbane, and not
 * UTC either.
 *
 * Every rendered date in this app goes through `lib/time.ts`, which reads
 * only UTC fields off a Brisbane-shifted instant — so the machine's own zone
 * must not be able to change a single assertion. On a developer's Brisbane
 * laptop a local-field regression is invisible; on a UTC CI runner it is
 * invisible too, because UTC and "UTC fields" agree. `America/New_York` is
 * behind UTC and half a day from Brisbane, so a local read shows up as a
 * whole day's difference rather than an hour's.
 *
 * Set here, before Jest forks its workers, because a worker inherits the
 * parent's `process.env.TZ` and Node caches the zone on first use.
 * `e2e/core/timezone.spec.ts` does the browser half in America/Los_Angeles.
 *
 * D-1 (ADR-47): the app now formats in the DEVICE's zone, so one zone is no
 * longer enough — TD-01 wants the same instant asserted to read differently in
 * two of them. `JSTACK_TZ` chooses; `board.yml` runs the suite twice, under
 * this default and under `Australia/Brisbane`. Its OWN name rather than `TZ`
 * so that a developer whose machine happens to export `TZ` still gets the
 * deliberate default, and the second run is always a decision somebody made.
 */
process.env.TZ = process.env.JSTACK_TZ ?? "America/New_York";

const shared = {
  setupFiles: ["react-native-gesture-handler/jestSetup"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  transformIgnorePatterns: [
    // row 17: tests/unit/registry.test.ts is the first Jest test to import
    // layout/registry.tsx, which pulls in expo-router -> @react-navigation
    // -> query-string -> decode-uri-component (ESM `export default`, no
    // CJS build) — the only untransformed link in that chain.
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|@noble/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|zustand|decode-uri-component)",
  ],
  // migration/ lives beside the app (a standalone deliverable); its transformed
  // output must still resolve @babel/runtime from the app's node_modules
  moduleDirectories: ["node_modules", "<rootDir>/node_modules"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@react-native-async-storage/async-storage$":
      "@react-native-async-storage/async-storage/jest/async-storage-mock",
    "^expo-secure-store$": "<rootDir>/tests/mocks/expo-secure-store.js",
  },
  clearMocks: true,
};

module.exports = {
  projects: [
    {
      displayName: "unit",
      preset: "jest-expo",
      testMatch: ["<rootDir>/tests/unit/**/*.test.ts", "<rootDir>/tests/unit/**/*.test.tsx"],
      ...shared,
    },
    {
      // v1.2 NR: every surface mounts under the iOS preset with the real
      // stores; a tree walk fails on any text under a non-Text host (the
      // bug web's react-native-web silently swallowed — RCA #2). jest-expo's
      // "ios" preset is jest-expo's own React Native, not react-native-web:
      // strings-outside-Text is a structural fact of the rendered tree here,
      // not a runtime throw, so the test walks toJSON() itself (spec §15.12).
      displayName: "native",
      preset: "jest-expo/ios",
      testMatch: ["<rootDir>/tests/native/**/*.test.ts", "<rootDir>/tests/native/**/*.test.tsx"],
      ...shared,
    },
  ],
  // AUDIT D-33: every run records its own totals into evidence/, so
  // QA_REPORT's board numbers are guarded like every other count
  reporters: ["default", "<rootDir>/tools/jest-summary-reporter.cjs"],
};
