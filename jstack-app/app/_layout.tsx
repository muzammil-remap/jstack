/**
 * The real root layout (row 6, ADR-10, ADR-15). After S-3 it holds only what
 * has to be at the very top of the tree: the theme, the root error boundary,
 * the Gate and the privacy shield (`PrivacyShield.tsx` since P-8, F-70), the
 * `inert` node they cover, and the two hosts — `<DialogHost />` and `<ToastHost />`.
 *
 * Everything else it used to do in line moved out and is called from here in
 * one line each: every dialog and sheet is an entry in `layout/dialogs.tsx`
 * (SM-05 — adding one touches that registry and its own component, never
 * this file), and the boot sequence and font loading are `lib/boot.ts`'s
 * `useAppBoot()` / `useAppFonts()`.
 *
 * A dialog still MUST mount at the root rather than inline in the tree that
 * opens it: `position: "absolute"` only spans the nearest positioned
 * ancestor, so one rendered inside a scrolled ScrollView covers that
 * content's box and not the viewport (BUGLOG_v2.md B-14). `DialogHost` is
 * where that root is.
 */
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { setInert } from "@/lib/webInert";
import { useAppBoot, useAppFonts } from "@/lib/boot";
import { RootBoundary } from "@/components/chrome/ErrorBoundary";
import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { FaceIDGate } from "@/components/chrome/Gate";
import { ToastHost } from "@/components/chrome/Toast";
import { DemoWatermark } from "@/components/chrome/DemoWatermark";
import { DialogHost } from "@/components/chrome/DialogHost";
import { PrivacyShield } from "@/components/chrome/PrivacyShield";
import { useOverlayOpen } from "@/layout/dialogs";
import { useSessionStore } from "@/stores/session";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

function Root() {
  const { scheme, colors } = useTheme();
  const locked = useSessionStore((s) => s.locked);
  const contentRef = useRef<View | null>(null);
  // C-3: narrower than `contentRef` — the routed screen goes inert while an overlay is open,
  // DialogHost (outside this ref) and the toast stay reachable either way.
  const stackRef = useRef<View | null>(null);
  const overlayOpen = useOverlayOpen();

  useAppBoot();

  // B7-01: the gate paints over the app, which stops a pointer and nothing else (lib/webInert.ts).
  // `inert` goes on the app content, never the gate, so the passkey button stays reachable.
  useEffect(() => {
    setInert(contentRef.current, locked);
  }, [locked]);
  useEffect(() => {
    setInert(stackRef.current, overlayOpen);
  }, [overlayOpen]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: colors.ground }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        {/* Everything the gate must cover lives inside this one node, so that
            one `inert` closes all of it: the tabs, every overlay, the Toast
            host, and the focus order that ran through all three. Only the
            gate and the privacy shield sit outside — they ARE the cover.

            B8-01: the Toast host used to be outside, and that was the whole
            defect. `toast-undo` is a live control that writes through the
            adapter, so with a task toggled and the undo toast up, an
            auto-lock left it behind an opaque gate, out of the inert
            subtree, one Tab away, and Enter on it flipped the task back and
            reached `patchTask`. The pointer was blocked and nothing was
            visible; the keyboard did not care. */}
        <View ref={contentRef} collapsable={false} style={{ flex: 1 }}>
          <View ref={stackRef} collapsable={false} style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }} />
          </View>
          <DialogHost />
          <ToastHost />
        </View>
        <FaceIDGate />
        {/* Outside the gated subtree and above the gate's layer, so it is on
            the locked screen as well as every tab (ID-02). */}
        <DemoWatermark />
        <PrivacyShield />
      </View>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  // splash holds until the faces are loaded (ADR-10)
  if (!useAppFonts()) return null;
  return (
    <ThemeProvider>
      <RootBoundary>
        <Root />
      </RootBoundary>
    </ThemeProvider>
  );
}
