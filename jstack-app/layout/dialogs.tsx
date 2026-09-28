/**
 * The dialog registry (S-3, SM-05).
 *
 * Every root-level overlay is one entry here, in the order it paints.
 * `app/_layout.tsx` used to hand-write all twenty-three as a wall of
 * `{modal === "help" && <Help …>}`, which is why the ordering rules that
 * matter survived only as comments in the middle of it.
 *
 * **Array order is stacking order.** No z-index: DOM order decides what
 * paints on top, so a dialog openable from inside another must come after
 * it. Not a style choice — B-14 (a dialog inside a scrolled ScrollView only
 * covers that content's box) and B-15 (devices/focus-edit/emergency-confirm
 * open from within the settings sheet) were both real defects. The comments
 * on the entries carry the reason for each position; keep them if it moves.
 *
 * `source` is where "is it open?" is read from, `kind` is how it presents:
 * `task` is modal-shaped with its open state in `stores/taskCard.ts`, and
 * `settings` has its own slot so a child renders on top of it.
 */
import React from "react";
import { dialog, optionalPayload, unpackPayload, type DialogEntry } from "@/layout/dialogKit";
import { useSessionStore } from "@/stores/session";
import { useTaskCardStore } from "@/stores/taskCard";
import { bp } from "@/theme/tokens";
import { useLayout } from "@/theme/useLayout";
import { CapsDialog } from "@/components/agents/CapsDialog";
import { EmergencyConfirmDialog } from "@/components/agents/EmergencyLock";
import { HistoryDialog as AgentsHistoryDialog } from "@/components/agents/HistoryDialog";
import { DictateDialog } from "@/components/brain/DictateDialog";
import { BrainItemDetail } from "@/components/detail/BrainItemDetail";
import { DecisionDetail } from "@/components/detail/DecisionDetail";
import { FileDetail } from "@/components/detail/FileDetail";
import { FilesArchive } from "@/components/brain/FilesArchive";
import { GoalDetail } from "@/components/detail/GoalDetail";
import { GoalEditDialog } from "@/components/life/GoalEditDialog";
import { GoalsAllDialog } from "@/components/life/GoalsAllDialog";
import { HabitEditDialog } from "@/components/life/HabitEditDialog";
import { IssuesAllDialog } from "@/components/agents/IssuesAllDialog";
import { LearningAllDialog } from "@/components/life/LearningAllDialog";
import { MemoryHistoryDialog } from "@/components/brain/MemoryHistoryDialog";
import { QueuedItemDetail } from "@/components/detail/QueuedItemDetail";
import { IssueDetail } from "@/components/detail/IssueDetail";
import { LearningDetail } from "@/components/detail/LearningDetail";
import { ReplyDetail } from "@/components/detail/ReplyDetail";
import { FindDialog } from "@/components/chrome/FindDialog";
import { FIND_MODAL, FIND_PHONE, useOpenFind } from "@/layout/find";
import { ItemEditor } from "@/components/brain/ItemEditor";
import { ProposalEdit } from "@/components/brain/ProposalEdit";
import { TalkScreen } from "@/components/brain/TalkScreen";
import { ArrangeDialog } from "@/components/chrome/ArrangeDialog";
import { ExternalLinkDialog } from "@/components/chrome/ExternalLinkDialog";
import { Help } from "@/components/chrome/Help";
import { ConfigureDialog } from "@/components/life/ConfigureDialog";
import { TrendsDialog } from "@/components/life/TrendsDialog";
import { Devices } from "@/components/settings/Devices";
import { Sync } from "@/components/settings/Sync";
import { FocusEditDialog } from "@/components/settings/FocusEditDialog";
import { RulesEditDialog } from "@/components/settings/RulesEditDialog";
import { SettingsSheet } from "@/components/settings/SettingsSheet";
import { FilterDialog } from "@/components/tasks/FilterDialog";
import { RangeDialog } from "@/components/tasks/RangeDialog";
import { SlicerEditDialog } from "@/components/tasks/SlicerEditDialog";
import { TaskDetail } from "@/components/tasks/TaskDetail";
import { HistoryDialog } from "@/components/today/HistoryDialog";
import { ReviewDialog } from "@/components/today/ReviewDialog";
import { ReviseDialog } from "@/components/today/ReviseDialog";
import { CompleteConfirm } from "@/components/tasks/CompleteConfirm";
import { DelegatePicker } from "@/components/tasks/DelegatePicker";
import { SubtaskMenu } from "@/components/tasks/SubtaskMenu";
import { TeachSheet } from "@/components/today/TeachSheet";
import { overlayOver } from "@/lib/cardVerbs";

