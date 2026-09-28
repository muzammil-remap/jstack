/**
 * Entry — Brain's column-1 "entry" section: the mind-dump box (BR-01),
 * mic (VO-01) and send buttons, and Talk with EA / Dictate to EA —
 * mock v11's `brain()` bundles all four into one card block. Talk and
 * Chat open through `session.ts`'s root sheet/modal stack, never inline
 * here (BUGLOG_v2.md B-14/B-15: a Dialog/Sheet nested inside a scrolled
 * section, or behind another already-open one, is unreachable).
 */
import React from "react";
import { View } from "react-native";
import { Btn, BtnPrimary, Card, Field, FieldButton, Txt } from "@/theme/ui";
import { AttachButton, AttachChips, useAttachments, useFileDropTarget } from "@/theme/ui/attach";
import { useFilesStore } from "@/stores/files";
import { useBrainDictation, useBrainStore } from "@/stores/brain";
import { stopMicFor } from "@/lib/mic";
import { micIsOpen, micStateLabel } from "@/stores/mic";
import { useSessionStore } from "@/stores/session";
import { bp, space } from "@/theme/tokens";
import { useLayout } from "@/theme/useLayout";

export function Entry() {
  const dumpDraft = useBrainStore((s) => s.dumpDraft);
  const setDumpDraft = useBrainStore((s) => s.setDumpDraft);
  const dump = useBrainStore((s) => s.dump);
  const openSheet = useSessionStore((s) => s.openSheet);
  const openModal = useSessionStore((s) => s.openModal);
  const { width } = useLayout();
  /**
   * MC-04: the transcript streams into the FIELD, as the field's own value.
   * Before V-1 dictation filed straight to Brain without the words ever
   * appearing anywhere you could read them, let alone edit them. Interim text
   * renders muted; the final replaces it in ink and waits for the send
   * control, exactly as typed text does. The orb starts the same session.
   */
  const interim = useBrainStore((s) => s.dumpInterim);
  const mic = useBrainDictation();
  // TE-01, Josh's v3 note: the mind-dump box is the main thing on the page, so
  // it rests taller than one line — four on a phone, three where a desktop
  // window has other things in the column. `bp.tablet` (768) is the phone edge
  // the rest of the app uses, so a tablet reads as a desktop here.
  const phone = width < bp.tablet;

  /**
   * UP-01/UP-02: files chosen for THIS capture. They upload on SEND, not on
   * choose — a file attached and then abandoned should leave nothing behind on
   * the server, and the ids only mean anything once there is a capture to
   * attach them to. The drop target is the card, so a file dropped on the
   * mind-dump box lands here and one dropped elsewhere on the page does not.
   */
  const attach = useAttachments();
  const upload = useFilesStore((s) => s.upload);
  const showToast = useSessionStore((s) => s.showToast);
  const dropRef = useFileDropTarget(attach.add);

  const send = async () => {
    // MC-07 names send as an exit path and nothing built it (A4R11-02): the
    // words are away, and a microphone still listening records the room into
    // an empty field
    stopMicFor("brain");
    const ids: string[] = [];
    for (const file of attach.files) {
      const stored = await upload(file, {});
      if (stored != null) ids.push("queued" in stored ? stored.ref : stored.id);
    }
    const refused = useFilesStore.getState().uploadError;
    // The capture still goes. The words are the thing being captured, and
    // losing them because a file was too big would be the app deciding the
    // attachment mattered more than the thought.
    if (refused != null) showToast(refused);
    attach.clear();
    // W-1: a draft the capture route put here is still a SHARE, even though a
    // person is pressing send. A share arrives at a locked app, the gate
    // refuses the route's own send, and this is the tap that follows — filing
    // it as `typed` would drop the provenance and with it the extraction and
    // the triage card.
    const pending = useBrainStore.getState().shareDraft;
    await dump(pending != null ? "share" : "typed", undefined, undefined, ids.length > 0 ? ids : undefined, pending?.url);
  };

  return (
    <View testID="brain-entry-section" ref={dropRef}>
      <Card testID="brain-entry">
        <Field
          testID="dump-input"
          value={dumpDraft}
          onChangeText={setDumpDraft}
          placeholder="Mind dump · thoughts, notes, tasks, anything"
          multiline
          restLines={phone ? 4 : 3}
          // TE-06: the same action the arrow runs, so Enter on a desktop and
          // the button on a phone cannot diverge. `Field` only wires it above
          // `bp.desktop`; on touch, return stays a newline.
          onSend={dumpDraft.trim() === "" ? undefined : () => void send()}
          style={{ borderWidth: 0, padding: 0 }}
          interim={interim}
          right={
            <>
              <AttachButton variant="field" testID="dump-attach" label="Attach a file to this capture" onFiles={attach.add} />
              <FieldButton
                icon="mic"
                primary
                testID="dump-mic"
                accessibilityLabel={micIsOpen({ state: mic.state }) ? "Stop dictating" : "Dictate"}
                state={mic.state}
                label={micStateLabel(mic.state)}
                onPress={mic.toggle}
              />
              <FieldButton
                icon="arrow_upward"
                accessibilityLabel="Send"
                testID="dump-send"
                {...(dumpDraft.trim() === "" ? { disabledReason: "Type or dictate first" } : { onPress: () => void send() })}
              />
            </>
          }
        />
        {/* MC-02/MC-08: the honest line, under the field rather than on a
            30px button. An error says what went wrong and leaves the typing
            path alone; a notice says why the mic switched itself off, which
            is the thing a person is owed when it happens mid-thought. */}
        {/* UP-01: chosen, not yet sent, and each removable. */}
        <AttachChips files={attach.files} onRemove={attach.remove} testID="dump-attachments" />
        {mic.error != null && (
          <Txt kind="meta" tone="alert" testID="dump-mic-error" style={{ marginTop: 4 }}>
            {mic.error}
          </Txt>
        )}
        {mic.error == null && mic.notice != null && (
          <Txt kind="meta" testID="dump-mic-notice" style={{ marginTop: 4 }}>
            {mic.notice}
          </Txt>
        )}
      </Card>
      <View style={{ flexDirection: "row", gap: space[3], marginTop: space[3] }}>
        <View style={{ flex: 1 }}>
          <BtnPrimary testID="talk-with-ea" label="Talk with EA" onPress={() => openSheet("talk")} style={{ width: "100%" }} />
          <Txt kind="meta" style={{ marginTop: 4 }}>Two-way voice, in the app</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Btn testID="brain-dictate" label="Dictate to EA" onPress={() => openModal("brain-dictate")} style={{ width: "100%" }} />
          <Txt kind="meta" style={{ marginTop: 4 }}>Dictate; the EA replies in text</Txt>
        </View>
      </View>
    </View>
  );
}
