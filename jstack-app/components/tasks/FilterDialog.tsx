/**
 * FilterDialog — TK-14: Priority / Status / Project / Owner / Due,
 * multi-select; applied chips with ✕; Clear all; composes with the
 * slicer (AND across groups, OR within — `stores/tasks.ts` serialises
 * the same shape `data/mock/handlers/tasks.ts` applies).
 *
 * F-1/TF-03: every value shows the name a person would use for it. The chips
 * used to print the WIRE values — `in_progress`, `ea`, `josh` — which is the
 * app showing its own plumbing to somebody who has never seen the contract.
 * The Owner group also renders people and agents apart, because they are not
 * the same kind of thing: a person gets an initial in a circle, an agent gets
 * the EA mark, and both get their name.
 *
 * The RANGE is not here. It has its own always-visible chip in the slicer row
 * (`RangeChip`), and "Clear all" in this panel deliberately leaves it alone —
 * clearing something the person cannot see from this dialog is a surprise.
 */
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Btn, Chip, Label, Meta, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { EMPTY_FILTERS, useTasksStore, type TaskFilters } from "@/stores/tasks";
import { FILTER_GROUP_KEYS, activeFilterCount, type FilterGroupKey } from "@/data/taskFilters";
import { filterValueLabel } from "@/components/tasks/filterLabels";
import { personLabel } from "@/lib/taskMeta";
import { radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import type { Task } from "@/data/types";

const PRIORITY: Task["priority"][] = ["low", "medium", "high"];
const STATUS: Task["status"][] = ["open", "in_progress", "waiting", "done"];
const OWNER: Task["owner"][] = ["josh", "joce", "ea", "dev"];
// the chips read their words from `filterValueLabel`; a label here was dead data (F-50, P-13)
const DUE: TaskFilters["due"][number][] = ["overdue", "today", "week", "none"];

function Group<T extends string>({ group, label, options, selected, onToggle }: { group: FilterGroupKey; label: string; options: readonly T[]; selected: T[]; onToggle: (v: T) => void }) {
  return (
    <View style={{ marginTop: space[5] }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] }}>
        {options.map((opt) => (
          <Chip key={opt} label={filterValueLabel(group, opt)} selected={selected.includes(opt)} onPress={() => onToggle(opt)} testID={`filter-${label.toLowerCase()}-${opt}`} />
        ))}
      </View>
    </View>
  );
}

/**
 * The Owner group, which is the one that is not a list of words (TF-03).
 * People and agents both own tasks and are told apart everywhere else in this
 * app — the EA mark on a row, the initial circle on a card — so a flat row of
 * four chips reading `josh joce ea dev` was the one place they looked alike.
 */
function OwnerGroup({ selected, onToggle }: { selected: Task["owner"][]; onToggle: (v: Task["owner"]) => void }) {
  const c = useTokens();
  const roster = useTasksStore((s) => s.roster);
  const isAgent = (id: Task["owner"]) => roster.some((a) => a.id === id && a.canTakeTasks) || id === "ea";
  return (
    <View style={{ marginTop: space[5] }}>
      <Label>Owner</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] }}>
        {OWNER.map((owner) => (
          <Chip
            key={owner}
            testID={`filter-owner-${owner}`}
            selected={selected.includes(owner)}
            onPress={() => onToggle(owner)}
            label={`${isAgent(owner) ? "EA" : personLabel(owner).slice(0, 1)}  ${personLabel(owner)}`}
          />
        ))}
      </View>
      <Meta style={{ marginTop: space[2], color: c.muted }}>People carry their initial; agents carry the EA mark.</Meta>
    </View>
  );
}

