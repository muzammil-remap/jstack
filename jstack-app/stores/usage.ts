/**
 * usage.ts (ADR-04, ADR-43) — what the agents spent: the Agents › Usage
 * section's month (`GET /usage`) and the open task card's runs
 * (`GET /tasks/{id}/usage`).
 *
 * Its own store rather than a corner of `stores/agents.ts`, which the 7 Sep
 * tree note suggested and which would have had the task card reading its cost
 * lines out of the Agents tab's store. Usage is one subject with two
 * questions — "what did this task cost" and "what did this month cost" — and
 * both are asked from surfaces that have nothing else to do with each other.
 *
 * `taskTitles` is the one piece here that is not a fetch. The `/usage` rows
 * carry a `taskId` and no title, because a usage row is an accounting record
 * and not a task; the section still has to say "Redact the 200 sample emails"
 * rather than "t2". So the loader asks the task list for the names it needs.
 * A row whose task is not in that list falls back to the id, which is honest
 * and legible, rather than to a blank.
 */
import { create } from "zustand";
import { copyToClipboard } from "@/lib/clipboard";
import { getAdapter } from "@/data/provider";
import { usageCsv } from "@/lib/usage";
import { useSessionStore } from "@/stores/session";
import type { UsageSummary } from "@/data/types";

type UsageState = {
  /** the Agents tab's month */
  summary: UsageSummary | null;
  /** taskId → title, for the section's rows */
  taskTitles: Record<string, string>;
  /** the open card's runs, keyed by task so a second card cannot show the
   * first one's numbers for a frame */
  forTask: Record<string, UsageSummary>;

  load: () => Promise<void>;
  loadTask: (id: string) => Promise<void>;
  copyCsv: () => void;
};

export const useUsageStore = create<UsageState>((set, get) => ({
  summary: null,
  taskTitles: {},
  forTask: {},

  load: async () => {
    // one request for the names, not one per row — and beside the summary
    // rather than after it. `view: "board"` because it is the only view that
    // returns every status: half the tasks in a month's usage are finished, and
    // `list` would have left them showing their ids.
    const [summary, tasks] = await Promise.all([getAdapter().getUsage("month"), getAdapter().getTasks({ view: "board" })]);
    const taskTitles: Record<string, string> = {};
    for (const t of tasks) taskTitles[t.id] = t.title;
    set({ summary, taskTitles });
  },

  loadTask: async (id) => {
    const summary = await getAdapter().getTaskUsage(id).catch(() => null); // unreadable: the card shows no usage line
    if (summary != null) set((s) => ({ forTask: { ...s.forTask, [id]: summary } }));
  },

  /**
   * US-04. The CSV is built from the rows already on screen — copying
   * something other than what is displayed is the one thing an export must
   * never do.
   *
   * The toast reports the ROW count and not "Copied", because a person who
   * asked for a log wants to know how much of it they got; and when the write
   * did not happen (no clipboard on this platform, or a denied permission,
   * `lib/clipboard.ts`) it says so rather than claiming a copy that isn't
   * there — which is what both of the copies S-9 replaced used to do.
   */
  copyCsv: () => {
    const rows = get().summary?.rows ?? [];
    if (rows.length === 0) {
      useSessionStore.getState().showToast("Nothing to copy");
      return;
    }
    void copyToClipboard(usageCsv(rows)).then((copied) => {
      useSessionStore.getState().showToast(copied ? `Copied · ${rows.length} ${rows.length === 1 ? "row" : "rows"}` : "Couldn't copy · no clipboard here");
    });
  },
}));
