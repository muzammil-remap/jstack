/**
 * Security — Settings' parameters card (L-1, LK-03, defaults table #7).
 *
 * ONE table-driven block rather than a lock control here and a task-window
 * control on Tasks and a microphone control in Voice. Josh asked for a
 * registry he and the EA can both see; scattering the six controls into the
 * sections that happen to read them would put the registry back in the code.
 *
 * Every control is generated from `data/parameters.ts`: a switch for a
 * boolean, a `Seg` of the row's `choices` where it has them, and a field that
 * takes any value inside the range. The field is not decoration — the range is
 * enforced by the SERVER, so the only way to see the honest line is to be able
 * to type a number outside it (LK-03), and a UI that could only offer legal
 * values would be testing nothing.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Field, Label, ListCard, Meta, Row, Seg, Switch, Txt } from "@/theme/ui";
import { useParametersStore } from "@/stores/parameters";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { QUEUED_META } from "@/data/transport/outbox";
import type { Parameter, ParameterKey } from "@/data/types";

export function Security() {
  const parameters = useParametersStore((s) => s.parameters);

  return (
    <View testID="settings-security">
      <Label hint="the EA can ask; only you can change">Security and behaviour</Label>
      <ListCard style={{ marginTop: 8 }}>
        {parameters.map((p, i) => (
          <ParameterRow key={p.key} p={p} last={i === parameters.length - 1} />
        ))}
      </ListCard>
    </View>
  );
}

function ParameterRow({ p, last }: { p: Parameter; last: boolean }) {
  const c = useTokens();
  const setParameter = useParametersStore((s) => s.setParameter);
  const invalid = useParametersStore((s) => s.invalid);
  const clearInvalid = useParametersStore((s) => s.clearInvalid);
  // the field's own draft: a half-typed "3" on the way to "30" must not be
  // sent, and must not be overwritten by the store on every keystroke
  const [draft, setDraft] = useState<string | null>(null);
  const key = p.key as ParameterKey;
  const reason = invalid?.key === p.key ? invalid.reason : null;
  // A4R8-02: a value on its way to the server — shown, and not yet enforced
  const pending = useParametersStore((s) => s.pending[key]);
  const pendingLine = pending === undefined ? null : `${typeof pending === "boolean" ? (pending ? "on" : "off") : `${pending} ${p.unit}`} · ${QUEUED_META}`;

  const commit = (text: string) => {
    setDraft(null);
    const n = Number(text.trim());
    // an empty or non-numeric field is not a refusal to explain, it is a
    // person who changed their mind — put the current value back
    if (text.trim() === "" || Number.isNaN(n)) {
      clearInvalid();
      return;
    }
    void setParameter(key, n);
  };

  return (
    <Row testID={`param-row-${p.key}`} last={last}>
      <View style={{ flex: 1, gap: space[1] }}>
        <Txt>{p.label}</Txt>
        <Meta>{p.help}</Meta>
        {p.unit !== "boolean" && p.choices != null && (
          <Seg
            testID={`param-seg-${p.key}`}
            options={p.choices.map((n) => ({ key: String(n), label: String(n) }))}
            value={String(p.value)}
            onChange={(v) => void setParameter(key, Number(v))}
          />
        )}
        {reason != null && (
          <Meta testID={`param-error-${p.key}`} style={{ color: c.alert }}>
            {reason}
          </Meta>
        )}
        {pendingLine != null && <Meta testID={`param-pending-${p.key}`}>{pendingLine}</Meta>}
      </View>
      {p.unit === "boolean" ? (
        <Switch testID={`param-switch-${p.key}`} accessibilityLabel={p.label} value={p.value === true} onValueChange={(v) => void setParameter(key, v)} />
      ) : (
        <Field
          testID={`param-field-${p.key}`}
          accessibilityLabel={`${p.label}, ${p.unit}`}
          value={draft ?? String(p.value)}
          onChangeText={setDraft}
          onBlur={() => draft != null && commit(draft)}
          onSubmitEditing={() => draft != null && commit(draft)}
          keyboardType="numeric"
          style={{ width: 72, marginLeft: space[3] }}
        />
      )}
    </Row>
  );
}
