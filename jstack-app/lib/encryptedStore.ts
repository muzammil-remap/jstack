/**
 * Encrypted persistence (spec §14.9 — SEC-06): AES-256-GCM around the app's
 * only persistent store.
 *
 *  - native: key material lives in the Keychain (expo-secure-store),
 *    cipher = @noble/ciphers (pure JS, audited; Hermes has no WebCrypto).
 *  - web: a NON-EXTRACTABLE WebCrypto key kept in IndexedDB — the key
 *    material is never readable by script, and nothing key-like touches
 *    localStorage/sessionStorage (SEC-09).
 *
 * The persisted bytes never hold plaintext. Sens content is kept too, as
 * ciphertext, where Josh decided it should be: the offline copies of the
 * planning tabs (`lib/lastSeen.ts`, WPI-1 — §9's "not persisted client-side",
 * revised for them). `wipeAllLocalData` is what the emergency lock does to this
 * device (`lib/emergencyWipe.ts`, AG-12).
 *
 * WPI-2: on native the store says whether it can keep anything at all —
 * `secureStoreStatus()`, from `crypto.getRandomValues` and boot's probe — and
 * what writes through it (the queue, the offline copies, the file cache, the
 * preferences) keeps nothing while it cannot.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const MAGIC = "jstack-enc-v1:";
const IDB_DB = "jstack-keys";
const IDB_STORE = "keys";
const NATIVE_KEY_ID = "jstack.enc.key.v1";

// ─── native cipher (@noble, key in SecureStore) ─────────────────────────────

/**
 * A-6 (A4R8-05): single-flight, as the web key is. At the first use of the store two
 * writers used to find no key and each mint one; the second mint replaced the first in
 * the Keychain, and whatever the first had sealed could not be opened again. A read or
 * mint that fails is not remembered, and the wipe forgets the key it deletes.
 */
let nativeKeyPromise: Promise<Uint8Array> | null = null;
function nativeKey(): Promise<Uint8Array> {
  if (nativeKeyPromise == null) {
    const p = readOrMintNativeKey();
    nativeKeyPromise = p;
    void p.catch(() => {
      if (nativeKeyPromise === p) nativeKeyPromise = null;
    });
  }
  return nativeKeyPromise;
}

async function readOrMintNativeKey(): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
  const before = wipes;
  let hex = await SecureStore.getItemAsync(NATIVE_KEY_ID);
  if (!hex) {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    hex = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
    // WPA-16: a mint the wipe overtook keeps no key in the Keychain; the seal it was minted for is refused by the count
    if (wipes === before) await SecureStore.setItemAsync(NATIVE_KEY_ID, hex, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  return Uint8Array.from(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
}

/** The native cipher with its key handed in: what the store seals and opens with, and what boot's probe tries under a key it throws away (WPI-2). */
function nativeSealWith(key: Uint8Array, plain: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gcm } = require("@noble/ciphers/aes.js") as typeof import("@noble/ciphers/aes.js");
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const ct = gcm(key, nonce).encrypt(new TextEncoder().encode(plain));
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce);
  out.set(ct, nonce.length);
  let bin = "";
  for (const b of out) bin += String.fromCharCode(b);
  return MAGIC + btoa(bin);
}

function nativeOpenWith(key: Uint8Array, payload: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gcm } = require("@noble/ciphers/aes.js") as typeof import("@noble/ciphers/aes.js");
  const raw = Uint8Array.from(atob(payload.slice(MAGIC.length)), (c) => c.charCodeAt(0));
  const plain = gcm(key, raw.slice(0, 12)).decrypt(raw.slice(12));
  return new TextDecoder().decode(plain);
}

async function nativeEncrypt(plain: string): Promise<string> {
  return nativeSealWith(await nativeKey(), plain);
}

async function nativeDecrypt(payload: string): Promise<string> {
  return nativeOpenWith(await nativeKey(), payload);
}

// ─── web cipher (WebCrypto, non-extractable key in IndexedDB) ───────────────

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, k: string): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(k);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, k: string, v: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(v, k);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** WPA-14: every row of the key store goes with the wipe, so no key that sealed this device's bytes outlives it */
function idbClearKeys(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

let webKeyPromise: Promise<CryptoKey> | null = null;
function webKey(): Promise<CryptoKey> {
  webKeyPromise ??= (async () => {
    const before = wipes;
    const db = await idb();
    const existing = await idbGet(db, "kv");
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false /* non-extractable */, ["encrypt", "decrypt"]);
    // WPA-16: a mint the wipe overtook keeps no key row — checked on the tick the row's transaction opens, so a wipe that
    // starts after it clears the row with the rest; the seal it was minted for is refused by the count
    if (wipes !== before) return key;
    await idbPut(db, "kv", key);
    return key;
  })();
  return webKeyPromise;
}

/**
 * WPA-14: what a read opens with — the key at rest, never a new one. A key minted to open bytes sealed under another
 * opens nothing, and after the wipe it would leave a key row behind. A key found is remembered only if no wipe ran
 * while it was being read: that key is the one the wipe deleted.
 */
async function webKeyToRead(): Promise<CryptoKey | undefined> {
  if (webKeyPromise != null) return webKeyPromise;
  const before = wipes;
  const found = await idbGet(await idb(), "kv");
  if (found != null && wipes === before && webKeyPromise == null) webKeyPromise = Promise.resolve(found);
  return found;
}

