# NATIVE_RUNBOOK.md — building and submitting the iPhone app

Josh builds and submits the iOS app himself, on his own Apple developer account, with Xcode. No EAS, no Expo account or service (`DEPLOY.md`). The app is still written with the open-source Expo SDK modules (`expo-router`, `expo-secure-store`, `expo-speech-recognition`, and the rest) — those compile straight into the binary, and this runbook does not touch them.

## Prerequisites

- An Apple developer account (paid, for TestFlight and the App Store) and Xcode, installed from the Mac App Store.
- The bundle id is already set: `com.josh.jstack`, in `jstack-app/app.json`'s `ios.bundleIdentifier`. Nothing to change there.
- From `jstack-app/`: `npx expo prebuild --platform ios` generates the native `ios/` project from `app.json` and the installed plugins. Re-run it after any change to `app.json`'s `ios` block or plugin list — it is safe to re-run any time, since it regenerates `ios/` rather than hand-editing it.

## Build the development version

```
npx expo prebuild --platform ios
open ios/JSTACK.xcworkspace
```

In Xcode: pick a Signing Team (the Apple developer account above) under the app target's "Signing & Capabilities", pick a connected iPhone or a simulator as the run destination, and press Run. This installs straight onto the device — no TestFlight wait, no App Store review. It carries every native module the old Expo Go channel could not: on-device speech (`expo-speech-recognition`, wired behind `lib/mic.ts`'s one microphone owner — B-4), the share extension once it exists (`CONTRACT.md` Q22), and APNs push once it exists.

**Check these on the device**, against a build pointed at REMAP's own server (below), not the packaged mock (fixture data on purpose):

| Check | What to do |
|---|---|
| **Secure storage** | Open Settings › Sync first. "Secure storage is unavailable on this device — captures are sent live and held in memory only; nothing is saved offline" means this build has no working `crypto.getRandomValues`: the app runs but keeps nothing offline. `HANDOVER.md` §7, "Native crypto — what to add", says what to add (WPI-2). |
| **Face ID gate** | The app opens locked; Face ID (or the device passcode fallback) unlocks it; backgrounding and returning locks it again. `DEVICE_RUNBOOK.md` §1 is the same check on the web build — repeat it here, because native asks the OS for Face ID directly (`expo-local-authentication`, `components/chrome/Gate.tsx`) instead of running a WebAuthn ceremony, and the two paths can disagree. |
| **Microphone permission strings** | The first time the app asks for the microphone or speech recognition, iOS shows the exact sentences in `app.json`'s `ios.infoPlist`: `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`. Decline once — the app does not deep-link to Settings (the app's only `Linking.openURL` is `ExternalLinkDialog.tsx`, never reached from here); it shows `lib/mic.ts`'s own line, "Microphone permission needed — typing still works." Accept on a second install to see the normal, listening path. |
| **Native dictation** | Wired (B-4): `lib/mic.ts` holds `expo-speech-recognition`'s recogniser behind the same one-microphone owner the browser path uses — same states, same `stop()`, same exit paths, same words reaching the same callbacks. Check it the way MC-01..MC-09 check the web path: press the mic, speak, see the words land; press it again mid-sentence and confirm the first session's `stop()` released (no red dot lingering in iOS's status bar once the app backgrounds). |
| **Offline capture and replay** | `DEVICE_RUNBOOK.md` §6, on the device: flight mode, a capture that reads "Saved here · syncs when you're back online", flight mode off, the capture lands for real within a few seconds. |
| **Push** | Parked (`KNOWN_GAPS.md`): the app ships Web Push, not APNs — neither the subscription prompt nor a notification should appear natively yet. A push prompt here is new, unreviewed behaviour, not a check passing. |

## Point the build at your server

`EXPO_PUBLIC_API_BASE_URL` is read the same way `pnpm build:web` reads it, because this build runs locally, not on a remote CI service: Metro bundles the JS as part of Xcode's own build step, in this shell's environment. Set it before opening Xcode: `export EXPO_PUBLIC_API_BASE_URL=https://<your host>/api/v1` in the same terminal, then `open ios/JSTACK.xcworkspace` from it. Do this every time, in every terminal a build runs from — nothing in this repo persists it between sessions, and `.env.development` is committed (`EXPO_PUBLIC_JSTACK_TEST` only), never the place for a real host. Leaving it unset runs the build on the in-process mock, same as an unset web build. Prove the server first either way: `pnpm connect:check https://<your host>/api/v1` (D-2). A build pointed at a server that does not match the contract fails in exactly the ways the checks above are meant to catch, and a native build takes longer to iterate on than a web one.

## Submit to TestFlight and the App Store

In Xcode: select "Any iOS Device" as the destination (not a simulator, not a specific device), then Product › Archive. When the archive finishes, Xcode's Organizer opens on it automatically. "Distribute App" → "TestFlight & App Store" walks through signing with the Apple developer account and uploading. A successful upload lands the build in App Store Connect, in TestFlight, for internal testing first — Josh adds the build to an internal testing group there, in App Store Connect's own UI, not a command flag. That stays internal — never a route to an external tester without Apple's own Beta App Review.

## What this does not do

No store listing, no App Store review submission, no APNs key, no push, no share extension — those are their own rows, later. This runbook is the one step `DEPLOY.md`'s "native" section names as next and does not itself walk through: a development build on Josh's own phone, and the path from there to TestFlight.
