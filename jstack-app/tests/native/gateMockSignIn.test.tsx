/**
 * v2.3.1 WPN-1 — Josh, 15 Sep: "I can't open the mock 14 or mock 15 in html. Saying 'this browser has no
 * authenticator'. … make sure the mock html can be opened on chrome, brave and safari browsers. It's a mock."
 *
 * The packaged mock is opened from Dropbox as a file, and a file page cannot run a passkey ceremony: Chrome and Brave
 * keep `PublicKeyCredential` there and refuse the ceremony itself (a SecurityError for the file's opaque origin), and a
 * browser with no WebAuthn has no `PublicKeyCredential` at all. The gate keeps its honest sentence; when the app runs
 * on its in-process mock — and only then — it also offers the mock's own sign-in, which opens the fixture session. A
 * build pointed at a server (`USE_API_ADAPTER`) never shows it. The gate's web branch is under test, so `Platform.OS`
 * is set here the way `tests/unit/micAwake.test.ts` sets it, and B-17's rule holds: every browser global is created
 * here, never assumed.
 */
import React from "react";
import { Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import TodayScreen from "@/app/(tabs)/index";
import { FaceIDGate } from "@/components/chrome/Gate";
import * as config from "@/data/config";
import { reset as resetDb } from "@/data/mock/db";
import { useSessionStore } from "@/stores/session";
import { ThemeProvider } from "@/theme/ThemeProvider";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <GestureHandlerRootView>
        <ThemeProvider>{children}</ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

/** the stores load through the adapter, and the gate asks the page before anybody taps */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 24; i++) await Promise.resolve();
  });
}

const g = globalThis as Record<string, unknown>;
const KEYS = ["PublicKeyCredential", "isSecureContext", "navigator", "localStorage", "crypto"];
const saved: Record<string, unknown> = {};
const ORIGINAL_OS = Platform.OS;

beforeEach(() => {
  for (const k of KEYS) saved[k] = g[k];
  Platform.OS = "web";
  resetDb();
  useSessionStore.setState({ locked: true, emergency: false, signedOut: false, toast: null });
});

afterEach(() => {
  Platform.OS = ORIGINAL_OS;
  for (const k of KEYS) {
    if (saved[k] === undefined) delete g[k];
    else g[k] = saved[k];
  }
  useSessionStore.setState({ locked: false, toast: null });
  jest.restoreAllMocks();
});

/** a browser with no WebAuthn, on a page that is not a secure context (a file opened from disk) */
function pageWithNoPasskeys(): void {
  delete g.PublicKeyCredential;
  g.isSecureContext = false;
  g.navigator = {};
}

describe("WPN-1 · on a page that cannot run a passkey, the packaged mock signs in with its fixture session", () => {
  it("no PublicKeyCredential and no secure context, on the in-process mock: the mock sign-in is offered before any tap, beside the honest sentence, and it opens Today", async () => {
    pageWithNoPasskeys();
    const gate = render(
      <Providers>
        <FaceIDGate />
      </Providers>,
    );
    await flush();
    expect(gate.getByTestId("gate-message")).toHaveTextContent(/no passkey support/);
    await waitFor(() => expect(gate.getByTestId("mock-sign-in")).toBeTruthy());
    expect(gate.getByTestId("mock-sign-in-note")).toBeTruthy();

    fireEvent.press(gate.getByTestId("mock-sign-in"));
    await flush();
    expect(useSessionStore.getState().locked).toBe(false);
    expect(gate.queryByTestId("facelock")).toBeNull();
    expect(gate.queryByTestId("mock-sign-in")).toBeNull();
    gate.unmount();

    // what opens is the fixture session: Today's own fixture cards render on the unlocked app
    Platform.OS = ORIGINAL_OS;
    const today = render(
      <Providers>
        <TodayScreen />
      </Providers>,
    );
    await flush();
    expect(today.queryAllByText(/then proposes 1/).length).toBeGreaterThan(0);
    today.unmount();
  });

  it("the same page with the API adapter live (a build pointed at a server): the honest sentence only, and a tap leaves it locked", async () => {
    pageWithNoPasskeys();
    jest.replaceProperty(config, "USE_API_ADAPTER", true);
    const gate = render(
      <Providers>
        <FaceIDGate />
      </Providers>,
    );
    await flush();
    expect(gate.getByTestId("gate-message")).toHaveTextContent(/no passkey support/);
    fireEvent.press(gate.getByTestId("facelock"));
    await flush();
    expect(gate.queryByTestId("mock-sign-in")).toBeNull();
    expect(useSessionStore.getState().locked).toBe(true);
    gate.unmount();
  });

  it("a ceremony the page refuses — the SecurityError a file page throws in Chrome and Brave — offers the mock sign-in after the tap, and it opens the app", async () => {
    g.PublicKeyCredential = function PublicKeyCredential() {};
    g.isSecureContext = true;
    const refuse = () => Promise.reject(Object.assign(new Error("The operation is insecure."), { name: "SecurityError" }));
    g.navigator = { credentials: { create: refuse, get: refuse } };
    const stored = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) };
    if (typeof (saved.crypto as { getRandomValues?: unknown } | undefined)?.getRandomValues !== "function") {
      g.crypto = (require("node:crypto") as { webcrypto: unknown }).webcrypto;
    }
    const gate = render(
      <Providers>
        <FaceIDGate />
      </Providers>,
    );
    await flush();
    expect(gate.queryByTestId("mock-sign-in")).toBeNull();

    fireEvent.press(gate.getByTestId("facelock"));
    await flush();
    expect(gate.getByTestId("gate-message")).toHaveTextContent("Passkey required — this browser has no usable authenticator");
    expect(gate.getByTestId("mock-sign-in")).toBeTruthy();

    fireEvent.press(gate.getByTestId("mock-sign-in"));
    await flush();
    expect(useSessionStore.getState().locked).toBe(false);
    gate.unmount();
  });

  it("a page that can run a passkey (a secure context with the credentials API) offers nothing before a tap", async () => {
    g.PublicKeyCredential = function PublicKeyCredential() {};
    g.isSecureContext = true;
    g.navigator = { credentials: {} };
    const gate = render(
      <Providers>
        <FaceIDGate />
      </Providers>,
    );
    await flush();
    expect(gate.queryByTestId("mock-sign-in")).toBeNull();
    expect(gate.queryByTestId("gate-message")).toBeNull();
    gate.unmount();
  });
});
