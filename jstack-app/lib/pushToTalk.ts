/**
 * v2.3.2 WPR-2 — the orb's push-to-talk: one Brain session per hold. Josh, 16 Sep: "Confirm this is push to talk,
 * and mic turns off when button released. Should do the same thing as 'dictate to ea' on brain tab."
 *
 * Press-in opens the microphone through the one owner (`lib/mic.ts`, so keep-awake, the lock rules and the release on
 * every exit path come with it). Release closes it, and whatever it heard is filed through `POST /brain/dump` as
 * `source: "voice"` — the store's own `dump`, so the offline queue and the toast are the ones every capture gets. A
 * release inside `PTT_MIN_HOLD_MS` is a tap, not a hold: the microphone closes and nothing is filed; a hold that heard
 * nothing files nothing. A draft typed into the dump field is never touched: the words go straight to Brain.
 */
import { useCallback, useRef, useState } from "react";
import { startMic, stopMicFor } from "@/lib/mic";
import { useBrainStore } from "@/stores/brain";
import { micIsOpen, useMicStore } from "@/stores/mic";
import { currentParameter } from "@/stores/parameters";
import { useSessionStore } from "@/stores/session";

/** shorter than this, a press is a tap and files nothing */
const PTT_MIN_HOLD_MS = 250;

export function useBrainPushToTalk(): { holding: boolean; pressIn: () => void; pressOut: () => void } {
  const [holding, setHolding] = useState(false);
  const heard = useRef("");
  const pressedAt = useRef(0);

  const pressIn = useCallback(() => {
    heard.current = "";
    pressedAt.current = Date.now();
    setHolding(true);
    void startMic({
      purpose: "brain",
      autoStopSeconds: Number(currentParameter("mic.autoStopSeconds")),
      onInterim: (text) => {
        heard.current = text;
      },
      onFinal: (text) => {
        heard.current = text;
      },
    });
  }, []);

  const pressOut = useCallback(() => {
    setHolding(false);
    const tap = Date.now() - pressedAt.current < PTT_MIN_HOLD_MS;
    stopMicFor("brain");
    const file = () => {
      const text = heard.current.trim();
      heard.current = "";
      if (tap || text === "") return;
      // WPR-6 (the audit's R5-05): the write is refused while the session is locked (lib/lockGate.ts) — a device lock or
      // leaving the app mid-hold, the emergency lock, a relock — and the refusal used to be an unhandled rejection: no
      // toast, no draft, the spoken words gone. The words stay, as Brain's own draft, and the toast says so; the next
      // unlock finds them in the field. A throw for any other reason keeps them the same way.
      void useBrainStore
        .getState()
        .dump("voice", text)
        .catch(() => {
          // WPR-9 (the audit's R5b-01): a draft already in the field keeps its place and the words join it on a new
          // line — nothing spoken is dropped either way — and the toast names the real reason
          const brain = useBrainStore.getState();
          const draft = brain.dumpDraft.trim();
          brain.setDumpDraft(draft === "" ? text : `${brain.dumpDraft.replace(/\s+$/, "")}\n${text}`);
          const session = useSessionStore.getState();
          session.showToast(session.locked || session.emergency ? "Locked · your words are kept in Brain" : "Not sent · your words are kept in Brain");
        });
    };
    // the last words can arrive after the stop — a recording is transcribed once it ends — so the filing waits for
    // the session to close rather than for the finger to lift
    if (!micIsOpen(useMicStore.getState())) {
      file();
      return;
    }
    const unsubscribe = useMicStore.subscribe((s) => {
      if (micIsOpen(s)) return;
      unsubscribe();
      file();
    });
  }, []);

  return { holding, pressIn, pressOut };
}
