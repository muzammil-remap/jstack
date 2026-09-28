/**
 * mic.ts (V-1, ADR-49) — the ONLY code in the app that opens a microphone.
 *
 * Josh: "Mic staying on and I don't know how to turn it off — this must never
 * happen." Before this file there were three ways in (dictation through
 * `lib/stt.ts`, Talk through `stores/voice.ts`, the orb) and none of them
 * called `track.stop()`, so the browser's recording indicator stayed lit after
 * every session. `stores/voice.ts` went further and discarded the stop
 * function `captureAudio` handed it.
 *
 * So: one owner, one active session, and one `stop()` that always releases
 * every track of the stream. Everything else — the field's button, the banner,
 * the health line, the document title, Talk's Mute — renders `stores/mic.ts`,
 * which this file writes. Nothing else calls `getUserMedia`,
 * `SpeechRecognition` or `MediaRecorder`; TD-07's grep guard enforces it.
 *
 * States: off → requesting → listening → transcribing → done | error.
 */
import { AppState, Platform } from "react-native";
import { useMicStore } from "@/stores/mic";
import { holdScreenAwake, releaseScreenAwake } from "@/lib/wakeLock";

export type MicPurpose = "brain" | "journal" | "dictate" | "talk";
export type MicState = "off" | "requesting" | "listening" | "transcribing" | "done" | "error";

/**
 * What a person is told when the microphone is not available here.
 *
 * Deliberately NOT exported: MC-08 pins this sentence as a literal in the
 * e2e, because a test that imports the string it is checking asserts only
 * that a constant equals itself (hard rule 11).
 */
const UNAVAILABLE_LINE = "Mic unavailable here · type instead";
/** what a refused permission says, in a browser and on a phone alike (MC-08) */
const PERMISSION_LINE = "Microphone permission needed — typing still works.";
/** WPF-14: a phone that cannot transcribe on the device is told to type, and nothing is recorded */
const OFF_DEVICE_LINE = `${UNAVAILABLE_LINE} · no on-device dictation`;

type Track = { stop: () => void };
type Stream = { getTracks: () => Track[] };

export type MicHandle = {
  readonly purpose: MicPurpose;
  /** set when the session ended in `error`; null while it is healthy */
  error: string | null;
  /** release everything. Idempotent — every exit path may call it. */
  stop: (detail?: { notice?: string }) => void;
  /** the recogniser heard something: reset the silence timer */
  heard: () => void;
};

type StartMicOptions = {
  purpose: MicPurpose;
  /** silence before the mic stops itself; `mic.autoStopSeconds` (60) */
  autoStopSeconds?: number;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  /** Talk wants the audio itself, which is what needs a MediaRecorder */
  onChunk?: (chunk: string) => void;
  onState?: (state: MicState, detail?: { reason?: string; notice?: string }) => void;
};

const DEFAULT_AUTO_STOP_SECONDS = 60;
/** v2.3.1 WPJ-1 — the tag this owner keeps the screen on under, for the life of each session */
const AWAKE_TAG = "jstack-mic";

/**
 * Resolution #9: the notice composes FROM the parameter rather than spelling
 * it, so changing `mic.autoStopSeconds` changes what the person is told. Sixty
 * reads as "a minute" because that is how people say it.
 */
export function autoStopNotice(seconds: number): string {
  return `Mic off · nothing heard for ${seconds === 60 ? "a minute" : `${seconds} seconds`}`;
}

/**
 * MC-09. Chosen with `isTypeSupported`, never assumed: Safari has no
 * webm/opus, and the hard-coded mime in `lib/voice/audio.ts` is what threw on
 * Josh's iPhone into a `.catch(() => null)` and left the session "listening"
 * with no way out.
 *
 * A `MediaRecorder` without `isTypeSupported` counts as UNSUPPORTED rather
 * than as a reason to guess (resolution #25).
 */
export function micMimeType(): string | null {
  const Rec = (globalThis as { MediaRecorder?: { isTypeSupported?: (m: string) => boolean } }).MediaRecorder;
  if (Rec == null || typeof Rec.isTypeSupported !== "function") return null;
  for (const mime of ["audio/webm;codecs=opus", "audio/mp4"]) {
    if (Rec.isTypeSupported(mime)) return mime;
  }
  return null;
}

