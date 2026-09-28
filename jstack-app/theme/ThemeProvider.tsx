/**
 * Theme mode reads stores/settings.ts (ADR-04), which persists it through
 * lib/encryptedStore.ts (ADR-16: "theme mode and privacy blur are per-
 * device local", never the server). `auto` follows the device/browser
 * scheme live; `light`/`dark` override for the session and persist across
 * reloads. On web, `useLayoutEffect` paints `data-theme` and the ground
 * colour onto `<html>`/`<body>` before the browser's first paint, so a
 * stored dark preference never flashes light (GL-03).
 */
import React, { createContext, useContext, useEffect, useLayoutEffect } from "react";
import { Platform, useColorScheme } from "react-native";
import { useDeviceStore, type ThemeMode } from "@/stores/device";
import { dark, light, ThemeName, Tokens } from "./tokens";

export type { ThemeMode };

type ThemeContextValue = {
  scheme: ThemeName;
  colors: Tokens;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  scheme: "light",
  colors: light,
  mode: "auto",
  setMode: () => {},
});

function paintWebGround(scheme: ThemeName, colors: Tokens): void {
  if (Platform.OS !== "web") return;
  const doc = (globalThis as unknown as { document?: { documentElement: { dataset: Record<string, string>; style: { backgroundColor: string } }; body?: { style: { backgroundColor: string } } } }).document;
  if (!doc) return;
  doc.documentElement.dataset.theme = scheme;
  doc.documentElement.style.backgroundColor = colors.ground;
  if (doc.body) doc.body.style.backgroundColor = colors.ground;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme(); // follows device; live on web via matchMedia
  const mode = useDeviceStore((s) => s.themeMode);
  const setMode = useDeviceStore((s) => s.setThemeMode);
  const hydrateLocal = useDeviceStore((s) => s.hydrateLocal);

  useEffect(() => {
    void hydrateLocal();
  }, [hydrateLocal]);

  const scheme: ThemeName = mode === "auto" ? (system === "dark" ? "dark" : "light") : mode;
  const colors = scheme === "dark" ? dark : light;

  useLayoutEffect(() => {
    paintWebGround(scheme, colors);
  }, [scheme, colors]);

  return <ThemeContext.Provider value={{ scheme, colors, mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** The active theme's colour tokens. */
export function useTokens(): Tokens {
  return useContext(ThemeContext).colors;
}

