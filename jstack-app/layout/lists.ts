/**
 * lists.ts (O-1, OP-07) — every list in the app, and how its rows open.
 *
 * ADR-52's rule is "everything listed opens". A rule like that decays the
 * moment somebody adds a list and forgets, and it decays SILENTLY: a row that
 * does nothing looks exactly like a row whose destination has not been built
 * yet. Both of those shipped in V2.1, which is why this exists.
 *
 * So the rule has a registry. Every file that renders the `Row` primitive is
 * named here with either the thing its rows open or an explicit `static`
 * reason, and `tests/unit/opens.test.ts` greps the tree: a file that imports
 * `Row` and is not in this list fails, and so does an entry naming a file that
 * no longer exists. A `static` entry is a decision somebody wrote down, not an
 * omission — which is the whole difference this file is for.
 *
 * It is data, not behaviour: nothing imports it at runtime.
 */
type ListEntry = {
  /** path relative to the app root, with forward slashes */
  file: string;
  /** what a row opens — name the dialog or the surface */
  opens?: string;
  /** why a row does NOT open. One reason, in a sentence somebody can check. */
  static?: string;
};

export const LIST_COMPONENTS: ListEntry[] = [
  // ── Brain ──────────────────────────────────────────────────────────────
  { file: "components/brain/Find.tsx", opens: "the record behind a result, through `openRef` (OP-01)" },
  { file: "components/brain/LatestIn.tsx", opens: "`brain-item`, or `queued-item` for a capture still waiting to send (OP-02)" },
  { file: "components/brain/Memory.tsx", opens: "each proposal's own ok/edit controls; the section's `all` opens the history (OP-03)" },
  {
    file: "components/brain/MemoryHistoryDialog.tsx",
    static: "a history entry IS the record — what was proposed, decided, by whom and what it replaced are all on the row, and there is nothing beneath it to open",
  },
  { file: "components/chrome/FindRow.tsx", opens: "the record the result names, through `openSearchResult` — the tab as well as the dialog, so a task card opened from Find does not leave you on someone else's tab (GS-04)" },
  { file: "components/detail/ReplyDetail.tsx", opens: "the record each SOURCE names, through `openRef` — a citation you cannot follow is one you have to take on trust (RP-02)" },
  { file: "components/brain/FilesArchive.tsx", opens: "`file` — the viewer for anything with extracted text, the Dropbox link for everything else (FL-03)" },

  // ── Agents ─────────────────────────────────────────────────────────────
  { file: "components/agents/Checks.tsx", opens: "the check's own run control; a failing check opens its issue" },
  { file: "components/agents/EmergencyLock.tsx", opens: "`emergency-confirm`" },
  { file: "components/agents/Feed.tsx", opens: "the run it reports" },
  { file: "components/agents/History.tsx", opens: "`agents-history`, whose rows open `decision` (OP-04)" },
  { file: "components/agents/HistoryDialog.tsx", opens: "`decision` (OP-04)" },
  { file: "components/agents/Issues.tsx", opens: "`issue`, and `issues-all` from the section (OP-05)" },
  { file: "components/agents/IssuesAllDialog.tsx", opens: "`issue` (OP-05)" },

  // ── Life ───────────────────────────────────────────────────────────────
  { file: "components/life/Goals.tsx", opens: "`goal` — the goal detail, with its tasks, deliverables and KPIs (LG-02)" },
  {
    file: "components/life/Habits.tsx",
    static: "every row IS the control — its week strip's cells log the habit in place (LH-02), and the habit's edit, archive and reorder live behind the section's own control in HabitEditDialog (LH-07); a row press would be a second door onto the same cells",
  },
  { file: "components/life/GoalsAllDialog.tsx", opens: "`goal`, read-only: an archived goal shows its history and no verbs (LG-04)" },
  { file: "components/life/LearningAllDialog.tsx", opens: "`learning` — the same detail every Learning row opens (LL-03, OP-06)" },
  { file: "components/detail/GoalDetail.tsx", opens: "the task card, for the goal's tasks, for its deliverables' `file` viewer, and for the task a new subtask is being hung on (LG-02, LG-03)" },
  { file: "components/life/ConfigureDialog.tsx", opens: "the block being configured" },
  { file: "components/life/HabitEditDialog.tsx", opens: "each row's own edit, archive and reorder controls; the ARCHIVED rows in the add form restore that habit with its history (LH-07)" },
  { file: "components/settings/Rules.tsx", opens: "`rules-edit` on that rule — the EA's standing instructions, moved here from Brain at ST-1 (ST-02)" },

  // ── Tasks ──────────────────────────────────────────────────────────────
  { file: "components/tasks/TaskRow.tsx", opens: "the task card" },
  { file: "components/tasks/BoardCard.tsx", opens: "the task card" },
  { file: "components/tasks/Subtasks.tsx", opens: "the subtask menu" },
  { file: "components/tasks/SubtaskMenu.tsx", opens: "each menu action" },
  { file: "components/tasks/DelegatePicker.tsx", opens: "picks a delegatee" },
  { file: "components/tasks/Files.tsx", opens: "`file`, for the task's files and every subtask's (FL-02)" },
  { file: "components/tasks/WaitingOn.tsx", opens: "the decision card the row is waiting on" },
  {
    file: "components/tasks/Activity.tsx",
    static: "an activity line IS the record — 'delegated to the EA, 9:12' has no detail behind it, and a dialog repeating one line would be a door onto the same sentence",
  },

  // ── Today ──────────────────────────────────────────────────────────────
  { file: "components/today/YourTasks.tsx", opens: "the task card" },
  { file: "components/today/CalendarList.tsx", opens: "the event's own source" },
  { file: "components/today/HistoryDialog.tsx", opens: "`decision` (OP-04)" },
  {
    file: "components/today/ReviewDialog.tsx",
    static: "the week in review is bars and counts, not a list of records — the rows are a chart's labels and there is nothing to open behind 'promises kept: 6'",
  },

  // ── Settings and chrome ────────────────────────────────────────────────
  {
    file: "components/settings/Appearance.tsx",
    static: "every row IS a control — a segmented control, a switch, a stepper or a hold-to-lock (L-1) — and pressing the row would be a second way to change the setting, which is how two controls come to disagree; it used to carry its own Row (F-57, P-13)",
  },
  { file: "components/settings/Devices.tsx", opens: "the device's revoke confirmation" },
  { file: "components/settings/Focuses.tsx", opens: "`focus-edit`" },
  { file: "components/settings/Sync.tsx", opens: "a conflict's resolution" },
  { file: "components/settings/ChipSetEditDialog.tsx", opens: "each chip's edit controls" },
  {
    file: "components/settings/Security.tsx",
    static: "every row IS a control — a switch or a stepper for one parameter (L-1). Pressing the row would be a second way to change a setting, which is how two controls come to disagree",
  },
  {
    file: "components/chrome/Help.tsx",
    static: "the rows are capability lines ('Spoken replies: this device's browser'), not records — there is nothing behind a statement about the build",
  },
  { file: "components/chrome/ArrangeDialog.tsx", opens: "each section's own arrange controls" },

  // ── the configured-section renderer ────────────────────────────────────
  {
    file: "layout/blocks.tsx",
    opens: "whatever the bound row's verb does — `open` opens its record (OP-06's Learning is the first), and the walker checks the BINDS rather than this file",
  },
];