/**
 * B-4 (v2.3) — the phone's own recogniser, behind this same owner.
 *
 * `expo-speech-recognition` was installed and configured in `app.json` and
 * imported nowhere, so on Josh's iPhone every microphone said "Mic unavailable
 * here · type instead". It is this file's native implementation now: the same
 * states, the same `stop()`, the same exit paths, and the words reach the
 * same callbacks the browser's recogniser feeds. Null in a browser, and
 * wherever the module is not in the binary (Expo Go), which leaves the web path
 * exactly as it was.
 */
type NativeRecogniser = {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  supportsOnDeviceRecognition: () => boolean;
  start: (options: { lang: string; interimResults: boolean; continuous: boolean; requiresOnDeviceRecognition: boolean }) => void;
  stop: () => void;
  addListener: (event: "start" | "result" | "error" | "end", listener: (event: unknown) => void) => { remove: () => void };
};

function nativeRecogniser(): NativeRecogniser | null {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("expo-speech-recognition") as { ExpoSpeechRecognitionModule?: NativeRecogniser }).ExpoSpeechRecognitionModule ?? null;
  } catch {
    return null;
  }
}

/**
 * WPF-14 — whether this phone transcribes without a server. The permission strings
 * promise it (`app.json`: "transcription happens on this device. Nothing leaves your
 * phone"), and the module keeps that promise only where the recogniser can: on iOS it
 * sets `requiresOnDeviceRecognition` only on a recogniser that supports it and otherwise
 * transcribes on Apple's servers (`ExpoSpeechRecognizer.swift`), and on Android it opens
 * the on-device recogniser only from API 33 (`ExpoSpeechService.kt`). So the app asks
 * first, and a phone that cannot is told to type rather than having its audio leave the phone.
 */