export function FilterDialog({ onClose }: { onClose: () => void }) {
  const c = useTokens();
  const filters = useTasksStore((s) => s.filters);
  const setFilters = useTasksStore((s) => s.setFilters);
  const clearFilters = useTasksStore((s) => s.clearFilters);
  const columns = useTasksStore((s) => s.columns);
  const view = useTasksStore((s) => s.view);
  const projects = useTasksStore((s) => s.projects);
  const loadProjects = useTasksStore((s) => s.loadProjects);
  const [draft, setDraft] = useState<TaskFilters>(filters);

  // TK-14: the project names, from the store that owns the list (P-4, F-47)
  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // `FilterGroupKey`, not `keyof TaskFilters`: F-1 put `range` and `columns` on
  // the shape and neither is a chip group (the range has its own always-visible
  // chip, and columns are the board's).
  const toggle = <K extends FilterGroupKey>(key: K, value: TaskFilters[K][number]) => {
    setDraft((d) => {
      const list = d[key] as TaskFilters[K][number][];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...d, [key]: next };
    });
  };

  const appliedCount = activeFilterCount(draft);

  return (
    <Dialog testID="filter-dialog" title="Filter" onClose={onClose}>
      {appliedCount > 0 && (
        <View testID="filter-applied-chips" style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {FILTER_GROUP_KEYS.flatMap((key) =>
            (draft[key] as string[]).map((v) => (
              // A4R2-10: `radius.control` (8), not a hand-rolled 12. At ~22px
              // tall a 12 is a full pill, and the pack's chips are radius 8 —
              // `theme/ui/chips.tsx` uses the token; this one did not go
              // through the primitive and so drifted from it.
              <View key={`${key}-${v}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.accentSoft, borderRadius: radius.control, paddingVertical: 4, paddingHorizontal: 8 }}>
                <Txt kind="small" tone="accentInk">{filterValueLabel(key, v)}</Txt>
                <Txt testID={`filter-remove-${key}-${v}`} onPress={() => toggle(key, v as never)} kind="small" tone="accentInk">
                  ✕
                </Txt>
              </View>
            )),
          )}
        </View>
      )}

      <Group group="priority" label="Priority" options={PRIORITY} selected={draft.priority} onToggle={(v) => toggle("priority", v)} />
      <Group group="status" label="Status" options={STATUS} selected={draft.status} onToggle={(v) => toggle("status", v)} />
      <Group group="project" label="Project" options={projects} selected={draft.project} onToggle={(v) => toggle("project", v)} />
      <OwnerGroup selected={draft.owner} onToggle={(v) => toggle("owner", v)} />
      <Group group="due" label="Due" options={DUE} selected={draft.due} onToggle={(v) => toggle("due", v)} />

      {/* BD-02: which board columns are shown. Nothing selected means ALL — an
          empty list would otherwise be indistinguishable from "hide every lane",
          which is a board nobody asked for. It sits in this panel rather than on
          the board because it is one of the things Clear resets.

          On the BOARD only. One panel serves four views, and a group that does
          nothing on the view you are looking at is worse than a missing one:
          it invites a person to set it, watch the list not change, and stop
          trusting the panel. */}
      {view === "board" && (
      <View style={{ marginTop: space[5] }}>
        <Label>Board columns</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] }}>
          {columns.map((col) => (
            <Chip
              key={col.id}
              testID={`filter-columns-${col.id}`}
              label={col.name}
              selected={(draft.columns ?? []).includes(col.id)}
              onPress={() =>
                setDraft((d) => {
                  const on = d.columns ?? [];
                  return { ...d, columns: on.includes(col.id) ? on.filter((x) => x !== col.id) : [...on, col.id] };
                })
              }
            />
          ))}
        </View>
        <Meta style={{ marginTop: space[2] }}>None chosen shows them all.</Meta>
      </View>
      )}

      <View style={{ flexDirection: "row", gap: space[2], marginTop: space[6] }}>
        <Btn
          testID="filter-clear"
          label="Clear all"
          onPress={() => {
            setDraft(EMPTY_FILTERS);
            void clearFilters();
          }}
        />
        <Btn
          testID="filter-apply"
          label="Apply"
          onPress={() => {
            void setFilters(draft);
            onClose();
          }}
        />
      </View>
    </Dialog>
  );
}