// the type moved to `dialogKit`; re-exported so callers keep one import site
export type { DialogEntry } from "@/layout/dialogKit";

export const DIALOGS: DialogEntry[] = [
  dialog({ name: "help", kind: "modal", source: "modal", component: Help }),
  dialog({ name: "history", kind: "modal", source: "modal", component: HistoryDialog }),
  dialog({ name: "review", kind: "modal", source: "modal", component: ReviewDialog }),
  dialog({ name: "revise-card", kind: "modal", source: "modal", component: ReviseDialog, props: (id) => ({ id }), requiresPayload: true }),
  dialog({ name: "task-filter", kind: "modal", source: "modal", component: FilterDialog }),
  // F-1: the range chip's presets, and the slicer set's editor. Root-mounted
  // like every other overlay — the slicer row is inside a scrolled section, and a Dialog rendered there is B-14.
  dialog({ name: "task-range", kind: "modal", source: "modal", component: RangeDialog }),
  dialog({ name: "slicer-edit", kind: "modal", source: "modal", component: SlicerEditDialog, props: optionalPayload }),
  // TS-04: renamed from "Chat". The OLD NAME stays as an alias for one
  // release — the registry is what push routing resolves against (R-1).
  // O-1 / ADR-52: the detail dialogs. One per record KIND, not one per
  // surface that lists it, so Find, Latest in and a search dialog all land in
  // the same place for the same thing. `modal`, not `sheet` (resolution #52):
  // a Dialog is already full-screen on a phone and a detail is to be read.
  dialog({ name: "brain-item", kind: "modal", source: "modal", component: BrainItemDetail, props: (id) => ({ id }), requiresPayload: true }),
  dialog({ name: "decision", kind: "modal", source: "modal", component: DecisionDetail, props: (id) => ({ id }), requiresPayload: true }),
  dialog({ name: "issue", kind: "modal", source: "modal", component: IssueDetail, props: (id) => ({ id }), requiresPayload: true }),
  dialog({ name: "learning", kind: "modal", source: "modal", component: LearningDetail, props: (id) => ({ id }), requiresPayload: true }),
  dialog({ name: "reply", kind: "modal", source: "modal", component: ReplyDetail, props: (id) => ({ id }), requiresPayload: true }),
  // K-1: ONE component, two entries. An entry declares one kind, and Find is a
  // centred modal on a desktop and a full-screen surface on a phone — a
  // decision, not a width test hidden inside a component. `layout/find.ts`
  // picks between them so no caller has to.
  dialog({ name: FIND_MODAL, kind: "modal", source: "modal", component: FindDialog }),
  dialog({ name: FIND_PHONE, kind: "screen", source: "modal", component: FindDialog }),
  dialog({ name: "goal", kind: "modal", source: "modal", component: GoalDetail, props: (id) => ({ id }), requiresPayload: true }),
  // LG-1: the goal EDITOR takes an optional payload the way `slicer-edit`
  // does — absent opens the list, "new" opens a blank form, an id opens that
  // goal's. After `goal` so a detail can hand off to it later without
  // painting behind the thing that opened it.
  dialog({ name: "goal-edit", kind: "modal", source: "modal", component: GoalEditDialog, props: optionalPayload }),
  dialog({ name: "queued-item", kind: "modal", source: "modal", component: QueuedItemDetail, props: (id) => ({ id }), requiresPayload: true }),
  // OP-08: an "all" list is one `SearchableListDialog` per route.
  dialog({ name: "memory-history", kind: "modal", source: "modal", component: MemoryHistoryDialog }),
  dialog({ name: "issues-all", kind: "modal", source: "modal", component: IssuesAllDialog }),
  dialog({ name: "files-archive", kind: "modal", source: "modal", component: FilesArchive }),
  dialog({ name: "goals-all", kind: "modal", source: "modal", component: GoalsAllDialog }),
  dialog({ name: "learning-archive", kind: "modal", source: "modal", component: LearningAllDialog }), // LL-03
  dialog({ name: "brain-dictate", kind: "modal", source: "modal", component: DictateDialog }),
  dialog({ name: "item-editor", kind: "modal", source: "modal", component: ItemEditor, props: (id) => ({ id }), requiresPayload: true }),
  dialog({ name: "proposal-edit", kind: "modal", source: "modal", component: ProposalEdit, props: (id) => ({ id }), requiresPayload: true }),
  dialog({ name: "trends", kind: "modal", source: "modal", component: TrendsDialog }),
  dialog({ name: "habit-edit", kind: "modal", source: "modal", component: HabitEditDialog, props: optionalPayload }),
  dialog({ name: "life-config", kind: "modal", source: "modal", component: ConfigureDialog, props: (id) => ({ id }), requiresPayload: true }),
  dialog({ name: "caps", kind: "modal", source: "modal", component: CapsDialog }),
  dialog({ name: "agents-history", kind: "modal", source: "modal", component: AgentsHistoryDialog }),
  dialog({ name: "arrange", kind: "modal", source: "modal", component: ArrangeDialog, props: optionalPayload }),

  // The settings sheet has its own state slot, so the three dialogs below
  // it — each openable FROM WITHIN it (B-15) — render on top of it rather
  // than replacing it. Moving any of them above this line puts them behind
  // the sheet that opened them.
  // S6-26: the pack's 900 is the SHEET's (`surface: "sheet"`). The four
  // opened from inside it are 640 `panel`s (S6-05: at the sheet's own 900
  // they read as a band cut out of it), and a `confirm` is 480.
  dialog({ name: "settings", kind: "settings", surface: "sheet", source: "settings", component: SettingsSheet, props: optionalPayload }),
  dialog({ name: "devices", kind: "modal", surface: "panel", source: "modal", component: Devices }),
  dialog({ name: "sync", kind: "modal", surface: "panel", source: "modal", component: Sync }),
  dialog({ name: "focus-edit", kind: "modal", surface: "panel", source: "modal", component: FocusEditDialog, props: optionalPayload }),
  // ST-1: the EA's standing instructions. Opened FROM the settings sheet, so
  // it sits below it here for the reason B-15 records — a dialog above that
  // line renders behind the sheet that opened it.
  dialog({ name: "rules-edit", kind: "modal", surface: "panel", source: "modal", component: RulesEditDialog, props: optionalPayload }),
  dialog({ name: "emergency-confirm", kind: "modal", surface: "confirm", source: "modal", component: EmergencyConfirmDialog }),

  // the task card keeps the sheet's 900: the one record with sections of its
  // own, and the one measured at that width (JQ-01)
  dialog({ name: "task", kind: "modal", surface: "sheet", source: "task", component: TaskDetail, props: (id) => ({ id }), requiresPayload: true }),

  // T-3: the completion confirm. After `task` (it can be opened from the card
  // as well as from a list row) and before the three below.
  dialog({ name: "complete-confirm", kind: "modal", surface: "confirm", source: "modal", component: CompleteConfirm, props: (id) => ({ id }), requiresPayload: true }),
  // T-2: the task card's two small choosers. Both carry a payload — the task
  // for one, `taskId:subtaskId` for the other — because a chooser with no
  // subject is a chooser that has to guess. AFTER `task`, which opens them, and
  // BEFORE the three below, which can be opened from inside anything.
  dialog({ name: "delegate-picker", kind: "sheet", desktopKind: "modal", source: "sheet", component: DelegatePicker, props: (id) => ({ id }), requiresPayload: true }),
  dialog({ name: "subtask-menu", kind: "sheet", source: "sheet", component: SubtaskMenu, props: (id) => ({ id }), requiresPayload: true }),

  // X-1 (B-50): `file` is opened from inside an already-open dialog — the task
  // card, the archive, a Find result — so it belongs here, above the things
  // that open it, and BELOW `external-link`, which it opens in turn.
  //
  // It was registered up with the other details, before `task`. The registry's
  // order is the stacking order, so the card's own backdrop painted over it:
  // "Open in Dropbox" was visible, enabled, and swallowed every click. Same
  // class as B-14/B-15.
  dialog({ name: "file", kind: "modal", source: "modal", component: FileDetail, props: (id) => ({ id }), requiresPayload: true }),

  // Last, and for the same reason as B-15: external-link and the teach
  // sheet can each be opened from inside an already-open dialog (TaskDetail,
  // a decision card, an EA report), so they must paint on top of whatever
  // opened them.
  dialog({
    name: "external-link",
    kind: "modal",
    surface: "confirm",
    source: "modal",
    component: ExternalLinkDialog,
    props: (payload) => {
      const [url, label] = unpackPayload(payload);
      return { url, label };
    },
    requiresPayload: true,
  }),
  dialog({ name: "teach", kind: "sheet", source: "sheet", component: TeachSheet, props: optionalPayload }),
  dialog({ name: "talk", kind: "screen", presentation: "panel", source: "sheet", component: TalkScreen }),
];

