/**
 * RulesEditDialog — the standing instructions Josh has given his EA (ST-1,
 * ST-02).
 *
 * A config over `ChipSetEditDialog`, the fifth after focuses, slicers, goals
 * and habits — and the one that finally retires V2.1's parallel `Rule` list.
 * That list lived on Brain, had its own type, its own four routes and its own
 * two dialogs, and said nothing about WHEN a rule applies or whether the EA
 * should act on it or ask first. An `AutonomyRule` says both, which is what
 * makes it a rule the mock can actually obey: `ingestShare` reads them before
 * it decides whether to raise a card at all.
 *
 * THREE FIELDS, and no more. The text, the scope (all, or one kind of card)
 * and the mode (do it, or ask me). A rule with a free-text condition would be
 * a small language written by a person and evaluated by a server, which is the
 * thing §4.10's whole design exists to avoid — the same argument the slicer
 * editor records for its five predicates.
 *
 * `on` is not in the form. A rule you have switched off is a rule you have
 * stopped believing, and the honest gesture for that is `remove` — which here
 * really does remove, unlike a habit's archive, because a rule has no history
 * to keep and an off rule that still shows in the list is a rule you will read
 * as active one day.
 */
import React, { useEffect } from "react";
import { ChipSetEditDialog, type ChipSetField } from "@/components/settings/ChipSetEditDialog";
import { useRulesStore } from "@/stores/rules";
import { useSessionStore } from "@/stores/session";
import { MODE_LABEL, SCOPE_LABEL } from "@/lib/enumLabels";
import type { AutonomyRule } from "@/data/types";

/** `all`, or one card kind — the words are `lib/enumLabels.ts`'s (hard rule
 * 21), in the order the maps declare them; a chip set wants value + label. */
const SCOPES: { value: string; label: string }[] = Object.entries(SCOPE_LABEL).map(([value, label]) => ({ value, label }));
const MODES: { value: string; label: string }[] = Object.entries(MODE_LABEL).map(([value, label]) => ({ value, label }));

const FIELDS: ChipSetField<AutonomyRule>[] = [
  {
    id: "text",
    kind: "text",
    placeholder: "One line, e.g. Never book anything before 7:30am",
    read: (r) => r.text ?? "",
    write: (r, value) => ({ ...r, text: value as string }),
    requiredReason: "Write the rule first",
  },
  {
    id: "scope",
    kind: "checklist",
    label: "When it applies",
    options: SCOPES,
    read: (r) => (r.scope != null ? [r.scope] : ["all"]),
    // a checklist standing in for a single choice: the last tap wins, so a
    // rule cannot end up claiming two scopes at once
    write: (r, value) => ({ ...r, scope: ((value as string[]).at(-1) ?? "all") as AutonomyRule["scope"] }),
  },
  {
    id: "mode",
    kind: "checklist",
    label: "What the EA does",
    options: MODES,
    read: (r) => (r.mode != null ? [r.mode] : ["ask"]),
    write: (r, value) => ({ ...r, mode: ((value as string[]).at(-1) ?? "ask") as AutonomyRule["mode"] }),
  },
];

/** What a rule row reads as in the list: the rule, then when and how.
 * Exported so the Settings card and this dialog cannot describe one
 * differently. */
export function ruleLine(rule: AutonomyRule): string {
  const scope = SCOPE_LABEL[rule.scope];
  const mode = MODE_LABEL[rule.mode];
  return `${scope} · ${mode}`;
}

export function RulesEditDialog({ payload, onClose }: { payload?: string; onClose: () => void }) {
  const rules = useRulesStore((s) => s.rules);
  const loaded = useRulesStore((s) => s.loaded);
  const putAutonomyRules = useRulesStore((s) => s.put);
  const showToast = useSessionStore((s) => s.showToast);

  // A4R5-03: this dialog is opened from Settings AND from Find, and only the
  // Settings panel used to load the list — so a rule found in Find opened a
  // blank "Add a rule" over an empty set, and its save replaced every standing
  // rule with one. It asks for the set itself, and saves nothing until it has it.
  useEffect(() => {
    void useRulesStore.getState().load();
  }, []);

  return (
    <ChipSetEditDialog<AutonomyRule>
      prefix="rule"
      copy={{
        title: "Rules for my EA",
        add: "Add a rule",
        formTitle: { edit: "Edit rule", add: "Add a rule" },
        saved: { edit: "Rule saved", add: "Rule added" },
      }}
      items={rules}
      ready={loaded}
      nameOf={(r) => r.text}
      fields={FIELDS}
      payload={payload}
      onClose={onClose}
      makeItem={(draft) => ({
        id: `ar-${Date.now()}`,
        text: draft.text ?? "",
        scope: draft.scope ?? "all",
        mode: draft.mode ?? "ask",
        on: true,
        addedBy: "josh",
        addedAt: new Date().toISOString(),
      })}
      onSave={(next, view) => {
        // a remove saves the set and stays on the list; a form save toasts and
        // closes — the same two shapes every other editor on this component has
        const saving = putAutonomyRules(next);
        if (next.length < rules.length) return;
        void saving.then(() => {
          showToast(view === "edit" ? "Rule saved" : "Rule added");
          onClose();
        });
      }}
    />
  );
}
