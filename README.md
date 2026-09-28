# JSTACK

Josh's private personal-operations app (v2.3.2): Today, Tasks, Brain, Life, Agents. One React Native codebase, built with the open-source Expo SDK modules — no Expo account or service. Ships as a web PWA and builds for iPhone. The client is complete and runs on an in-process mock backend.

**Start at [`HANDOVER.md`](HANDOVER.md).** Everything — the plan, running it, connecting a server, the backend requirements, security, the reference files — is one document.

## See it running, without installing anything

`jstack-mock-v15.html` is the real app on fixture data, in one file. Double-click it: from disk, its lock screen offers "Continue — passkeys unavailable here, mock sign-in". Or serve it and unlock with your device's passkey: run `JSTACK_DIST=. node jstack-app/tools/serve-web.mjs 4190` and open `http://localhost:4190/jstack-mock-v15.html`.