/** The names a `session.modal` / `session.sheet` value can take, for the
 * store's own types and for tests that assert the two agree. */
export const MODAL_NAMES = DIALOGS.filter((d) => d.source === "modal").map((d) => d.name);
export const SHEET_NAMES = DIALOGS.filter((d) => d.source === "sheet").map((d) => d.name);

/**
 * Is a `screen`-kind dialog open? The tabs shell hides the rail and the tab
 * bar while one is, which is what makes `screen` a real kind rather than a
 * label. A hook rather than two store reads at the call site, so
 * `app/(tabs)/_layout.tsx` needs no per-dialog knowledge; the pure form it
 * asks, `screenDialogOpenIn`, is the one the tests exercise (F-31 folded the
 * one-caller wrapper that sat between them).
 */
export function useScreenDialogOpen(): boolean {
  const modal = useSessionStore((s) => s.modal);
  const sheet = useSessionStore((s) => s.sheet);
  const { width } = useLayout();
  return screenDialogOpenIn(DIALOGS, { modal, sheet }, width);
}

/** The same decision over an arbitrary registry, so a test can prove the
 * rule fires without waiting for V-2 to add the app's first `screen`. */
export function screenDialogOpenIn(dialogs: DialogEntry[], open: { modal?: string | null; sheet?: string | null }, width = 0): boolean {
  return dialogs.some((d) => {
    if (d.kind !== "screen") return false;
    const isOpen = (d.source === "modal" && d.name === open.modal) || (d.source === "sheet" && d.name === open.sheet);
    if (!isOpen) return false;
    // TS-01: a screen PRESENTED AS A PANEL does not replace the chrome — the
    // whole point of the panel is that the rail stays visible and usable
    // behind it. Below `bp.desktop` it is edge-to-edge and does.
    //
    // The width defaults to 0 so an existing caller that asks the question
    // without one still gets the full-screen answer, which is the safe way
    // round: the chrome hides, as it did before this flag existed.
    return !(d.presentation === "panel" && width >= bp.desktop);
  });
}

/**
 * Is ANY overlay open — a modal, a sheet, the settings sheet or the task card?
 * The floating mic orb asks (S6-09): a control that starts a capture has no
 * business over a dialog's scrim, and over the desktop Talk panel it was a
 * second microphone on top of a running conversation. Not `useScreenDialogOpen`:
 * that one is about the CHROME (the rail stays for a desktop panel); this one
 * is about anything at all being over the tab.
 */
export function useOverlayOpen(): boolean {
  const taskOpen = useTaskCardStore((s) => s.openTaskId != null);
  // `lib/cardVerbs.ts` holds the one definition; the desktop keys read it too
  return useSessionStore((s) => overlayOver(s, taskOpen));
}

/**
 * What the tabs shell needs to know about overlays, in one call.
 *
 * `app/(tabs)/_layout.tsx` is capped at 60 lines (SM-03) and K-1 gave it a
 * second overlay question to ask. Two hooks and two imports is two lines it
 * does not have, and shaving a comment to buy them would be paying for a
 * feature with documentation. The two questions belong together anyway: both
 * are "what is the registry doing to the chrome right now".
 */
export function useShell(): { onScreen: boolean; openFind: () => void } {
  return { onScreen: useScreenDialogOpen(), openFind: useOpenFind() };
}