function transcribesOnDevice(native: NativeRecogniser): boolean {
  if (Platform.OS === "android" && Number(Platform.Version) < 33) return false;
  try {
    return native.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

/**
 * Whether this device hears WORDS rather than recording audio. Talk asks before
 * it opens its microphone (`lib/talkMic.ts`): a phone's recogniser hands over
 * text, which joins the conversation the way a typed line does, and a browser
 * records the audio for the server (§4.11).
 */
export function micHearsWords(): boolean {
  return nativeRecogniser() != null;
}

/**
 * B-11 (v2.3) — the previous recognition, until the device says it has ended.
 *
 * The device's `end` for it comes late. `stop()` only finishes a recognition: its
 * last words come back, and then its `end` (expo-speech-recognition's iOS
 * recogniser finishes the task and resets after its result; Android tears down
 * after its results the same way). A start inside that time resets the module
 * under the recognition still finishing: that one is cancelled, its `end`
 * arrives after the new `start`, and its handler then resets whatever
 * recognition is current, which is the new one. So a start waits for the
 * `end`, and `NATIVE_END_WAIT_MS` bounds the wait: a recognition that never
 * ends is treated as ended rather than holding the next microphone forever.
 */
let nativeEnding: Promise<void> | null = null;
const NATIVE_END_WAIT_MS = 1500;
/** a device still busy with an earlier recognition is asked again, this often and this far apart */
const BUSY_RETRIES = 3;
const BUSY_RETRY_MS = 300;
/** every native session's release, so the test seam can drop their listeners */
const nativeReleases = new Set<() => void>();

/** the one session, module-level so a second start can find the first */
let active: MicHandle | null = null;

export function activeMic(): MicHandle | null {
  return active;
}

/**
 * What `relock()` calls. A lock — auto, emergency, a server sign-out or
 * refresh reuse — is an exit path like any other, and it is security-class:
 * the microphone must not outlive the session that opened it.
 */
export function stopActiveMic(detail?: { notice?: string }): void {
  active?.stop(detail);
}

/**
 * Stop the session opened for `purpose` — arrived, or still at the permission
 * prompt, where `startMic` has handed nothing back to hold. Talk's End calls
 * it, so it cannot stop another purpose's microphone as `stopActiveMic` would.
 */
export function stopMicFor(purpose: MicPurpose): void {
  if (active?.purpose === purpose) active.stop();
}

/** test seam — forget the active session without touching real devices */
export function __resetMicForTests(): void {
  active = null;
  for (const release of [...nativeReleases]) release();
  nativeEnding = null;
  useMicStore.getState().clear();
}

function reasonFor(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return PERMISSION_LINE;
  }
  if (name === "NotFoundError") return `${UNAVAILABLE_LINE} · no microphone found`;
  return UNAVAILABLE_LINE;
}

/**
 * Open the microphone. NEVER rejects: a failure is a state, not an exception,
 * because every caller of this is a button someone pressed and a swallowed
 * rejection is exactly how the old code left the UI stuck in "listening".
 */
export async function startMic(opts: StartMicOptions): Promise<MicHandle> {
  // MC-01: at most one, app-wide. The second start stops the first rather
  // than refusing — the person pressed a mic button and expects a microphone.
  active?.stop();

  const seconds = opts.autoStopSeconds ?? DEFAULT_AUTO_STOP_SECONDS;
  let stream: Stream | null = null;
  let stopped = false;
  let silence: ReturnType<typeof setTimeout> | null = null;
  let recogniser: { stop: () => void } | null = null;
  let recorder: { state: string; stop: () => void } | null = null;
  /** v2.3.1 WPJ-3: this session's watch on the app leaving the screen */
  let away: { remove: () => void } | null = null;

  const emit = (state: MicState, detail?: { reason?: string; notice?: string }) => {
    useMicStore.getState().set(state, opts.purpose, detail);
    opts.onState?.(state, detail);
  };

  const handle: MicHandle = {
    purpose: opts.purpose,
    error: null,
    heard: () => armSilence(),
    stop: (detail) => {
      // idempotent: `stop()` is called by Stop, Cancel, send, navigation,
      // unmount, relock and the auto-stop, and several of those overlap
      if (stopped) return;
      stopped = true;
      if (silence != null) clearTimeout(silence);
      silence = null;
      try {
        recogniser?.stop();
      } catch {
        // already stopped; not a reason to leave the tracks open
      }
      try {
        if (recorder != null && recorder.state !== "inactive") recorder.stop();
      } catch {
        // same
      }
      releaseTracks();
      // WPJ-1: the screen may sleep again. Every way a session ends comes through this stop
      releaseScreenAwake(AWAKE_TAG);
      away?.remove();
      away = null;
      if (active === handle) active = null;
      if (handle.error == null) emit("off", detail);
    },
  };

  function releaseTracks(): void {
    // THE LINE THIS FILE EXISTS FOR
    for (const track of stream?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // a track that refuses to stop must not stop the others
      }
    }
    stream = null;
  }

  function armSilence(): void {
    if (stopped) return;
    if (silence != null) clearTimeout(silence);
    // 0 means no auto-stop. Talk passes it: a pause in a conversation is the
    // other side thinking, and that session has its own ways to end.
    if (seconds <= 0) return;
    silence = setTimeout(() => handle.stop({ notice: autoStopNotice(seconds) }), seconds * 1000);
  }

  const fail = (reason: string): MicHandle => {
    handle.error = reason;
    // release anything already opened before saying so — the failure path is
    // where a microphone was most often left on
    handle.stop();
    emit("error", { reason });
    return handle;
  };

  // The one session from the press, not from the stream. The permission prompt
  // waits as long as the person leaves it, and a session registered only once
  // its stream arrived could not be stopped while it waited: the lock, the
  // banner's Stop, the field's own button, a second start and Talk's End each
  // found nothing to stop, and the microphone opened when the prompt was
  // answered — behind a lock screen as readily as anywhere (A4R10-03's class).
  active = handle;
  emit("requesting");
  // WPJ-1 (Josh, 15 Sep): while a microphone is open the screen stays on — from the press, once per session
  holdScreenAwake(AWAKE_TAG);
  // WPJ-3 (Josh, 15 Sep: "If I lock the device, voice locks too"): the device locking or the app switching away ends
  // the session the way a pause does — the words already heard stay where they went, and nothing reopens on the way
  // back. "background" only: iOS passes through "inactive" for a permission prompt or Control Center, and the session
  // that asked must survive its own prompt
  away = AppState.addEventListener("change", (state) => {
    if (state === "background") handle.stop();
  });

  // B-4: on a phone the words come from the device's recogniser, never from
  // `getUserMedia`. A purpose that wants audio (a browser's Talk) is not
  // offered one — Talk on a phone asks for words (`micHearsWords`).
  const native = opts.onChunk == null ? nativeRecogniser() : null;
  if (native != null) {
    // WPF-14: the words stay on the phone, or the microphone does not open — before the
    // permission prompt, which would otherwise ask for a microphone that cannot be used
    if (!transcribesOnDevice(native)) return fail(OFF_DEVICE_LINE);
    let granted = false;
    try {
      granted = (await native.requestPermissionsAsync()).granted;
    } catch {
      granted = false;
    }
    // stopped while the prompt was up: nothing starts behind it (A4R10-03's class)
    if (stopped) return handle;
    if (!granted) return fail(PERMISSION_LINE);
    // B-11: after the previous recognition's `end`, never inside it
    while (nativeEnding != null) await nativeEnding;
    // stopped while it waited: nothing starts behind the stop
    if (stopped) return handle;
    recogniser = startNativeRecogniser(native, opts, handle, {
      started: () => {
        if (stopped) return;
        emit("listening");
        armSilence();
      },
      // the device is still busy with an earlier recognition: no microphone is open while it waits
      waiting: () => {
        if (!stopped) emit("requesting");
      },
      failed: (reason) => void fail(reason),
    });
    return recogniser == null ? fail(UNAVAILABLE_LINE) : handle;
  }
  const media = (globalThis as { navigator?: { mediaDevices?: { getUserMedia: (c: unknown) => Promise<Stream | null> } } }).navigator?.mediaDevices;
  if (media == null) return fail(UNAVAILABLE_LINE);

  try {
    stream = await media.getUserMedia({ audio: true });
  } catch (err) {
    // stopped while it waited: the stop has said "off", and a refusal after it is not news
    return stopped ? handle : fail(reasonFor(err));
  }
  if (stopped) {
    // ...and what the prompt granted afterwards is released at once, never opened
    releaseTracks();
    return handle;
  }
  if (stream == null) return fail(UNAVAILABLE_LINE);

  // Talk wants the audio; dictation wants the words. A purpose that wants
  // audio and has no supported mime is unavailable — it is not a session that
  // silently records nothing.
  if (opts.onChunk != null) {
    const mime = micMimeType();
    if (mime == null) return fail(UNAVAILABLE_LINE);
    try {
      recorder = startRecorder(stream, mime, opts.onChunk, handle);
    } catch {
      return fail(UNAVAILABLE_LINE);
    }
  }

  if (opts.onInterim != null || opts.onFinal != null) {
    // B-9: a recogniser that fails ends the session through `fail`, which SAYS
    // so — unless a stop got there first, whose "off" already stands
    recogniser = startRecogniser(opts, handle, (reason) => {
      if (!stopped) fail(reason);
    });
    if (recogniser == null && opts.onChunk == null) return fail(UNAVAILABLE_LINE);
  }

  emit("listening");
  armSilence();
  return handle;
}

