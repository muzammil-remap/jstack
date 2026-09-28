/**
 * The tab table (F-40, F-71 — P-6): the five tabs declared ONCE — id, label,
 * route path and icon. `lib/boot.ts`'s shortcut paths, `layout/openRef.ts`'s
 * result paths, `ArrangeDialog`'s titles, `SectionPreview`'s names, `Rail`'s
 * icons and the shell's path maps were six copies of this one fact, and
 * `TabId` is derived from the table rather than the table from the type.
 *
 * Its own module rather than `layout/registry.tsx` on purpose (S-2b, CD-05):
 * the shell imports the registry only as a *type*, which erases at build
 * time, and a runtime import from it would pull the registry's whole
 * component graph into the tabs layout. Nothing here renders.
 */
import type { IconName } from "@/components/chrome/icons.generated";
import { iconNames } from "@/theme/tokens";

export const TABS = [
  { id: "today", label: "Today", path: "/", icon: iconNames.today },
  { id: "tasks", label: "Tasks", path: "/tasks", icon: iconNames.tasks },
  { id: "brain", label: "Brain", path: "/brain", icon: iconNames.brain },
  { id: "life", label: "Life", path: "/life", icon: iconNames.life },
  { id: "agents", label: "Agents", path: "/agents", icon: iconNames.agents },
] as const satisfies readonly { id: string; label: string; path: string; icon: IconName }[];

export type TabId = (typeof TABS)[number]["id"];

/** the tab a route path shows, or nothing for a path no tab owns */
export function tabForPath(path: string): TabId | undefined {
  return TABS.find((t) => t.path === path)?.id;
}

/** a tab's route path; an id that is not a tab goes home — a search result's
 * `tab` is a wire string, not a `TabId` */
export function tabPath(id: string): string {
  return TABS.find((t) => t.id === id)?.path ?? "/";
}

/** a tab's label, or the id back when it is not one — a config's `tab` is
 * validated on the way in, but a preview should never print nothing */
export function tabLabel(id: string): string {
  return TABS.find((t) => t.id === id)?.label ?? id;
}
