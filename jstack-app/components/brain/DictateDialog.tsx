/**
 * DictateDialog (TS-04) — "Dictate to EA", the typed-or-spoken thread.
 *
 * Was `ChatDialog` / "Chat" until V-2. The rename is the point rather than
 * decoration: "Chat" said nothing about what the surface is FOR next to a
 * button called "Talk with EA", and the two sat side by side. Dictate is the
 * one you use when you cannot or do not want to hold a conversation — you say
 * or type a thing, the EA answers in text and reads it back if you let it.
 *
 * Two things V-2 gives it beyond the name:
 *
 * - THE MIC (MC-02). It goes through `lib/mic.ts` like every other microphone
 *   in the app, with the state on the button and the transcript streaming into
 *   the field as muted text. Before this the only way in was the keyboard.
 * - THE THREAD IS THE SERVER'S (TS-04). `GET /chat/thread` on open, and
 *   `POST /chat` appends BOTH sides to it. The conversation used to live in
 *   `stores/brain.ts` alone, so it survived the modal closing and nothing
 *   else — a reload lost it, and no other surface could ever show it.
 *
 * v2.3.2 WPR-3 — Josh, 16 Sep: "Dictate to ea mic button is waaay too small. Make it a large orb centre bottom of the
 * screen like the 'talk with ea'." The button is the floating orb's own control (`OrbControl`) at Talk's size, centred
 * in the sheet's foot (`Dialog`'s `footer`: below the thread and the field, the bottom of the screen on a phone), and
 * it is held: press-in starts the dictation, release stops it, and the words still land in the field for review, as
 * the small button's did. The field keeps typing and its arrow.
 */
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { OrbControl } from "@/components/chrome/Orb";
import { stopMicFor } from "@/lib/mic";
import { Field, FieldButton, Meta, Txt } from "@/theme/ui";
import { useDictateStore } from "@/stores/dictate";
import { micIsOpen, micStateLabel, useDictation } from "@/stores/mic";
import { space } from "@/theme/tokens";
import { sayRefused } from "@/lib/optimistic";

export function DictateDialog({ onClose }: { onClose: () => void }) {
  const chat = useDictateStore((s) => s.chat);
  const sendChat = useDictateStore((s) => s.sendChat);
  const loadChatThread = useDictateStore((s) => s.loadChatThread);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState(false);
  const [holding, setHolding] = useState(false);

  // TS-04: the thread the server holds, not whatever this component happened
  // to accumulate. Fetched on open so the conversation is there when you come
  // back to it.
  useEffect(() => {
    void loadChatThread();
  }, [loadChatThread]);

  const mic = useDictation({
    purpose: "dictate",
    // A4R11-02: these words live in this component's state, so the microphone
    // goes when the dialog does — closing it is an exit path (MC-07)
    releaseOnUnmount: true,
    onInterim: (t) => {
      setInterim(true);
      setText(t);
    },
    onFinal: (t) => {
      setInterim(false);
      setText(t);
    },
  });

  // WPR-3: a hold, not a toggle. Press-in starts the sheet's dictation unless it is already open; the release stops
  // it at once — `stopMicFor` releases a session still at the permission prompt as readily as a listening one, and
  // reads no render's state, so a tap too quick for a re-render cannot start a second session
  const pressIn = () => {
    setHolding(true);
    if (!micIsOpen({ state: mic.state })) mic.toggle();
  };
  const pressOut = () => {
    setHolding(false);
    stopMicFor("dictate");
  };
  const live = mic.state !== "off" ? micStateLabel(mic.state) : null;

  const submit = () => {
    if (text.trim() === "") return;
    // not heard: said, and the words come back unless something new was typed
    void sendChat(text).catch((e: unknown) => {
      sayRefused(e);
      setText((now) => (now === "" ? text : now));
    });
    setText("");
    setInterim(false);
  };

  return (
    <Dialog
      testID="dictate-dialog"
      title="Dictate to EA"
      onClose={onClose}
      footer={
        // WPR-3: the large orb, centred at the foot of the sheet — the bottom of the screen on a phone, as Talk's is;
        // MC-02's state reads under it while the microphone is live
        <View testID="dictate-orb-block" style={{ alignItems: "center", gap: space[3] }}>
          <OrbControl
            testID="dictate-mic"
            size="large"
            holding={holding}
            accessibilityLabel={micIsOpen({ state: mic.state }) ? "Release to stop dictating" : "Hold to dictate"}
            onPressIn={pressIn}
            onPressOut={pressOut}
            data={{ "mic-state": mic.state }}
          />
          <Meta>{live ?? "Hold to dictate"}</Meta>
        </View>
      }
    >
      <View testID="dictate-thread" style={{ gap: space[3], marginBottom: space[4] }}>
        {chat.map((m, i) => (
          <View key={i} testID={`dictate-message-${i}`} style={{ alignSelf: m.from === "josh" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <Txt kind="body">{m.text}</Txt>
            {m.sources != null && m.sources.length > 0 && <Meta>{m.sources.join(" · ")}</Meta>}
          </View>
        ))}
      </View>
      <Field
        testID="dictate-input"
        value={text}
        onChangeText={setText}
        interim={interim}
        placeholder="Say it or type it"
        onSubmitEditing={submit}
        right={
          <>
            <FieldButton icon="arrow_upward" primary accessibilityLabel="Send" testID="dictate-send" {...(text.trim() === "" ? { disabledReason: "Say or type something first" } : { onPress: submit })} />
          </>
        }
      />
      {mic.error != null && (
        <Meta testID="dictate-mic-error" style={{ marginTop: 4 }}>
          {mic.error}
        </Meta>
      )}
    </Dialog>
  );
}
