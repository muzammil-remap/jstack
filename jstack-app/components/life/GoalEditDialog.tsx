/**
 * GoalEditDialog — the goals are a set Josh edits (LG-1, LG-01).
 *
 * A config over `ChipSetEditDialog`, which is the point of S-3 having made
 * that component: the focus editor, the slicer editor and this one are the
 * same gesture, and the third arrives as sixty lines rather than another
 * hundred and twenty.
 *
 * THE FORM IS AREA, TITLE, TARGET DATE AND ONE MEASURE — and what it does NOT
 * offer is the measure's current VALUE. `kpis[].value` is advanced by the
 * backend from agent work (contract §4.20, resolution #65); a field that let a
 * person type it would let them type progress that nothing did, and the number
 * on the card would stop meaning anything. So the editor sets what is being
 * counted and what the target is, and the count itself is reported to it.
 *
 * ONE KPI, not a repeating set: a goal measured five ways is a goal nobody
 * checks, and the row has space for one line. `Goal.kpis` stays an array
 * because the backend may report more than one and the detail renders all of
 * them — the EDITOR is the narrow surface, not the record.
 *
 * Removing a goal here does not delete it: `PUT /goals` archives anything that
 * leaves the list, with its history (LG-04). The list says "remove" because
 * that is what the gesture does to the card; the goal is in "All goals".
 */
import React from "react";
import { ChipSetEditDialog, type ChipSetField } from "@/components/settings/ChipSetEditDialog";
import { useLifeStore } from "@/stores/life";
import { useLifeEditsStore } from "@/stores/lifeEdits";
import { useSessionStore } from "@/stores/session";
import { todayKey } from "@/lib/time";
import type { Goal, GoalKpi } from "@/data/types";

/** the KPI being edited, or a blank one to write into — so a form that sets a
 * target on a goal that had no measure does not have to special-case it */
const kpiOf = (g: Partial<Goal>): GoalKpi => g.kpis?.[0] ?? { label: "", value: 0, target: 0 };

function withKpi(g: Partial<Goal>, next: GoalKpi): Partial<Goal> {
  // a measure with neither a name nor a target is not a measure: drop it
  // rather than storing an empty row the detail would render as "0 of 0"
  if (next.label.trim() === "" && next.target === 0) return { ...g, kpis: [] };
  return { ...g, kpis: [next, ...(g.kpis ?? []).slice(1)] };
}

const FIELDS: ChipSetField<Goal>[] = [
  {
    id: "area",
    kind: "text",
    placeholder: "Area, e.g. Health",
    read: (g) => g.area ?? "",
    write: (g, value) => ({ ...g, area: value as string }),
    requiredReason: "Give it an area",
  },
  {
    id: "text",
    kind: "text",
    placeholder: "The goal, in a line",
    read: (g) => g.text ?? "",
    write: (g, value) => ({ ...g, text: value as string }),
    requiredReason: "Give it a title",
  },
  {
    id: "target",
    kind: "date",
    label: "Target date",
    placeholder: "Add a target date",
    read: (g) => g.targetDate ?? "",
    write: (g, value) => ({ ...g, targetDate: (value as string) === "" ? undefined : (value as string) }),
  },
  {
    id: "kpi-label",
    kind: "text",
    placeholder: "Measured by, e.g. this week",
    read: (g) => kpiOf(g).label,
    write: (g, value) => withKpi(g, { ...kpiOf(g), label: value as string }),
  },
  {
    id: "kpi-target",
    kind: "text",
    placeholder: "Target, e.g. 3",
    read: (g) => {
      const target = kpiOf(g).target;
      return target === 0 ? "" : String(target);
    },
    write: (g, value) => {
      const target = Number.parseInt(value as string, 10);
      return withKpi(g, { ...kpiOf(g), target: Number.isFinite(target) && target > 0 ? target : 0 });
    },
  },
];

export function GoalEditDialog({ payload, onClose }: { payload?: string; onClose: () => void }) {
  // what the editor SHOWS: the Life tab's goals, which are narrowed by the
  // focus. The save is composed from the server's whole set, not from this
  // (A4R5-01) — `stores/lifeEdits.ts` says why.
  const goals = useLifeStore((s) => s.goals);
  const saveGoals = useLifeEditsStore((s) => s.saveGoals);
  const showToast = useSessionStore((s) => s.showToast);
  // A4R5-02: a new goal is filed in the silo of whoever creates it — the
  // session's own personal silo, which the server checks — never Josh's
  const silos = useSessionStore((s) => s.silos);
  const ownSilo = silos.find((s) => s.startsWith("personal:")) ?? silos[0] ?? "personal:josh";

  return (
    <ChipSetEditDialog<Goal>
      prefix="goal"
      copy={{
        title: "Goals",
        add: "Add a goal",
        formTitle: { edit: "Edit goal", add: "Add a goal" },
        saved: { edit: "Goal saved", add: "Goal added" },
      }}
      items={goals}
      nameOf={(g) => `${g.area}: ${g.text}`}
      fields={FIELDS}
      payload={payload}
      onClose={onClose}
      makeItem={(draft) => ({
        id: `goal-${Date.now()}`,
        area: draft.area ?? "",
        text: draft.text ?? "",
        status: "active",
        targetDate: draft.targetDate,
        kpis: draft.kpis ?? [],
        taskIds: [],
        deliverableIds: [],
        history: [],
        // a new goal inherits nothing to inherit from, so it takes its
        // creator's own silo (DATA_LABELS R1) and the focus is set with the
        // labels once the person files it
        labels: { silo: ownSilo, types: ["open"], setBy: "josh" },
        setAt: todayKey(),
        focus: "personal",
      })}
      onSave={(next, view) => {
        // a remove saves the set and stays on the list; a form save toasts and
        // closes — the same two shapes the focus and slicer editors have. A
        // refusal is said either way, never dropped on the page.
        const removed = next.length < goals.length;
        void saveGoals(goals, next).then((refusal) => {
          if (refusal != null) {
            showToast(refusal.reason);
            return;
          }
          if (removed) return;
          showToast(view === "edit" ? "Goal saved" : "Goal added");
          onClose();
        });
      }}
    />
  );
}