async function webEncrypt(plain: string): Promise<string> {
  const key = await webKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  let bin = "";
  for (const b of out) bin += String.fromCharCode(b);
  return MAGIC + btoa(bin);
}

async function webDecrypt(payload: string): Promise<string> {
  const key = await webKeyToRead();
  if (key == null) throw new Error("no key on this device"); // `unseal` reads it as absent
  const raw = Uint8Array.from(atob(payload.slice(MAGIC.length)), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return new TextDecoder().decode(plain);
}

// ─── public surface ─────────────────────────────────────────────────────────

/**
 * How many times this device has been wiped since the app started (A-3). A write
 * reads it before it encrypts and again before it lands: encryption awaits the
 * key, and a wipe that runs inside that await has emptied the device, so the
 * write must not put anything back. `lib/lastSeen.ts` reads it for the copies it
 * is still holding.
 */
let wipes = 0;
export const wipeCount = (): number => wipes;

/** What this device's encrypted store can do (WPI-2): `reason` says why when it can keep nothing. */
export type SecureStoreStatus = { status: "ok" | "unavailable"; reason: string | null };

const SECURE_OK: SecureStoreStatus = { status: "ok", reason: null };
const NO_RANDOM: SecureStoreStatus = { status: "unavailable", reason: "crypto.getRandomValues is not provided on this device" };
/** boot's round trip, once it has run — never the missing function, which is read afresh at every call */
let probed: SecureStoreStatus | null = null;

const hasGetRandomValues = (): boolean => typeof (globalThis as { crypto?: { getRandomValues?: unknown } }).crypto?.getRandomValues === "function";

/**
 * WPI-2: whether this device can keep anything encrypted. Web answers ok: WebCrypto is the platform's own. On native a
 * missing `crypto.getRandomValues` answers at once — nothing the v2.3 tree ships provides it on Hermes, and the key mint
 * and every seal call it (`HANDOVER.md` §7, "Native crypto — what to add") — and boot's probe answers the rest.
 */
export function secureStoreStatus(): SecureStoreStatus {
  if (Platform.OS === "web") return SECURE_OK;
  if (!hasGetRandomValues()) return NO_RANDOM;
  return probed ?? SECURE_OK;
}

function roundTrip(): SecureStoreStatus {
  const value = "jstack secure store probe";
  try {
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);
    return nativeOpenWith(key, nativeSealWith(key, value)) === value ? SECURE_OK : { status: "unavailable", reason: "a sealed value did not open again" };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Boot's probe, on native (WPI-2): a short value sealed and opened again by the store's own cipher, under a key minted
 * for the probe and thrown away — so the probe keeps nothing, and mints no key the wipe would have to find. Never throws.
 */
export async function probeSecureStore(): Promise<SecureStoreStatus> {
  if (Platform.OS === "web") return SECURE_OK;
  if (!hasGetRandomValues()) return NO_RANDOM;
  const found = roundTrip();
  probed = found;
  return found;
}

/**
 * The cipher without the storage (A-4): for a store that keeps its own bytes —
 * the web outbox, in IndexedDB — and must still keep them as ciphertext. The
 * same key, the same format, and the same one-time read of a value written
 * before there was encryption.
 */
export async function seal(plain: string): Promise<string> {
  return Platform.OS === "web" ? webEncrypt(plain) : nativeEncrypt(plain);
}

export async function unseal(payload: string): Promise<string | null> {
  if (!payload.startsWith(MAGIC)) return payload; // pre-encryption value (one-time migration read)
  try {
    return Platform.OS === "web" ? await webDecrypt(payload) : await nativeDecrypt(payload);
  } catch {
    return null; // wrong key / corrupted — treat as absent, reseed
  }
}

export async function encryptedSet(storageKey: string, plain: string): Promise<void> {
  const before = wipes;
  const payload = await seal(plain);
  if (wipes !== before) return;
  await AsyncStorage.setItem(storageKey, payload);
}

export async function encryptedGet(storageKey: string): Promise<string | null> {
  const payload = await AsyncStorage.getItem(storageKey);
  return payload == null ? null : unseal(payload);
}

export async function encryptedRemove(storageKey: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey);
}

/** §9 remote wipe: clears every locally persisted byte — the offline copies (A-3)
 * with the rest, and the cipher key that sealed them on both platforms (WPA-14) —
 * and counts itself first, so a write already under way cannot
 * land after it (`wipes`). */
export async function wipeAllLocalData(): Promise<void> {
  wipes += 1;
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove([...keys]);
  if (Platform.OS !== "web") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
    await SecureStore.deleteItemAsync(NATIVE_KEY_ID);
    // A-6: forgotten only once the Keychain has let it go, so no write in between remembers a key being deleted
    nativeKeyPromise = null;
    return;
  }
  // WPA-14: the web key used to stay, and a value sealed before the wipe still opened after a reload. Every key row
  // goes, and, as A-6 orders it on native, the key is forgotten only once IndexedDB has let it go
  if ((globalThis as { indexedDB?: IDBFactory }).indexedDB != null) await idbClearKeys(await idb());
  webKeyPromise = null;
}
