/**
 * Appearance — Settings' "Appearance and account" card (SE-08): theme
 * segmented control, Devices summary + "manage" (opens the Devices
 * dialog), "Hide sensitive figures" (privacy blur, GL-04), Export
 * (capability-gated), and a second, compact "Hold to lock" — the mock
 * carries this control twice (here and on Agents' own Emergency card,
 * both wired to the same global hold handler), so this one reuses
 * `lib/holdToLock.ts` and the same root-mounted confirm dialog.
 */
import React from "react";
import { useDeviceStore } from "@/stores/device";
import { Pressable, View } from "react-native";
import { BtnSm, Card, Label, Meta, Row, Seg, Switch, Txt } from "@/theme/ui";
import { RESTING_HINT, useHoldToLock } from "@/lib/holdToLock";
import { useSessionStore } from "@/stores/session";
import { zoneName } from "@/lib/time";
import { useSettingsStore } from "@/stores/settings";
import { useSyncStore } from "@/stores/sync";
import { useTheme, useTokens } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import type { ThemeMode } from "@/stores/device";
import { sayRefused } from "@/lib/optimistic";

const THEMES: { key: ThemeMode; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

export function Appearance() {
  const c = useTokens();
  const { mode, setMode } = useTheme();
  const devices = useSettingsStore((s) => s.devices);
  const online = useSessionStore((s) => s.online);
  const queued = useSyncStore((s) => s.queued);
  const conflicts = useSyncStore((s) => s.conflicts);
  const privacyBlur = useDeviceStore((s) => s.privacyBlur);
  const setPrivacyBlur = useDeviceStore((s) => s.setPrivacyBlur);
  const capabilities = useSettingsStore((s) => s.capabilities);
  const openModal = useSessionStore((s) => s.openModal);
  const showToast = useSessionStore((s) => s.showToast);
  const modal = useSessionStore((s) => s.modal);
  const { hint, start, cancelHold } = useHoldToLock(() => openModal("emergency-confirm"), modal === "emergency-confirm");

  const exportAll = useSettingsStore((s) => s.exportAll);
  const doExport = async () => {
    try {
      await exportAll();
    } catch (e) {
      sayRefused(e);
      return;
    }
    showToast("Export started · you'll get a link when it's ready");
  };

  return (
    <View testID="settings-appearance">
      <Label>Appearance and account</Label>
      <Card style={{ marginTop: 8 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt>Theme</Txt>
          <Seg testID="settings-theme" options={THEMES} value={mode} onChange={setMode} width={190} />
        </Row>
        {/* TD-07 (D-1, ADR-47). Here rather than in a new "General" card: this
            is already the DEVICE card — theme, blur and hold-to-lock are all
            answers to "how does this screen behave on this phone" — and one
            line does not earn a section of its own plus two edits to
            SettingsSheet's lists. Read-only on purpose: the device already
            knows, and a zone override is the ADR's own reject. */}
        <Row style={{ justifyContent: "space-between" }}>
          <Txt>Time zone</Txt>
          <Meta testID="settings-timezone">{`${zoneName()} (this device)`}</Meta>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Txt>Devices</Txt>
            <Meta>{devices.map((d) => d.name).join(", ") || "loading…"}</Meta>
          </View>
          <Txt testID="devices-manage" onPress={() => openModal("devices")} kind="meta" tone="accentInk">
            manage
          </Txt>
        </Row>
        {/* O-2/OF-07: the count is here rather than only inside the dialog,
            because a capture that has not sent is something to notice without
            going looking for it. */}
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Txt>Sync</Txt>
            <Meta testID="settings-sync-summary">
              {queued === 0 ? (online ? "everything is on the server" : "offline · nothing waiting") : `${queued} waiting${online ? "" : " · offline"}`}
              {conflicts.length > 0 ? ` · ${conflicts.length} could not be applied` : ""}
            </Meta>
          </View>
          <Txt testID="settings-sync" onPress={() => openModal("sync")} kind="meta" tone="accentInk">
            open
          </Txt>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Txt>Hide sensitive figures</Txt>
            <Meta>money, journal, health</Meta>
          </View>
          <Switch testID="settings-privacy-blur" accessibilityLabel="Hide sensitive figures" value={privacyBlur} onValueChange={setPrivacyBlur} />
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Txt>Export everything</Txt>
            <Meta>open formats, into storage you control</Meta>
          </View>
          <BtnSm
            testID="settings-export"
            label="Export"
            {...(capabilities.export ? { onPress: () => void doExport() } : { disabledReason: "Not available in this build yet" })}
          />
        </Row>
        <Row style={{ justifyContent: "space-between" }} last>
          <View style={{ flex: 1 }}>
            <Txt>Emergency lock</Txt>
            {/* AG-1: compared to the CONSTANT, not to a hand-typed copy of it. The
                literal here was a second declaration of the hook's own sentence, and
                the comparison would have stopped matching the day either moved. */}
            <Meta testID="settings-hold-hint">{hint === RESTING_HINT ? "revokes sessions, freezes the vault, pauses agents" : hint}</Meta>
          </View>
          <Pressable
            testID="settings-hold-to-lock"
            accessibilityRole="button"
            accessibilityLabel="Hold to lock"
            onPressIn={start}
            onPressOut={cancelHold}
            style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: space[3], paddingVertical: 6, borderRadius: radius.control, borderWidth: 1, borderColor: c.alert }}
          >
            <Txt kind="meta" tone="alert" weight="emphasis">Hold to lock</Txt>
          </Pressable>
        </Row>
      </Card>
    </View>
  );
}
