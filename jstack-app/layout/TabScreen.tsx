/**
 * `<TabScreen>` — header + focus chips (all tabs but Agents, FS-05) +
 * `<Columns>` over `visibleSections()`. Every tab file becomes this plus
 * its header props (ADR-01); the section content itself comes from the
 * registry. Page padding is `pagePadPhone`/`pagePadDesktop`
 * (theme/tokens.ts) — phone's 120px bottom clears the floating tab bar
 * and mic orb (BUGLOG_v2.md B-11: this screen used a flat `space[7]`
 * padding instead until row 8's taller Today content pushed real
 * interactive controls behind the floating tab bar on phone widths).
 */
import React, { useEffect } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bannerClearance } from "@/components/chrome/BottomBanner";
import { Columns } from "@/components/chrome/Columns";
import { ORB_CLEARANCE } from "@/components/chrome/Orb";
import { EaLayoutBanner } from "@/components/chrome/EaLayoutBanner";
import { useBannerUp } from "@/components/chrome/MicBanner";
import { FocusChips } from "@/components/chrome/FocusChips";
import { Header } from "@/components/chrome/Header";
import { TabUnavailable } from "@/components/chrome/TabUnavailable";
import { sectionsForTab, sectionsWithConfigs, visibleSections } from "@/layout/registry";
import type { TabId } from "@/layout/tabRoutes";
import { useSessionStore } from "@/stores/session";
import { useSectionsStore } from "@/stores/sections";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { useLayout } from "@/theme/useLayout";
import { Txt } from "@/theme/ui";
import { misc, pagePadDesktop, pagePadPhone, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";

export function TabScreen({
  tab,
  title,
  subtitle,
  deltaLine,
  onReviewWeek,
  footer,
  onRetry,
}: {
  tab: TabId;
  title: string;
  subtitle: string;
  deltaLine?: string;
  onReviewWeek?: () => void;
  /** one small line under the columns. Life's says its sections are
   * templates the EA configures — a statement about the TAB, which is why
   * it lives here and not inside whichever section happened to be last
   * (B-2: as a section's own footer its testID shared a prefix with that
   * section's rows, and LF-08's row count quietly went from 2 to 3). */
  footer?: string;
  /** A-2: set only while the tab's own load has failed with nothing loaded to
   * show. The columns give way to one sentence (`TabUnavailable`), and a tap
   * calls this to load the tab again. */
  onRetry?: () => void;
}) {
  const c = useTokens();
  const { phone } = useLayout();
  const insets = useSafeAreaInsets();
  const layout = useSettingsStore((s) => s.layouts[tab]);
  const loadLayout = useSettingsStore((s) => s.loadLayout);
  const capabilities = useSettingsStore((s) => s.capabilities);
  const sectionConfigs = useSectionsStore((s) => s.sections);
  const openModal = useSessionStore((s) => s.openModal);
  const openSettings = useSessionStore((s) => s.openSettings);
  const toastInset = useUiStore((s) => s.toastInset);
  const bannerUp = useBannerUp();

  useEffect(() => {
    if (layout == null) void loadLayout(tab);
  }, [tab, layout, loadLayout]);

  const columns = visibleSections(tab, layout, capabilities, sectionsWithConfigs(tab, sectionConfigs));
  const showChips = tab !== "agents"; // FS-05
  // v2.3.2 WPR-1: the phone's page runs to the tab bar again. A6-07 had it END above a 140 px band kept for the orb
  // and the demo watermark, and on Josh's iPhone that band was "a band across the screen wasting valuable screen
  // space". The orb floats over the content now, and the page's bottom PADDING — the orb's reach, a constant on a
  // phone (a padding that changed with what is on screen would re-lay out the page under a dialog, the AG-04
  // regression) — lets the last card scroll clear of the orb and the bar.
  const pagePad = phone
    ? { paddingTop: insets.top + pagePadPhone.topBase, paddingHorizontal: pagePadPhone.sides, paddingBottom: ORB_CLEARANCE }
    : { paddingTop: pagePadDesktop.top, paddingHorizontal: pagePadDesktop.sides, paddingBottom: pagePadDesktop.bottom };

  return (
    // RL-04: the 1500 content cap is the whole PAGE's, not just the column
    // grid's — the header's Arrange/Help/Theme buttons were pinned to the
    // viewport and floated 153px past the content block at 1920 (ux-review D6).
    // RN boxes are border-box, so the cap has to carry the page padding too or
    // the columns would lose 2 × sides of their own 1500.
    //
    // S6-13: while a toast shows, the page ENDS above its band (`ui.toastInset`)
    // rather than running under it — the pill sat on a waiting row's Approve at
    // 393. Padding inside the content would clear only the end of the scroll; a
    // margin clears every scroll position, the keyboard inset's way.
    //
    // A4-03: and above the MIC BANNER's band for the same reason. Only the
    // toast had ever asked, so at 393 with the mic listening the Brain page ran
    // 118px past the banner's top: it covered a Latest-in row's `open` and its
    // `edit` and ate a real tap on them. The larger of the two, because both
    // can be up at once and the toast then sits above the banner.
    // v2.3.2 WPR-1: and no longer above a band for the demo watermark and the orb — both float over the page now,
    // and the page's bottom padding (above) lets its last card scroll clear of them.
    <ScrollView testID={`tab-screen-${tab}`} style={{ flex: 1, backgroundColor: c.ground, marginBottom: Math.max(toastInset, bannerUp ? bannerClearance(phone) : 0) }} contentContainerStyle={[pagePad, { maxWidth: misc.contentMax + 2 * (phone ? pagePadPhone.sides : pagePadDesktop.sides), width: "100%" }]}>
      <Header
        title={title}
        subtitle={subtitle}
        deltaLine={deltaLine}
        onReviewWeek={onReviewWeek}
        onArrange={() => openModal("arrange", tab)}
        onHelp={() => openModal("help")}
        onSettings={() => openSettings()}
      />
      {showChips && <FocusChips onEdit={() => openModal("focus-edit")} />}
      <EaLayoutBanner tab={tab} />
      {onRetry != null ? <TabUnavailable tab={tab} onRetry={onRetry} /> : <Columns columns={columns} />}
      {footer != null && (
        <Txt testID={`${tab}-footer`} kind="small" style={{ marginTop: space[3] }}>
          {footer}
        </Txt>
      )}
    </ScrollView>
  );
}

/** the section ids a tab declares, in registry order — used by tests and
 * by row 17's ArrangeDialog to seed a fresh layout before one is loaded. */
export function defaultOrderFor(tab: TabId): string[] {
  return sectionsForTab(tab).map((s) => s.id);
}
