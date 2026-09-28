/**
 * CapsDialog — AG-01/AG-02/SEC-07: the monthly hard stop on what each agent may
 * spend.
 *
 * Editing a cap is high-risk, so Save first asks for a fresh biometric
 * assertion (`assertHighRisk`, `lib/highRisk.ts`) bound to a server nonce; a
 * decline changes nothing and toasts the exact SEC-07 copy. Root-mounted
 * (`modal === "caps"`).
 *
 * AG-01 GAVE THE NUMBER ITS UNITS AND ITS CONTEXT. The field was a bare box
 * with a figure in it: nothing said dollars, nothing said per month, and
 * nothing said what the agent had already spent — so the one number that stops
 * an agent spending was the least informative control in the app. It reads
 * "$ [ 50 ] AUD / month · $12.40 of $50" now, and the spend comes from
 * `GET /agents/spend` (`caps[].spent`), which is the same figure the Spend card
 * shows. `GET /agents` is T-2's ROSTER and has nothing to do with money.
 *
 * THE VALIDATION IS SHOWN, NOT JUST ENFORCED. A cap must be digits and at most
 * five of them; the line says which rule was broken, per field, and Save is
 * disabled with a reason for as long as any field is wrong — never a dead
 * button, and never a silent refusal at the end of a Face ID prompt.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Btn, BtnPrimary, Field, Meta, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { assertHighRisk } from "@/lib/highRisk";
import { money } from "@/lib/money";
import { useAgentsStore } from "@/stores/agents";
import { useSessionStore } from "@/stores/session";
import { space } from "@/theme/tokens";
import { FRESH_CHECK } from "@/lib/unlockCopy";

/** Five digits: $99,999 a month is already far past anything this app is for,
 * and a cap nobody can read is a cap nobody checks. */
const MAX_DIGITS = 5;

/** Why this value is not a cap, or `null` if it is. One function, so the line
 * under the field and the reason on Save cannot disagree. */
export function capProblem(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return "A cap is a number";
  if (!/^\d+$/.test(trimmed)) return "Digits only — no symbols, no decimals";
  if (trimmed.length > MAX_DIGITS) return `That is more than ${MAX_DIGITS} digits`;
  return null;
}

export function CapsDialog({ onClose }: { onClose: () => void }) {
  const spend = useAgentsStore((s) => s.spend);
  const putCaps = useAgentsStore((s) => s.putCaps);
  const showToast = useSessionStore((s) => s.showToast);
  const [caps, setCaps] = useState<Record<string, string>>(
    Object.fromEntries((spend?.caps ?? []).map((cap) => [cap.agent, String(cap.cap)])),
  );
  const [saving, setSaving] = useState(false);

  if (spend == null) return null;

  /** the first field that is wrong, and what is wrong with it */
  const blocked = spend.caps.map((cap) => capProblem(caps[cap.agent] ?? "")).find((p) => p != null) ?? null;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const auth = await assertHighRisk();
    if (auth == null) {
      setSaving(false);
      showToast(`Cancelled — editing caps needs ${FRESH_CHECK}`);
      return;
    }
    await putCaps(
      Object.entries(caps).map(([agent, cap]) => ({ agent, cap: Number(cap) || 0 })),
      auth.nonce,
      auth.biometricAssertion,
    );
    setSaving(false);
    onClose();
  };

  return (
    <Dialog testID="caps-dialog" title="Edit caps" onClose={onClose}>
      <Meta style={{ marginBottom: space[4] }}>{"Caps are hard stops — an agent can't spend past its own."}</Meta>
      {spend.caps.map((cap) => {
        const problem = capProblem(caps[cap.agent] ?? "");
        return (
          <View key={cap.agent} style={{ marginBottom: space[3] }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
              <Txt kind="body" style={{ flex: 1 }}>
                {cap.agent}
              </Txt>
              <Meta>$</Meta>
              <Field
                testID={`caps-input-${cap.agent}`}
                // AA-03: these had no accessible name. They are the fields that
                // set an agent's SPENDING CAP, so a screen reader announcing
                // three unlabelled number boxes is the worst place in the app
                // for it.
                accessibilityLabel={`Monthly cap for ${cap.agent}, dollars`}
                value={caps[cap.agent] ?? ""}
                onChangeText={(v) => setCaps((s) => ({ ...s, [cap.agent]: v }))}
                keyboardType="numeric"
                style={{ width: 80 }}
              />
              <Meta>AUD / month</Meta>
            </View>
            <Meta testID={`caps-spent-${cap.agent}`}>
              {money(cap.spent)} of {money(cap.cap)} this month
            </Meta>
            {problem != null && (
              <Txt kind="meta" tone="alert" testID={`caps-error-${cap.agent}`}>
                {problem}
              </Txt>
            )}
          </View>
        );
      })}
      {/* S6-51: one verb row, primary first, as the completion confirm and
          every decision card lay theirs — Save had stood on top of Cancel */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[4] }}>
        <BtnPrimary testID="caps-save" label="Save" {...(blocked != null ? { disabledReason: blocked } : { onPress: () => void save() })} />
        <Btn testID="caps-cancel" label="Cancel" onPress={onClose} />
      </View>
    </Dialog>
  );
}
