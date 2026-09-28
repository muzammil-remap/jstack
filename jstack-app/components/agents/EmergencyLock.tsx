/**
 * EmergencyLock — Agents' "Emergency" card (AG-11/AG-12): hold the
 * button 1.2s (an early release resets the hint), then a confirm
 * dialog with four rows; confirming needs a fresh biometric assertion
 * (SEC-07) before `session.lock()` calls `POST /lock`.
 */
import React from "react";
import { Pressable } from "react-native";
import { Btn, Card, DialogVerbs, ListCard, Meta, Row, Section, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { ContractError } from "@/data/ApiAdapter";
import { assertHighRisk } from "@/lib/highRisk";
import { isUnreachable, lockWithoutServer } from "@/lib/emergencyLock";
import { useHoldToLock } from "@/lib/holdToLock";
import { touchSlop } from "@/lib/webData";
import { useSessionStore } from "@/stores/session";
import { radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { FRESH_CHECK, RECOVERY_NEEDS } from "@/lib/unlockCopy";

/** The four things an emergency lock does, in the mock's own order. */
const CONSEQUENCES = [
  "Every session and token revoked",
  "Vault frozen · agents paused · outbound tools disabled",
  "Memory and databases untouched · this device's cache wiped",
  RECOVERY_NEEDS,
] as const;

export function EmergencyLock() {
  const c = useTokens();
  const openModal = useSessionStore((s) => s.openModal);
  const modal = useSessionStore((s) => s.modal);
  const { hint, start, cancelHold } = useHoldToLock(() => openModal("emergency-confirm"), modal === "emergency-confirm");

  return (
    <Section testID="agents-lock-section" sectionId="emergency-lock" title={"Emergency"}>
      <Card style={{ marginTop: 8, borderColor: c.alert }}>
        <Txt kind="body">Emergency lock</Txt>
        <Meta style={{ marginVertical: 4 }}>
          {"A stolen phone or a suspected intrusion. Revokes every session and token, freezes the vault, pauses the agents, wipes this device's cache. Your data on the server is untouched."}
        </Meta>
        <Pressable
          testID="hold-to-lock"
          accessibilityRole="button"
          accessibilityLabel="Hold to lock"
          onPressIn={start}
          onPressOut={cancelHold}
          {...touchSlop(4, { "hold-to-lock": "1" })}
          // outlined in alert, never a saturated fill — README Buttons ("Never a
          // saturated fill, never white text") and handoff.md Agents ("'Hold to
          // lock' outlined in alert"); the mock's own `.btn.alert{color:var(--alert);
          // border-color:var(--alert)}` (ux-review D13)
          style={{ alignSelf: "flex-start", minHeight: 36, justifyContent: "center", paddingHorizontal: space[4], paddingVertical: 9, borderRadius: radius.control, borderWidth: 1, borderColor: c.alert }}
        >
          <Txt kind="body" tone="alert" weight="emphasis">Hold to lock</Txt>
        </Pressable>
        <Meta testID="hold-hint" style={{ marginTop: 6 }}>
          {hint}
        </Meta>
      </Card>
    </Section>
  );
}

export function EmergencyConfirmDialog({ onClose }: { onClose: () => void }) {
  const c = useTokens();
  const lock = useSessionStore((s) => s.lock);
  const showToast = useSessionStore((s) => s.showToast);

  // WPF-4: never silent. A refusal changes nothing (Josh's A-0 row 5) and the
  // dialog says the server's reason; a server that cannot be reached locks this
  // device, and the lock screen over the dialog says the server has not confirmed
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const confirm = async () => {
    setRefusal(null);
    try {
      const auth = await assertHighRisk();
      if (auth == null) {
        showToast(`Cancelled — the emergency lock needs ${FRESH_CHECK}`);
        return;
      }
      await lock(auth.nonce, auth.biometricAssertion);
      onClose();
    } catch (error) {
      if (isUnreachable(error)) {
        lockWithoutServer(); // not even the nonce could be fetched
        onClose();
        return;
      }
      const reason = error instanceof ContractError ? (error.reason ?? `refused (${error.status})`) : String(error);
      setRefusal(`Nothing was locked · the server said: ${reason}`);
    }
  };

  return (
    <Dialog testID="emergency-confirm" title="Emergency lock" onClose={onClose}>
      <Meta style={{ marginBottom: space[4] }}>For a stolen or unlocked phone, a compromised account or a suspected intrusion.</Meta>
      {refusal != null && (
        <Meta testID="emergency-refused" style={{ color: c.alert, marginBottom: space[4] }}>
          {refusal}
        </Meta>
      )}
      {/* R19-01: the four consequences are a LIST CARD, as mock v11 writes
          them (`card pad0 list`, four `.li` rows). Shipped as bare Text they
          had no container, so the destructive button row sat 9px below the
          last line — less than the 11px between two consecutive lines, and
          against the 14px the app's own decision cards put above their verb
          rows — and at 1366 and 1920 this was the only dialog in the set whose
          content did not reach its own panel (51% of the usable width at
          1920). Nobody had seen either, because this dialog sits behind a 1.2s
          press-and-hold and no capture pass had ever photographed it. */}
      <ListCard style={{ marginBottom: space[5] }}>
        {CONSEQUENCES.map((line, i) => (
          <Row key={line} last={i === CONSEQUENCES.length - 1}>
            <Txt kind="body" style={{ flex: 1 }}>{line}</Txt>
          </Row>
        ))}
      </ListCard>
      {/* B9-01: OUTLINED in alert, not filled with it. The pack is explicit
            — "Never a saturated fill, never white text" — handoff.md says
            "outlined in alert" twice, and mock v11's `.btn.alert` sets colour
            and border-color only. The fill also failed contrast outright: ink
            on `c.alert` measured 2.88:1 light and 2.55:1 dark at 12.5px/500,
            under even the 3:1 large-text floor.
            B-50 declared this fixed a whole stage ago and it found two of the
            three: the card and its Hold-to-lock button above are outlined,
            this dialog was not. Nothing caught it because `demo/v2/` had no
            emergency-confirm frame — the dialog is behind a 1.2s press-and-
            hold, so eighteen review rounds judged the card and never the
            dialog it opens. The capture pass now takes that frame. */}
      <DialogVerbs
        primary={
          <Btn
            testID="emergency-lock-go"
            label="Lock everything now"
            onPress={() => void confirm()}
            style={{ borderColor: c.alert }}
            textStyle={{ color: c.alert }}
          />
        }
        secondary={<Btn testID="emergency-cancel" label="Cancel" onPress={onClose} />}
      />
    </Dialog>
  );
}
