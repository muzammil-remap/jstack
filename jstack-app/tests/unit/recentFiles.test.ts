/**
 * FL-05 — what the device cache keeps, and what it must never keep.
 *
 * The claim is about the BYTES ON DISK, so this reads them back through the
 * store rather than trusting the TypeScript type: `CachedFile` is a `Pick`,
 * and a `Pick` is erased at runtime. A test that asserted the type would be
 * asserting the compiler agreed with itself (hard rule 14) — what matters is
 * that a record carrying a signed `url` goes in and no `url` comes out.
 *
 * The key is spelled as a literal rather than imported for the same reason it
 * is documented that way in `lib/recentFiles.ts`: renaming it orphans the
 * cache on every device that already has one, so it is a change a test should
 * notice rather than follow.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { encryptedGet, wipeAllLocalData } from "@/lib/encryptedStore";
import { cacheFiles, cachedFiles } from "@/lib/recentFiles";
import { useParametersStore } from "@/stores/parameters";
import { defaultParameters } from "@/data/parameters";
import type { Attachment } from "@/data/types";
import * as SecureStore from "expo-secure-store";
import { getAdapter } from "@/data/provider";
import { useFilesStore } from "@/stores/files";
import { useSessionStore } from "@/stores/session";

const KEY = "jstack.recentFiles";

/**
 * What the store actually wrote, decrypted and parsed — not what the caller
 * handed it, and not what the type says.
 *
 * `encryptedGet` rather than a raw read because the value IS encrypted at rest
 * (SEC-06), which `it("is encrypted at rest")` below proves separately. The
 * encryption is orthogonal to the claim here: what matters is which FIELDS
 * survived `strip()`, and those are only legible after decryption.
 */
async function onDisk(): Promise<Record<string, unknown>[]> {
  const raw = await encryptedGet(KEY);
  if (raw == null) return [];
  return JSON.parse(raw) as Record<string, unknown>[];
}

const file = (over: Partial<Attachment> = {}): Attachment => ({
  id: "f1",
  name: "passport scan.pdf",
  kind: "pdf",
  size: 1024,
  storage: "store",
  folder: "/JSTACK/Personal/Travel",
  dropboxUrl: "https://www.dropbox.com/home/JSTACK/Personal/Travel/passport.pdf",
  previewText: "the first words the backend extracted",
  addedBy: "josh",
  at: new Date().toISOString(),
  labels: { silo: "family1", types: ["identity"], setBy: "josh" },
  setAt: new Date().toISOString().slice(0, 10),
  focus: "family",
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useParametersStore.setState({ parameters: defaultParameters() });
});

describe("FL-05 · the cache holds no credentials", () => {
  it("is encrypted at rest — file names and extracted text are content (SEC-06)", async () => {
    await cacheFiles([file()]);
    const raw = await AsyncStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    expect(raw as string).toContain("jstack-enc-v1:");
    // the plaintext is not sitting beside the ciphertext
    expect(raw as string).not.toContain("passport scan.pdf");
  });

  it("a signed url goes in and never reaches the disk", async () => {
    await cacheFiles([file({ url: "https://signed.example/abc?sig=SECRET", urlExpiresAt: new Date().toISOString() })]);

    const stored = await onDisk();
    expect(stored).toHaveLength(1);
    // the two forbidden keys, named — "no extra keys" would pass on a cache
    // that stored nothing at all
    expect(Object.keys(stored[0])).not.toContain("url");
    expect(Object.keys(stored[0])).not.toContain("urlExpiresAt");
    // and the secret is nowhere in the serialised bytes, however it got there
    expect(JSON.stringify(stored)).not.toContain("SECRET");
  });

  it("keeps the metadata, the preview and the Dropbox link — the half that makes it useful offline", async () => {
    await cacheFiles([file({ url: "https://signed.example/abc" })]);
    const [stored] = await onDisk();
    expect(stored.name).toBe("passport scan.pdf");
    expect(stored.kind).toBe("pdf");
    expect(stored.folder).toBe("/JSTACK/Personal/Travel");
    expect(stored.previewText).toBe("the first words the backend extracted");
    expect(stored.dropboxUrl).toContain("dropbox.com");
    expect(stored.addedBy).toBe("josh");
  });

  it("a field added to Attachment later is NOT persisted by accident", async () => {
    // the explicit `Pick` is the point: an unknown field arrives, and the
    // cache drops it rather than deciding on its own that it is safe to keep
    await cacheFiles([{ ...file(), somethingNew: "not for disk" } as unknown as Attachment]);
    expect(Object.keys((await onDisk())[0])).not.toContain("somethingNew");
  });
});

