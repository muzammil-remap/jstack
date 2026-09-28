/**
 * Test-build gateway — the ONLY door to test-only capability (SEC-01, TM-01).
 *
 * Metro swaps this module for `testBuild.prod.ts` on production exports
 * (see metro.config.js), so everything reached through here — the __JSTACK__
 * state hook, Test mode, mock seams — is physically absent from the
 * production bundle, not merely gated at runtime. SEC-01/TM-01 grep the
 * built bundle to prove it.
 */
export { installTestHook } from "@/lib/testHook";

/** True in test-instrumented builds; the prod flavour exports false. */
export const IS_TEST_BUILD = true;
