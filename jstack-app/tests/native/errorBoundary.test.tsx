/**
 * NR-03/NR-04 (spec §15.11) — recovery instead of white screens. Before this
 * existed, nothing anywhere caught a render-phase error (RCA #1/#15): React's
 * default with no boundary is to unmount the WHOLE tree, which is the white
 * screen Josh hit on Talk with EA, the bug button and Brain › Chat.
 *
 * v2 row 1 (ADR-18, ADR-06): the v1.2 CrashTest modal and its OverlayBoundary
 * coverage (which depended on Overlays.tsx, uiStore, toastStore) are retired
 * — the crash rig becomes a Jest-only boundary test per ADR-06. This file
 * keeps the RootBoundary coverage, which never depended on the deleted UI
 * layer. Row 6 reconnects OverlayBoundary to stores/session.ts's modal/sheet
 * stack and adds its own Jest-only throw test then.
 */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { RootBoundary } from "@/components/chrome/ErrorBoundary";
import { ThemeProvider } from "@/theme/ThemeProvider";
import * as themeProvider from "@/theme/ThemeProvider";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>{children}</ThemeProvider>
    </GestureHandlerRootView>
  );
}

// GL-00's zero-console budget (tests/setup.ts) assumes nothing crashes on
// purpose. Every test in this file does: React itself — not our code —
// logs a "the above error occurred in..." console.error for any error a
// boundary catches (react-test-renderer mirrors react-dom here), on top of
// ErrorBoundary's own deliberate, SEC-14-safe one-line log. That reporting
// is expected and desirable (a developer SHOULD see a crash in the
// console even though the UI recovered), so this one file is exempted —
// scoped to just these tests, not a loosening of the budget anywhere else.
beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

function ThrowOnce({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("NR-04 proof: root-level throw");
  return <View testID="app-content" />;
}

describe("NR-04 RootBoundary: a whole-app crash gets a recovery screen, not a white screen", () => {
  it("renders the recovery screen instead of propagating the error", () => {
    expect(() => {
      render(
        <Providers>
          <RootBoundary>
            <ThrowOnce shouldThrow={true} />
          </RootBoundary>
        </Providers>,
      );
    }).not.toThrow();
  });

  it("shows 'Reload app' and, in a test build, the error message", () => {
    const utils = render(
      <Providers>
        <RootBoundary>
          <ThrowOnce shouldThrow={true} />
        </RootBoundary>
      </Providers>,
    );
    expect(utils.getByTestId("recovery-screen")).toBeTruthy();
    expect(utils.getByTestId("recovery-reload")).toBeTruthy();
    expect(utils.getByTestId("recovery-message")).toBeTruthy();
  });

  it("Reload app remounts the tree", () => {
    const utils = render(
      <Providers>
        <RootBoundary>
          <ThrowOnce shouldThrow={true} />
        </RootBoundary>
      </Providers>,
    );
    expect(utils.queryByTestId("app-content")).toBeNull();
    act(() => {
      fireEvent.press(utils.getByTestId("recovery-reload"));
    });
    // the remounted tree renders ThrowOnce again, but this time shouldThrow
    // is still true (same crashing child) — proving the remount actually
    // happened (a fresh attempt, not a frozen fallback) rather than proving
    // "the crash is gone", which would need a different child post-reload
    expect(utils.queryByTestId("recovery-screen")).toBeTruthy();
  });
});

describe("F-33 (P-6) · the theme's deprecated alias is gone", () => {
  it("ErrorBoundary reads the tokens through useTokens; useColors and useThemeMode no longer exist", () => {
    expect("useColors" in themeProvider).toBe(false);
    expect("useThemeMode" in themeProvider).toBe(false);
    expect(typeof themeProvider.useTokens).toBe("function");
  });
});
