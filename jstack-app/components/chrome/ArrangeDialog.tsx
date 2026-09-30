/**
 * ArrangeDialog (AR-01..05) — opened from Header's Arrange button
 * (`session.ts`'s `modal === "arrange"`, payload = tab id, TabScreen.tsx).
 * Per-tab section order + visibility (pinned rows carry no switch, AR-03),
 * then an "App" card for the focus row and the other four tabs' visibility
 * (AR-04) — mirrors the mock's single `arrangeDlg()` (jstack-mock-v11.html
 * lines 667-673), which renders both in one dialog body.
 */
import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Dialog } from "@/components/chrome/Dialog";
import { Btn, BtnPrimary, DialogVerbs, IconBtn, ListCard, Meta, Row, Switch, Txt } from "@/theme/ui";
import { sectionsWithConfigs, type SectionDef } from "@/layout/registry";
import { TABS, tabLabel, type TabId } from "@/layout/tabRoutes";
import { useSessionStore } from "@/stores/session";
import { useSectionsStore } from "@/stores/sections";
import { useSettingsStore } from "@/stores/settings";
import { space } from "@/theme/tokens";
import { ARRANGE_NAME_COL } from "@/lib/labelColumn";
import { sayRefused } from "@/lib/optimistic";

// AR-04: Today can never be hidden — it's the tab a hidden-current-tab
// falls back to, so it isn't one of the choices here.
const HIDEABLE_TABS = TABS.filter((t) => t.id !== "today");

