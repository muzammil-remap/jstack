/**
 * Button controls (S-2 split of theme/ui.tsx, ADR-33): Btn, BtnPrimary,
 * BtnSm, and the shared disabled-reason contract every button carries.
 * Checkbox and Switch live in `./lists`, IconBtn in `./iconButton` and
 * FieldButton in `./fieldButton` (SM-03's 250-line cap). No-dead-controls
 * contract (NC-01/QA-01): a button either has a real handler or is VISIBLY
 * disabled with a reason (tapping toasts the reason) — the union below
 * makes a handler-less, reason-less button a compile error.
 *
 * `useButtonChrome` (F-35, P-7) is that contract written once. The five
 * buttons used to repeat `disabled = onPress == null`, the aria-disabled
 * patch, the hover hook, the toast-the-reason press and the disabled-reason
 * webData in their own bodies, and `Btn`/`BtnPrimary` were one component
 * with two fills. The `btn`/`btn-primary`/`btn-sm` webData markers stay on
 * the buttons — GL-05 and `e2e/matrix/theme.spec.ts` measure by them.
 *
 * `hitSlop`, not `webHitArea`, on these: RNW boxes are border-box, so on a
 * component with its own width/padding `webHitArea` either gets overridden
 * or eats the content box (AUDIT_v2.md AAA-01/AAA-02 — a Checkbox inflated
 * to a zero-size content box this way once). These are exempt from GL-05's
 * floor anyway; the pack fixes their sizes and `e2e/matrix/theme.spec.ts`
 * measures each against it.
 */
import React, { useEffect, useRef } from "react";
import { Pressable, StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";
import { pressLands, type PressPoint } from "@/lib/pressGate";
import { touchSlop, webData } from "@/lib/webData";
import { useTokens } from "@/theme/ThemeProvider";
import { hoverSurface, useHover } from "./hover";
import { fonts, misc, radius, type as typeScale } from "@/theme/tokens";
import { toast } from "@/components/chrome/Toast";

export type ButtonAction = { onPress: () => void; disabledReason?: undefined } | { onPress?: undefined; disabledReason: string };

/** react-native-web's Pressable only writes `aria-disabled` from its own
 * `disabled` prop (which we can't set — it would also drop clicks via
 * `pointerEvents: box-none`, breaking the tap-to-explain contract above).
 * Patch the DOM attribute directly so screen readers still see the state. */
export function useAriaDisabledPatch(disabled: boolean) {
  const ref = useRef<View>(null);
  useEffect(() => {
    (ref.current as unknown as { setAttribute?: (name: string, value: string) => void } | null)?.setAttribute?.(
      "aria-disabled",
      disabled ? "true" : "false",
    );
  }, [disabled]);
  return ref;
}

/**
 * The chrome every button shares (F-35): `disabled` means "no handler", the
 * aria-disabled patch, the hover state, a press that toasts the reason when
 * there is no handler, and the `disabled-reason` webData the e2e reads.
 * Typed loosely on purpose: the callers hand it the REST of their props,
 * which TypeScript widens from `ButtonAction`'s union.
 */
export function useButtonChrome(
  action: { onPress?: () => void; disabledReason?: string },
  id?: string,
): {
  disabled: boolean;
  ref: ReturnType<typeof useAriaDisabledPatch>;
  hovered: boolean;
  hoverProps: ReturnType<typeof useHover>["hoverProps"];
  onPress: (e?: PressPoint) => void;
  disabledData: Record<string, string>;
} {
  const disabled = action.onPress == null;
  const ref = useAriaDisabledPatch(disabled);
  const { hovered, hoverProps } = useHover();
  const act = action.onPress ?? (() => toast(action.disabledReason ?? "Not available yet"));
  // A4R11-01: the settle window. Every button in the app presses through here,
  // so the one rule — a press at the point of the last one, on a control that
  // has changed under it, is not aimed at this control — is written once.
  const onPress = (e?: PressPoint) => {
    if (pressLands(id, e)) act();
  };
  const disabledData: Record<string, string> = disabled ? { "disabled-reason": action.disabledReason ?? "" } : {};
  return { disabled, ref, hovered, hoverProps, onPress, disabledData };
}

type BtnProps = {
  label: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
} & ButtonAction;

/** `Btn` and `BtnPrimary` are one shape with two fills (F-35): no surface at
 * rest with a hairline, or the primary fill; CD-17 lifts either by one step
 * of the card's tint on hover. */
function BaseBtn({ primary, label, style, textStyle, testID, accessibilityLabel, ...action }: BtnProps & { primary: boolean }) {
  const c = useTokens();
  const { disabled, ref, hovered, hoverProps, onPress, disabledData } = useButtonChrome(action, testID ?? label);
  const rest = primary ? c.btnPrimaryBg : "transparent";
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-disabled={disabled}
      testID={testID}
      onPress={onPress}
      {...hoverProps}
      {...webData({ [primary ? "btn-primary" : "btn"]: "1", ...disabledData })}
      style={({ pressed }) => [
        {
          minHeight: 36,
          justifyContent: "center",
          alignItems: "center",
          padding: 9,
          borderRadius: radius.control,
          borderWidth: primary ? 0 : 1,
          borderColor: c.hairline,
          backgroundColor: (!disabled && hovered ? hoverSurface(rest, c.card) : null) ?? rest,
          opacity: disabled ? misc.disabledOpacity : pressed ? misc.pressedOpacity : 1,
        },
        style,
      ]}
    >
      <Text style={[{ fontFamily: fonts.body, fontSize: typeScale.size.body, fontWeight: String(typeScale.weight.emphasis) as TextStyle["fontWeight"], color: primary ? c.btnPrimaryFg : c.ink }, textStyle]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Btn(props: BtnProps) {
  return <BaseBtn primary={false} {...props} />;
}

export function BtnPrimary(props: BtnProps) {
  return <BaseBtn primary {...props} />;
}

export function BtnSm({ label, outlined = false, style, textStyle, testID, accessibilityLabel, ...action }: BtnProps & { outlined?: boolean }) {
  const c = useTokens();
  const { disabled, ref, hovered, hoverProps, onPress, disabledData } = useButtonChrome(action, testID ?? label);
  const rest = outlined ? "transparent" : c.btnPrimaryBg;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-disabled={disabled}
      testID={testID}
      onPress={onPress}
      {...hoverProps}
      {...touchSlop(6, { "btn-sm": "1", ...disabledData })}
      style={({ pressed }) => [
        {
          minHeight: 30,
          justifyContent: "center",
          alignItems: "center",
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: radius.control,
          // CD-17
          backgroundColor: (!disabled && hovered ? hoverSurface(rest, c.card) : null) ?? rest,
          borderWidth: outlined ? 1 : 0,
          borderColor: c.hairline,
          opacity: disabled ? misc.disabledOpacity : pressed ? misc.pressedOpacity : 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          {
            fontFamily: fonts.body,
            fontSize: typeScale.size.label,
            fontWeight: String(outlined ? typeScale.weight.regular : typeScale.weight.emphasis) as TextStyle["fontWeight"],
            color: outlined ? c.ink : c.btnPrimaryFg,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
