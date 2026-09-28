/**
 * <Sens> — wraps every sensitive value app-wide (money, journal, health).
 * Privacy ON blurs all of them (GL-03, spec §2.7). A registry counts mounted
 * vs blurred instances so tests assert count(mounted) === count(blurred).
 *
 * `kind`/`tone` (SM-04): Sens can't just render `<Txt>` — the registry above
 * must count every real mount, and wrapping `Txt` in another wrapper would
 * still need its own `<Text>`-shaped props passthrough — so it applies the
 * same `useTxtStyle` a `Txt` does to its own style array instead of a call
 * site hand-writing `fontSize`.
 */
import React, { useEffect } from "react";
import { useDeviceStore } from "@/stores/device";
import { Platform, Text, TextProps, TextStyle } from "react-native";
import { create } from "zustand";
import { webData } from "@/lib/webData";
import { useTxtStyle, type TxtKind, type TxtTone, type TxtWeight } from "@/theme/ui/text";

type SensRegistry = {
  mounted: number;
  inc: () => void;
  dec: () => void;
};

export const useSensRegistry = create<SensRegistry>((set) => ({
  mounted: 0,
  inc: () => set((s) => ({ mounted: s.mounted + 1 })),
  dec: () => set((s) => ({ mounted: s.mounted - 1 })),
}));

const blurStyle: TextStyle =
  Platform.OS === "web"
    ? ({ filter: "blur(6px)", userSelect: "none" } as unknown as TextStyle)
    : ({ opacity: 0.18, textDecorationLine: "line-through" } as TextStyle);

export function Sens({
  children,
  style,
  kind,
  tone,
  weight,
  ...rest
}: TextProps & { kind?: TxtKind; tone?: TxtTone; weight?: TxtWeight }) {
  const privacy = useDeviceStore((s) => s.privacyBlur);
  const inc = useSensRegistry((s) => s.inc);
  const dec = useSensRegistry((s) => s.dec);
  const txtStyle = useTxtStyle(kind, tone, weight);

  useEffect(() => {
    inc();
    return () => dec();
  }, [inc, dec]);

  return (
    <Text
      {...rest}
      {...webData({ sens: privacy ? "blurred" : "visible" })}
      style={[kind != null ? txtStyle : null, style, privacy ? blurStyle : null]}
    >
      {children}
    </Text>
  );
}