export function ArrangeDialog({ payload, onClose }: { payload?: string; onClose: () => void }) {
  const router = useRouter();
  const tab = (payload ?? "today") as TabId;

  const layout = useSettingsStore((s) => s.layouts[tab]);
  const appLayout = useSettingsStore((s) => s.appLayout);
  const putLayout = useSettingsStore((s) => s.putLayout);
  const putAppLayout = useSettingsStore((s) => s.putAppLayout);
  const revertLayout = useSettingsStore((s) => s.revertLayout);
  const showToast = useSessionStore((s) => s.showToast);

  // B-2: the merged list, not the registry's own — four of Life's sections
  // are config records now, and a section you can see but cannot arrange
  // would be a worse answer than not having built them.
  const sectionConfigs = useSectionsStore((s) => s.sections);
  const registrySections = sectionsWithConfigs(tab, sectionConfigs);
  const order = layout?.order ?? registrySections.map((s) => s.id);
  const hidden = layout?.hidden ?? [];
  const byId = new Map(registrySections.map((s) => [s.id, s] as const));
  const rows = order.map((id) => byId.get(id)).filter((s): s is SectionDef => s != null);
  // a section that arrived after this layout was saved is appended rather
  // than dropped — the same rule `visibleSections` applies when rendering,
  // and the two must agree or Arrange would offer to hide a row that is
  // not on screen (or worse, silently not offer one that is).
  for (const s of registrySections) if (!order.includes(s.id)) rows.push(s);

  const move = (id: string, dir: -1 | 1) => {
    const idx = order.indexOf(id);
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[idx], next[j]] = [next[j], next[idx]];
    void putLayout(tab, { order: next }).catch(sayRefused);
  };

  const toggleHidden = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    void putLayout(tab, { hidden: next }).catch(sayRefused);
  };

  const hiddenTabs = appLayout?.hiddenTabs ?? [];
  const toggleTabHidden = (id: TabId) => {
    const willHide = !hiddenTabs.includes(id);
    const next = willHide ? [...hiddenTabs, id] : hiddenTabs.filter((x) => x !== id);
    void putAppLayout({ hiddenTabs: next }).then(() => {
      // AR-04: hiding the tab you're currently viewing returns to Today.
      if (willHide && tab === id) {
        onClose();
        router.navigate("/");
      }
    }, sayRefused);
  };

  const revert = () => {
    void Promise.all([revertLayout(tab), putAppLayout({ hiddenTabs: [], showFocusRow: true })]).then(() => showToast("Reverted to yesterday"), sayRefused);
  };

  return (
    <Dialog testID="arrange-dialog" title={`Arrange · ${tabLabel(tab)}`} onClose={onClose}>
      <Meta style={{ marginBottom: space[3] }}>
        On means shown. Off means hidden and the code kept. History is kept; revert any time. The EA may propose an arrangement with a reason; yours wins.
      </Meta>

      {/* S6-17 (ux round, Stage 6): the rows sit on LIST CARDS, as every
          group in the Settings sheet does — README Components, "section label
          above each card, rows 8px tall with hairlines". On the bare frosted
          sheet the page ghosted through between the rows, and this was the
          one sheet in the app whose rows had no card under them. */}
      <ListCard>
        {rows.map((s, i) => (
          <Row key={s.id} testID={`arrange-row-${s.id}`} last={i === rows.length - 1}>
            {/* the ↑↓ pair sits BESIDE the name it moves, not 671px away at
                the far edge of a 900px row (S6-17); the switch keeps the
                trailing edge, which is where every Settings row puts one */}
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <View testID={`arrange-name-${s.id}`} style={{ width: ARRANGE_NAME_COL }}>
                <Txt kind="body">{s.title}</Txt>
                {s.pinned && <Meta>cannot be hidden</Meta>}
              </View>
              <IconBtn
                testID={`arrange-up-${s.id}`}
                icon="arrow_upward"
                accessibilityLabel={`Move ${s.title} up`}
                {...(i === 0 ? { disabledReason: "Already at the top" } : { onPress: () => move(s.id, -1) })}
              />
              <IconBtn
                testID={`arrange-down-${s.id}`}
                icon="arrow_downward"
                accessibilityLabel={`Move ${s.title} down`}
                {...(i === rows.length - 1 ? { disabledReason: "Already at the bottom" } : { onPress: () => move(s.id, 1) })}
              />
            </View>
            {/* A pinned row still RESERVES the switch's slot, so the arrows and
                switches line up in their columns (ux-review R8-01). AR-03 still
                requires no `arrange-hide-*` control on a pinned row, so this
                is an inert spacer, not a disabled switch. */}
            {s.pinned ? (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40 }} />
            ) : (
              <Switch testID={`arrange-hide-${s.id}`} accessibilityLabel={`Show ${s.title}`} value={!hidden.includes(s.id)} onValueChange={() => toggleHidden(s.id)} />
            )}
          </Row>
        ))}
      </ListCard>

      {/* A group heading inside a dialog is a SECTION LABEL — 11.5 tracked
          caps in Accent ink, the treatment Configure's own groups use. S-2
          had homed it on `title` (a 15px serif card title), which made it
          the dialog's fourth heading treatment (ux-review R1-13). */}
      <Txt kind="label" style={{ marginTop: space[5], marginBottom: space[1] }}>App</Txt>
      <ListCard>
        <Row>
          <Txt kind="body" style={{ flex: 1 }}>Focus row</Txt>
          <Switch
            testID="arrange-focus-row"
            accessibilityLabel="Show the focus row"
            value={appLayout?.showFocusRow ?? true}
            onValueChange={(v) => void putAppLayout({ showFocusRow: v }).catch(sayRefused)}
          />
        </Row>
        {HIDEABLE_TABS.map((t, i) => (
          <Row key={t.id} testID={`arrange-tab-row-${t.id}`} last={i === HIDEABLE_TABS.length - 1}>
            <Txt kind="body" style={{ flex: 1 }}>{t.label}</Txt>
            <Switch testID={`arrange-tab-${t.id}`} accessibilityLabel={`Show ${t.label} tab`} value={!hiddenTabs.includes(t.id)} onValueChange={() => toggleTabHidden(t.id)} />
          </Row>
        ))}
      </ListCard>

      <DialogVerbs style={{ marginTop: space[5] }} primary={<BtnPrimary testID="arrange-done" label="Done" onPress={onClose} />} secondary={<Btn testID="arrange-revert" label="Revert to yesterday" onPress={revert} />} />
    </Dialog>
  );
}
