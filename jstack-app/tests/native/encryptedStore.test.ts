/**
 * A-6 (WP-A, v2.3) — A4R8-05: one key mint on native.
 *
 * The encrypted store memoised its web key and not its native one, so at the first use of
 * the store — a fresh install, or the first write after a wipe — two writers could each find
 * no key in the Keychain and each mint one, and the second mint replaced the first: whatever
 * the first writer had sealed could not be opened again. The audit measured it as one
 * ordering in thirteen, and it lands on the captures that matter most, the first ones. Driven
 * in the native lane, where the SecureStore branch runs, counting the Keychain writes of the
 * key and reading both values back.
 */
import * as SecureStore from "expo-secure-store";
import { encryptedGet, encryptedSet, wipeAllLocalData } from "@/lib/encryptedStore";

const KEY_ID = "jstack.enc.key.v1";
const setItem = SecureStore.setItemAsync as jest.Mock;
const mints = () => setItem.mock.calls.filter(([k]) => k === KEY_ID).length;
const keychain = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(async () => {
  // the first use of the store: nothing in the Keychain, nothing on disk
  await wipeAllLocalData();
  setItem.mockClear();
});

describe("A-6 · one key mint on native (A4R8-05)", () => {
  it("two writes at the first use of the store mint one key between them, and both read back", async () => {
    await Promise.all([encryptedSet("jstack.first", "the first capture"), encryptedSet("jstack.second", "the second, a moment later")]);
    expect({ mints: mints(), first: await encryptedGet("jstack.first"), second: await encryptedGet("jstack.second") }).toEqual({
      mints: 1,
      first: "the first capture",
      second: "the second, a moment later",
    });
  });

  it("after a wipe the next write mints afresh rather than sealing with the key the wipe deleted", async () => {
    await encryptedSet("jstack.before", "before the wipe");
    await wipeAllLocalData();
    setItem.mockClear();
    await encryptedSet("jstack.after", "after the wipe");
    expect({ mints: mints(), keyInKeychain: keychain.has(KEY_ID), readBack: await encryptedGet("jstack.after") }).toEqual({
      mints: 1,
      keyInKeychain: true,
      readBack: "after the wipe",
    });
  });
});

/**
 * WPA-16 (WP-H, v2.3) — a key mint the wipe overtakes: the first seal on a device reads the Keychain, finds no key and
 * mints one, and a wipe that ran while it was reading used to have that key put back after it. The seal it was minted
 * for is refused by the wipe count; the key is kept nowhere.
 */
describe("WPA-16 · a key mint the wipe overtakes keeps no key", () => {
  it("a mint held at its Keychain read while the wipe runs puts no key back after it", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const read = SecureStore.getItemAsync as jest.Mock;
    read.mockImplementationOnce(async (k: string) => {
      await gate;
      return keychain.get(k) ?? null;
    });
    const writing = encryptedSet("jstack.first", "the first capture on this device");
    await wipeAllLocalData();
    release();
    await writing;
    expect({ keyInKeychain: keychain.has(KEY_ID), onDisk: await encryptedGet("jstack.first") }).toEqual({ keyInKeychain: false, onDisk: null });
  });
});
