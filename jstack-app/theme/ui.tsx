/**
 * UI primitives — the barrel (S-2, ADR-33). `theme/ui.tsx` used to be one
 * 994-line file; every primitive now lives in `theme/ui/{surfaces,text,
 * controls,chips,lists,fields}.tsx` by family, and this file re-exports
 * them all so every existing `import { X } from "@/theme/ui"` keeps working
 * unchanged (`tag` and `label` since P-7). Add a new primitive to the family
 * file it belongs to, then export it here.
 */
export { frostedStyle, Card, ListCard, Inset, Ghost } from "./ui/surfaces";
export { Txt, useTxtStyle, LINK_SLOP, TextLink, Meta, Expiry, CardTitle, Stat, Strong } from "./ui/text";
export { Label } from "./ui/label";
export { Section } from "./ui/section";
export type { TxtKind, TxtTone, TxtWeight } from "./ui/text";
export { Btn, BtnPrimary, BtnSm } from "./ui/controls";
export { IconBtn } from "./ui/iconButton";
export { Chip, Seg, HabitChip } from "./ui/chips";
export { Tag } from "./ui/tag";
export { Row, Track, Dot, Checkbox, Switch } from "./ui/lists";
export { Field } from "./ui/fields";
export { DateTimeField } from "./ui/datetime";
export { DialogVerbs } from "./ui/verbRow";
export { FieldButton } from "./ui/fieldButton";

// blur is re-exported so callers building a bespoke bar/card variant can
// read the pack's backdrop-blur radius without importing theme/tokens too
export { blur } from "@/theme/tokens";
