# DEVICE_RUNBOOK.md — the phone check

The board runs headless Chromium at 393 px — a viewport, not a phone. This is the half hour on a real iPhone, in Safari itself (not an in-app browser), that the board cannot do: thumb reach, what the keyboard covers, a microphone, a real network, daylight. Run it before a release, and after any row that changes the shell, capture, offline behaviour or the microphone. It replaces `history/v21/DEVICE_RUNBOOK_v21.md` for the V2.2 surfaces. Every step names the acceptance ID it checks by hand (each PASS in `QA_REPORT_v22.md` §1); every quoted string is the app's own.

## Setting up

A passkey and the microphone need a secure page — the phone must reach the app over `https`; a LAN address over `http` will not unlock. Either deploy the production export to a preview host (`DEPLOY.md`), or serve the test export (`node tools/build-web.mjs`, then `pnpm serve:web` in `jstack-app/`) behind an `https` tunnel you trust. Steps marked *(test build)* need the test flavour's rig; the rest are best on the production build.

## What to check, and what "wrong" looks like

### 1. It opens locked, and locks when you leave — LK-01
- The app opens on the lock screen; the passkey (Face ID) reopens it.
- Switch to another app, or lock the phone, and come back: it is locked again at once.
- The mock: double-click `jstack-mock-v15.html` from Dropbox in Chrome, Brave or Safari; the Enter screen signs you in without a passkey ("Continue — passkeys unavailable here, mock sign-in").
- **Wrong:** anything legible behind the gate, or a return to the app without the gate.

### 2. Typing on a phone — TE-01, TE-02
- Tap Brain's capture field, then Find's: the page does not zoom — the field's text is 16 px, a step larger than the page's — and the tab bar and the orb sit just above the keyboard, stepping aside while Brain's field is open as the editor. Press Enter, or tap away: the page settles back whole, neither zoomed nor cropped. Only a phone proves this: the board's WebKit has no soft keyboard and never zooms on focus.
- Type several lines: the editor stays above the keyboard, and the send control stays visible.
- **Wrong:** a zoom on focus, the caret or the tab bar behind the keyboard, or a page left zoomed or cut off after Enter.

### 3. Dictation — MC-02, MC-07
- Tap the field's mic: it shows "Listening" while listening and "Working…" while transcribing. Words arrive in the field for review; nothing sends until you send.
- Leave mid-dictation (switch tab, lock the phone): the microphone indicator in the status bar goes out.
- Brain › "Dictate to EA" uses the same microphone: open it, start talking, switch away — the indicator goes out the same way.
- The orb floats at the bottom right over the page, faint until pressed. Press and hold it and speak: it brightens while held, the status-bar microphone comes on at the press and goes out when you lift, and what you said is filed to Brain. A quick tap files nothing. Hold it for several seconds: no text selection or copy menu appears, and the microphone stays open until you lift. In Brain › "Dictate to EA" the microphone is the large orb centred at the bottom of the screen: hold it and speak, and the words arrive in the field for you to check; lift to stop.
- Native dictation *(development build, v2.3 B-4)*: say a sentence in Brain › Dictate. The mic reads "Listening" while the phone's recogniser is open; the words arrive in the field; Stop, or locking the phone, ends it. Refuse the microphone in iOS Settings and try again: the field says "Microphone permission needed — typing still works." and still types. The Jest lane mocks the recogniser — this is the only proof a phone hears a word.
- Stop, then start again at once *(development build, v2.3 B-11)*: in Brain › Dictate tap Stop then the mic straight away; in Talk tap Mute then Unmute. The mic reads "Listening" and stays that way, and a sentence still arrives in the field. A mic that turns off by itself a moment later is the defect B-11 fixed.
- Transcription stays on the phone *(development build, v2.3 WPF-14)*: with Airplane Mode on, say a sentence in Brain › Dictate — the words still arrive. A phone that cannot transcribe on-device says "no on-device dictation" and still types. Try this on a phone set to another language too.
- **Wrong:** a status-bar mic light with nothing on screen saying the app is listening.

### 4. Talk with EA, thumb reach and the car — TS-01, TS-06
- Brain › "Talk with EA": the header has a Close before Start, and End during a session.
- Turn on car mode in Settings › Voice: controls grow to thumb size, and End stays visible on screen and on the banner while you're away from it.
- Talk in Safari *(v2.3 B-8)*: in Safari itself, not an in-app browser, open Brain › "Talk with EA" and start talking. Safari records no WebM with Opus, so the app offers MP4 audio instead (MC-09, Q19): the state reads "listening", words reach the conversation and a reply comes back, and End puts the status-bar microphone out. The board proves the choice against a browser that says it supports mp4 (TS-07) — only this step proves Safari does.
- **Wrong:** a control you have to shift your grip to reach; "listening" with nothing ever heard; a microphone light after End.

### 5. Find — GS-02
- Open Find and search "steve": results arrive grouped, each row opening its record.
- **Wrong:** a result you cannot open, or a sensitive row readable with privacy blur on.

### 6. Attach, and offline — UP-01, UP-03, SY-02
- Attach a photo to a capture: it shows as a chip under the field before send.
- Turn on flight mode: the sync dot in the header turns to pending, and the capture you send reads "Saved here · syncs when you're back online".
- Try a decision card: its verbs say "needs a connection". A large file says "needs a connection" too, and is not queued.
- Turn flight mode off: within a few seconds the queued lines go and the rows are real.
- **Wrong:** anything silently disappearing. That is the one unacceptable outcome on this page.

### 7. Share into JSTACK — UP-07
- Install the Shortcut from `HANDOVER.md` §8, share a web page to it, and confirm it lands in Brain's capture with its link.
- **Wrong:** the shared text in the page's address as `?text=` rather than after `#`.

### 8. Collapsible headings — CL-01, CL-02
- Collapse two sections on Today with their triangles, reload, and confirm both stay collapsed and nothing else moved.

### 9. Habits and Settings — LH-02, LH-03, ST-01, ST-02
- Life › Habits: the month grid and the year view read at phone width.
- Settings › Notifications: every group is a labelled row with four named switches, nothing truncated. Settings › Autonomy shows "Rules for my EA".

### 10. Daylight
- Take it outside. The muted meta lines are still readable. If not, note it in `jstack-app/design/DISCREPANCIES.md` rather than fixing it on the spot.

## Recording it

Add a dated block to `QA_REPORT_v22.md`: the device, the iOS version, one line per step — passed, or what you saw. A step not done is recorded as not done, never as passed — an unrun check is not evidence.
