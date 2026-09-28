/**
 * Face ID gate — full-screen lock on every app open (GL-01, spec §2.2).
 * Native: expo-local-authentication prompts on mount. Web (§14.9 SEC-02): a
 * real passkey/WebAuthn ceremony — tap alone does not unlock. Auto-lock and
 * the privacy shield live in lib/autoLock.ts (SEC-03/04). Unlock → subtle
 * toast. Non-optional by design. Content is `LockedNormal` (LK-01) or
 * `LockedEmergency` (AG-12, row 15) depending on `session.emergency` —
 * emergency mode has its own internal Recover form/buttons, so it is NOT
 * wrapped in the outer tap-anywhere-to-unlock Pressable normal mode uses.
 *
 * v2.3.1 WPN-1: on the web, a page that cannot run a passkey ceremony at all — a file opened from disk, a browser with
 * no WebAuthn, a ceremony the browser refuses — also gets the mock's own sign-in (`MockSignIn`), and only while the
 * app runs on its in-process mock: a build pointed at a server (`USE_API_ADAPTER`) never renders it.
 */
import * as LocalAuthentication from "expo-local-authentication";
import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useSessionStore } from "@/stores/session";
import { toast } from "@/components/chrome/Toast";
import { LockedEmergency, LockedNormal, MockSignIn } from "@/components/chrome/LockedScreen";
import { USE_API_ADAPTER } from "@/data/config";
import { MOCK_SIGNED_IN_TOAST, UNLOCK_LABEL, UNLOCKED_TOAST } from "@/lib/unlockCopy";
import { passkeyCannotRunHere, webAuthnAvailable, webAuthnCeremony } from "@/lib/webauthnGate";
import { useTokens } from "@/theme/ThemeProvider";
import { Z } from "@/layout/zorder";

/** SEC-02 (Josh's A-0 row 5): said before any tap, and a tap runs no ceremony
 * behind it. A browser or device without WebAuthn used to get whatever the
 * failed ceremony threw. */
const NO_PASSKEY_SUPPORT = "This browser has no passkey support — open JSTACK in Safari, Chrome or Edge on a device with Face ID, Touch ID or Windows Hello.";

export function FaceIDGate() {
  const c = useTokens();
  const locked = useSessionStore((s) => s.locked);
  const emergency = useSessionStore((s) => s.emergency);
  const unlock = useSessionStore((s) => s.unlock);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  // WPN-1: set only where no passkey can run, and only on the in-process mock
  const [mockSignIn, setMockSignIn] = useState(false);
  const signedOut = useSessionStore((s) => s.signedOut);

  const authenticate = useCallback(async () => {
    // TODO(BACKEND: §4.1) device-bound keys + fresh biometric assertion on approval endpoints
    if (Platform.OS === "web") {
      if (!(await webAuthnAvailable())) {
        setGateMessage(NO_PASSKEY_SUPPORT);
        if (!USE_API_ADAPTER) setMockSignIn(true);
        return;
      }
      // SEC-02: a REAL passkey ceremony — a tap alone cannot unlock
      const result = await webAuthnCeremony();
      if (result === "unlocked") {
        setGateMessage(null);
        unlock();
        toast(UNLOCKED_TOAST);
      } else {
        setGateMessage("Passkey required — this browser has no usable authenticator");
        // WPN-1: the browser would not run a ceremony on this page — never offered on a build pointed at a server
        if (result === "refused" && !USE_API_ADAPTER) setMockSignIn(true);
      }
      return;
    }
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock JSTACK",
        disableDeviceFallback: false,
      });
      if (res.success) {
        unlock();
        toast(UNLOCKED_TOAST);
      }
    } catch {
      // stay locked; user can tap to retry
    }
  }, [unlock]);

  /** WPN-1: the mock's fixture session, opened the way a completed ceremony opens it */
  const signInToMock = useCallback(() => {
    setGateMessage(null);
    setMockSignIn(false);
    unlock();
    toast(MOCK_SIGNED_IN_TOAST);
  }, [unlock]);

  useEffect(() => {
    if (locked && Platform.OS !== "web") {
      authenticate();
    }
  }, [locked, authenticate]);

  // the honest state, asked on the web before anybody taps
  useEffect(() => {
    if (!locked || Platform.OS !== "web") return;
    let live = true;
    void webAuthnAvailable().then((ok) => {
      if (!live) return;
      if (!ok) setGateMessage(NO_PASSKEY_SUPPORT);
      // WPN-1: no ceremony can run on this page — the mock's own sign-in, before any tap, on the in-process mock only
      if (!USE_API_ADAPTER && (!ok || passkeyCannotRunHere())) setMockSignIn(true);
    });
    return () => {
      live = false;
    };
  }, [locked]);

  if (!locked) return null;

  // FULLY OPAQUE — the gate must block all content (GL-01, spec §2.2). The
  // mock pairs rgba(.97) with backdrop blur; without a reliable
  // cross-platform blur, opacity 1.0 is the only honest equivalent
  // (AUDIT.md D-1). It paints the ACTIVE theme's ground: the pack has no
  // exemption for the gate ("Theme follows the system", README
  // Accessibility), and the always-dark v1.2 carry-over made every
  // locked-*-light frame identical to its dark twin (ux-review D30).
  const backdropStyle = {
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: Z.gate,
    backgroundColor: c.ground,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 18,
  };

  if (emergency) {
    return (
      <View testID="facelock" style={backdropStyle}>
        <LockedEmergency />
      </View>
    );
  }

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={UNLOCK_LABEL} testID="facelock" onPress={authenticate} style={backdropStyle}>
        <LockedNormal gateMessage={gateMessage} />
      </Pressable>
      {mockSignIn && !USE_API_ADAPTER && !signedOut && <MockSignIn onPress={signInToMock} />}
    </>
  );
}
