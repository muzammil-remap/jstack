/**
 * attach.tsx (X-1, UP-01) — putting a file on a capture, a task or a subtask.
 *
 * ONE control, three homes: Brain's capture field, the task card's Files
 * section and the subtask menu. They differ in where the file lands, not in
 * how it is chosen, so the picking, the pending chips and the removal live
 * here once.
 *
 * NO NEW DEPENDENCY (hard rule 4). On web that means a real
 * `<input type="file" multiple>`, hidden, clicked programmatically — the
 * thing every file picker on the web actually is. `expo-document-picker` and
 * `expo-image-picker` are used only if they are ALREADY installed, resolved
 * at call time through `require` in a try, so the native lane gets the system
 * picker where it exists and the input everywhere else.
 *
 * PASTE AND DROP are web-only and deliberately scoped to the field's own
 * surface rather than the window: a paste handler on `document` would swallow
 * an image copied for somewhere else entirely, and a drop target that is the
 * whole page is one a person hits by accident.
 *
 * The chips are PENDING files — chosen, not yet sent. They are held by the
 * caller (`useAttachments`) rather than by a store, because their lifetime is
 * the composition of one message: navigating away should lose them, and a
 * store would keep them.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Icon } from "@/components/chrome/Icon";
import { FieldButton } from "./fieldButton";
import { IconBtn } from "./iconButton";
import { Meta } from "./text";
import { useTokens } from "@/theme/ThemeProvider";
import { formatSize } from "@/data/files";
import { radius, space } from "@/theme/tokens";
import type { MultipartFile } from "@/data/transport/Transport";

/** A file chosen but not yet sent. `MultipartFile` is the wire shape; this
 * adds only what the chip needs to draw itself. */
export type PendingFile = MultipartFile & { key: string };

let seq = 0;
const toPending = (file: { name: string; type?: string; size?: number }, data: Blob | string): PendingFile => ({
  key: `p${(seq += 1)}`,
  filename: file.name,
  contentType: file.type ?? "application/octet-stream",
  size: file.size ?? 0,
  data,
});

/**
 * The pending list for one composition. Returned rather than stored so the
 * caller decides when it is cleared — which is on a successful send, and not
 * before: clearing on submit would lose the files if the send were refused.
 */
export function useAttachments() {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const add = useCallback((incoming: PendingFile[]) => setFiles((f) => [...f, ...incoming]), []);
  const remove = useCallback((key: string) => setFiles((f) => f.filter((x) => x.key !== key)), []);
  const clear = useCallback(() => setFiles([]), []);
  return { files, add, remove, clear };
}

/** Web: the hidden input, created once and reused. Native: the system picker
 * when one is installed. Either way the caller gets `PendingFile[]`. */