describe("FL-05 · the window", () => {
  it("reads back what is inside files.recentDays", async () => {
    await cacheFiles([file({ id: "recent", at: new Date().toISOString() })]);
    expect((await cachedFiles()).map((f) => f.id)).toEqual(["recent"]);
  });

  it("drops what is older, and drops it FROM DISK rather than hiding it", async () => {
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
    await cacheFiles([file({ id: "recent" }), file({ id: "stale", at: old })]);
    expect((await onDisk()).map((f) => f.id).sort()).toEqual(["recent", "stale"]);

    // default window is 14 days
    expect((await cachedFiles()).map((f) => f.id)).toEqual(["recent"]);
    // the expiry is WRITTEN BACK: a cache that only filtered on the way out
    // would keep the bytes forever while claiming a fourteen-day window
    expect((await onDisk()).map((f) => f.id)).toEqual(["recent"]);
  });

  it("the window is the PARAMETER, not a constant — a wider one keeps more", async () => {
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
    useParametersStore.setState({ parameters: defaultParameters().map((p) => (p.key === "files.recentDays" ? { ...p, value: 90 } : p)) });
    await cacheFiles([file({ id: "stale", at: old })]);
    expect((await cachedFiles()).map((f) => f.id)).toEqual(["stale"]);
  });

  it("newest first, and a re-cache replaces a row rather than duplicating it", async () => {
    const older = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    await cacheFiles([file({ id: "a", at: older }), file({ id: "b" })]);
    await cacheFiles([file({ id: "a", at: older, name: "renamed.pdf" })]);

    const rows = await cachedFiles();
    expect(rows.map((f) => f.id)).toEqual(["b", "a"]);
    expect(rows.find((f) => f.id === "a")?.name).toBe("renamed.pdf");
  });
});

/**
 * WPA-16 (WP-H, v2.3) — the audit's D1 in smaller clothes: a Files read answered before `POST /lock`, landing after the
 * wipe, put its file details back on the wiped device through `encryptedSet`, which minted a fresh key for them, and
 * reading the cache under the lock wrote back its drop of expired entries. While the emergency lock is on, the cache
 * keeps nothing new — A-13's rule.
 */
describe("WPA-16 · under the emergency lock the file cache keeps nothing new", () => {
  const keychain = (SecureStore as unknown as { __store: Map<string, string> }).__store;
  afterEach(() => useSessionStore.setState({ emergency: false, locked: false }));

  it("a Files load answered after the lock landed and the device was wiped writes nothing and mints no key", async () => {
    const real = await getAdapter().getFiles();
    await wipeAllLocalData(); // no key and nothing on disk, as on a device the wipe has been through
    let answer: (list: typeof real) => void = () => {};
    const files = jest.spyOn(getAdapter(), "getFiles").mockImplementationOnce(() => new Promise<typeof real>((resolve) => (answer = resolve)));
    try {
      const load = useFilesStore.getState().loadRecent();
      useSessionStore.setState({ emergency: true, locked: true });
      await wipeAllLocalData();
      answer({ ...real, attachments: [file()] });
      await load;
      expect({ shown: useFilesStore.getState().recent.length, onDisk: await AsyncStorage.getAllKeys(), keyMinted: keychain.has("jstack.enc.key.v1") }).toEqual({
        shown: 1,
        onDisk: [],
        keyMinted: false,
      });
    } finally {
      files.mockRestore();
    }
  });

  it("an expired entry is not written back while the lock is on — the read still hides it", async () => {
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
    await cacheFiles([file({ id: "recent" }), file({ id: "stale", at: old })]);
    const before = await AsyncStorage.getItem(KEY);
    useSessionStore.setState({ emergency: true, locked: true });
    const shown = (await cachedFiles()).map((f) => f.id);
    expect({ shown, unchangedOnDisk: (await AsyncStorage.getItem(KEY)) === before }).toEqual({ shown: ["recent"], unchangedOnDisk: true });
  });
});
