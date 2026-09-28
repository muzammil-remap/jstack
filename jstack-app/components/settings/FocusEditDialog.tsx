/**
 * FocusEditDialog — FS-04/SE-07: one dialog for all three entry points
 * — FocusChips' tune icon (`payload` undefined → the manage-all list),
 * Settings' per-row "edit" (`payload` = a focus id), and "Add a focus"
 * (`payload === "new"`). The mock's own editor is just `window.prompt()`
 * calls with no modeled filter fields — this builds a real name + silo
 * checklist editor instead, since FS-04 requires "name + saved filter"
 * as a real feature (A-36). `filter.silos` is the only piece edited;
 * `projects`/`types` aren't surfaced anywhere else in the app either.
 *
 * S-3 made it a config over `ChipSetEditDialog`. Everything below is the two
 * fields, the copy and where the set is saved; the list, the form, the fixed
 * row, the disabled Save and every testID come from the shared dialog, so the
 * next editable set arrives as another twenty lines rather than another
 * hundred and twenty.
 */
import React from "react";
import { ChipSetEditDialog, type ChipSetField } from "@/components/settings/ChipSetEditDialog";
import { SILO_META, type Silo } from "@/data/labels";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import type { Focus } from "@/data/types";

const SILOS = Object.keys(SILO_META) as Silo[];

const FIELDS: ChipSetField<Focus>[] = [
  {
    id: "name",
    kind: "text",
    placeholder: "Name the focus (for example Practice)",
    read: (f) => f.name ?? "",
    write: (f, value) => ({ ...f, name: value as string }),
    requiredReason: "Name the focus first",
  },
  {
    id: "silo",
    kind: "checklist",
    label: "Saved filter — silos included",
    options: SILOS.map((silo) => ({ value: silo, label: SILO_META[silo].shortName })),
    read: (f) => f.filter?.silos ?? [],
    write: (f, value) => ({ ...f, filter: { ...f.filter, silos: value as string[] } }),
  },
];

export function FocusEditDialog({ payload, onClose }: { payload?: string; onClose: () => void }) {
  const focuses = useSettingsStore((s) => s.focuses);
  const putFocuses = useSettingsStore((s) => s.putFocuses);
  const showToast = useSessionStore((s) => s.showToast);

  return (
    <ChipSetEditDialog<Focus>
      prefix="focus"
      copy={{
        title: "Focus filters",
        add: "Add a focus",
        formTitle: { edit: "Edit focus", add: "Add a focus" },
        saved: { edit: "Focus saved", add: "Focus added" },
      }}
      items={focuses}
      fields={FIELDS}
      payload={payload}
      onClose={onClose}
      makeItem={(draft) => ({ id: `focus-${Date.now()}`, name: draft.name ?? "", filter: { silos: draft.filter?.silos ?? [] } }) as Focus}
      onSave={(next, view) => {
        // a remove saves the set and stays on the list; a form save toasts and
        // closes, which is the difference the `view` argument carries
        const saving = putFocuses(next);
        if (next.length < focuses.length) return;
        void saving.then((saved) => {
          // refused (A4R6-11): the store has said why, and nothing was added
          if (!saved) return;
          showToast(view === "edit" ? "Focus saved" : "Focus added");
          onClose();
        });
      }}
    />
  );
}
