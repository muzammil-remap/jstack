/**
 * Service-worker registration (P-1).
 *
 * Only on web, and only in a PRODUCTION build. A worker in the test build
 * would serve a cached shell to Playwright between specs and turn every
 * cache-timing question into a flake — and `IS_TEST_BUILD` is the flag that
 * already means "this bundle carries things production must not have"
 * (SEC-01), which is exactly the same distinction.
 *
 * Registration is best-effort and silent on failure: an app that will not
 * open because its offline support would not install has the priority
 * backwards.
 */
import { Platform } from "react-native";
import { IS_TEST_BUILD } from "@/lib/testBuild";

export function registerServiceWorker(): void {
  if (Platform.OS !== "web" || IS_TEST_BUILD) return;
  const nav = (globalThis as { navigator?: { serviceWorker?: { register: (u: string) => Promise<unknown> } } }).navigator;
  if (nav?.serviceWorker == null) return;
  void nav.serviceWorker.register("/sw.js").catch(() => {
    // an unregistered worker costs offline shell loading, nothing else
  });
}