export async function pickFiles(): Promise<PendingFile[]> {
  if (Platform.OS !== "web") return pickNative();
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";
    input.addEventListener("change", () => {
      const chosen = Array.from(input.files ?? []).map((f) => toPending(f, f));
      input.remove();
      resolve(chosen);
    });
    // A cancelled picker fires no `change` in any browser, so the promise
    // would never settle and the button would stay busy forever. `cancel` is
    // supported where it matters and the input is removed either way.
    input.addEventListener("cancel", () => {
      input.remove();
      resolve([]);
    });
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Native: a file URI rather than bytes (resolution #33). The picker is
 * OPTIONAL — `require` inside a try — so this file adds no dependency (hard
 * rule 4) and a lane without it returns nothing chosen rather than crashing.
 *
 * Typed structurally rather than with `typeof import("expo-document-picker")`:
 * the module is not installed, so a type import would be a `pnpm check` error
 * for a package the build deliberately does not have. The shape below is the
 * documented one, and it is the only part of it this file touches.
 */
type DocumentPicker = {
  getDocumentAsync: (opts: { multiple: boolean; copyToCacheDirectory: boolean }) => Promise<
    { canceled: true } | { canceled: false; assets: { name: string; mimeType?: string; size?: number; uri: string }[] }
  >;
};

async function pickNative(): Promise<PendingFile[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const picker = require("expo-document-picker") as DocumentPicker;
    const res = await picker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return [];
    return res.assets.map((a) => toPending({ name: a.name, type: a.mimeType, size: a.size ?? 0 }, a.uri));
  } catch {
    return [];
  }
}

/**
 * The attach control — the app's OWN icon buttons, not a bare glyph.
 *
 * ux X1-03: it was a `Pressable` wrapping an `Icon`, which rendered as 10 x
 * 15px of ink with no box, no border and no fill, sitting beside a properly
 * chromed `···` on the task card and beside two 30px buttons in the capture
 * field. README Components says an icon button is 32 or 36 square, and on a
 * phone GL-05's 36px floor is not optional. Two variants because there are two
 * homes and each already has a primitive: `FieldButton` inside a `Field`'s
 * right slot, `IconBtn` beside a heading (rule 16 — one primitive per
 * pattern).
 */
export function AttachButton({
  onFiles,
  testID = "attach",
  label = "Attach a file",
  variant = "icon",
}: {
  onFiles: (files: PendingFile[]) => void;
  testID?: string;
  label?: string;
  /** `field` inside a `Field`'s right slot, beside the mic and the arrow;
   * `icon` beside a section heading. */
  variant?: "field" | "icon";
}) {
  const onPress = () => {
    void pickFiles().then((files) => {
      if (files.length > 0) onFiles(files);
    });
  };
  const props = { icon: "attach_file" as const, testID, accessibilityLabel: label, onPress };
  return variant === "field" ? <FieldButton {...props} /> : <IconBtn {...props} />;
}

/**
 * The pending chips. Under the field, before send, each removable — UP-01's
 * "can be removed" is the half that makes attaching safe to do quickly.
 */
export function AttachChips({ files, onRemove, testID = "attach-chips" }: { files: readonly PendingFile[]; onRemove: (key: string) => void; testID?: string }) {
  const c = useTokens();
  if (files.length === 0) return null;
  return (
    <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] }}>
      {files.map((f) => (
        <View
          key={f.key}
          testID={`attach-chip-${f.filename}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.tag, backgroundColor: c.surfaceInset }}
        >
          <Meta>{[f.filename, formatSize(f.size)].filter(Boolean).join(" · ")}</Meta>
          <Pressable
            testID={`attach-remove-${f.filename}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${f.filename}`}
            aria-label={`Remove ${f.filename}`}
            onPress={() => onRemove(f.key)}
            hitSlop={8}
          >
            <Icon name="close" size={12} color={c.muted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/**
 * Paste and drop on ONE element (web only). The ref goes on the field's
 * surface, so a paste anywhere else on the page is somebody else's business.
 *
 * `preventDefault` on dragover is what makes a drop target a drop target;
 * without it the browser navigates to the file, which is the default and is
 * the worst possible outcome — it leaves the app.
 */
export function useFileDropTarget(onFiles: (files: PendingFile[]) => void) {
  const ref = useRef<View | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = ref.current as unknown as HTMLElement | null;
    if (node == null) return;

    const emit = (list: FileList | null | undefined) => {
      const files = Array.from(list ?? []).map((f) => toPending(f, f));
      if (files.length > 0) onFiles(files);
    };
    const onPaste = (e: Event) => emit((e as ClipboardEvent).clipboardData?.files);
    const onDrop = (e: Event) => {
      e.preventDefault();
      emit((e as DragEvent).dataTransfer?.files);
    };
    const onDragOver = (e: Event) => e.preventDefault();

    node.addEventListener("paste", onPaste);
    node.addEventListener("drop", onDrop);
    node.addEventListener("dragover", onDragOver);
    return () => {
      node.removeEventListener("paste", onPaste);
      node.removeEventListener("drop", onDrop);
      node.removeEventListener("dragover", onDragOver);
    };
  }, [onFiles]);

  return ref;
}