function startRecorder(stream: Stream, mime: string, onChunk: (c: string) => void, handle: MicHandle): { state: string; stop: () => void } {
  const Rec = (globalThis as { MediaRecorder?: new (s: unknown, o: unknown) => { state: string; start: (ms: number) => void; stop: () => void; ondataavailable: ((e: { data: { size: number; arrayBuffer: () => Promise<ArrayBuffer> } }) => void) | null } }).MediaRecorder;
  if (Rec == null) throw new Error("no MediaRecorder");
  const rec = new Rec(stream, { mimeType: mime });
  rec.ondataavailable = (e) => {
    if (e.data.size === 0) return;
    handle.heard();
    void e.data
      .arrayBuffer()
      .then((buf) => onChunk(bytesToBase64(new Uint8Array(buf))))
      .catch(() => undefined);
  };
  rec.start(250);
  return rec;
}

type WebSpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string }; length: number }[] }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function startRecogniser(opts: StartMicOptions, handle: MicHandle, failed: (reason: string) => void): { stop: () => void } | null {
  const g = globalThis as { SpeechRecognition?: new () => WebSpeechRec; webkitSpeechRecognition?: new () => WebSpeechRec };
  const Ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
  if (Ctor == null) return null;
  let rec: WebSpeechRec;
  try {
    rec = new Ctor();
  } catch {
    return null;
  }
  rec.lang = "en-AU";
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = (ev) => {
    handle.heard();
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) opts.onFinal?.(r[0].transcript);
      else opts.onInterim?.(r[0].transcript);
    }
  };
  // v2.3 B-9: this set the handle's error and stopped it, and a handle with an
  // error says nothing when it stops — so the device was released and every
  // surface went on reading "listening". A silence the recogniser gave up on,
  // and an abort, end the session like any stop (as on a phone, B-4); anything
  // else ends it in error, with the reason, through the same `fail` a start uses.
  rec.onerror = (ev) => {
    if (ev.error === "no-speech" || ev.error === "aborted") handle.stop();
    else failed(ev.error === "not-allowed" ? PERMISSION_LINE : UNAVAILABLE_LINE);
  };
  try {
    rec.start();
  } catch {
    return null;
  }
  return rec;
}

