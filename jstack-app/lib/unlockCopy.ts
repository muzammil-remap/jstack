/**
 * The words for the unlock mechanism, in one place, because they differ by
 * platform and are shown on four surfaces.
 *
 * The web runs a real passkey/WebAuthn ceremony (`lib/webauthnGate.ts`); a
 * phone unlocks through expo-local-authentication (`components/chrome/Gate.tsx`).
 * Until A-6 the copy said "passkey" on both platforms while the gate's
 * accessible NAME said "Unlock with Face ID" on both, so on the web the name
 * contradicted the label beside it — WCAG 2.5.3 Label in Name, which is the
 * rule that makes "tap Unlock with passkey" work for a speech-input user — and
 * on a phone the screen offered a mechanism that platform does not run. The
 * planner found the pair on the 20:26 mock at 393 (12 September 2026).
 *
 * The label and the name are ONE string here rather than two strings that
 * happen to agree, which is what stops them drifting apart again.
 *
 * Guards: `tests/native/screens.test.tsx` (the native pair, 2.5.3),
 * `e2e/matrix/theme.spec.ts` "label in name" (the web sweep, every control on
 * the gate and all five tabs), `tests/unit/security.test.ts` (no user-visible
 * copy names the mechanism except through this file).
 */
import { Platform } from "react-native";

/**
 * The mechanism as a noun: "passkey" in a browser, "Face ID" on a phone.
 *
 * Not exported: every user-visible form of it is below, and an export nothing
 * imports is a hole in CT-06's sweep. A surface that needs the word takes one
 * of the sentences, which is the point of this file.
 */
const UNLOCK_MECHANISM = Platform.OS === "web" ? "passkey" : "Face ID";

/** the lock button's visible label AND the gate's accessible name — one string, so 2.5.3 holds by construction */
export const UNLOCK_LABEL = `Unlock with ${UNLOCK_MECHANISM}`;

/** the sentence above the button (the web wording is pinned by `e2e/core/lock.spec.ts` and `shell.spec.ts`) */
export const UNLOCK_SENTENCE = Platform.OS === "web" ? "Locked. Unlock with your passkey." : "Locked. Unlock with Face ID.";

/** the toast a completed ceremony fires */
export const UNLOCKED_TOAST = `Unlocked with ${UNLOCK_MECHANISM}`;

/**
 * The re-assertion a high-risk verb demands (`lib/highRisk.ts`: Face ID on a
 * phone, the passkey ceremony in a browser), as the object of "needs …".
 * Spelled out rather than composed from UNLOCK_MECHANISM because "needs a
 * fresh passkey" reads as an instruction to create one; what is being asked
 * for is a fresh CHECK.
 */
export const FRESH_CHECK = Platform.OS === "web" ? "a fresh passkey check" : "a fresh Face ID";

/** what recovery asks for, on the emergency screen and in its confirm */
export const RECOVERY_NEEDS = `Recovery needs your ${UNLOCK_MECHANISM} and recovery key; secrets rotate before anything resumes`;

/** the emergency screen's longer form of the same sentence */
export const RECOVERY_SENTENCE = `Recovery: your ${UNLOCK_MECHANISM} and the recovery key. All secrets rotate first, then your session, then the agents one at a time as their checks pass.`;

/**
 * v2.3.1 WPN-1 — the packaged mock's own way in on a page that cannot run a passkey ceremony (a file opened from disk,
 * a browser with none). Web only, and only while the app runs on its in-process mock (`components/chrome/Gate.tsx`):
 * a build pointed at a server never renders it. Josh, 15 Sep: "It's a mock."
 */
export const MOCK_SIGN_IN_LABEL = "Continue — passkeys unavailable here, mock sign-in";

/** the one line under it that says why */
export const MOCK_SIGN_IN_NOTE = "This page cannot run a passkey (a file opened from disk, or a browser without one), so the mock signs in with its fixture data.";

/** the toast once it has */
export const MOCK_SIGNED_IN_TOAST = "Signed in to the mock · fixture data";
