const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

/**
 * Build flavours (SEC-01 / TM-01): unless this is a test-instrumented build
 * (EXPO_PUBLIC_JSTACK_TEST=1, set by tools/build-web.mjs and .env.development),
 * every import of `lib/testBuild` resolves to the no-op prod stub, so the
 * __JSTACK__ hook, Test mode and mock seams are physically absent from
 * production bundles — provable by grepping the exported bundle.
 */
// `expo start` (NODE_ENV=development) is always test-instrumented — the dev
// server is the documented debugging surface. Only production exports
// (expo export sets NODE_ENV=production) without the flag get the stub.
const isTestBuild =
  process.env.EXPO_PUBLIC_JSTACK_TEST === "1" || process.env.NODE_ENV !== "production";
if (!isTestBuild) {
  const prodStub = path.resolve(__dirname, "lib", "testBuild.prod.ts");
  const defaultResolver = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (/(^|\/)testBuild$/.test(moduleName)) {
      return { type: "sourceFile", filePath: prodStub };
    }
    return defaultResolver
      ? defaultResolver(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}

/**
 * BS-05 swap proof: `build:web:swap` sets EXPO_PUBLIC_USE_API_ADAPTER=1 and
 * `data/config` resolves to the swap flavour (ApiAdapter on, reference-server
 * base URL). Resolver swap, not env inlining — babel's env replacement is
 * cache-keyed unreliably across flavour rebuilds, the resolver is not.
 */
if (process.env.EXPO_PUBLIC_USE_API_ADAPTER === "1") {
  const swapConfig = path.resolve(__dirname, "data", "config.swap.ts");
  const prevResolver = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (/(^|\/)data\/config$/.test(moduleName) || (moduleName === "./config" && /[\\/]data[\\/]/.test(context.originModulePath ?? ""))) {
      return { type: "sourceFile", filePath: swapConfig };
    }
    return prevResolver
      ? prevResolver(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}

// Playwright creates/deletes temp dirs under e2e/.artifacts mid-run; on
// Windows, Metro's fallback watcher crashes (ENOENT on watch) when a watched
// dir vanishes. Excluding test outputs keeps `expo start` alive during e2e runs.
config.resolver.blockList = [
  ...config.resolver.blockList,
  /e2e[\\/]\.artifacts[\\/].*/,
  /playwright-report[\\/].*/,
];

module.exports = config;