/**
 * One recognition session on the device. "Listening" waits for the device's
 * own `start` — the microphone is open then, not when it was asked for. Every
 * listener the session adds goes when it ends: the module is one for the whole
 * app, and a second session must never hear the first one's words.
 *
 * B-11: they go at THIS session's `end`, not at the next session's start. The
 * words a stopped recognition hands back on its way out belong to the field
 * that asked for them, and the next session starts after that `end`
 * (`nativeEnding`), so it never receives them.
 */
function startNativeRecogniser(
  native: NativeRecogniser,
  opts: StartMicOptions,
  handle: MicHandle,
  on: { started: () => void; waiting: () => void; failed: (reason: string) => void },
): { stop: () => void } | null {
  const subs: { remove: () => void }[] = [];
  let ended = false;
  /** a stop or an error has been taken, and the device's `end` is on its way */
  let stopping = false;
  let busy = false;
  let retries = 0;
  let settle: (() => void) | null = null;
  const release = () => {
    ended = true;
    for (const sub of subs.splice(0)) sub.remove();
    nativeReleases.delete(release);
    const done = settle;
    settle = null;
    done?.();
  };
  nativeReleases.add(release);
  /** the next start waits for this recognition's `end`, or for the bound */
  const expectEnd = () => {
    if (stopping || ended) return;
    stopping = true;
    const ending: Promise<void> = new Promise((resolve) => {
      const timer = setTimeout(release, NATIVE_END_WAIT_MS);
      settle = () => {
        clearTimeout(timer);
        if (nativeEnding === ending) nativeEnding = null;
        resolve();
      };
    });
    nativeEnding = ending;
  };
  // WPF-14: on the device only (`transcribesOnDevice` has already turned away a phone that cannot)
  const begin = () => native.start({ lang: "en-AU", interimResults: true, continuous: true, requiresOnDeviceRecognition: true });
  try {
    subs.push(
      native.addListener("start", () => on.started()),
      native.addListener("result", (event) => {
        const e = event as { isFinal?: boolean; results?: { transcript?: string }[] };
        const text = e.results?.[0]?.transcript ?? "";
        handle.heard();
        if (e.isFinal) opts.onFinal?.(text);
        else opts.onInterim?.(text);
      }),
      native.addListener("error", (event) => {
        const code = (event as { error?: string }).error;
        // our own stop, and a silence, are not failures — the auto-stop says
        // why the microphone went off after a silence (MC-06)
        if (code === "aborted" || code === "no-speech") return;
        // B-11: still busy with an earlier recognition is a wait, not a failure.
        // This attempt's `end` follows, and the start is asked again after it
        if (code === "busy" && retries < BUSY_RETRIES) {
          busy = true;
          return;
        }
        // the device resets itself after an error and its `end` follows: the
        // next start waits for that one, rather than a second `end` a stop would add
        expectEnd();
        // `service-not-allowed` is a recogniser that is switched off (Siri and
        // Dictation, or the language's assets), not a refused permission
        on.failed(code === "not-allowed" ? PERMISSION_LINE : UNAVAILABLE_LINE);
      }),
      // the recogniser ended on its own — a call, Siri, the platform's own
      // limit — so the microphone is off, and the state says so
      native.addListener("end", () => {
        // B-11: the end of an attempt the device refused as busy. Ask again, after a moment
        if (busy && !stopping) {
          busy = false;
          retries += 1;
          on.waiting();
          setTimeout(() => {
            if (stopping || ended) return;
            try {
              begin();
            } catch {
              release();
              on.failed(UNAVAILABLE_LINE);
            }
          }, BUSY_RETRY_MS);
          return;
        }
        release();
        handle.stop();
      }),
    );
    begin();
  } catch {
    release();
    return null;
  }
  return {
    // `stop()`, not `abort()`: the device hands back the words it has already
    // heard as one last `result` — the end of the sentence being dictated — and
    // its `end` then removes the listeners. Until that `end`, the next start
    // waits (B-11)
    stop: () => {
      if (stopping || ended) return;
      expectEnd();
      try {
        native.stop();
      } catch {
        release();
      }
    },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return typeof btoa === "function" ? btoa(s) : "";
}
