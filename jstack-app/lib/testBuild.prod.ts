/**
 * Production flavour of the test-build gateway (see testBuild.ts).
 * Metro resolves `@/lib/testBuild` here on production exports, so no
 * test-only module is reachable from — or bundled into — a prod build.
 */
export function installTestHook(): void {
  // no-op: production builds carry no state hook (SEC-01)
}

export const IS_TEST_BUILD = false;
