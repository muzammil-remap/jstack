/**
 * Recovery instead of white screens (spec §15.11, NR-03/04). A crash with no
 * boundary anywhere unmounts the whole tree (RCA #1/#15) — this is the
 * missing piece. No PII is ever logged (SEC-14): only the error's message
 * and stack reach the console, in dev/test builds only.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import { IS_TEST_BUILD } from "@/lib/testBuild";
import { useTokens } from "@/theme/ThemeProvider";
import { type as typeScale } from "@/theme/tokens";

type BoundaryProps = {
  children: React.ReactNode;
  onError: (error: Error, reset: () => void) => void;
  renderFallback: (error: Error, reset: () => void) => React.ReactNode;
};
type BoundaryState = { error: Error | null; key: number };

class Boundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error): void {
    if (IS_TEST_BUILD || __DEV__) {
      // message/stack only — never props, state or route params (SEC-14)
      console.error("[boundary]", error.message);
    }
    this.props.onError(error, this.reset);
  }

  reset = (): void => {
    this.setState((s) => ({ error: null, key: s.key + 1 }));
  };

  render(): React.ReactNode {
    if (this.state.error) return this.props.renderFallback(this.state.error, this.reset);
    // key bump forces a full remount on reset — no stale state survives
    return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
  }
}

function RecoveryScreen({ error, onReload }: { error: Error; onReload: () => void }) {
  const c = useTokens();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }} testID="recovery-screen">
      {/* B5-03: not 600 — "Nothing is 600 except the JSTACK wordmark"
          (README Type). A heading is Source Serif 4 at 500; a primary verb
          is 500. These were the last two outside the wordmark once round 11
          enforced the same rule on the toast. */}
      <Text style={{ fontFamily: typeScale.family.heading, fontSize: 20, fontWeight: "500", color: c.ink, textAlign: "center" }}>Something broke</Text>
      {/* A4R2-10: the body family, not `monospace`. The pack has two families
          and this was a third — dev/test-gated, so it never rendered in
          production, but it was still shipped source and still a third font.
          An error message reads fine in the body face. */}
      {(IS_TEST_BUILD || __DEV__) && (
        <Text testID="recovery-message" style={{ fontSize: 12.5, fontFamily: typeScale.family.body, color: c.muted, textAlign: "center", maxWidth: 340 }}>
          {error.message}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reload app"
        testID="recovery-reload"
        onPress={onReload}
        style={{ marginTop: 8, backgroundColor: c.accent, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, minHeight: 48, justifyContent: "center" }}
      >
        <Text style={{ fontSize: 14.5, fontWeight: "500", color: c.onSelected }}>Reload app</Text>
      </Pressable>
    </View>
  );
}

/** Around <Root/> (app/_layout.tsx): the whole-app fallback. Reload clears
 * open surfaces and remounts the tree; store data itself is untouched — the
 * stores are module-level singletons that outlive any component remount. */
export function RootBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Boundary
      onError={() => {}}
      renderFallback={(error, reset) => <RecoveryScreen error={error} onReload={reset} />}
    >
      {children}
    </Boundary>
  );
}

/** Around <Overlays/> (app/_layout.tsx): a crashing modal/sheet closes
 * itself and the tab underneath stays interactive — self-heals immediately
 * (no visible fallback frame), never blocking the rest of the app.
 * TODO(v2 row 6): reconnect to session.ts's modal/sheet stack + toast. */
export function OverlayBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Boundary onError={() => {}} renderFallback={() => null}>
      {children}
    </Boundary>
  );
}
