/**
 * ChipSetEditDialog — one dialog for "a named set the person edits" (S-3).
 *
 * Generalised out of `FocusEditDialog`, which was the first of at least five:
 * focuses and slicers now, and goals, habits and autonomy rules in V2.2's own
 * rows. Each is the same shape — a list with a fixed row or two that cannot be
 * removed, a per-row edit and remove, an add, and a small form — and each
 * would have arrived as its own 124-line copy of this file.
 *
 * What is configurable is deliberately narrow: the copy, the testID prefix,
 * and the fields. Everything about HOW the list and form behave is here and in
 * `ChipSetForm`, so a later set cannot quietly grow a different grammar for
 * the same gesture — which is the defect A-11 found in three dialogs with
 * three verb rows.
 *
 * Every testID is derived from one prefix (`focus` → `focus-edit-row-…`,
 * `focus-name`, `focus-silo-work`), so the specs that pin them did not move
 * when the focus editor became a config, nor when the form moved to its own
 * file at LG-1.
 *
 * THREE OPTIONAL BEHAVIOURS, added at LH-2 and each general rather than the
 * habit editor's business leaking in. `onRemove` replaces the default "save the
 * set without it" for a set whose members are put AWAY rather than deleted —
 * habits keep every log, and the server refuses a list that has simply dropped
 * one. `onReorder` adds ↑/↓ where the set's order is a fact about it (`sort`).
 * `formExtra` is a slot at the top of the ADD form, which is where a set that
 * can offer you something you already had belongs. A set that wants none of
 * them behaves exactly as before.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Btn, IconBtn, ListCard, Meta, Row, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { ChipSetForm } from "@/components/settings/ChipSetForm";
import { space } from "@/theme/tokens";
import type { ChipSetCopy, ChipSetField, ChipSetItem } from "@/components/settings/chipSet";

export type { ChipSetField } from "@/components/settings/chipSet";

type EditorView = { kind: "list" } | { kind: "edit"; id: string } | { kind: "add" };

function editorFor(payload: string | undefined): EditorView {
  if (payload == null) return { kind: "list" };
  if (payload === "new") return { kind: "add" };
  return { kind: "edit", id: payload };
}

export function ChipSetEditDialog<T extends ChipSetItem>({
  prefix,
  copy,
  items,
  fields,
  payload,
  nameOf,
  removeLabel = "remove",
  onRemove,
  onReorder,
  formExtra,
  onClose,
  onSave,
  makeItem,
  ready = true,
}: {
  prefix: string;
  copy: ChipSetCopy;
  items: T[];
  /**
   * A4R5-03: false while `items` has not been loaded. Every save here is the
   * WHOLE set, so a list that has not arrived yet is not an empty set — it is
   * no set at all, and an "add" composed from it replaced seven standing rules
   * with one. Until it is true the dialog says so and offers nothing to save.
   */
  ready?: boolean;
  fields: ChipSetField<T>[];
  payload?: string;
  /** what the list row shows. Defaults to `item.name`, which is what a focus
   * and a slicer carry; a goal has no `name` and reads as its area and text
   * (LG-1) — a lookup rather than a field invented on the record to suit this
   * dialog. */
  nameOf?: (item: T) => string;
  /** the word on the destructive link. "remove" unless the set puts its members
   * away rather than deleting them */
  removeLabel?: string;
  /** what that link does, when it is not "save the set without this one" */
  onRemove?: (item: T) => void;
  /** present when the set's ORDER is a fact about it; adds ↑/↓ to each row */
  onReorder?: (next: T[]) => void;
  /** rendered at the top of the ADD form — for a set that can offer back
   * something you already had (LH-07's archived habits) */
  formExtra?: React.ReactNode;
  onClose: () => void;
  /** the whole set, saved at once — the same shape every store already takes */
  onSave: (next: T[], view: "edit" | "add") => void;
  /** build a new member from the form's draft */
  makeItem: (draft: Partial<T>) => T;
}) {
  const [view, setView] = useState<EditorView>(editorFor(payload));

  const remove = (item: T) => (onRemove != null ? onRemove(item) : onSave(items.filter((f) => f.id !== item.id) as T[], "edit"));
  const label = nameOf ?? ((item: T) => item.name ?? item.id);

  /** move one row by one place; the caller saves whatever order comes back */
  const move = (index: number, by: number) => {
    const next = [...items];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    onReorder?.(next);
  };

  if (!ready) {
    return (
      <Dialog testID={`${prefix}-edit-dialog`} title={copy.title} onClose={onClose}>
        <Meta testID={`${prefix}-edit-loading`}>Loading…</Meta>
      </Dialog>
    );
  }

  const existing = view.kind === "edit" ? items.find((f) => f.id === view.id) : undefined;
  // A4R5-03: an edit whose member is not in the set is NEVER an add. Opened
  // for a record the set does not hold, the form used to fall through to "Add"
  // with the fields blank, and saving it appended to whatever was loaded.
  if (view.kind === "edit" && existing == null) {
    return (
      <Dialog testID={`${prefix}-edit-dialog`} title={copy.title} onClose={onClose}>
        <Meta testID={`${prefix}-edit-missing`}>That one is not here any more.</Meta>
        <Btn testID={`${prefix}-edit-back`} label="Back to the list" onPress={() => setView({ kind: "list" })} style={{ marginTop: space[3], alignSelf: "flex-start" }} />
      </Dialog>
    );
  }

  if (view.kind === "list") {
    return (
      <Dialog testID={`${prefix}-edit-dialog`} title={copy.title} onClose={onClose}>
        <ListCard>
          {items.map((item, i) => (
            <Row key={item.id} testID={`${prefix}-edit-row-${item.id}`} last={i === items.length - 1}>
              <Txt style={{ flex: 1 }}>{label(item)}</Txt>
              {item.fixed ? (
                <Meta>always present</Meta>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
                  {onReorder != null && (
                    <>
                      <IconBtn
                        icon="arrow_upward"
                        testID={`${prefix}-up-${item.id}`}
                        accessibilityLabel={`Move ${label(item)} up`}
                        {...(i > 0 ? { onPress: () => move(i, -1) } : { disabledReason: "This one is already first" })}
                      />
                      <IconBtn
                        icon="arrow_downward"
                        testID={`${prefix}-down-${item.id}`}
                        accessibilityLabel={`Move ${label(item)} down`}
                        {...(i < items.length - 1 ? { onPress: () => move(i, 1) } : { disabledReason: "This one is already last" })}
                      />
                    </>
                  )}
                  <Txt testID={`${prefix}-edit-open-${item.id}`} onPress={() => setView({ kind: "edit", id: item.id })} kind="meta" tone="accentInk">
                    edit
                  </Txt>
                  <Txt testID={`${prefix}-remove-${item.id}`} onPress={() => remove(item)} kind="meta" tone="alert">
                    {removeLabel}
                  </Txt>
                </View>
              )}
            </Row>
          ))}
        </ListCard>
        <Btn testID={`${prefix}-add-open`} label={copy.add} onPress={() => setView({ kind: "add" })} style={{ marginTop: space[3], alignSelf: "flex-start" }} />
      </Dialog>
    );
  }

  return (
    <ChipSetForm<T>
      prefix={prefix}
      copy={copy}
      fields={fields}
      item={existing}
      extra={existing == null ? formExtra : undefined}
      onCancel={() => setView({ kind: "list" })}
      onSave={(draft) => {
        const next =
          existing != null ? (items.map((f) => (f.id === existing.id ? { ...f, ...draft } : f)) as T[]) : ([...items, makeItem(draft)] as T[]);
        onSave(next, existing != null ? "edit" : "add");
      }}
    />
  );
}
