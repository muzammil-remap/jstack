/**
 * ExternalLinkDialog — the confirmation every outbound link goes through
 * before leaving the app (TD-04's "google" link today; Tasks' "open in
 * Twenty" and Agents' portal tiles reuse this in later rows). Nothing
 * opens without this step — SEC-15 territory even though a page view
 * isn't itself a send/pay/book verb.
 */
import React from "react";
import { Linking } from "react-native";
import { Btn, BtnPrimary, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { space } from "@/theme/tokens";

export function ExternalLinkDialog({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  return (
    <Dialog testID="external-link-dialog" title="Leaving JSTACK" onClose={onClose}>
      <Txt>Open {label} in a new tab?</Txt>
      <Txt kind="meta" style={{ marginTop: 4 }}>{url}</Txt>
      <BtnPrimary
        testID="external-link-open"
        label="Open"
        style={{ marginTop: space[5], alignSelf: "flex-start" }}
        onPress={() => {
          void Linking.openURL(url);
          onClose();
        }}
      />
      <Btn testID="external-link-cancel" label="Cancel" style={{ marginTop: space[2], alignSelf: "flex-start" }} onPress={onClose} />
    </Dialog>
  );
}
