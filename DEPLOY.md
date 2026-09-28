# DEPLOY.md — putting JSTACK on the web

Written for whoever does this once and then not again for six months, which
will usually be Josh. It is short on purpose.

## What gets deployed

`jstack-app/` builds to a static site. There is no server: the app talks to
REMAP's backend directly over HTTPS, and until that backend exists it runs
entirely on the in-process mock (`USE_API_ADAPTER` off, see below).

```bash
cd jstack-app
pnpm install --frozen-lockfile
pnpm build:web:prod
```

The output lands in `$JSTACK_PROD_DIST` (default `~/.jstack-dist-prod`). That
directory IS the site — upload it as-is.

## The two flavours, and why the difference matters

| | `build:web` | `build:web:prod` |
|---|---|---|
| test hook (`__JSTACK__`) | present | **absent** — `SEC-01` greps the bundle to prove it |
| service worker | registered? no | yes |
| CSP `connect-src` | allows loopback, for the e2e rig | `'self'` only |

**Never deploy the test flavour.** The board's `SEC-01` step exists to make
that mistake loud rather than quiet: it fails if `__JSTACK__` appears anywhere
in the production bundle.

## Host configuration

Two files carry the same policy, because the two hosts read different ones:

- `jstack-app/public/_headers` — Netlify, Cloudflare Pages
- `jstack-app/vercel.json` — Vercel

`tests/unit/pwa.test.ts` asserts they agree. If you add a header, add it to
both or the board fails, which is the point.

Any other host needs three things:

1. **SPA rewrite** — every path that is not a real file serves `/index.html`.
   Expo Router does the routing client-side; without this, a refresh on
   `/tasks` is a 404.
2. **The headers** in `_headers`, especially the CSP and HSTS.
3. **`/sw.js` and `/manifest.webmanifest` uncached** (`Cache-Control:
   no-cache`). A cached service worker cannot replace itself, and the app
   would be stuck on an old shell until someone cleared their browser.

## Pointing it at a real backend

One file: `jstack-app/data/config.ts`. Set `EXPO_PUBLIC_API_BASE_URL` at build
time and `USE_API_ADAPTER` follows automatically.

```bash
EXPO_PUBLIC_API_BASE_URL="https://api.example.com/v1" pnpm build:web:prod
```

Then prove the backend actually matches the contract before trusting it:

```bash
node tools/conformance.mjs https://api.example.com/v1 --write evidence
```

That sweeps every GET in `data/routes.ts`, validates each response against
`openapi.yaml`, performs the safe writes, and exits non-zero on the first
disagreement. It is the difference between "the build points at the backend"
and "the backend does what the app expects".

**`httpTransport` refuses to run on a non-HTTPS origin** other than
`localhost` (`ID-03`). A build served over `http://` hands over every token it
holds however carefully it talks to the backend, so it stops instead.

## Native — what exists, what is parked, the next step

**Exists.** The iOS app is the same Expo SDK 54 codebase as the web build (`jstack-app/package.json`), written with the open-source Expo SDK modules — no Expo account or service. `jstack-app/app.json` carries the name, the bundle id `com.josh.jstack`, the Face ID usage string, and the plugins: `expo-router`, `expo-local-authentication` (the lock, `jstack-app/components/chrome/Gate.tsx`), `expo-font`, `expo-splash-screen`, `expo-secure-store` and `expo-speech-recognition` with its two permission strings. `pnpm ios` runs it in the iOS simulator on a Mac with Xcode, and the native Jest lane (`jstack-app/tests/native/`, `jest-expo/ios`) mounts the app's screens, dialogs and sheets on every push (`.github/workflows/board.yml`).

**Expo Go and EAS, retired 15 Sep** (Josh: "Delete everything expo unless it's required for the final App"): `history/expo-go/` (the old demo channel) and `history/expo-services/` (`eas.json`). Josh builds and submits with his own Apple developer account and Xcode now — `NATIVE_RUNBOOK.md`.

**Parked.** There is no store build, no TestFlight and no APNs push yet: those need the development build below and an Apple account. The iOS share extension (`CONTRACT.md` Q22) and push through APNs (the app ships Web Push, Q5) wait for that build. On-device speech (`expo-speech-recognition`) is wired (v2.3 B-4) behind `jstack-app/lib/mic.ts`'s one microphone owner — proven in the native Jest lane with the module mocked, but not yet heard on a real phone: that is a development-build check, not a code gap (`KNOWN_GAPS.md`).

**The next step.** `npx expo prebuild --platform ios`, open `ios/` in Xcode, sign with Josh's Apple developer account, and run it on his phone — a development build carrying every native module, which the share extension and APNs push both need. Everything before that is done: on-device speech is wired and waiting on a real device to hear it. `NATIVE_RUNBOOK.md` (D-8, D-9, D-11, WPO-1) walks through both steps: prerequisites, the development build and what to check on it, then the App Store build and TestFlight.

## Releasing

`.github/workflows/release.yml` runs on a `v*` tag: the full board, the
production build, the SBOM, and the built site as a release artefact. Tag only
a commit whose board is already green.

```bash
git tag v2.1.0 && git push origin v2.1.0
```

## The demo

The shared demo runs on fixtures and must never point at a real backend
(`SECURITY.md`). `DemoWatermark` renders on every tab and the locked screen
whenever the mock transport is live, and there is no setting to turn it off.

## The bundle is one file

`app.json` sets `web.output: "single"`, so Metro emits one JavaScript file — 613 KB gzipped at
V2.1 (`evidence/perf-baseline.json`, PF-04's budget). It is not split per route: `React.lazy`
defers evaluation, not a download, so the lazy-tabs row (PF-02) is recorded as a deviation.
Kept for V2.1 by Josh's decision (7 September 2026, `history/v2/NEEDS_JOSH.md`): the app is opened on
wifi and 613 KB is slow rather than broken. Splitting is a deployment decision for REMAP —
`web.output: "static"` makes Expo Router emit per-route files, which changes what is deployed
(many files, a different rewrite story) and moves the head injection in `tools/build-web.mjs`
back into `app/+html.tsx` (ADR-38). Make it once the host is chosen, not before.
