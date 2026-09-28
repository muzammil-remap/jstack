/**
 * SlicerEditDialog — the slicer chips are a list Josh edits (F-1, TF-06,
 * ADR-44).
 *
 * A config over `ChipSetEditDialog`, which is the point of S-3 having made that
 * component: the focus editor and this one are the same gesture — a list with a
 * fixed row or two, a per-row edit and remove, an add, and a small form — and
 * the second one arrives as forty lines rather than another hundred and
 * twenty-four.
 *
 * The form is a name, a KIND, and a number of days that only the `dueWithin`
 * kind uses. That is the whole language: five questions the server knows how to
 * answer (`PREDICATE_KINDS`), so the worst slicer anybody can save is one that
 * matches nothing. A free-text predicate would be a small language written by a
 * person and evaluated by a server, which is the thing §4.10's whole design
 * exists to avoid.
 */
import React from "react";
import { ChipSetEditDialog, type ChipSetField } from "@/components/settings/ChipSetEditDialog";
import { useSessionStore } from "@/stores/session";
import { useTasksStore } from "@/stores/tasks";
import type { Slicer, SlicerPredicate } from "@/data/types";

/** the five kinds, in the words a person would use for them */
const KINDS: { value: string; label: string }[] = [
  { value: "dueWithin", label: "Due within" },
  { value: "status", label: "Waiting" },
  { value: "delegated", label: "Delegated" },
  { value: "owner", label: "The EA's" },
  { value: "repeat", label: "Recurring" },
];

/** a kind plus a number is enough to build any of the five: the three that take
 * no argument ignore it, and the two that do have exactly one each. */
function predicateFor(kind: string, days: number): SlicerPredicate {
  if (kind === "status") return { kind: "status", status: "waiting" };
  if (kind === "owner") return { kind: "owner", owner: "ea" };
  if (kind === "delegated") return { kind: "delegated" };
  if (kind === "repeat") return { kind: "repeat" };
  return { kind: "dueWithin", days };
}

const FIELDS: ChipSetField<Slicer>[] = [
  {
    id: "name",
    kind: "text",
    placeholder: "Name, e.g. Next fortnight",
    read: (s) => s.name ?? "",
    write: (s, value) => ({ ...s, name: value as string }),
    requiredReason: "Give it a name first",
  },
  {
    id: "kind",
    kind: "checklist",
    label: "What it selects",
    options: KINDS,
    read: (s) => (s.predicate?.kind != null ? [s.predicate.kind] : []),
    // a checklist standing in for a single choice: the last tap wins, so the
    // field cannot produce a slicer that asks two questions at once
    write: (s, value) => {
      const kind = (value as string[]).at(-1) ?? "dueWithin";
      const days = s.predicate?.kind === "dueWithin" ? s.predicate.days : 7;
      return { ...s, predicate: predicateFor(kind, days) };
    },
  },
  {
    id: "days",
    kind: "text",
    placeholder: "Days (for Due within)",
    read: (s) => (s.predicate?.kind === "dueWithin" ? String(s.predicate.days) : ""),
    write: (s, value) => {
      if (s.predicate?.kind !== "dueWithin") return s;
      const days = Number.parseInt(value as string, 10);
      return { ...s, predicate: { kind: "dueWithin", days: Number.isFinite(days) && days > 0 ? days : 7 } };
    },
  },
];

export function SlicerEditDialog({ payload, onClose }: { payload?: string; onClose: () => void }) {
  const slicers = useTasksStore((s) => s.slicers);
  // WPF-6: every save here is the whole set, so the editor offers nothing to save
  // until a list has loaded — and asks for one if the tab's own load failed
  const slicersLoaded = useTasksStore((s) => s.slicersLoaded);
  const loadSlicers = useTasksStore((s) => s.loadSlicers);
  React.useEffect(() => {
    if (!slicersLoaded) void loadSlicers();
  }, [slicersLoaded, loadSlicers]);
  const putSlicers = useTasksStore((s) => s.putSlicers);
  const showToast = useSessionStore((s) => s.showToast);

  return (
    <ChipSetEditDialog<Slicer>
      prefix="slicer"
      copy={{
        title: "Slicers",
        add: "Add a slicer",
        formTitle: { edit: "Edit slicer", add: "Add a slicer" },
        saved: { edit: "Slicer saved", add: "Slicer added" },
      }}
      items={slicers}
      ready={slicersLoaded}
      fields={FIELDS}
      payload={payload}
      onClose={onClose}
      makeItem={(draft) => ({ id: `slicer-${Date.now()}`, name: draft.name ?? "", predicate: draft.predicate ?? { kind: "dueWithin", days: 7 } })}
      onSave={(next, view) => {
        // a remove saves the set and stays on the list; a form save toasts and
        // closes — the same two shapes the focus editor has
        const saving = putSlicers(next);
        if (next.length < slicers.length) return;
        void saving.then(() => {
          showToast(view === "edit" ? "Slicer saved" : "Slicer added");
          onClose();
        });
      }}
    />
  );
}
