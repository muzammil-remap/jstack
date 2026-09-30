/**
 * Devices — SE-08/LK-06: lists every device with a revoke action
 * (SEC-07-gated, a fresh biometric assertion); the current device
 * can't revoke itself. Root-mounted (`modal === "devices"`).
 *
 * `lastSeen` is an instant on the wire (CONTRACT_v2.md §3 `Device`) and is
 * worded here through `formatWhen` like every other instant (rule 19). It
 * printed the ISO string until P-1 (B-72), and the iPad's fixture carried a
 * bare day key — corrected to an instant in the same commit.
 */
import React from "react";
import { View } from "react-native";
import { BtnSm, Meta, Row, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { assertHighRisk } from "@/lib/highRisk";
import { formatWhen } from "@/lib/time";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { FRESH_CHECK } from "@/lib/unlockCopy";
import { sayRefused } from "@/lib/optimistic";

export function Devices({ onClose }: { onClose: () => void }) {
  const devices = useSettingsStore((s) => s.devices);
  const revokeDevice = useSettingsStore((s) => s.revokeDevice);
  const showToast = useSessionStore((s) => s.showToast);

  const revoke = async (id: string) => {
    const auth = await assertHighRisk();
    if (auth == null) {
      showToast(`Cancelled — revoking a device needs ${FRESH_CHECK}`);
      return;
    }
    try {
      await revokeDevice(id, auth.nonce, auth.biometricAssertion);
    } catch (e) {
      sayRefused(e); // still listed: nothing was revoked
      return;
    }
    showToast("Device revoked");
  };

  return (
    <Dialog testID="devices-dialog" title="Devices" onClose={onClose}>
      {devices.map((d, i) => (
        <Row key={d.id} testID={`device-${d.id}`} last={i === devices.length - 1}>
          <View style={{ flex: 1 }}>
            <Txt>
              {d.name}
              {d.current ? " · this device" : ""}
            </Txt>
            <Meta>{`last seen ${formatWhen(d.lastSeen)}`}</Meta>
          </View>
          {!d.current && <BtnSm testID={`device-revoke-${d.id}`} label="revoke" onPress={() => void revoke(d.id)} />}
        </Row>
      ))}
    </Dialog>
  );
}
