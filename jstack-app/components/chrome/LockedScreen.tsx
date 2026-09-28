/**
 * LockedScreen — the two locked-screen states (mock v11 `#lock`, line
 * 281 default / line 556 emergency), rendered by `<FaceIDGate>` once
 * `locked` is true. `LockedNormal` (LK-01): "Locked. Unlock with your
 * passkey." `LockedEmergency` (AG-12): the revoked-everything copy plus
 * a Recover form that needs the passkey (a fresh biometric assertion,
 * SEC-07) AND the recovery key (LK-05) before `POST /recover` runs.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { BtnPrimary, Field, Txt } from "@/theme/ui";
import { assertHighRisk } from "@/lib/highRisk";
import { tellServerNow, useEmergencyLockStore } from "@/lib/emergencyLock";
import { FRESH_CHECK, MOCK_SIGN_IN_LABEL, MOCK_SIGN_IN_NOTE, RECOVERY_SENTENCE, UNLOCK_LABEL, UNLOCK_SENTENCE } from "@/lib/unlockCopy";
import { useSessionStore } from "@/stores/session";
import { radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { Z } from "@/layout/zorder";

/** `onUnlock` is unused here on purpose: the whole gate backdrop
 * (`Gate.tsx`'s outer Pressable, testID "facelock") is the tap target,
 * matching its pre-row-15 tap-anywhere behaviour — this "button" is a
 * VISUAL label only. A real nested Pressable here would double-fire
 * `authenticate()` on click (RNW's onClick bubbles to the ancestor
 * Pressable), risking two concurrent WebAuthn ceremonies. */
export function LockedNormal({ gateMessage }: { gateMessage: string | null }) {
  const c = useTokens();
  const signedOut = useSessionStore((s) => s.signedOut);
  return (
    <>
      <Txt kind="wordmarkXl">JSTACK</Txt>
      {/* SH-09: a device the SERVER signed out cannot be reopened with a
          passkey, so it must not be told to try one. Two locked states, two
          sentences — the difference is the whole point. */}
      {signedOut ? (
        <Txt tone="muted" testID="locked-signed-out">
          This device was signed out.
        </Txt>
      ) : (
        <Txt tone="muted">{UNLOCK_SENTENCE}</Txt>
      )}
      <View
        testID="unlock-btn"
        style={{ paddingHorizontal: space[6], paddingVertical: 10, borderRadius: radius.control, backgroundColor: c.btnPrimaryBg }}
      >
        <Txt weight="emphasis" style={{ color: c.btnPrimaryFg }}>
          {UNLOCK_LABEL}
        </Txt>
      </View>
      {gateMessage != null && (
        <Txt testID="gate-message" kind="chip" tone="alert" style={{ maxWidth: 280, textAlign: "center" }}>
          {gateMessage}
        </Txt>
      )}
    </>
  );
}

/**
 * v2.3.1 WPN-1: the packaged mock's way in on a page that cannot run a passkey (`Gate.tsx` decides when). It sits at
 * the top of the locked screen, OUTSIDE the tap-anywhere `facelock` Pressable — a button nested in that one would run
 * its ceremony as well (see `LockedNormal` above) — clear of the gate's centre, where a tap on `facelock` lands, and of
 * the demo watermark in the bottom corner.
 */
export function MockSignIn({ onPress }: { onPress: () => void }) {
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: space[9], left: space[6], right: space[6], zIndex: Z.gate, alignItems: "center", gap: space[3] }}>
      <BtnPrimary testID="mock-sign-in" label={MOCK_SIGN_IN_LABEL} onPress={onPress} style={{ paddingHorizontal: space[6] }} />
      <Txt testID="mock-sign-in-note" kind="meta" tone="muted" style={{ maxWidth: 340, textAlign: "center" }}>
        {MOCK_SIGN_IN_NOTE}
      </Txt>
    </View>
  );
}

export function LockedEmergency() {
  const c = useTokens();
  const recover = useSessionStore((s) => s.recover);
  const showToast = useSessionStore((s) => s.showToast);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // WPF-4: locked on this device, and the server could not be reached to confirm it
  const unconfirmed = useEmergencyLockStore((s) => s.unconfirmed);
  const tell = async () => {
    const result = await tellServerNow();
    if (result === "cancelled") showToast(`Cancelled — telling the server needs ${FRESH_CHECK}`);
    else if (result === "unreachable") showToast("Still no connection · locked on this device");
    else if (result === "refused") showToast("The server did not take it · try again");
  };

  const doRecover = async () => {
    if (recoveryKey.trim() === "" || recovering) return;
    setRecovering(true);
    const auth = await assertHighRisk();
    if (auth == null) {
      setRecovering(false);
      showToast(`Cancelled — recovery needs ${FRESH_CHECK}`);
      return;
    }
    await recover(recoveryKey.trim(), auth.nonce, auth.biometricAssertion);
    setRecovering(false);
    showToast("Secrets rotated · your session restored · agents resuming one at a time");
  };

  return (
    <View testID="locked-emergency" style={{ alignItems: "center", gap: 14, maxWidth: 340 }}>
      <Txt kind="wordmarkXl">Locked</Txt>
      {unconfirmed ? (
        <>
          <Txt testID="locked-unconfirmed" tone="muted" style={{ textAlign: "center" }}>
            Locked on this device · the server has not confirmed
          </Txt>
          <BtnPrimary testID="lock-tell-server" label="Tell the server now" onPress={() => void tell()} style={{ paddingHorizontal: space[6] }} />
        </>
      ) : (
      <Txt tone="muted" style={{ textAlign: "center" }}>
        Every session and token is revoked. The vault is frozen and the agents are paused. Memory and databases are untouched.
      </Txt>
      )}
      <Txt kind="meta" style={{ textAlign: "center" }}>
        {RECOVERY_SENTENCE}
      </Txt>
      {!showForm ? (
        <BtnPrimary testID="recover-open" label="Recover" onPress={() => setShowForm(true)} style={{ paddingHorizontal: space[6] }} />
      ) : (
        <>
          <Field
            testID="recovery-key"
            value={recoveryKey}
            onChangeText={setRecoveryKey}
            placeholder="Recovery key"
            style={{ width: "100%", backgroundColor: c.card, borderColor: c.hairline }}
          />
          <BtnPrimary testID="recover-confirm" label="Confirm recovery" onPress={() => void doRecover()} style={{ paddingHorizontal: space[6] }} />
        </>
      )}
    </View>
  );
}
