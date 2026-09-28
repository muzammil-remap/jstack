/**
 * ChipSetForm — the FORM half of `ChipSetEditDialog` (S-3, split at LG-1).
 *
 * The dialog was at 222 of its 250 lines when goals needed a third field kind,
 * and the split is a real seam rather than a place to put lines: the dialog
 * owns "a named set the person edits" — the list, the add, the remove, the
 * save — and this owns what one member's form looks like. Every testID is
 * still derived from the one prefix, so nothing a spec pins moved.
 *
 * THREE FIELD KINDS, and the vocabulary is deliberately narrow. What a caller
 * configures is which fields exist and where their values live; HOW a field
 * behaves is decided here, so a later set cannot quietly grow a different
 * grammar for the same gesture — the defect A-11 found in three dialogs with
 * three verb rows.
 *
 *   text       a `Field` with a placeholder
 *   checklist  a column of boxes; the caller decides whether it is one choice
 *              or several by what its `write` does with the array
 *   date       a `DateTimeField` in `dateOnly` mode, exchanging DAY KEYS with
 *              the caller rather than instants (LG-1)
 *
 * `date` speaks day keys because that is what the records carry — a goal's
 * `targetDate`, a range bound — and `DateTimeField` speaks instants. The
 * conversion lives here, once, and uses `atTime(key, 0)` rather than
 * `new Date(key)`: a day key parsed as a date is UTC midnight, which is the
 * previous evening anywhere behind UTC (B-19).
 */
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Btn, BtnPrimary, DateTimeField, Field, Meta, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { atTime, dayKey } from "@/lib/time";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import type { ChipSetCopy, ChipSetField, ChipSetItem } from "@/components/settings/chipSet";

export function ChipSetForm<T extends ChipSetItem>({
  prefix,
  copy,
  fields,
  item,
  extra,
  onSave,
  onCancel,
}: {
  prefix: string;
  copy: ChipSetCopy;
  fields: ChipSetField<T>[];
  item?: T;
  /** rendered above the fields when ADDING — LH-07's "or bring one back" */
  extra?: React.ReactNode;
  onSave: (draft: Partial<T>) => void;
  onCancel: () => void;
}) {
  const c = useTokens();
  const [draft, setDraft] = useState<Partial<T>>(() => (item ?? {}) as Partial<T>);

  const valueOf = (field: ChipSetField<T>) => field.read(draft);
  const set = (field: ChipSetField<T>, value: string | string[]) => setDraft((d) => field.write(d, value));

  /** the first required field left empty, and the reason it gives — narrowed
   * to a string here so `BtnPrimary`'s "either onPress or a reason" union
   * holds, which is what stops a disabled button with nothing to say */
  const blockedReason = fields.find((f) => f.requiredReason != null && String(valueOf(f) ?? "").trim() === "")?.requiredReason;

  return (
    <Dialog testID={`${prefix}-form`} title={item != null ? copy.formTitle.edit : copy.formTitle.add} onClose={onCancel}>
      {extra}
      {fields.map((field) => (
        <FormField key={field.id} prefix={prefix} field={field} value={valueOf(field)} onChange={(v) => set(field, v)} hairline={c.hairline} accentSoft={c.accentSoft} />
      ))}
      <View style={{ flexDirection: "row", gap: space[2] }}>
        <BtnPrimary
          testID={`${prefix}-save`}
          label="Save"
          {...(blockedReason != null ? { disabledReason: blockedReason } : { onPress: () => onSave(draft) })}
        />
        <Btn testID={`${prefix}-cancel`} label="Cancel" onPress={onCancel} />
      </View>
    </Dialog>
  );
}

function FormField<T extends ChipSetItem>({
  prefix,
  field,
  value,
  onChange,
  hairline,
  accentSoft,
}: {
  prefix: string;
  field: ChipSetField<T>;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  hairline: string;
  accentSoft: string;
}) {
  if (field.kind === "text") {
    return (
      <Field
        testID={`${prefix}-${field.id}`}
        value={String(value ?? "")}
        onChangeText={onChange}
        placeholder={field.placeholder}
        style={{ marginBottom: space[4] }}
      />
    );
  }

  if (field.kind === "date") {
    const key = String(value ?? "");
    return (
      <View style={{ marginBottom: space[4] }}>
        {field.label ? <Meta style={{ marginBottom: space[2] }}>{field.label}</Meta> : null}
        <DateTimeField
          testID={`${prefix}-${field.id}`}
          dateOnly
          defaultTime="09:00"
          label={field.placeholder ?? "Pick a date"}
          value={key === "" ? undefined : atTime(key, 0).toISOString()}
          onChange={(iso) => onChange(iso == null ? "" : dayKey(new Date(iso)))}
        />
      </View>
    );
  }

  const chosenSet = value as string[];
  return (
    <View>
      {field.label ? <Meta style={{ marginBottom: space[2] }}>{field.label}</Meta> : null}
      <View style={{ gap: 8, marginBottom: space[4] }}>
        {(field.options ?? []).map((option) => {
          const chosen = chosenSet.includes(option.value);
          return (
            <Pressable
              key={option.value}
              testID={`${prefix}-${field.id}-${option.value}`}
              onPress={() => onChange(chosen ? chosenSet.filter((x) => x !== option.value) : [...chosenSet, option.value])}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  borderWidth: chosen ? 0 : 1,
                  borderColor: hairline,
                  backgroundColor: chosen ? accentSoft : "transparent",
                }}
              />
              <Txt>{option.label}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
