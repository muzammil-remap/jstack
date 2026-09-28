/**
 * PrivacyShield (F-70, P-8 — out of `app/_layout.tsx`, which sat at 99/100).
 * The opaque cover `lib/autoLock` raises while the app is backgrounded or
 * about to lock: outside the gated subtree and above the gate's own layer
 * (`Z.privacyShield`), so nothing on the page is readable from a task switcher
 * or a screenshot. `lib/autoLock` owns the state; this only paints it.
 */
import React from "react";
import { View } from "react-native";
import { useAutoLockStore } from "@/lib/autoLock";
import { dark } from "@/theme/tokens";
import { Z } from "@/layout/zorder";

export function PrivacyShield() {
  const shielded = useAutoLockStore((s) => s.shielded);
  if (!shielded) return null;
  return (
    <View
      testID="privacy-shield"
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: Z.privacyShield, backgroundColor: dark.ground, alignItems: "center", justifyContent: "center" }}
    />
  );
}
