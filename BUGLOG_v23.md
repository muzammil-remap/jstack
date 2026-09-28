# BUGLOG_v23.md — JSTACK v2.3 build log

Format per row: `A-nn` for an executor decision (routine default taken, no ADR needed) or
`B-nn` for a bug found and fixed; each package prefixes its own (`WPA-` to
`WPG-`). State the row, the finding, the default or fix taken, and why. Continues
`BUGLOG_v22.md` (its numbering stands; numbering restarts here, scoped to v2.3).

Every row names the test that was red before the fix and what it printed.

---

## Row 0 — baseline on `v23-build`

`v23-build` created from `main` at tag `v2.2` (`ff89c004`, the 14 Sep re-tag).

**A-01 · the pre-push guard now needs three audits, so two V2.2 expectations change.** Row 0
extends `.githooks/pre-push` so a push to `main` is refused unless `AUDIT_v23.md` also carries
a signed LAST verdict (the hook's own instruction: "add the next version's audit when that build
starts; never remove one"). `tests/unit/hooks.test.ts` printed, after the hook change and before
the test moved:

```
● RR-05 · … › D9: a later round's sign-off reopens main after an earlier round found defects
  Expected: 0  Received: 1
● RR-05 · … › allows a push to main once BOTH audits say SIGNED OFF …
  Expected: 0  Received: 1
```

Both cases now sign all three audits, a new case proves two signed audits alone are refused naming
`AUDIT_v23.md`, and the live-file case for `AUDIT_v23.md` mirrors the V2.2 one. The V2.1 and V2.2
rules are not weakened.

**B-01 · in a linked worktree the pre-commit hook staged the five maps at the repo root.** Found
by build opus 1 (`f194429e` on `v23/wpa`) and build opus 2 (`6eef5f23` on `v23/wpb`) within
minutes of each other: git runs hooks with an absolute `GIT_DIR` and no `GIT_WORK_TREE`, so after
the hook's `cd jstack-app` the relative `git add` treated `jstack-app/` as the top of the tree.
On CI it showed as `security.test.ts` "CODEMAP.md:1205 contains U+0008" (the root copy). Fixed at
`2a91fad2`: the hook exports `GIT_WORK_TREE="$ROOT"` and adds the maps by absolute path. Guards:
`tests/unit/workflows.test.ts`, `tests/unit/security.test.ts` (55/55), and the builders' branches
checked with `git ls-tree --name-only HEAD` for root copies.

---

## WP-A — Offline: the plane test

**WPA-1 · A phone in flight mode read "online".** `lib/syncInstall.ts` took the connection from
`window`'s `online`/`offline` events and `navigator.onLine`, and React Native has none of them: on the
iPhone build `session.online` stayed `true` whatever the radio did, so the sync dot said "ok", every
capture tried the dead connection before it queued, and nothing ever moved the flag back. Fixed
without a dependency by reading the connection off the requests. `data/transport/reachability.ts`
wraps the HTTP transport under the outbox: a network failure (the outbox's own `isNetworkFailure`
class, now exported, so the app counts itself offline exactly when a capture would queue) sets
`online: false`; any answer, 2xx to 5xx, sets it `true`; any other error says nothing.
`data/provider.ts` writes only a change. While offline with something queued, the 30-second retry in
`lib/syncInstall.ts` first asks `GET /capabilities` (`stores/sync.ts` `probe`) and replays on the same
tick. The browser's events stay as a second signal on web. The mock transport is not wrapped: it has
no network to lose, and the rig's `goOffline` stays the e2e board's only word on the connection.

*File:* `jstack-app/data/transport/reachability.ts` (new), `jstack-app/data/provider.ts`,
`jstack-app/stores/sync.ts`, `jstack-app/lib/syncInstall.ts`, `jstack-app/data/transport/outbox.ts`.

*Red first:* `reachability.test.ts`, four of its six cases before the fix — "a request that fails at the network layer takes the session offline, with no window event anywhere" (its name since the word cleanup at the end of WP-A) printed `"online": true` where `false` was expected; "once it knows, a capture queues at once instead of trying the dead connection first" printed `"tried": ["POST /brain/dump"]`; "the next answer brings it back — any answer, because a refusal still had to reach the server" printed `"afterOk": false`; "offline with a capture waiting, the 30-second retry asks GET /capabilities, and the answer brings the status and the queue back on their own" printed `[]` for what was sent. The other two keep the fix from overreaching and were green before it, so each was planted red and restored: with every error read as a lost connection, "an error that is not the network's says nothing about the connection" printed `Received: false`; with the timer's queue check removed, "with nothing queued the timer stays quiet" printed `["GET /capabilities", "GET /capabilities"]`.

*Consequence recorded:* in the e2e swap mode (the suite against a real server, not run since `v1.2`)
the rig's `goOffline` is overruled by the next request that gets an answer, so an offline spec there
needs `context.setOffline` as well.

*Counts moved:* the new suite moves the board to 2155 Jest tests across 106 suites, and QA-02
(`handover.test.ts`) and QA-03 (`qaReport22.test.ts`) failed the Brisbane run on the old 2149/105
in `HANDOVER_v2.md`, `QA_REPORT_v2.md` and `QA_REPORT_v22.md` §3 — so those move in this commit,
with `evidence/jest-summary.json` from the full run (PROTOCOL §3).

*Commit:* `fix(v2.3): wpa-1 — the connection is read off the requests` — `f194429e`, and `98dc29d4`
taking out five maps the pre-commit hook staged at the repo root: in a linked worktree git exports
`GIT_DIR` to hooks without `GIT_WORK_TREE`, so the hook's `cd jstack-app` became the top of the
tree. A probe hook that dumped its environment and refused the commit (nothing committed) showed
more: exported, `GIT_WORK_TREE` reaches the hook as `.`, which the hook's own `cd` turns into
`jstack-app/` — so no setting fixes it from outside, and A-2's first commit staged the five again.
Every commit here is checked for the five root paths and cleaned by an additive commit before it
is pushed; row 0's B-01 records the integration fix (`2a91fad2`: the hook exports `GIT_WORK_TREE` and stages by absolute path), merged into this branch.

**WPA-2 · Offline with nothing cached, a tab was a title over an empty page.** The five tab stores'
`load()` had no catch, and every tab calls it fire-and-forget from an effect, so a first load that
failed — flight mode on a cold open — was an unhandled rejection: `composite` stayed null and Today
read "Today" over an empty date, Tasks "0 open · 0 waiting" over nothing, and Brain, Life and Agents
the same. `lib/loadError.ts` `recordLoad` now wraps the `load` of today, tasks, brain, life and
agents: a failure is recorded as `loadError` in the error's own words and never thrown, and the next
load that gets through clears it. `layout/TabScreen.tsx` takes an `onRetry` that each tab passes only
while its load has failed with nothing from before to show; the columns then give way to one `Ghost`
sentence (`components/chrome/TabUnavailable.tsx`, testID `tab-unavailable-${tab}`) — "You're offline
· captures still queue" when `session.online` is false, "Couldn't load · tap to retry" otherwise —
and both take the tap, because on a phone the retry is how the tab, and the reachability layer,
learn the connection is back. `stepAnchor` moved from `stores/today.ts` to `lib/timeGrid.ts` to make
room under the 200-line store cap. The control is documented in `CONTROLS_v2.md` §1.9.

*File:* `jstack-app/lib/loadError.ts` (new), `jstack-app/components/chrome/TabUnavailable.tsx` (new),
`jstack-app/layout/TabScreen.tsx`, `jstack-app/stores/today.ts`, `jstack-app/stores/tasks.ts`,
`jstack-app/stores/brain.ts`, `jstack-app/stores/life.ts`, `jstack-app/stores/agents.ts`,
`jstack-app/lib/timeGrid.ts`, the five files in `jstack-app/app/(tabs)/`, `CONTROLS_v2.md`.

*Red first:* `today.test.ts`, `tasks.test.ts`, `brain.test.ts`, `life.test.ts` and `agents.test.ts`, before the fix — in all five, "a rejecting read leaves loadError set, … as it was, and a load that resolves, so nothing is thrown at the tab" printed `"loadError": undefined` and `"settled": "rejected"`, and "the next load that gets through clears it" printed `"loadError": undefined` where `null` was expected; `screens.test.tsx` — "offline it says captures still queue; online it offers a retry, and the retry loads the tab" printed `"offline": false`, beside Jest's own report of the rejection, `TypeError: Network request failed`.

*Deviation, recorded:* WP-A asked for `process.on('unhandledRejection')` in the test. The first red run
showed it cannot work under jest-circus: the counter read 0 in all five store cases while Jest's own
handler reported "TypeError: Network request failed" against each of them. A counter that reads 0
either way is a guard that cannot go red, so the shared harness (`tests/unit/stores/failingLoad.ts`)
asserts how `load()`'s own promise settled instead — the tab does `void load()`, and a load that
resolves cannot reject into nothing — and the cases were rewritten, and watched fail again, before
any source changed. The same first run caught the native case leaving its render mounted when an
assertion threw, so the store reset re-rendered it outside `act()`; it unmounts first now.

*Left as found, not this item's:* the tabs' secondary fire-and-forget loads — the replies on Today and
Brain, and Tasks' waiting rows and open count — still reject into nothing offline. Each draws nothing
when it fails, and none is a tab's primary load.

*Commit:* `fix(v2.3): wpa-2 — a tab whose load failed says so` — `8f7c5fa1`, and `3a918751` taking out
the five root maps the pre-commit hook staged again.

**WPA-3 · Offline, the tabs Josh plans from had nothing to plan with.** With no connection a cold
open had no Today, no task list and no Brain to look at; A-2 made that a sentence rather than a
blank page, and this row gives the three planning tabs something to show. `lib/lastSeen.ts` keeps
one copy each of the last Today composite, the Tasks list for the filter it was loaded under, and
Brain's recent items — written through `lib/encryptedStore.ts` after every successful load,
coalesced to one write at a time per tab with no timer, scoped by focus (and for Tasks by view,
slicer, query and filters), and shown only when a load fails while `session.online` is false,
through `recordLoad`'s new fallback, which runs before the failure is recorded so a tab with a copy
never flashes A-2's sentence first. A copy is never on screen without "last updated <formatAgo> ·
offline": Today's delta line says it, and Tasks and Brain now pass one to `TabScreen`. A record
marked `sens` (the contract) or `sensitive` (the triage), in itself or in a record it holds, is
dropped before the write, and nothing is kept for Life, Agents, Settings or search (ADR-66).
`wipeAllLocalData` already removed every key; it now counts itself first, and `encryptedSet`
refuses a write the wipe overtook, so a copy under way cannot land on an emptied device.
`keptShare` moved from `stores/brain.ts` to `lib/shareDraft.ts` for the room under the store cap.

*File:* `jstack-app/lib/lastSeen.ts` (new), `jstack-app/lib/shareDraft.ts` (new),
`jstack-app/lib/encryptedStore.ts`, `jstack-app/lib/loadError.ts`, `jstack-app/stores/today.ts`,
`jstack-app/stores/tasks.ts`, `jstack-app/stores/brain.ts`, `jstack-app/app/(tabs)/tasks.tsx`,
`jstack-app/app/(tabs)/brain.tsx`, `DECISIONS.md`.

*Red first:* `lastSeen.test.ts`, eight of its nine cases before the fix — "Today: a load that fails offline shows the last good composite under a 'last updated … · offline' line" printed `"line": undefined` and `"shown": undefined`; "Tasks: the copy is the list for the filter it was loaded under, and another filter gets none" printed `"ids": []` and `"stale": false`, as did "Brain: a load that fails offline shows the last recent items, marked with when they are from"; "nothing marked sens or sensitive reaches the store, the rest does, and it is ciphertext at rest" printed `"ciphertext": false`; "only the three planning tabs are kept — Life, Agents and Settings leave nothing behind" printed no keys at all; "one write per load: back-to-back loads leave the latest copy, not a queue of them" printed `"writesPerLoadAtMostOne": false`; "the emergency wipe removes every copy" printed `before` all false; and "a write already under way when the wipe runs cannot put a copy back" printed `"copyAfterWipe": true`. The ninth, "online, a failed load never shows an old copy — that is A-2's sentence, not a stale page", was green before the fix, so it was planted red — with `offlineCopy` no longer checking the connection it printed the whole composite and a `stale` time where `null` was expected — and restored.

*The first red run was not honest, and was run again:* the in-flight case passed before any guard
existed. A throwaway probe proved the defect real (the late write landed after the wipe) and the
fault in the test file: the one-write case spied on `AsyncStorage.setItem`, which is already a
`jest.fn`, and restoring that spy stripped its implementation, so every later write in the file
stored nothing. The case reads the mock's own call log now, and the second red run is the one
quoted above.

*Expectation changes, recorded:* ADR-66 is the sixty-sixth decision, so RM-09 in
`consolidation.test.ts` moves its pinned count from 65 to 66 — the literal a numbered row is meant
to move. And the native A-2 case in `screens.test.tsx` now removes the Today copy before it
renders: its promise is "offline with nothing cached", and since A-3 an earlier render in that file
leaves a copy, so the tab showed the copy — correctly — instead of the sentence. Its expectation is
unchanged; its precondition is stated.

*Commit:* `fix(v2.3): wpa-3 — offline, the planning tabs show their last copy` — `71fcf818`, and `98b8052c`
taking out the five root maps the old hook staged once more, before `origin/v23-build` (row 0's fixed
hook) was merged at `86863e58` and the counts moved after it at `b2d32142`.

**WPA-4 · The web outbox kept a capture in plain words.** `lib/queueStore.ts` said both tiers were
encrypted at rest, and only the native one was: the web tier put each `OutboxEntry` into IndexedDB as
it was, so a capture made offline in the browser sat on the disk in Josh's own words for as long as
the connection stayed down. `lib/encryptedStore.ts` now exports its cipher without its storage —
`seal` and `unseal`: the same key, the same format and the same one-time read of a value written
before encryption, with `encryptedSet` and `encryptedGet` rebuilt on them — and the web tier writes
each row as `{ offlineId, sealed }`, still keyed by `offlineId`, and unseals on read. A row written
plain before the upgrade is read once as it is rather than dropped, because it is somebody's capture
still waiting to go; a row that will not unseal reads as absent, as it already did on native. The
module comment is true now.

*File:* `jstack-app/lib/encryptedStore.ts`, `jstack-app/lib/queueStore.ts`,
`jstack-app/tests/unit/fakeIndexedDb.ts` (new, test-only).

*Red first:* `outbox.test.ts` — "a queued capture's words are not in its IndexedDB row, the row is still keyed by its offlineId, and the queue reads the words back" printed `"plaintext": true` where `false` was expected, with no sealed marker, over an in-memory IndexedDB (`fakeIndexedDb.ts`, exactly the calls the web queue and the web key store make, since the repo takes no dependency). The other two cases were green before the fix, so each was planted red on its own and restored: with a plain pre-upgrade row dropped, "an entry queued before the upgrade — plain in IndexedDB — still reads back rather than being lost" printed the missing `"queued before the upgrade"`; with the web tier no longer ordering what it reads, "entries still read back in the order they were captured, and remove and clear still work" printed the two ids the wrong way round.

*Left as found:* a web put still sealing when the emergency wipe clears the outbox can land after the
clear — `wipeThisDevice` clears the queue before `wipeAllLocalData` counts itself, so A-3's guard does
not reach it. It needs a capture in flight at the moment of the lock.

*Commit:* `fix(v2.3): wpa-4 — the web outbox at rest is ciphertext` — `f94b857f`.

**WPA-5 · A4R7-08 — a capture the server refused was lost on reload.** A refusal leaves the queue and
goes on the conflict list with the server's reason, which is how no capture is dropped in silence
(OF-07) — but the list lived only in `stores/sync.ts`'s memory, so a reload dropped the words anyway,
later and quietly. The queue store now keeps the refused captures beside the queue, in the same
tier: in memory for the memory tier, under a second encrypted key on native
(`jstack.outbox.conflicts`), and on web in a `conflicts` object store that IndexedDB version 2 adds
beside the outbox, as one sealed row. `clear()` takes them with the queue, so the emergency wipe
removes refused words as well as queued ones. The outbox passes them through (`storedConflicts`,
`keepConflicts`); the sync store loads them at boot (`loadConflicts`, called by `lib/syncInstall.ts`
beside `refresh`, merging by `offlineId` so nothing refused before the read landed is listed twice),
keeps the grown list after a replay that refused something, and keeps the shrunk list on Dismiss.
Copy and Dismiss in Settings › Sync are unchanged.

*File:* `jstack-app/lib/queueStore.ts`, `jstack-app/data/transport/outbox.ts`,
`jstack-app/stores/sync.ts`, `jstack-app/lib/syncInstall.ts`.

*Red first:* `sync.test.ts` — "refused, then reloaded: the row is still there with its words and the server's reason, and Dismiss clears it for good" printed `"reloaded": []` where the refused capture was expected with its words and the reason "changed on the server since you captured this". The reload is the app's sync modules loaded afresh in an isolated registry over the same AsyncStorage and SecureStore instances — a reload loses memory, not the disk — and booted through `installSync`. That case runs in the native lane, so the web tier has its own guard in `outbox.test.ts`, green on arrival and so planted red: with the web tier's `saveConflicts` keeping nothing, "saved through one store and read through the next, its row holds no words, and clear takes it with the queue" printed `"kept": []` and `"sealed": false`, and was restored.

*Commit:* `fix(v2.3): wpa-5 — a refused capture survives a reload` — `e7927b3e`.

**WPA-6 · A4R8-05 — two first writes on the phone could each mint a key.** `lib/encryptedStore.ts`
memoised the web key (`webKeyPromise`) and not the native one: `nativeKey()` read the Keychain and,
finding nothing, minted a key and wrote it. At the first use of the store — a fresh install, or the
first write after the emergency wipe — two writes that started together each found no key and each
minted one, and the second `setItemAsync` replaced the first, so whatever the first write had sealed
could never be opened again. The audit measured it as one ordering in thirteen, and it falls on the
first captures. `nativeKey()` is single-flight now, as the web key is: one promise for every caller,
forgotten if the read or the mint fails so a later write can try again, and forgotten by
`wipeAllLocalData` once the Keychain has deleted the key, so the first write after a wipe mints
afresh instead of sealing with a key that is gone.

*File:* `jstack-app/lib/encryptedStore.ts`, `jstack-app/tests/native/encryptedStore.test.ts` (new).

*Red first:* `tests/native/encryptedStore.test.ts` — "two writes at the first use of the store mint one key between them, and both read back" printed `"mints": 2` and `"first": null` where one mint and "the first capture" were expected. The second case, "after a wipe the next write mints afresh rather than sealing with the key the wipe deleted", was green before the fix, because nothing was remembered then, so it was planted red once the key was: with the wipe no longer forgetting it, it printed `"mints": 0` and `"keyInKeychain": false` (the write sealed with the deleted key, readable only until the app closes), and was restored.

*Precondition stated, recorded:* A-3's "a write already under way when the wipe runs cannot put a
copy back" holds its write at the key read, and since this fix an earlier case can leave the key
remembered, which lets the write pass that read without stopping. The case now wipes first, as the
first use of the store; its expectation is unchanged, and planted again it still goes red — with
`encryptedSet`'s wipe check removed it printed `"copyAfterWipe": true` — and was restored.

*Commit:* `fix(v2.3): wpa-6 — one key mint on native` — `79107c5c`.

**WPA-7 · The memory fallback was silent.** `lib/queueStore.ts` falls back to a queue held in memory
when there is nowhere else to keep it — a browser that gives the app no IndexedDB, or a native store
that will not open — and marked that tier `persistent: false`, and nothing read the flag: the dot
said "ok", Settings › Sync said "Everything is on the server.", and every capture made from then on
was gone the moment the app closed. The module comment promised a `capabilities.persistentQueue`
that would say so; no such capability existed. `persistent` is a sixth sync fact now. The outbox
passes it through, `stores/sync.ts` reads it at each refresh (boot refreshes, so it is known before
anything is captured), and `lib/syncStatus.ts` makes a queue that cannot persist attention, ahead of
a conflict or a failed replay, with its own phrase — "captures are not being saved on this device" —
because "needs attention" would have the person look for a refused capture that is not there, and a
conflict is kept where the next capture is not. `SyncDot` puts it in its label, and Settings › Sync
shows the same words above the queue in the alert tone. The module comment says what is true.

*File:* `jstack-app/lib/syncStatus.ts`, `jstack-app/stores/sync.ts`,
`jstack-app/data/transport/outbox.ts`, `jstack-app/lib/queueStore.ts`,
`jstack-app/components/chrome/SyncDot.tsx`, `jstack-app/components/settings/Sync.tsx`.

*Red first:* `syncStatus.test.ts` — the new row "captures held only in memory → attention" printed `"status": "ok"` and `"label": "Sync · ok"`, and "a queue that cannot persist outranks everything else the dot could say — the next capture is the one at risk" printed `"phrase": "needs attention"`; `sync.test.ts` — "the device's own queue reads persistent and a memory-only one does not, so its status is attention" printed `"device": undefined`, `"memory": undefined` and `"status": "ok"`, over the app's sync modules loaded afresh on a queue store that could only offer memory; `screens.test.tsx` — "the dot's label and Settings › Sync both say captures are not being saved on this device" printed `"dot": "Sync · ok"` and `"settings": 0`. All four were red before any source changed, so none needed a plant.

*Expectation changes, recorded:* the fact type grew, so the two places a test spells out every fact
spell out the sixth — `syncStatus.test.ts`'s `settled` fixture takes `persistent: true` and its
describe now says six facts, and `sync.test.ts`'s existing attention case passes `s.persistent`. No
expected value moved.

*Commit:* `fix(v2.3): wpa-7 — a queue held only in memory says so` — `11b61c59`.

**WPA-8 · R11-REMAP-1 — a shared page carried no key of its own.** `app/capture.tsx` files a share
through `useBrainStore.dump("share", …)`, which posted `POST /brain/dump` with no `offlineId`, so the
outbox minted a new one on every attempt. A share can be filed twice with nobody pressing anything
twice: expo-router puts the fragment back 7 ms after the route clears it, so a reload inside the
request re-reads it and files it again (A4R11-04), and the tap after the lock gate files what the
route could not. Each attempt reached the server under a new key, with nothing for its dedupe to
hold on to. `lib/shareDraft.ts` `shareKey` reads a key off the share itself — its words and its
link, in 53 bits (cyrb53), because a collision would file a different share as a duplicate of this
one, silently — and `dump` puts it on every share it files, the route's and the tap's alike, unless
the caller passed a key of its own. A share filed with files attached keeps the outbox's key: a retry
that adds files is a different capture, and taking it for the first would leave the files unlinked.
The audit's own remedy asked for a key "derived from the fragment"; WP-A's "mint one the way
`outbox.ts:55-57` does" would have made each re-read a new capture again, so the key is derived
rather than minted. The two `KNOWN_GAPS.md` rows that said a share carries no key now say what it
carries; expo-router's put-back (§1) and the server's dedupe (§3) stay open.

*File:* `jstack-app/lib/shareDraft.ts`, `jstack-app/stores/brain.ts`, `KNOWN_GAPS.md`.

*Red first:* `share.test.ts` — "the body carries an offlineId, a second read of the same share carries the same one, and a different share does not" printed `"carries": "undefined"` and `"otherShareOtherKey": false`, mounting the `/capture` route over a fragment and reading the body it handed the adapter. Its middle clause, `"sameShareSameKey": true`, held before the fix only because both keys were missing, so it was planted: with `shareKey` minting a key per attempt it printed `"sameShareSameKey": false`, and was restored. The second case, "a share filed with files attached takes the outbox's own key — a retry that adds files is a new capture, not taken for the first", was green before the fix, since no share carried a key, and was planted red: with the exclusion taken out of `dump` it printed `"offlineId": "share-mhvw70dvqk"`, and was restored.

*Decision, recorded:* the same words and link shared again are the same capture to a server that
dedupes on the key, so a page shared again after its capture was deleted gets the first capture's
answer. The key covers only what makes the share itself — a note typed around it, or a file
attached, makes a new key — because a duplicate can be tidied and a lost capture cannot.

*Commit:* `fix(v2.3): wpa-8 — a shared page carries its own key` — `2d9f1ae2`.

**WPA-9 · Three small losses on the offline path.** Each lost something a person had just done.

A4R8-07, Close the day. `stores/today.ts` `submitJournal` cleared the draft after `postJournal`
resolved, so over a real network a line typed while the previous one was on its way was wiped by that
one's clear — under two milliseconds on the mock, which is why it read as nothing. The draft is cleared
as the line goes, as Brain's capture already is (OF-05), and given back if the write throws and nothing
new has been typed; the store stays under its cap at 199 lines.

A4R7-11, a subtask title. `components/tasks/Subtasks.tsx` cleared the field before a write that could
throw — offline over HTTP a new subtask does not queue — and the rejection went unhandled, so the words
were simply gone. The field is still cleared as the write starts, and the title comes back if it
throws, unless a new one is already being typed. WP-A's wording was "clear after the write resolves,
restore on throw"; clearing after would have brought OF-05's race to this field, so it clears first, as
the other two capture fields do, and restores.

A4R8-09, an offline tick. `stores/taskCard.ts` patched the copies the app had loaded when a completion
queued, and the next reload — a tab switch — brought the server's copy back, still open, while the
completion sat in the queue; ticking it again was the natural response. The tick is derived from the
queue now, the way Habits already reads a queued log: `data/transport/outbox.ts` `QUEUED_COMPLETE`,
read by Today's `YourTasks` and the Tasks list's `TaskRow`, so a completion reads done on both until it
lands and clears itself when the queue drains.

*File:* `jstack-app/stores/today.ts`, `jstack-app/components/tasks/Subtasks.tsx`,
`jstack-app/data/transport/outbox.ts`, `jstack-app/components/today/YourTasks.tsx`,
`jstack-app/components/tasks/TaskRow.tsx`.

*Red first:* `today.test.ts` — "the words typed during the round trip are still in the field when the previous line lands" printed `"draft": ""` where "and the next thought" was expected, with the first line's write held open; `screens.test.tsx` — "A4R7-11: a typed subtask title is still in the field when the write throws" printed `"stillTyped": false` after `"writes": 1`, beside Jest's report of the unhandled `TypeError: Network request failed` from `Subtasks.tsx`; and "A4R8-09: a task ticked offline still reads done on Today and in the Tasks list after a reload, while its completion is queued" printed `"today": false` and `"tasksList": false` with `"serverStillOpen": true`. The fourth case, "a write that throws gives the words back to the field", was green before the fix — the old `submitJournal` never cleared before the write, so there was nothing to give back — and was planted red: with the restore taken out it printed `Received: ""`, and was restored.

*The first red run was not all honest, and was run again:* the tick case read `props["aria-checked"]`,
which the native host never carries — Pressable maps it onto `accessibilityState.checked`, which
`collapse.test.tsx` already reads — so it printed `undefined` and could never have gone green; and both
native cases unmounted only after a passing assertion, so the red run left the subtask view mounted
while `finally` put the store back, and GL-00 reported the re-render outside `act()`. Both were
corrected before any source changed, and the second red run is the one quoted above.

*Left as found:* ticking a task whose completion is still queued queues a second completion, which the
server answers as it is (A4R7-06), rather than reopening it.

*Commit:* `fix(v2.3): wpa-9 — three small losses on the offline path` — `c9f5695a`.

**WPA-10 · The allow-list test named six routes, and there are ten.** OF-01 in
`tests/unit/outbox.test.ts` — "the six capture writes are queueable and nothing else is" — checked six
queueable paths by hand and a handful of refusals, while `data/routes.ts` marks ten routes
`offline: true`: a journal line, a new task, a task edit, a subtask edit, a completion, a capture, a
habit tick, a note about someone, a file and a setting. The four it did not name were queueable unseen,
and an eleventh marked offline tomorrow would have passed unseen too. The case now reads the table's own
list — every `offline: true` row as `METHOD /path`, sorted — and asserts it equals the ten spelled out,
so the next route marked offline is a decision this test makes somebody take; and it checks each of the
ten is queueable in its concrete form through the matcher the outbox uses. Its refusals stand as they
were. No source changed: `data/routes.ts` was already right, and WP-A's rule that what is queueable
does not change holds.

*File:* `jstack-app/tests/unit/outbox.test.ts`.

*Red first:* a test of a test goes red by planting the defect it should catch. With `postChat` (`POST /chat`, a live-only route) planted `offline: true`, OF-01 as it stood passed — "the six capture writes are queueable and nothing else is" ✓ — which is the gap. The rewritten case, "the ten capture writes are queueable, the table marks exactly these ten, and nothing else is", passed on the real table, and with the same plant it failed, printing `+ "POST /chat"` in the list read off the table where the ten were expected. The plant was restored; only the rewritten case stays.

*Commit:* `fix(v2.3): wpa-10 — the allow-list test names all ten routes` — `4c7e31ad`.

**WPA-11 · The limit, recorded.** Captures queue offline and replay only while the app is open — on
reconnect, focus, unlock and the 30-second retry. Nothing wakes the app in the background on either
platform: `jstack-app/public/sw.js` has no `sync` listener, and the phone build has no
`expo-background-fetch` or `expo-task-manager`. So a capture made on a plane reaches the server when
the app is next opened after landing, not when the phone finds a signal, and the owner's "sync as it
comes back online automatically in the background" holds only with the app open. That is now said
where a reader looks: a row in `KNOWN_GAPS.md` §2 (Josh / REMAP: "replay needs the app in the
foreground; iOS wakes it on open"), and a clause in `HANDOVER.md` §1.4's Sync row that points to it.
`REMAP_HANDOVER_v22.html` is regenerated from `HANDOVER.md` by `pnpm codemap`. No code changed.

*File:* `KNOWN_GAPS.md`, `HANDOVER.md`, `REMAP_HANDOVER_v22.html` (generated).

*Red first:* none — WP-A asks for a record, not a change ("No code"). The two facts it records were checked before they were written: a grep finds no `sync` or `periodicsync` listener in `jstack-app/public/sw.js`, and no `expo-background-fetch`, `expo-task-manager` or `background-fetch` in `jstack-app/package.json` (both counts 0); and `consolidation.test.ts` RM-08 holds every path the new row names to the tree.

*Commit:* `docs(v2.3): wpa-11 — the foreground-only replay, recorded` — `89c75a23`.

**WPA-12 · An online write overtook an older queued write to the same record (CODE_REVIEW_v23
finding 6, added to WP-A by the planner after A-11).** `data/transport/outbox.ts` put a queueable
write straight onto the network whenever the session was online, whatever was still queued. On a flaky
link an edit failed at the network and queued, the next edit to the same task got through, and the
retry then replayed the older value over it: two valid writes in the wrong order, which the server
cannot tell apart — silent last-writer-wins on stale data, on exactly the connection the queue exists
for. A queueable write to a record that already has an older write waiting — queued, or still on the
wire — now joins the queue behind it instead, and replay keeps the order. The record is read off the
route table, as the path up to its route's first `{param}`: `/tasks/t1`, `/tasks/t1/subtasks/s1` and
`/tasks/t1/complete` are one task, and `/parameters/{key}` one setting. A create (`/brain/dump`,
`/journal`, `/tasks`, `/files`) names no record, because nothing it writes can be overwritten by an
older copy, so captures still go straight out and the upload ceiling is untouched. Two more parts
close the race the review's scenario implies: a write still on the wire is counted from before the
first await, so an edit made while the previous one hangs on a failing request queues behind it; and
every entry is stamped when its write was made, strictly increasing, so the queue's order is the order
the writes were made in — even when the first is queued after the second, or both fall in one
millisecond.

*File:* `jstack-app/data/transport/outbox.ts`.

*Red first:* `outbox.test.ts`, three of its four cases before the fix — the planner's scenario, "an edit that failed and queued is not overtaken: the next edit to the task queues behind it, and after replay the server has the newer title", printed `"second": 200` and `"title": "the older title"`; "the record keeps the order, not the path: a completion that queued is not overtaken by a status edit to the same task" printed `"reopen": 200` and `"status": "done"`; and "an edit made while the previous one is still on the wire waits its turn, even inside one millisecond: when the first then fails, both replay in the order they were made" printed `"second": 200` and `"title": "the older title"`. The fourth, "the order is kept per record: while one task's edit waits in the queue, an edit to another task still goes straight through", was green before the fix and was planted red — with every queued write holding every record it printed `"other": 202`. Each remaining part of the fix was then planted out on its own and restored: with the record read as the whole path, the completion case printed `"reopen": 200` and `"status": "done"`; with the stamp taken straight from the clock, the one-millisecond case printed `"title": "the older title"`; and with a write still on the wire not counted, it printed `"second": 200`.

*Behaviour change, recorded:* while an older write to a record waits, a new write to that record
answers `202 { queued }` online as well, and lands at the next replay — unlock, the browser's reconnect
or focus, or the 30-second retry that runs while anything is queued. The review's other option, draining
the queue first, would hold every write behind any queued capture; holding by record keeps unrelated
writes live. The e2e `offline.spec.ts` ran once, at `89c75a23` before this item arrived (16/16), and
was not run again: WP-A allows one targeted run, and no journey in it makes an online write to a
record with an older write waiting.

*Commit:* `fix(v2.3): wpa-12 — an online write waits behind an older one to the same record` — `ee076f31`.

**WP-A's own lines, and PROTOCOL §5's four words.** Before the package report, every line WP-A added
(`git diff origin/v23-build...HEAD`) was read for §5's four words, as whole words. Seven carried one of
them — the same one each time, all from A-1 and A-4: two source comments
(`jstack-app/data/transport/reachability.ts`, `jstack-app/lib/queueStore.ts`), a test's name and two
comments in `jstack-app/tests/unit/reachability.test.ts`, and two phrases in this log. SEC-15's grep
reads method names, route patterns and handler paths, so no gate saw them. Each is reworded with its
meaning kept — the test is now "a request that fails at the network layer takes the session offline,
with no window event anywhere" — and no assertion changed.

*Commit:* `docs(v2.3): wpa — PROTOCOL §5's four words out of WP-A's own lines` — `37185714`.

**QA on `37185714` — four follow-ups (planner, 15 Sep).** QA passed A-1 and A-4..A-12 and failed A-2 and A-3
on the bar; the planner asked for four small items as new commits, each red first.

**WPA-1b · Two timer cases ran out of Jest's default budget on a loaded machine.** In
`tests/unit/reachability.test.ts`, "offline with a capture waiting, the 30-second retry asks GET /capabilities…"
and "with nothing queued the timer stays quiet…" build the app's modules afresh and drive the retry timer, which
takes seconds when the machine is busy: red under the planner's full board, green alone, and a slower REMAP
machine would see them red too. Each carries its own 60-second budget now (`TIMER_CASE_MS`), which also wins
over any global `--testTimeout`. No source changed.

*File:* `jstack-app/tests/unit/reachability.test.ts`.

*Red first:* a budget is shown red by shrinking it. Run with `--testTimeout=50`, both cases printed `thrown: "Exceeded timeout of 50 ms for a test."` (they took 12083 ms and 1131 ms); with their own budget the same command passes both.

*Commit:* `fix(v2.3): wpa-1b — the reachability timer cases carry their own budget` — `013fd0c7`.

**WPA-4b · A capture queued on web before A-4 stayed plain at rest until it was sent.** A-4 read a row written
before the upgrade as it was, so the words were not lost, and left it plain in IndexedDB until a replay removed
it. `lib/queueStore.ts`'s web tier now seals such a row where it lies the first time `all()` reads it:
`resealPlain` reads the row and, only if it is still there and still plain, puts the sealed form in its place in
the same transaction, so a capture sent and removed while its seal was being made is not put back. A row that
will not seal stays readable as it was.

*File:* `jstack-app/lib/queueStore.ts`.

*Red first:* `outbox.test.ts` — "the first read after the upgrade seals a plain row where it lies, and it still reads back" printed `"plaintext": true` and `"sealed": false`, with the row read back on both reads. "a plain row removed while its seal was being made stays removed — sealing never puts back a capture that was sent" was green before the fix, because nothing sealed at all, and was planted red: with the still-there-and-plain check taken out it printed `"left": ["old"]`, and was restored.

*The first red run was not honest, and was run again:* both cases put the plain row into the fake IndexedDB before
the queue had opened the database, and the fake's `rows()` hands back a detached map for a database that does
not exist yet, so the row was never in the store — the seal case threw `Cannot read properties of undefined
(reading 'includes')` and the removal case passed over nothing. Each case now opens the queue once before the
old row goes in, as A-4's own legacy-row case does with a `put`; the second red run is the one quoted above.

*Commit:* `fix(v2.3): wpa-4b — a row queued plain before A-4 is sealed on its first read` — `d7bc56f0`.

**WPA-2b · The tabs' other loads still rejected unheard.** A-2 made each tab's main load record its failure and
settle; QA found the loads fired beside them still rejecting with nobody to hear it — the replies Today and Brain
load (`stores/replies.ts`, fired at `app/(tabs)/index.tsx:32` and `brain.tsx:24`), and the Tasks tab's waiting rows
and open count (`stores/tasks.ts` `loadWaiting` and `loadOpenCount`, `tasks.tsx:32` and `:37`). Each now records
and settles the way the main loads do. The replies store is its own store, so it records under its own
`loadError`; the two Tasks loads record under `waitingError` and `openCountError`, because the tab reads the list's
`loadError` to decide whether it failed — a waiting load that got through would otherwise clear a list failure,
and a failed one would stand in for a list that loaded. `lib/loadError.ts` gains `recordLoadAs(key, …)` for that.

*File:* `jstack-app/lib/loadError.ts`, `jstack-app/stores/replies.ts`, `jstack-app/stores/tasks.ts`.

*Red first:* `replies.test.ts` — "a failed replies load settles and records loadError, and the next one that gets through clears it" printed `"settled": "rejected"` and `"loadError": undefined`; `tasks.test.ts` — "a failed waiting load settles and records waitingError…" printed `"settled": "rejected"` and `"waitingError": undefined`, and "a failed open-count load settles and records openCountError…" printed `"settled": "rejected"` and `"openCountError": undefined`. "neither speaks for the list: a waiting load that gets through leaves the list's failure standing" was green before the fix, because the old waiting load never touched `loadError`, and was planted red: with the waiting load recorded under the list's own key it printed `"loadError": null`, and was restored.

*Found on the way, recorded:* the first full run failed LV-02 (`wiringOrphans.test.ts`), which listed `getReplies`
and `getTasksWaiting` among the routes no store action calls. `tools/gen-wiring.mjs` reads an action's body from
the brace depth of its header line, so a head written `load: () =>` with `recordLoad(set, async () => {` on the
next line had an empty body and its adapter call was never seen. The heads are written on one line, as A-2's are,
and the wiring map finds both store actions again; the committed orphan list stands as it was.

*Commit:* `fix(v2.3): wpa-2b — the tabs' other loads are recorded and settle` — `e536ffbf`.

**WPA-3b · "last updated … · offline" outlived the offline state.** Once a copy was on screen, the line stayed after
the connection came back: `stores/today.ts` keeps it while `staleAt` is set, and nothing reloaded on a reconnect
unless a replay delivered or refused something (`stores/sync.ts`), so with nothing queued Today, Tasks and Brain
went on saying offline while online. `lib/syncInstall.ts` now watches `session.online` go from false to true — the
browser's `online` event on web, A-1's reachability on a phone — lets the queue replay first, and then reloads the
three planning tabs with the active focus, whatever the queue held; a load that gets through clears `staleAt`, and
the line with it. The replay goes first so a reload shows what the replay delivered, and so a phone's probe answer
is still followed by the replay A-1 promised.

*File:* `jstack-app/lib/syncInstall.ts`.

*Red first:* `lastSeen.test.ts` — "copies shown offline, then online again with nothing queued: every stale mark is gone and the tabs hold live data" printed `"reloaded": false`, all three `staleAt` still set and `"stillSaysOffline": true`, after all three copies had shown offline; driven through `installSync`, the way the app boots. The order is guarded by A-1's own timer case: with the reloads planted in front of the replay, "offline with a capture waiting, the 30-second retry asks GET /capabilities…" printed `"GET /today"` where `"POST /brain/dump"` was expected second, and was restored.

*Left as found:* a reload that fails after a reconnect leaves the copy on screen under its old mark — the load's
fallback shows no copy while online, so it neither replaces the one on screen nor clears its time — and the
"· offline" in it reads wrong until a load gets through.

*Commit:* `fix(v2.3): wpa-3b — coming back online takes the offline copies down` — its sha is in `WP-A.md`'s status
line and the message to the planner.

**WPA-13 · An emergency-locked device could keep an offline copy taken after its wipe.** The WP-F merge put WPF-4's
lock retry and A-3b's tab reload on the same reconnect, so the planning reads the reload makes can be in flight when
`POST /lock` is confirmed and the device wiped. A read the server answered before the lock, whose answer lands after
the wipe, reached `rememberLastSeen` with the wipe's own count, which A-3's guards read as a fresh copy: the wipe count
drops only a copy taken before the wipe, and `encryptedSet` refuses only a write the wipe overtook. `rememberLastSeen`
now takes no copy while `session.emergency` is set — nothing written, nothing held for a later write — for all three
tabs and every load that calls it, not only the reconnect's. The load itself is untouched; only the copy on the device
is refused.

*File:* `jstack-app/lib/lastSeen.ts`.

*Red first:* `lastSeen.test.ts` — "emergency set and the device wiped, a composite that resolves late leaves no copy on the device" printed `"copyOnDevice": true` beside `"loaded": true`: the Today load was held at its read, the emergency state set and `wipeAllLocalData` run, and the composite answered after.

*Left as found:* a copy already queued behind a write when the lock comes on without a wipe (the server unreachable,
WPF-4's unconfirmed lock) is still written; it was taken before the lock, and an unconfirmed lock keeps what is already
on the device until the server confirms.

*Commit:* `fix(v2.3): wpa-13 — an emergency-locked device keeps no offline copy` — its sha is in `WP-A.md`'s status
line and the message to the planner.

**WPA-14 · After the emergency wipe, the web build could still read a capture (security-class; the audit's D1).**
Three ways on web, in `lib/emergencyWipe.ts`'s order. The web queue's `put` and `saveConflicts` sealed and then
wrote with no wipe check, so a capture or a refused list still being sealed when the wipe ran was written after the
queue had been cleared — and `wipeThisDevice` cleared the queue before `wipeAllLocalData` counted itself, so a check
alone could not have reached a seal that finished during the clear. `wipeAllLocalData` deleted the cipher key on
native only: on web the IndexedDB key stayed, so whatever had been sealed before the wipe still opened after a reload,
and a read that found no key minted one. Now the web queue's sealed writes check the wipe count on the tick their
transaction opens (`writeUnlessWiped`; A-4b's reseal checks it too, and seals nothing once a wipe has run), the wipe
counts itself before it clears the queue, the web wipe clears every key row and forgets the key only once IndexedDB
has let it go (A-6's order, mirrored), and a web read opens with the key at rest or with none, never a new one.
Native's queue writes through `encryptedSet`, which already checked the count, and its key was already deleted.
The service worker's cache is not part of it: `public/sw.js` never caches `/api/` or a non-GET, only same-origin
static assets, so what the wipe leaves in Cache Storage is the app shell.

*Files:* `jstack-app/lib/queueStore.ts`, `jstack-app/lib/encryptedStore.ts`, `jstack-app/lib/emergencyWipe.ts`.

*Red first:* `outbox.test.ts` — "a capture and a refused list still being sealed when the wipe runs are not written after it, and a reload reads neither back" printed `"in-flight"` in `queueRows` and `"list"` in `conflictRows`; "a value sealed before the wipe does not open after a reload, and no key is left in IndexedDB" printed `"opened": "sealed before the wipe"`; "A-6's rule on web: the wipe forgets the key it deletes, so the next seal mints afresh and what it seals opens after a reload" printed `"before": "sealed before the wipe"`, and, with the wipe planted to clear the key rows but forget nothing, `"after": null` and `"keys": 0`; `hardening.test.ts` — "WPA-14: the wipe counts itself before it clears the queue, so a capture still being sealed cannot land after the clear" printed `"countedBeforeTheQueueWasCleared": false`. The gate on A-4b's reseal, which no case of its own held until QA's probe at c30c91ff, is held too: `outbox.test.ts` "a plain row being sealed where it lies (A-4b) as the wipe runs mints no key after it, and nothing of it is at rest", with the gate planted out, printed `"keysLeft": 1`.

*Closed in WPA-16:* a key mint already under way when the wipe ran — the very first seal on a device, racing the
lock — could put a fresh key row back after the clear.

*Commit:* `fix(v2.3): wpa-14, wpa-15 — after the emergency wipe, nothing on the device can be read` — its sha is in
the report to the planner.

**WPA-15 · A capture whose request failed after the emergency wipe was queued onto the wiped device (security-class; the audit's D1).**
`data/transport/outbox.ts` handed every network failure to `enqueue`, which queued with no look at the lock — on
both platforms, and on native `encryptedSet` minted a fresh key for it — and answered `{ queued: true }`, telling the
person that a device just wiped was holding their words. The rule is A-13's, applied to the queue: while
`session.emergency` is set, the device keeps nothing new. `withOutbox` takes `isEmergency` beside `isOnline`
(`data/provider.ts` reads it off the session store), and `enqueue` refuses before the write, and again after it for
a lock that landed during it, with the lock gate's own `LockedError` — what a locked write already gets — so the
store's catch keeps the words in the field (A-9). Recovery clears `emergency`, and the same transport queues again
with no reload. The decision it carries: under a lock that could not reach the server (WPF-4's unconfirmed lock) the
device refuses new captures too, and still wipes nothing — Josh's A-0 row 5 holds.

*Files:* `jstack-app/data/transport/outbox.ts`, `jstack-app/data/provider.ts`.

*Red first:* `outbox.test.ts` — "emergency on, a capture that fails at the network is refused as a locked write, and nothing of it is at rest" printed `"lockedError": false`; "once recovery clears the emergency state, the same transport queues again with no reload" printed `"typed while locked"` still in the queue; `tests/native/queueStore.test.ts` — "a capture failing at the network after the wipe is refused as a locked write: no queue on disk, and no key minted for it" printed `"lockedError": false` and `"keyMinted": true`. The two parts that no case of their own held until QA's probe at c30c91ff are held now, each proven by its plant: with `data/provider.ts`'s fourth argument planted out, `stores/sync.test.ts` "web: refused as a locked write, and nothing of it — no queued row, no key row — is at rest" printed `"status": 202` with `"queueRows": 1` and `"keyRows": 1`, and "native: refused as a locked write — no queue on disk, and no key minted for it" printed `"status": 202` with `"queueOnDisk": true` and `"keyMinted": true`; with the refusal after the write planted out, `outbox.test.ts` "a lock that lands while the capture is being written is refused after the write, never answered queued" printed `"status": 202` and `"queued": true`.

*Commit:* the same commit as WPA-14.

**WPA-16 · Under the emergency lock, file details and this device's preferences still reached the wiped device (security-class; the audit's D1, in smaller clothes).**
`lib/recentFiles.ts` writes the details of every successful Files load (`cacheFiles`) and writes back its drop of
expired entries (`cachedFiles`), and `stores/device.ts` writes the theme mode, the privacy blur and the collapsed
sections — all through `encryptedSet`, with no look at the lock. A Files read answered before `POST /lock` whose
response landed after the wipe, or a preference changed under the lock, minted a fresh key on the wiped device and
kept bytes under it. A-13's rule now covers both: while `session.emergency` is set, `cacheFiles` and the prune's
write-back write nothing (the read still hides what has expired), and the three preference setters change the screen
and write nothing. A write already under way when the wipe runs is refused by `encryptedSet`'s wipe count, which is
why they need no more than the gate. The key mint WPA-14's row left open is closed here too: a mint reads the wipe
count before it starts and keeps no key — no IndexedDB row on web, no Keychain entry on native — when a wipe has run
meanwhile, and the seal it was minted for is refused by the count. On web the check sits on the tick the key row's
transaction opens, so a wipe that starts after it clears the row with the rest; a row is never deleted again
afterwards, since that could take a key minted after recovery.

*Files:* `jstack-app/lib/recentFiles.ts`, `jstack-app/stores/device.ts`, `jstack-app/lib/encryptedStore.ts`.

*Red first:* `recentFiles.test.ts` — "a Files load answered after the lock landed and the device was wiped writes nothing and mints no key" printed `"jstack.recentFiles"` on disk and `"keyMinted": true`; "an expired entry is not written back while the lock is on — the read still hides it" printed `"unchangedOnDisk": false`; `stores/device.test.ts` — "toggles under the lock leave AsyncStorage and the key store empty, and the state still moves" printed `"jstack.themeMode"` among the keys on disk and `"keyMinted": true`; `outbox.test.ts` — "WPA-16: a key mint still under way when the web wipe runs puts no key row back" printed `"kv"` in `keysLeft`; `tests/native/encryptedStore.test.ts` — "a mint held at its Keychain read while the wipe runs puts no key back after it" printed `"keyInKeychain": true`.

*Commit:* `fix(v2.3): wpa-16 — under the emergency lock, file details and preferences stay off the device` — its sha is in
the report to the planner.

**WPA-17 · After the wipe, a Dismiss in Settings › Sync wrote the other refused captures' words back to the device (security-class; the audit's D1, found by QA's probe at c30c91ff).**
The wipe emptied storage but not the sync store's in-memory list of refused captures, and `withOutbox`'s
`isEmergency` gated only `enqueue`: `dismissConflict` (`stores/sync.ts`) handed the rest of the list to the outbox's
`keepConflicts`, which called `saveConflicts` — whose wipe count was read after the wipe had counted, so its check
passed — and the seal minted a fresh key, on web and on native. Now `wipeThisDevice` first empties what the sync store
holds of the wiped queue (the refused list, the queued rows and their count), so there is nothing to write back, and
`keepConflicts` writes nothing while `isEmergency()` is set — the in-memory list may still change, as the preferences
do. `syncNow`'s own `keepConflicts` (`stores/sync.ts:165`) stays shut: `syncNow` returns before any replay while
`session.locked` is set (R-05), and every road into the emergency state sets it through `relock()`, so under the lock
it never reaches that line — and if it did, the gate would refuse the write.

*Files:* `jstack-app/lib/emergencyWipe.ts`, `jstack-app/data/transport/outbox.ts`.

*Red first:* `stores/sync.test.ts` — "web: nothing of the refused list is at rest, no key row is left, and a reload reads no refused words" printed `"conflictRows": 1`, `"keyRows": 1` and `"readBack": 1`; "native: no refused list on disk, and no key minted for one" printed `"listOnDisk": true` and `"keyMinted": true`; "the wipe empties what this store holds of the wiped queue: the refused words, the queued rows and their count" printed `"conflicts": 2`; `outbox.test.ts` — "WPA-17: keepConflicts writes nothing while the emergency lock is on — no refused words and no key reach the device" printed `"keptRows": 1` and `"keyRows": 1`. Either half alone turns the end-to-end cases green — the reset makes the Dismiss save an empty list, a delete; the gate writes nothing even when the list survives — so each half has a case of its own, planted out alone against it: the reset holds "the wipe empties what this store holds of the wiped queue: the refused words, the queued rows and their count", which with the reset planted out printed `"conflicts": 2`; the gate holds "web: under a lock that wiped nothing, a Dismiss rewrites no list at rest and mints no key" and "native: under a lock that wiped nothing, a Dismiss rewrites no list on disk and mints no key" (a refused list already at rest, the emergency lock on without a wipe, as under the unconfirmed lock), which with the gate planted out each printed `"listRewritten": true`. The web and native Dismiss-after-the-wipe cases stay as the end-to-end check, with the reload read-back.

*Commit:* `fix(v2.3): wpa-17 — a Dismiss after the wipe writes no refused words back` — its sha is in the report to the
planner.

---

## WP-C — keyboard, dialogs, and the acceptance IDs no test names

**WPC-1 (C-1) · Escape (and `closeAll()`) did not close the task card.** The task card's open
state lives in `stores/taskCard.ts`'s own `openTaskId`, outside the `modal`/`sheet`/`settingsOpen`
slots `stores/session.ts`'s `closeAll()` cleared — so Escape (which routes through `closeAll()`,
`lib/boot.ts`) closed every dialog and sheet except the one open over all of them. Red first:
`tests/unit/stores/session.test.ts` — "closeAll() closes the open task card too, not just
modal/sheet/settings (C-1)" — failed with `openTaskId` still `"t1"` after `closeAll()`. Fixed by
having `closeAll()` reach `useTaskCardStore.getState().openTask(null)`, the card's own close
action, so if it ever grows an "unsaved edits" prompt Escape goes through the same door.

**WPC-2 (C-2) · Escape did not reach an open dialog from inside a text field.**
`lib/shortcuts.ts`'s key handler returned on `typing` before the `Escape` branch, so the caps
dialog (and every other dialog) could not be closed from its own amount box or any other field —
only from focus elsewhere on the page. Letters (`a`/`r`/`l`, the tab digits) still need to stay
blocked while typing. Red first: `tests/unit/shortcuts.test.ts` — "closes a dialog from inside a
text field when one is open" — failed with `onEscape` called 0 times. Fixed by adding a
`hasOpenOverlay()` handler (wired in `lib/boot.ts` from `overlayOver()` + the task card's
`openTaskId`, the same question `useOverlayOpen` asks) and letting `Escape` through the typing
guard only when it answers true; every other key while typing is unaffected.

**WPC-3 (C-3) · dialogs had no `role`/`aria-modal`, no managed focus, and no Tab trap.**
`components/chrome/DialogHost.tsx` rendered each open registry entry's own `<Dialog>`/`<Sheet>`
with no accessibility contract around it: nothing marked the overlay as a dialog for assistive
tech, opening one left focus wherever it already was, Tab walked straight through to the tab
content behind it, and closing one did not give focus back to whatever had opened it. Red first:
`tests/unit/dialogFocus.test.ts`, one case per behaviour (role present, focus moved, Tab wraps
at both ends, focus restored on cleanup) against hand-rolled fake DOM nodes — this unit lane has
no real DOM. Genuinely red before `lib/dialogFocus.ts` existed: the test file was written first
and printed `Cannot find module '@/lib/dialogFocus' from 'tests/unit/dialogFocus.test.ts'`
(C-7f — re-confirmed by removing the module again and re-running the file, then restoring it).
Fixed with a new `lib/dialogFocus.ts` (the same imperative-`setAttribute` shape
`lib/webInert.ts`'s `setInert` already uses, since neither `role` nor `aria-modal` is a typed
React Native prop), wired through one new `DialogFrame` wrapper in `DialogHost.tsx` — mount is
open and unmount is close, so the effect's cleanup is the focus-restore for free. Reused the
`[inert]` pattern from `components/chrome/Gate.tsx` rather than a new mechanism for "nothing
behind it is reachable": `app/_layout.tsx` now wraps the routed `<Stack>` in its own ref and
applies `setInert` to it (not to `DialogHost`/`ToastHost`, which must stay reachable) whenever
`useOverlayOpen()` is true — Tab now has nothing outside the open dialog to walk into.

Targeted e2e at 393 and 1366 (`e2e/core/task-detail.spec.ts`, "C-3 the task card traps focus,
and restores it on close", under the lock rule) found two real defects the unit lane's fake DOM
nodes could not, both fixed in the same pass:

- **The scrim stole initial focus.** `Dialog`'s and `Sheet`'s click-to-close backdrop
  (`${testID}-scrim`) is a `Pressable`, which react-native-web renders with `role="button"` by
  default — matching the Tab-trap's own focusable selector, and sitting FIRST in DOM order,
  ahead of the dialog's real content. `firstFocusable()` landed on it instead of the close
  button. Fixed by giving both scrims `tabIndex={-1}`: Escape and the header's `CloseButton`
  are the keyboard paths to close a dialog, so an invisible full-screen "tap outside" target has
  no business in the Tab order at all.
- **Restoring focus raced the page-behind's own `inert` removal.** The same store write that
  closes a dialog (`openTaskId -> null`) also flips `app/_layout.tsx`'s `overlayOpen`, whose
  effect lifts `inert` off the routed screen the opener lives in — and an `inert` element
  refuses focus outright, browser-side. Both effects fire off the same commit with no
  guaranteed order between siblings, so `opener.focus()` running synchronously in
  `lib/dialogFocus.ts`'s cleanup could land before the `inert` removal and silently end up on
  `<body>` (confirmed live with a diagnostic: `opener` captured "task-open-t1" correctly, but
  `document.activeElement` was `BODY` immediately after `opener.focus()`). Fixed by deferring the
  restore one `requestAnimationFrame` past the cleanup; `tests/unit/dialogFocus.test.ts` moved to
  assert this async (`await new Promise(r => setTimeout(r, 0))`, matching how RN's jest setup
  polyfills `requestAnimationFrame`).

**WPC-4 (C-4) · four verbs that cannot succeed offline stayed enabled offline** (A4R10-04 rest,
`KNOWN_GAPS.md`). Revise's Save (`ReviseDialog.tsx`), a proposal's Configure Save
(`ConfigureDialog.tsx`), the Teach sheet's Save (`TeachSheet.tsx`) and Decision history's reopen
(agents `HistoryDialog.tsx`) are each reached only online in the mock, so a press offline threw
with nothing written and nobody told. Red first: `tests/unit/offlineVerbs.test.tsx`, one case per
verb, rendering the real component against `resetDb()`/real store loads with `online: false` —
asserts the underlying write action (spied) is never called and the toast reads
`OFFLINE_REASON` ("needs a connection"). Spot-checked genuinely red by reverting the Teach fix
alone and re-running that one case before restoring it. Re-confirmed for all four verbs (C-7f)
by swapping the pre-fix `TeachSheet.tsx`/`ReviseDialog.tsx`/`ConfigureDialog.tsx`/
`HistoryDialog.tsx` back in from commit `ffb84ac7^` and re-running the suite: all four printed
`expect(jest.fn()).not.toHaveBeenCalled()` — `Expected number of calls: 0, Received number of
calls: 1` — before the fix files were restored. Fixed with the exact pattern
`lib/cardVerbs.ts`'s decision verbs already use (`components/today/DecisionCard.tsx`):
`{...(online ? { onPress } : { disabledReason: OFFLINE_REASON })}`, which
`theme/ui/controls.tsx`'s `useButtonChrome` already renders `aria-disabled` and toasts the
reason on press for — no new mechanism.

**WPC-5 (C-5) · the desktop letter keys acted at the phone width too.** `lib/shortcuts.ts`'s
A/R/L deck belongs to the Expanded (non-phone) layout it was designed for — a phone has no
keyboard shortcuts anywhere else in the app — but nothing gated it on layout kind. Red first:
`tests/unit/shortcuts.test.ts` — "a/r/l do nothing at a phone width, even with an open card" —
failed with `onApprove` called once. Fixed by adding an `isExpandedLayout()` handler, read from
a ref `lib/boot.ts` keeps in sync with `theme/useLayout()`'s `phone` (the same "read fresh at
press time via a ref the effect keeps current" shape `onToday` already uses for A4R9-01), and
gating only the letter branch on it — the digit tabs and the mod-key shortcuts (Cmd/Ctrl+K/Z)
are unaffected, asserted by their own case in the same file.

**WPC-6 (C-6) · accepting a memory proposal wrote no history entry.** `CONTRACT.md` §4.18: `GET
/memory/history` answers `MemoryHistoryEntry[]`, newest first, and "accepting or editing a
memory proposal appends one" — `data/mock/handlers/brain.ts`'s `postMemoryProposal` changed only
the proposal's own `state`/`text` and never touched `memoryHistory` (`KNOWN_GAPS.md` MH-A). Red
first: `tests/unit/memoryHistory.test.ts`, three cases against the real handler through
`handle()` — accept appends one (`decision: "accepted"`), edit appends one naming the value it
replaced (`was: <old text>`), and `GET /memory/history` reflects the same write. Re-confirmed
(C-7f) by swapping the pre-fix `data/mock/handlers/brain.ts` back in from commit `53a3bf9d^`:
both the accept and edit cases printed `expect(h.length).toBe(before + 1)` — `Expected: 4,
Received: 3` — before the fix file was restored. Fixed by
appending the entry in the same call, prepended so the newest-first contract holds, `by: "Josh"`
matching the fixture convention, `was` set only for an edit (an accept changes no value, only
the proposal's state).

**WPC-7 (C-7) · nine acceptance IDs no test named** (`QA_REPORT_v22.md` §1). Wrote the smallest
honest test for each, quoting the ID, checking the acceptance row's own wording against the real
source rather than the report's claim about itself:

- **UP-10** PASS — `tests/unit/ingestionThreatModel.test.ts` reads `SECURITY.md`'s threat model
  and `CONTRACT.md`'s Q24, confirming both the tool-less extract step and the three named REMAP
  options (screening agent / n8n workflow / backend rules) are actually written, not merely
  referenced.
- **MC-05** PASS — `tests/unit/enterSends.test.ts` exercises `theme/ui/fieldEditor.ts`'s
  `enterSends` directly (newly exported, the same reason `theme/useLayout.ts`'s `layoutFor` is):
  Enter sends and prevents the newline, Shift+Enter does not, touch (`desktop: false`) gets no
  `onKeyPress` at all, and a field with no `onSend` (the journal) is unaffected.
- **MC-10** PASS — `tests/unit/orbOverlay.test.tsx` renders `Orb` and confirms it returns nothing
  while `useOverlayOpen()` is true — a modal, Talk itself (`sheet: "talk"`), or the task card —
  which is how "the orb cannot start a session while one is open" actually holds (S6-09); the
  shared release path is `tests/unit/mic.test.ts`'s existing MC-01/MC-07 coverage.
- **OP-08** PASS — `tests/unit/searchableAll.test.ts` reads all six "All"/history dialog files
  and confirms each renders through `SearchableListDialog`/`SearchableList`, plus a sweep of
  every other component file for a hand-rolled search+list pair that skipped the shared
  primitive.
- **BN-02** PASS — `tests/unit/bnCaptureCarried.test.ts` scans every `BR-nn`/`TM-nn`/`OF-nn` id
  in `02_ACCEPTANCE_TESTS_v2.md`/`_v21.md` and asserts each is PASS in its own QA report or
  explicitly marked retired/consolidated in the SAME document that carries it (TM's whole family:
  retired, test mode deleted ADR-06; BR-11/12/13: folded into BR-05) — 27 ids checked.
- **LL-01** PASS — `tests/unit/learningShape.test.ts` reads `LearningItem`'s real declaration
  (`kind`/`url`/`body`), confirms `GET /learning` and `GET /learning/{id}` are in `ROUTES`, and
  (C-7c, QA fail on the first pass: `?q=` was parsed nowhere in `getLearning`, so it silently
  returned the whole list for any query) now drives `GET /learning?q=` through `handle()` and
  asserts it actually narrows the result, case-insensitively, over title/body/kind
  (`data/mock/handlers/life.ts`).
- **BN-04** PASS (C-7d — corrected; the first pass's PARTIAL reason was itself false) —
  `tests/unit/brainProposalApplied.test.ts` confirms `BRAIN_PROPOSAL.md`'s dated approval and
  that all four `demo/v22/brain-proposal-{1366,393}-{light,dark}.png` captures exist. The first
  pass claimed "no `demo/` directory at all", which was wrong — `demo/v22/` has held device-pass
  frames throughout; the four brain-proposal captures use a shorter name
  (`brain-proposal-<width>-<scheme>.png`, no `-d1` segment) than the rest of that folder, which
  is what a prior look past. The remaining clause — N-1's commit message names any later
  `JOSH_QA.md` line it applied, or "none" — is a one-time historical fact, verified by hand
  rather than by a test that shells out to `git log` on every run (no guard here does that):
  commit `21bfbe91` ends "Later `JOSH_QA.md` lines applied: NONE — still exactly the six built
  at JQ-1..6."
- **CL-04, LL-03 — found NOT to hold, or infeasible to verify in this pass; left PARTIAL, not
  faked green** (hard rule: a behaviour that does not hold gets a BUGLOG row, not a test):
  - **LL-03** — Learning is a config-record section (`data/mock/fixtures/sections.json`, a
    `rows` block bound to `learning.rows`), and NOTHING in `layout/` or `components/` gives it
    an "All" link or a search affordance — no `learning-all` dialog, no entry in
    `layout/openRef.ts` beyond the single-item `learning` detail. The claim ("'All' opens the
    searchable list") does not currently hold; this is a real gap, not a missing test.
  - **CL-04** — a visual claim at two named widths (393, 1366) with two sections collapsed on
    each tab ("nothing overlaps, spacing holds") is an e2e/screenshot-shaped check; not
    attempted in this pass — time did not allow it honestly, and a unit test cannot see layout.

`QA_REPORT_v22.md` §1 moved seven rows PARTIAL → PASS (UP-10, MC-05, MC-10, OP-08, BN-02, LL-01,
BN-04), updated its own "N acceptance IDs named by no test" note (nine → two, naming the two
still open and why), its legend/heading PARTIAL counts (twenty → thirteen) and the completion
statement's tally (190/20 → 197/13 PASS/PARTIAL) — `tests/unit/qaReport22.test.ts` (D11, QA-02,
QA-03) holds all of that in sync and is green.

### C-3 and C-7 — QA's fail on `4f5406f2`, fixed

QA found two real defects the first pass's gates did not catch and one more documentation error,
beyond BN-04 above:

- **C-3b** — a focus-restore race: dialog A closes (schedules a `requestAnimationFrame`-deferred
  `opener.focus()`), dialog B opens in the SAME frame (a detail dialog swapping straight to a
  picker, say) — A's deferred restore was not cancelled, so it fired after B had already moved
  focus in and stole it back onto A's opener, which sits outside B. Fixed in
  `lib/dialogFocus.ts`: a module-level `pendingRestore` handle, cancelled the moment a new dialog
  installs, plus a same-purpose backstop (the restore itself is skipped if focus has already
  landed inside another open dialog by the time it would run). Red first:
  `tests/unit/dialogFocus.test.ts` "a dialog opened in the same frame the previous one closed
  keeps its own focus" — failed `expect(openerA.focus).not.toHaveBeenCalled()` (received 1 call)
  against the unfixed module.
  Also: `lib/dialogFocus.ts:8-9`'s comment claimed native gets a dialog announced through
  react-native-web mapping `role` from the JSX layer — nothing set it, and it does not compile:
  RN's `AccessibilityRole` union (checked against the installed `node_modules/react-native`
  types) has no `"dialog"` member at all. Tried `accessibilityViewIsModal` (a real prop) on
  `DialogFrame` instead, and reverted it: RNTL (and, per its docs, a real screen reader) treats
  it as "hide every OTHER open tree from queries while this one is up", which broke the SECOND
  of two simultaneously open overlays (a picker over the task card, S6-41) the moment either one
  carried the flag — caught by the pre-existing `tests/native/screens.test.tsx` case "a dialog
  opened over the task card paints no second scrim" going red (`Unable to find an element with
  testID: task-detail-backdrop`, then, after scoping the flag to the outer/scrim-owning dialog
  only, `Unable to find an element with testID: delegate-picker-backdrop` — the SIBLING, not a
  nested one, also went dark). Took QA's offered fallback instead: the comment now says plainly
  that native has no working equivalent yet, and why (doing it right means moving the flag to
  wrap the whole open-overlay region once, the same question `app/_layout.tsx`'s `inert` call
  already answers, not to one dialog at a time — left for whoever picks it up next). Kept the
  `testID` per dialog (`${d.name}-frame`) — genuinely useful, nothing hides it. Red first:
  `tests/native/screens.test.tsx` "an open dialog's frame is addressable by its own name on
  native" — failed `Unable to find an element with testID: task-frame` against the pre-C-3b
  host, which had no testID on `DialogFrame` at all.
- **C-7b / MC-10** — the floating orb read only Brain's own dictation state
  (`useBrainDictation()`), so with Talk's microphone live in the background (no overlay open —
  the scenario the existing MC-10 tests did not cover) the orb still offered itself, and pressing
  it called Brain's `toggle`, which `startMic`'s "second start stops the first" (MC-01) applied
  to a button nobody meant as a second owner — silently stopping Talk's live session. Fixed:
  `stores/mic.ts` gets `useAnyMicOpen()`, reading the store's raw (purpose-unfiltered) state
  rather than `useDictation`'s purpose-scoped one; `Orb.tsx` hides on `anyMicOpen`, not just its
  own `listening`. Red first: `tests/unit/orbOverlay.test.tsx` "is gone while Talk's microphone
  is live with no overlay showing" — failed `expect(queryByTestId("mic-orb")).toBeNull()`
  (element was found) against the unfixed orb.

### WPC-5b and GS-02 — QA fail on the interim board (`v23-build` `cd756da5`), fixed

QA's full-board run found two more real defects, neither caught by WP-C's own gates because
both are cross-package interactions: A4R10-07 (C-5, this package) meeting A4R9-01/02 (built
elsewhere) at the phone width, and C-3's own initial-focus heuristic meeting a field that
already asks for focus itself.

**WPC-5b · the A/R/L letter-key e2e cases asserted the pre-C-5 behaviour at the phone width.**
`e2e/core/decisions.spec.ts`'s "A4R9-01/02 · the A, R and L keys" describe block predates C-5
(WPC-5 above) and asserted, at every tested width including `w393-light`, that pressing a/r/l
answers the open card — true before C-5, false since: C-5 correctly gates the letter deck to
the Expanded (non-phone) layout, so at the phone width the same keypresses now do nothing,
which is the point of A4R10-07, not a regression. QA's own read of the interim board (four
cases red at `w393-light`, lines 474/514/523/611) is the red-first evidence here — the fix is
to the test's expectations, not to source that already behaves correctly, so there is no
separate broken-then-fixed run to reproduce. Fixed by adding `isExpanded(projectName)` (via
`pickProject`, the same width/scheme parse `e2e/helpers.ts` already exposes) and branching each
of the four cases on it: at Expanded widths the existing "answers" assertions hold unchanged;
at the phone width each case now asserts the card stays open and unanswered after the keypress
(a 300ms wait, then still `"open"`) — the buttons underneath remain clickable, only the letter
shortcut is gated, matching what C-5's own unit coverage already proves. Re-verified green via
a real Playwright run of `core/decisions.spec.ts` at both `w393-light` and `w1366-light` (no
diagnostic stub, the actual bundle) — all four previously-red cases pass at both widths.

**GS-02 · the desktop Find's query field lost its own autofocus to C-3's initial-focus pick.**
`e2e/core/find.spec.ts:25` — `toBeFocused()` on `find-query` — went red on the interim board.
Root cause needed a real browser to see: React applies `<TextInput autoFocus>` as a plain
`.focus()` call during React's OWN commit phase, not as a queryable DOM `autofocus` attribute —
confirmed against the actual bundle via a temporary `page.evaluate` diagnostic (removed before
the final commit) showing `autofocusCount: 0` and `document.activeElement` already on
`find-close`, not `find-query`, by the time `installDialogA11y`'s effect ran. Because
`Dialog.tsx` renders its `CloseButton` before `{children}`, `firstFocusable`'s "first in DOM
order" heuristic was the close button on every dialog with one, and this effect always ran
after any child `autoFocus` had already landed — so `installDialogA11y` was unconditionally
overwriting a control's own initial-focus request with the dialog's generic "first focusable"
pick. An initial attempt (querying for a DOM `[autofocus]` attribute to prefer) was wrong for
the same reason and only looked right against a hand-authored fake-DOM unit test that could not
catch the false premise — reverted. Fixed for real in `lib/dialogFocus.ts`'s
`installDialogA11y`: if `document.activeElement` on install already sits inside the dialog
being installed (`isInsideOpenDialog`), that control claimed focus on its own and is left
alone — no `firstFocusable` pick, no opener capture (there is no reliable way to recover the
true external opener once something inside has already claimed focus). Guarded by the new unit
case "never overrides a control that already claimed focus on its own (GS-02)"
(`tests/unit/dialogFocus.test.ts`). Re-verified green via a real Playwright run of
`core/find.spec.ts` at `w1366-light` (no diagnostic stub) — `find-query` is focused on open.

**WPC-3c · `dialogFocus.test.ts`'s stale native case name, and a single-handle restore that
could not track two dialogs closing in the same frame.** Two small QA items, taken together as
one commit: (1) the "is a no-op off web" case's title still claimed native "gets there through
accessibilityRole itself" — stale since C-3b's revert (the header comment above it already says
plainly that native has no working equivalent yet); renamed to match. (2) `pendingRestore` in
`lib/dialogFocus.ts` was a single module-level handle — `closeAll()` (C-1) can close the task
card and a modal/sheet in the same commit, scheduling two deferred restores at once, and the
second's `requestAnimationFrame` handle silently replaced the first's, leaving the first
uncancellable if a third dialog then opened before either fired. Fixed by making it a `Set`
(`pendingRestores`), with `cancelPendingRestores()` iterating and clearing all of it. Red proof
reconstructed by stashing only the `lib/dialogFocus.ts` fix (the new test stayed in place):
`tests/unit/dialogFocus.test.ts` — "two dialogs closing in the same frame (closeAll(), C-1) both
have their restore cancelled by a third opening (C-3c)" — failed
`expect(openerA.focus).not.toHaveBeenCalled()`, `Expected number of calls: 0, Received number
of calls: 1`, against the single-handle version; restored, all 11 cases in the file pass.

---

## WPD — Connect toolkit, transport truth, native configuration

**WPD-B01 · (this worktree's own hit on the same bug, before `2a91fad2` reached `v23-build`).**
`git status` after WPD-1's first commit showed `CODEMAP.md`, `wiring.json`, `WIRING.md`,
`WIRING.html` and `openapi.yaml` newly created at the repo ROOT, empty on disk, alongside the
real `jstack-app/CODEMAP.md` update. Root-caused independently with `git hook run pre-commit`
(runs the hook exactly as a real commit would, without committing) plus a one-line env dump —
the same `GIT_DIR` set / `GIT_WORK_TREE` unset mechanism as `Row 0`'s `B-01`. Two commits on
this branch before the fix converged with `2a91fad2`: `683746ad` (absolute paths alone — did
not fix it, same bug reproduced) then `0642861c` (pinned `GIT_WORK_TREE`, the same fix `B-01`
landed on `v23-build`). Both landed before `WPD-1` itself; nothing reached `origin` with the bug
in it — caught and reverted (`git reset --soft HEAD~1`, twice) in this worktree first. Superseded
by `2a91fad2` on merge; kept here as this worktree's own record of hitting and fixing it before
the fleet-wide fix was available.

**WPD-1 · `pnpm serve:mock`.** `data/mock/server.ts`'s `handle()` cannot be imported by a plain
`node`/`tsx` script: several handlers (`agents`, `brain`, `decisions`, `sections`, `tasks`,
`test`, `today`) transitively import `react-native`, whose Flow-flavoured source only Jest's
babel transform (`jest-expo`) parses — `esbuild` (what `tsx` uses) fails on
`node_modules/react-native/index.js:27` with `Unexpected "typeof"` before any app code runs.
`tests/unit/serveMockRig.test.ts` hosts the real mock behind `node:http` the way
`tests/unit/conformance.test.ts`'s `startServer` does, but self-skips unless
`JSTACK_SERVE_MOCK_RIG=1`; `tools/serve-mock.mjs` sets that and runs it with
`--testPathPattern`/`--runInBand`/`--reporters=default` (the last one because two Jest
processes writing `evidence/jest-summary.json` at once — the outer `pnpm test` and this one,
when `tests/unit/serveMock.test.ts` runs as part of a full suite — produced a corrupted,
inconsistent summary the first time this ran inside `pnpm test`). Red first:
`tests/unit/serveMock.test.ts` spawning `node tools/serve-mock.mjs`, which failed with
`Cannot find module '…/tools/serve-mock.mjs'` before the file existed, then (after the file
existed but pointed `--runTestsByPath` at `tests/rig/serveMockRig.ts`, outside
`jest.config.js`'s `testMatch`) with `No tests found` — moved into `tests/unit/` once that
was understood. `node tools/conformance.mjs http://127.0.0.1:4181/api/v1` against the running
server: 68 passed, 0 failed, 4 skipped.

**WPD-2 · `pnpm connect:check <base>`.** A thin wrapper around `tools/conformance.mjs` (now
exported from it, not reimplemented — rule 16): an evidence path of its own
(`evidence/connect/<date>/`, so a same-day rerun is a fresh file, not a silently overwritten
one) and one verdict line on top of conformance's own per-route transcript — `CONNECT OK — <n>
passed, <n> skipped` or `CONNECT FAILED — <route>: <detail>`, naming the first failing check.
Documented as `HANDOVER.md` §1.7 step 1's command. Red first: the WPD-1 test file extended with a
`D-2` describe block calling `node tools/connect-check.mjs` before the file existed —
`Cannot find module '…/tools/connect-check.mjs'`. `pnpm connect:check http://127.0.0.1:4181/api/v1`
against `pnpm serve:mock`: `CONNECT OK — 68 passed, 4 skipped, against
http://127.0.0.1:4181/api/v1`, evidence written to `evidence/connect/2026-09-14/`.

**WPD-3 · The passkey ceremony is typed (ADR-67).** `data/types.ts`: `WebauthnBody`/`WebauthnResult`
were `Record<string, unknown>`; `{step}` (`WebauthnStep`) had no enum. Typed per the WebAuthn
standard's JSON form (`PublicKeyCredential.toJSON()`, Level 3 — base64url buffers, never a raw
`ArrayBuffer`): `WebauthnOptions` (challenge; `rp`/`user`/`pubKeyCredParams` present only for a
fresh registration) and `WebauthnCredential` (every field optional — the ceremony is checked on
the DEVICE today, `lib/webauthnGate.ts`, not the server, so the mock cannot honestly verify
anything it receives). `data/mock/handlers/session.ts`'s `webauthnCeremony` answered `{ ok: true
}` for both steps alike; now answers a real `WebauthnOptions` for `"options"` and `{ verified:
true }` for `"verify"`. `CONTRACT.md` §4.1 updated to match; `ADR-67` in `DECISIONS.md`
(`tests/unit/consolidation.test.ts`'s RM-09 extended from "01..65" to "01..65 plus 67" — 66 is a
concurrent v2.3 package's, not on this branch). Red first:
`tests/unit/webauthn.test.ts` validating the mock's response against the generated
`WebauthnResult` schema through `tools/schema-validate.mjs` (the same validator
`tools/conformance.mjs` uses) — with the handler still answering `{ ok: true }`, both steps
printed `matches none of the 2 alternatives`. Packaged mock rebuilt in this commit (`data/`
touched — PROTOCOL §2).

**WPD-4 · A request timeout, with abort.** `data/transport/http.ts:65-72` — one `fetch`, no
timeout; `CONTRACT.md` Q20 said so outright ("the client sets no request timeout of its own").
Added a 15s default (`data/config.ts`'s `API_TIMEOUT_MS`, `EXPO_PUBLIC_API_TIMEOUT_MS`
overrides it) and a 60s allowance for an upload (`UPLOAD_TIMEOUT_MS`, not overridable). On
timeout, throws `Error("network timeout: …")` — the same network-failure class
`data/transport/outbox.ts`'s `isNetworkFailure` already recognises (its regex matches
"network"), so a queueable write times out into the queue and a read shows the existing error
path. First cut used `AbortSignal.timeout(ms)` and checked `error.name === "TimeoutError"` —
passed under Node's own fetch but silently never matched under React Native's fetch polyfill
(what this file's own Jest lane, and the native build, actually run against), letting the
original unwrapped message through. Rewritten with the transport's own `AbortController` and a
check on `controller.signal.aborted` instead, which needs nothing from the thrown error's shape
and is the same on every runtime. Also found and fixed along the way: `data/config.swap.ts`
(BS-05's swap-build flavour of `data/config.ts`) had no `API_TIMEOUT_MS`/`UPLOAD_TIMEOUT_MS`
exports, which `--swap` builds would have bundled as `undefined` — `setTimeout(fn, undefined)`
fires as `0ms`, timing out every request instantly; and two existing tests
(`tests/unit/conformance.test.ts`, `tests/unit/identity.test.ts`) mock `@/data/config` without
these two exports for the same reason, fixed the same way as `tests/unit/transport.test.ts`'s
own `loadWithBase()`. Red first: `tests/unit/transport.test.ts`'s new case, a real
`node:http` server that accepts the connection and never calls `res.end()` — under the
pre-fix code the request genuinely hung (had to be force-killed after several minutes rather
than failing fast), which is the defect itself, demonstrated rather than merely asserted.
`CONTRACT.md` Q20, `HANDOVER.md` §2/§4 and `KNOWN_GAPS.md`'s "Deferred to V3" table (the row is
gone, not reworded — the gap is closed) updated to match.

**WPD-5 · Credentials are explicit.** The transport set no `credentials` at all, so the httpOnly
refresh cookie (`CONTRACT.md` §8 Q9) rode only when `fetch`'s own implicit default
(`"same-origin"`) happened to be right — no lever existed to say otherwise. Added
`data/config.ts`'s `API_CREDENTIALS`: `"same-origin"` unless `EXPO_PUBLIC_API_CREDENTIALS=include`,
sent explicitly on every request. `data/config.swap.ts` (the BS-05 swap flavour) got the same
export in the same commit — WPD-4 already found that an omission there bundles as `undefined` in
a `--swap` build, which is exactly the mistake this row would otherwise have repeated one commit
later. `HANDOVER.md` §1.3 step 4 and `SECURITY.md` Q9 say what BOTH sides need for a
cross-origin deployment (the env var AND the backend's own CORS credentials answer). Red first:
`tests/unit/transport.test.ts`'s two new cases, spying on `global.fetch` and reading
`init.credentials` off the captured call — `toMatchObject` on the whole init object threw
("Map.prototype.entries called on incompatible receiver") against whatever Headers-like value
React Native's fetch polyfill builds internally, unrelated to credentials; reading the one
field as a primitive avoided it. `data/` touched: packaged mock rebuilt in this commit.

**WPD-6 · Pinning fails closed.** `data/pins.ts:35` verified a pinned host only `if (pinned &&
nativeVerifier)` — with `SPKI_PINS` filled and no verifier registered (every web build; a
native build before the go-live dev wiring runs), the check skipped straight past the whole
block, so the host looked pinned and was not. Fixed to fail closed: a pinned host with no
verifier now throws (`no pin verifier registered for <host>...`) rather than connecting
unverified. Practical consequence, named in the new `SECURITY.md` paragraph: naming a host in
`SPKI_PINS` makes it native-only the moment it is added, since the web has no pinning
mechanism at all — a decision REMAP makes on purpose per host, not one a user discovers by
hitting a refused connection. `SECURITY.md` gained the "Certificate pinning (SEC-08)" section
`REMAP_FIRST_LOOK.md` §2d asked for (it, and `KNOWN_GAPS.md`, "never mention pinning at all").
Red first: `tests/unit/security.test.ts`'s new case — pins configured, no verifier registered,
the request resolved instead of rejecting.

**WPD-7 · `/healthz` is reserved and said once.** `data/routes.ts:185` `GET /health` is the Life
health feed; `BACKEND_HANDSHAKE.md` already put the liveness check at `/healthz`, outside the
API, but `CONTRACT.md` §4 never said so beside the route it could be mistaken for. One line
added to the `GET /health` row. No code; no test (documentation only, nothing to be red first
about).

**WPD-8 · `eas.json` exists.** Did not exist. Added `jstack-app/eas.json` with `development` (a
dev client, internal distribution), `preview` (internal, no dev client) and `production` (a
store build — no dev client, not internal-only) profiles for iOS; `appVersionSource: "remote"`
chosen and stated; a `submit.production.ios` block naming `appleId`, `ascAppId` and
`appleTeamId` as placeholders (never a real credential). `eas build` not run. Red first:
`tests/unit/deploy.test.ts` (new file) against the repo with no `eas.json` — every case failed
`ENOENT`.

**WPD-9 · `NATIVE_RUNBOOK.md` for Josh's own build and submit.** New file at the repo root, in the
voice of `DEVICE_RUNBOOK_v22.md`: prerequisites (Apple developer account, `eas login`, the
bundle id already set), the development build (`eas build --profile development --platform
ios`) and what to check on it (Face ID gate, microphone permission strings — native dictation
and push both noted as not yet built rather than claimed, per `KNOWN_GAPS.md` — the offline
capture and replay), the production build and TestFlight submission (`eas build --profile
production --platform ios`, `eas submit --profile production --platform ios --latest`), how to
point a build at REMAP's server (`EXPO_PUBLIC_API_BASE_URL` at build time, proved first with
`pnpm connect:check`), and the line that Expo Go / EAS Update is a demo channel only. Every
command checked against the installed `eas-cli`'s own `--help` (`build`, `submit`, `login`,
`whoami`) before it was written; `eas build`/`eas submit` themselves not run (need a real Apple
account this session does not have). Linked from `DEPLOY.md`'s native section and
`HANDOVER.md` §1.8; added to `HANDOVER_OUTLINE.md`, whose paths `tests/unit/consolidation.test.ts`
(RM-08) already checks exist — no new test needed for that half. `pnpm codemap` also rebuilds
`REMAP_HANDOVER_v22.html` from `HANDOVER.md`; forgetting that step failed `tests/unit/
handover.test.ts` (RM-06, a stale fingerprint) the first time through this item, fixed before
committing.

**WPD-10 · Best effort — the swap lane against `serve:mock`.** Tried: took the `E2E_LOCK`
(PROTOCOL §3), started `pnpm serve:mock --test`, then checked what `e2e/helpers.ts` and
`lib/testHook.ts` actually need from a swap-mode server before building anything, rather than
building blind and finding out from a wall of red. Both call `POST /__test__/reset`,
`POST /__test__/clock` and `lib/testHook.ts` also `GET /__test__/db` — all THREE at the
server's own root (`new URL(API_BASE_URL).origin`), outside `/api/v1` entirely, unlike every
other route in the app including the other rig routes. Checked directly against the running
mock (`curl -X POST http://127.0.0.1:4181/api/v1/__test__/reset` and `.../clock`): both 404,
`"no mock route for POST /__test__/reset"`. Grepped `data/mock/` for `reset`/`clock`/`db` route
implementations: none exist anywhere, in-process or over HTTP — `data/mock/db.ts`'s own
`reset()` and `setClockOffsetMs()` are called directly by Jest today, never through a route,
and nothing serves a raw db snapshot at all. This is not a small repair to `e2e/helpers.ts` or
a build flag (the two things D-10 scoped as in bounds): it is a new, root-level debug surface
that has never existed in this mock, retired along with the v1.2 reference server it was
written for. Stopped here — released the lock, stopped the mock server, left the tree clean —
rather than build that surface past the stated scope. Found and written up in one focused pass,
inside D-10's own 90-minute cap with room to spare. `KNOWN_GAPS.md`'s swap-lane row updated with
exactly what was found, so the next attempt starts from the real blocker instead of rediscovering
it.

**WPD-11 · `NATIVE_RUNBOOK.md`'s three false steps, and dictation's stale "not yet wired."**
`:58` told Josh to run `EXPO_PUBLIC_API_BASE_URL="…" eas build --profile development --platform ios`
to point a build at REMAP's server — but `eas build` runs on EAS's own cloud, which never sees a
variable set in front of the command the shell issues (Expo's own docs: local env is not available
to EAS Build), so every such build silently built against the mock. Fixed: the variable now lives
in the build PROFILE's own `env` (`eas.json`'s `build.production.env`, a placeholder host —
`tests/unit/deploy.test.ts`'s new case proves it is there and not a real credential), and the
runbook says why the old form never worked. `:41` claimed declining the mic permission shows "the
OS settings deep-link the app offers" — there is no such deep-link (the only `Linking.openURL` in
the app is `ExternalLinkDialog.tsx`, never reached from here); it actually shows `lib/mic.ts`'s own
line, "Microphone permission needed — typing still works." `:82` claimed `-g`/`--groups` on
`eas submit` adds a build to "a named external group" — checked against the installed eas-cli
18.8.1's own `--help`: "Internal TestFlight testing groups," never external. Separately, `:42-45`'s
"Native dictation. Not yet wired" (and the same claim in `DEPLOY.md` and `HANDOVER.md`) predates
WP-B's B-4, already merged into this tree: `expo-speech-recognition` is wired behind `lib/mic.ts`'s
one microphone owner. Rewrote all three as the device check dictation now is, and removed
`KNOWN_GAPS.md`'s stale duplicate row (a corrected row already sat beside it, unremoved when B-4
landed).

**WPD-12 · Honest counts — "passed / total" let a design skip read as a pass.**
`evidence/jest-summary.json` only ever recorded `numTotalTests` and `numPassedTests`, so every
headline line that quoted it wrote "<total> passed / <total>" — true of the total, false of the
word "passed" over a suite that has skipped one BY DESIGN since WP-D (`serveMockRig.test.ts`,
self-skipping outside `pnpm serve:mock`). Added `numPendingTests` to the reporter's written
summary. New count-line format everywhere the old "<n> passed / <n>" or "<n> Jest tests" shape
stood: **"\<passed\> passed, \<skipped\> skipped by design / \<total\>, \<suites\> suites"** —
applied in `QA_REPORT_v22.md` §3's board, `QA_REPORT_v2.md` and `HANDOVER_v2.md` (each split onto
its own line/sentence where it used to share one with the e2e figures — sharing a line let
`handover.test.ts`'s e2e-breakdown checker grab the Jest "passed" number instead of the e2e one it
meant). `tests/unit/qaReport22.test.ts` and `tests/unit/handover.test.ts` now compare passed and
skipped to the summary, not only the total — with one structural fix: comparing the documented
PASSED number straight to `numPassedTests` is unsafe, because these exact cases are among the tests
that number counts, and the summary `qaReport22.test.ts` reads was written by the PREVIOUS run.
Total and skipped are both stable regardless of which test in the current run is still red, so each
is derived instead — `DOCUMENTED_PASSED` must equal `numTotalTests - numPendingTests` — sidestepping
the old chicken-and-egg lag without needing a rerun to settle. Board at commit: 2325 passed, 1
skipped by design / 2326, 123 suites.

**WPD-13 · A stalled body still hung, and a blank timeout var still meant zero.**
`http.ts` cleared the abort timer the moment `fetch()` resolved — headers in, status known — not
once the response actually arrived. A server that answers promptly and then stalls the BODY left
nothing armed to abort `res.text()`, hanging the caller the timeout exists to release. Fixed by
keeping the timer armed across both awaits: the same `AbortController`'s signal aborts a body read
on the `Response` it produced, so no second timer or abort path is needed. Separately,
`config.ts`'s `EXPO_PUBLIC_API_TIMEOUT_MS` parse trusted `Number()` on the raw env value:
`Number("fifteen")` is `NaN` as expected, but `Number("")` is `0`, not `NaN` — a var set and then
cleared would not even fail loud, and `setTimeout(fn, 0)`/`setTimeout(fn, NaN)` both fire at once.
Fixed to fall back to the 15s default on anything that is not a genuine positive number, in both
`data/config.ts` and its `config.swap.ts` mirror. Red first: `tests/unit/transport.test.ts`'s new
body-stall case (a real `node:http` server that flushes headers then never writes another byte)
hung/timed out against the unfixed code; the NaN/blank-string cases landed on `0` instead of the
15s default. Both green after. **Correction (WPD-13b): "genuine positive number" overclaimed what
the code actually checked here — `Number.isFinite` alone, which still let `"0"` and `"-1"` through
as themselves. See WPD-13b for the real fix.**

**WPD-14 · `serve:mock`'s real startup time, documented.** `pnpm serve:mock` runs the mock inside a
Jest worker (`jest-expo`'s own startup, not a bug) and takes around half a minute — it prints
Jest's own `Running one project: unit` banner before the base-URL line that means it is actually
ready. Documented once, in `tools/serve-mock.mjs`'s own header comment, which `HANDOVER.md` §1.7
and `CODEMAP.md` §5 both read from — one sentence each, as asked.

**WPD-15 · `evidence/connect/` gets a `.gitignore` rule.** `tools/connect-check.mjs` (D-2) writes a
dated verdict there on every run against a real server — REMAP's own evidence of ITS run against
ITS deployment, not the app repo's to carry forward. Added alongside the existing
`evidence/.e2e-raw/` rule.

**WPD-16 · RM-03's tree walk tolerates `lint-guards.test.ts`'s own scratch dirs.**
`tests/unit/consolidation.test.ts`'s env-var walker (RM-03) reads every file under `app/`,
`components/`, `data/`, `layout/`, `lib/`, `stores/`, `theme/`, `tools/`, `e2e/` and `tests/` with
`readdirSync`/`statSync` and no error handling. `tests/unit/lint-guards.test.ts` runs in parallel
and mkdtemp's/removes its own `tests/lint-guard-scratch-*` mid-suite — a name this walk could list
one tick and find gone the next, seen as an intermittent ENOENT with no code defect behind it.
Fixed two ways: the walker now skips `lint-guard-scratch-*` (and `.tmp-*`, the same convention for
whatever future test mkdtemp's under one) outright, and tolerates ENOENT on
`readdirSync`/`statSync` for whatever a real filesystem race still catches, re-throwing any other
error. A race is not reliably reproduced by a single red-first run; verified by rerunning the full
suite (where `lint-guards.test.ts` and this case genuinely run in parallel) repeatedly with no
recurrence.

**WPD-17 · `webauthnCeremony` carries the D-3 shapes through `DataProvider`.**
`DataProvider.ts` still declared `webauthnCeremony(step: "options" | "verify", payload?: unknown):
Promise<unknown>` — the pre-D-3 signature, untouched when `ApiAdapter.ts` and the mock handler were
typed. Tightened to `WebauthnStep` in, `WebauthnBody` in, `WebauthnResult` out. `pnpm check` proves
`ApiAdapter.ts`'s implementation and the mock handler still agree with the interface — `ApiAdapter`
is `DataProvider`'s only implementer (grepped), so no other call site needed a change.

**WPD-12b · `expectEveryMatch` returned on zero matches, so a doc still carrying the PRE-D-12 count
shape read green.** QA found it: `tests/unit/handover.test.ts`'s `expectEveryMatch` treats zero
regex matches as "this doc doesn't happen to quote this count — nothing to check" and returns. A
doc whose count line was never updated to D-12's new shape (`Jest 2326 passed / 2326, 123 suites;`
or `2320 Jest tests across 123 suites` sitting untouched in `HANDOVER_v2.md` or `QA_REPORT_v2.md`)
matches NEITHER of the three new-shape patterns `expectEveryMatch` checks, so all three see zero
matches and pass silently on a stale figure — the exact class of bug D-12 itself was written to
close, reopened by its own guard's blind spot. Fixed with two checks added to the QA-02
`describe.each` block (`HANDOVER_v2.md`, `README.md`, `QA_REPORT_v2.md`, `HANDOVER.md`): the two
pre-D-12 shapes (`/\b\d+ passed \/ \d+\b/`, `/\b\d+ Jest tests?\b/`) must appear NOWHERE in any of
the four docs, and the new shape must appear EXACTLY ONCE in the two docs whose own prose commits to
carrying it (`HANDOVER_v2.md`, `QA_REPORT_v2.md`). The same defensive pair added to
`tests/unit/qaReport22.test.ts` for §3 of `QA_REPORT_v22.md`, though that file's own `num()` helper
was never exposed to this bug class (a missing match already fails the comparison there — `null !==
number` — rather than returning early). Red first: appended a real stale line
(`Stale test line: 2326 passed / 2326, 123 suites.`) to `HANDOVER_v2.md`, watched the new
`staleSlash` check catch it, reverted.

**WPD-13b · `Number.isFinite` let `"0"` and `"-1"` through as themselves.** WPD-13's fix
(`Number.isFinite(parsed) ? parsed : 15_000`) closed the NaN and blank-string traps but not this
one: `0` and `-1` are both genuine finite numbers, so `EXPO_PUBLIC_API_TIMEOUT_MS="0"` or `"-1"`
passed straight through as the timeout value — `setTimeout(fn, 0)` fires at once and a negative
delay clamps to `0` and does the same, aborting every request exactly as instantly as the case this
row was meant to close. Fixed in both `data/config.ts` and `data/config.swap.ts`:
`Number.isFinite(parsed) && parsed > 0`, falling back to 15s on anything that is not a genuine
positive duration. `"0"` and `"-1"` added to `tests/unit/transport.test.ts`'s existing
unset/blank/non-numeric case. Red first: both values landed on `0` against the unfixed guard; green
after.

## WP-B — Voice, and the writes that lie (branch `v23/wpb`)

**WPB-0 · process — in a linked worktree the pre-commit hook staged the maps at the repo root.**
`.githooks/pre-commit` moves into `jstack-app/` and runs `git add CODEMAP.md wiring.json WIRING.md
WIRING.html openapi.yaml`. Git runs a hook with `GIT_DIR` set and no work tree, and in a linked
worktree (PROTOCOL §1 puts every v2.3 builder in one) git then takes the hook's current directory
for the top of the tree: the five maps were staged a second time at the repo root, and the first
push of WPB-1 carried 17,954 lines of copies (`6eef5f23`, replaced before anything was built on it).
Neither `GIT_WORK_TREE=… git commit` nor `git -c core.worktree=… commit` reaches the hook's own git
calls. The hook exports `GIT_WORK_TREE="$ROOT"` before it moves into the app now, so the maps stage
where they live in either kind of checkout. Row 0's B-01 is the fleet's record of the same defect,
and `2a91fad2` is the fix `v23-build` carries; this branch took it at the merge.
*Red first:* no Jest lane can run this hook inside a linked worktree (it runs `pnpm codemap`).
Reproduced with the hook's own sequence instead: from `jstack-app/` under `GIT_DIR=<the worktree's
git dir>`, `git rev-parse --show-prefix` printed `[]`, and with `GIT_WORK_TREE` set it printed
`[jstack-app/]`. The proof that it holds is the WPB-1 commit's own stat: no root-level map.
*Commit:* `fix(v2.3): wpb-0 — the pre-commit hook stages the maps inside the app in a linked worktree`.

**WPB-1 · A4R7-15 — a dropped Talk socket kept what was said before the drop on the screen, and lost
it from the record.** `jstack-app/data/mock/voice.ts` held each conversation's transcript in the
socket, and a reconnect is a new socket: `start { resume: true }` handed back nothing, and `finish`
filed only what came after the drop ("Talked with your EA" for a conversation about Andy). The
scripted server now keeps a conversation's lines by `sessionId`, the key §4.11's resume names, and
hands them back on a resume as the `final`s already sent, each under the `id` it first carried
(`jstack-app/lib/voice/protocol.ts`: `final { text, id? }`). `jstack-app/lib/voice/session.ts` keeps
one row per id and does not decide a replayed line again, so a replayed cue word ends no second
turn. `CONTRACT.md` §3 and §4.11 carry the field and the rule.
*Red first:* `tests/unit/voice.test.ts` › "A4R7-15 · a drop mid-conversation keeps, and files, what
was said before it" — printed `Expected substring: "What's most urgent?" / Received string: "and
after the tunnel"` (the summary), and `Expected length: 1 / Received length: 2` (the replayed row).
*Commit:* `fix(v2.3): wpb-1 — a dropped Talk socket keeps what was said before the drop`.

**WPB-2 · A4R11-08 — a typed Talk line was drawn twice.** `jstack-app/lib/voice/session.ts`: `sendText`
drew the row, and the server's echoed `final` drew it again through `onFinal`. The line is keyed by
the client's id now: `text { text, id? }` carries it and the server's `final` for the line carries it
back (`jstack-app/lib/voice/protocol.ts`), so the echo replaces the row it belongs to. The echo still
decides the words, once: a typed end phrase asks to end, and its replay on a resume does not ask
again. Found beside it and closed with the same key: a line typed while the connection was down
reached no server — it showed on the screen and was never filed. On a resume the client sends every
typed line not yet said back again, under its id, and the scripted server
(`jstack-app/data/mock/voice.ts`) says a line it already holds back rather than adding it twice.
`CONTRACT.md` §3 and §4.11 carry the field and both rules. `e2e/core/talk.spec.ts` TS-02 read the
typed line at `talk-row-1`, which was the echo's second row: it reads `talk-row-0` now and pins three
rows after the turn — the expectation moved with the defect, and this row is its record.
*Red first:* `tests/unit/voice.test.ts` › "A4R11-08 · a typed line is shown once": "a typed line and
the server's echo of it are one row" printed `Expected length: 1 / Received length: 2`, and "a line
typed while the connection is down goes again on the reconnect, under its id, and is shown once"
printed `- Expected - 7 / + Received + 1` (the reconnect sent no `text` at all). The third case, "the
echo still decides a typed line's words, once", passed before the fix: it is the guard that keying
the echo did not stop it deciding.
*Commit:* `fix(v2.3): wpb-2 — a typed Talk line is shown once`.

**WPB-3 · A4R11-06 — a lock during Talk released the microphone and the screen went on saying
"listening".** The release was the safe direction (`relock()` → `stopActiveMic()`, MC-07), but
nothing told the conversation, and `jstack-app/components/brain/TalkScreen.tsx` read its state line
off the session (`STATE_LINE[state]`): a person driving kept talking to a microphone that was gone,
and nothing offered it back. The planner's decision, within Josh's rule: `jstack-app/stores/voice.ts`
hears the lock, marks a running conversation `paused: "locked"` and lets go of its microphone (one
still at the permission prompt included); `resumeAfterLock()` is the only way back, and it opens
exactly one microphone through the mic owner — the unlock opens nothing. The state line derives from
the mic owner's own state for Talk's microphone (`stores/mic.ts`), never from a flag beside it:
"listening" only while that microphone is open, "Paused — locked" after a lock (with a single Resume
in place of Mute · Reply), "muted" once Mute has released it, "opening the mic…" at the permission
prompt, and "mic off" otherwise; the orb rests whenever the microphone is not listening.
The lock watch is armed by the first `start()`, never at import: armed at import it failed three
suites before a line of them ran (`tests/unit/stores/session.test.ts`, `stores/agents.test.ts`,
`autoLock.test.ts`: "Cannot read properties of undefined (reading 'subscribe')"), because
`stores/voice.ts` can be evaluated inside `stores/session.ts`'s own import graph, before the session
store exists. `CONTROLS_v2.md` §4.11 documents `talk-resume` (QA-01).
`stores/voice.ts` would have been 213 lines against the 200 cap, so its session half — the EA's two
speakers and the mirror of the session's events — moved to `jstack-app/lib/talkSession.ts`, beside
`lib/talkMic.ts` (187 lines now; `KNOWN_GAPS.md` D-5's count follows). Two expectations moved with
the rule, recorded here before they changed: `tests/native/screens.test.tsx` S6-09 pinned "listening"
with the microphone unavailable, and reads "mic off"; `e2e/core/talk.spec.ts` asserted "listening" in
a headless browser that has no microphone, so `openTalk`, VP-07 and TS-06 open the test build's stub
one first (`stubMic`, `__JSTACK__.mic.use`) and "listening" is backed by a stream there too.
Seen and not changed: `TalkBanner` draws its mic glyph in the live colour for as long as a
conversation runs, paused included — carried in the WP-B report.
*Red first:* `tests/native/screens.test.tsx` › "A4R11-06 · a lock during Talk pauses the
conversation, and only Resume reopens the microphone" — after `relock()`, with `open()` already 0
(the microphone was released), printed `Expected element to have text content: Paused — locked /
Received: listening`.
*Commit:* `fix(v2.3): wpb-3 — after a lock ends a Talk conversation, the screen says so`.

**WPB-4 · native dictation is wired, behind the one microphone owner.** On the iPhone build every
microphone said "Mic unavailable here · type instead": `expo-speech-recognition` was installed and
configured in `jstack-app/app.json` and imported nowhere, and `jstack-app/lib/mic.ts` knew only the
browser's `getUserMedia`. The planner's decision was to wire it, not remove it. `lib/mic.ts` drives
the module as its native implementation now: permission first — a refusal says "Microphone
permission needed — typing still works." and the field still types — then one recogniser, whose own
`start` event is what lets the state read "listening". Its results reach the same `onInterim` and
`onFinal` the browser's recogniser feeds. `stop()` asks the device for its last result, and the
`end` event removes every listener, because the module is one for the whole app. A second start, the
lock, the auto-stop and a stop at the permission prompt each end it the way they end a stream, and a
recogniser that ends on its own (a call, Siri) leaves the state "off". The web is unchanged: the
module is loaded only off the web (`Platform.OS`), and wherever it is absent (Expo Go, or a Jest lane
that does not mock it) the browser path runs as before. Talk on a phone asks `micHearsWords()` and
sends what the recogniser hears as text (`jstack-app/lib/talkMic.ts`) — never audio, and never both;
words heard while the EA speaks are dropped, as its audio is. The proof is the native Jest lane with
the module mocked (`tests/native/micNative.test.ts`, eight cases); hearing a sentence on a phone is
Josh's check, a `DEVICE_RUNBOOK_v22.md` §3 step now, and `KNOWN_GAPS.md` says so (owner: Josh).
`CODEMAP.md` §4 names the new test file (CM-05).
*Red first:* `tests/native/micNative.test.ts` › "B-4 · native dictation goes through the one
microphone owner" — all eight cases. "start opens exactly one recogniser, and its words reach the
field's callbacks" printed `Received: "Mic unavailable here · type instead"`; "a second start stops
the first recogniser" printed `Expected: 2 / Received: 0` (no recogniser ever started); "Talk on a
phone hears words and sends them as text" printed `Received: null` (Talk had no microphone on a
phone).
*Commit:* `fix(v2.3): wpb-4 — native dictation is wired behind the one microphone owner`.

**WPB-5 · A4R6-11 — a failed settings load let a later save write the defaults over the server.**
`jstack-app/stores/settings.ts` `load()` is all-or-nothing, and five saves send a whole record composed
over what it brought: with the boot load failed, the store held the defaults — no focuses, no autonomy
— and a save PUT them. The audit's "Add a focus" took the server from four focuses to one, and an
Autonomy change would have sent one key for the whole record. The store records a successful load now
(`loaded`). Until one has landed, `putFocuses`, `putAutonomy`, `putVoice`, `putQuietHours` and
`putNotificationGroup` send nothing: they say "Settings haven't loaded · needs a connection" (the words
the verbs use offline), try the load again so the next press composes over the real record, and
resolve `false`. The callers that announce a save check it: `components/settings/FocusEditDialog.tsx`
no longer says "Focus added", `Autonomy.tsx` no longer says "Autonomy saved", and `Notifications.tsx`
does not re-post the push groups for a save that did not happen. The partial writes (`putLayout`,
`putAppLayout`, `revertLayout`) send only what changed and are not refused.
*Red first:* `tests/unit/stores/settings.test.ts` › "A4R6-11 · a failed settings load never lets a
later save write defaults over the server" — after `load()` rejected, printed `expect(jest.fn())
.not.toHaveBeenCalled() / Expected number of calls: 0 / Received number of calls: 1` for `putFocuses`:
the defaults went to the server.
*Commit:* `fix(v2.3): wpb-5 — a failed settings load never lets a later save write defaults over the server`.

**WPB-6 · A4R8-02 — a lock parameter queued on a network failure was adopted on the device, unjudged.**
`jstack-app/stores/parameters.ts` `setParameter`: A4R7-02's range check runs only when the app believes
it is offline, but a send that fails at the network layer while it believes it is online is queued
too — and the queued branch adopted the value the moment the outbox's receipt came back, so 0 locked
the app at every tap and 9999 switched the auto-lock off until the next replay judged it. A queued
write is not accepted now: the record stays the server's, so `currentParameter` (what
`lib/autoLock.ts` reads) keeps the server's value; the new value is `pending`, and the parameters
reload that follows its replay (`stores/sync.ts` `reloadAffected`) adopts it, or drops it if the server
refused it. `components/settings/Security.tsx` shows a pending value under its control in the outbox's
one wording ("5 minutes · queued · syncs when you're back online"). One expectation moved with the
defect, recorded here first: `tests/unit/writePaths.test.ts` A4R6-05 asserted that a value set offline
was adopted on the device; its point — the record stays whole — stands, at the server's value with the
new one pending. Its title stands as it was, because `BUGLOG_v22.md` quotes it (LV-01).
*Red first:* `tests/unit/writePaths.test.ts` › "A4R8-02: a lock value queued on a network failure is not
adopted — the lock keeps the server's value until the replay lands" — with the outbox's receipt answered
as a network failure produces it, `currentParameter("lock.afterMinutes")` printed `Expected: 10 /
Received: 0`.
*Commit:* `fix(v2.3): wpb-6 — a lock parameter queued on a network failure is not adopted unjudged`.

**WPB-7 · A4R8-03 — an upload queued while its capture went through online was filed without the
capture.** B-218 closed A4R7-04 for the case where an upload and its capture are both queued, because
the outbox replays the upload first. A capture that goes straight through does not wait behind the
queue: `jstack-app/components/brain/Entry.tsx` sends it at once with `offline:<offlineId>` for a file
the server does not have yet, `jstack-app/data/mock/handlers/brain.ts` `attachTo` could not resolve the
name and dropped it, and the upload that replayed afterwards (`jstack-app/data/mock/handlers/files.ts`
`postFile`) was filed as a loose file in `/JSTACK/Inbox`. The reference exists now whichever arrives
first: `attachTo` keeps a name it cannot resolve yet (`db.captureByPendingUpload`), and `postFile`
files the upload with that capture when it arrives — the capture's silo and focus with it, as if it had
come first. `CONTRACT.md` §4.17 and §7 say the server does this, so REMAP builds it.
*Red first:* `tests/unit/writePaths.test.ts` › "A4R8-03: an upload still queued when its capture goes
through online is filed with the capture" — with the capture sent online and the upload still in the
queue, after the replay the file's `captureId` printed `Expected: "dump-mu15a7qx-u8r83ecc" / Received:
undefined` — the upload was filed loose.
*Commit:* `fix(v2.3): wpb-7 — an upload queued while its capture goes through online is filed with the capture`.

**WPB-8 · docs — the iOS Safari audio path is a runbook step, not a claim.** `CONTRACT.md` §4.11 says the client sends `audio/mp4` on iOS Safari (Q19), and `lib/mic.ts` chooses it with `isTypeSupported` (MC-09). The board can only prove the CHOICE, against Chromium told that mp4 is what it supports (`e2e/core/talk.spec.ts` TS-07); whether Safari records and a conversation goes through is a device fact. `DEVICE_RUNBOOK_v22.md` §4 carries the step now, with what wrong looks like (it names the formats in words: RM-08 reads a backticked `audio/mp4` there as a file path, and failed on the first cut), and `KNOWN_GAPS.md` keeps its §4.11 row: the streaming provider that would hear that audio is still REMAP's.
*Red first:* none — a docs row. No automated lane runs Safari on an iPhone, which is the gap the step exists for.
*Commit:* `docs(v2.3): wpb-8 — the iOS Safari audio path is a runbook step, not a claim`.

**WPB-9 · a browser recogniser error mid-dictation left every surface reading "listening".** Seen beside
B-4 and assigned by the planner: `jstack-app/lib/mic.ts` `startRecogniser`'s `onerror` set the handle's
error and stopped it, and a handle with an error says nothing when it stops (`stop()` emits "off" only
when there is no error) — so the device was released and no terminal state was emitted at all. The
field's button, the mic banner and the rail's health line went on reading "listening" over a closed
microphone, which is what ADR-49 exists to prevent. The recogniser ends the session through the stop
path's own terminal states now: a failure goes through `fail` — state "error" with its reason,
"Microphone permission needed — typing still works." for `not-allowed` and "Mic unavailable here · type
instead" otherwise — while a silence the recogniser gave up on (`no-speech`) and an abort end it "off"
the way any stop does, as the phone's recogniser already does (WPB-4). Nothing is said after a stop that
got there first.
*Red first:* `tests/unit/mic.test.ts` › "B-9: a recogniser that fails mid-session ends in error with its
reason, never still listening" — after `onerror({ error: "network" })` printed `ObjectContaining {
"error": "Mic unavailable here · type instead", "state": "error" }` against a store still at `"state":
"listening"`, `"error": null`; and "B-9: a recogniser that gives up on a silence ends the session
off, released, never still listening" printed `Expected: "off" / Received: "listening"`.
*Commit:* `fix(v2.3): wpb-9 — a browser recogniser error ends the session, never leaves it listening`.

**WPB-10 · the Talk banner's mic glyph claimed a live microphone while Talk was paused.** Seen beside B-3
and assigned by the planner: `jstack-app/components/chrome/TalkBanner.tsx` drew its mic glyph in `micLive`
for as long as a conversation ran — through a lock's pause, Mute, or a microphone that was not there — so
the banner a person reads once they have walked away from Talk claimed a microphone the device was not
backing. The glyph reads the mic owner's own state for Talk's microphone now (`stores/mic.ts`): `micLive`
only while it is listening, and otherwise the colour the resting orb's glyph wears (`accentInk`,
`LiveMicOrb`'s Idle dress).
*Red first:* `tests/native/screens.test.tsx` › "B-10 · the Talk banner's mic glyph is live only while
Talk's microphone is open" — paused by a lock, the glyph printed `Expected: "#4A5E70" / Received:
"#4F7FA8"` (the live colour).
*Commit:* `fix(v2.3): wpb-10 — the Talk banner's mic glyph is live only while Talk's microphone is open`.

**WPB-11 · on a phone, a start inside the previous recognition's finishing time read "listening", then went off
with no microphone.** QA's verdict on B-4, from the installed module's iOS source (expo-speech-recognition 3.1.3):
`stop()` only finishes a recognition, and its `end` arrives later, after its last words; a `start()` resets
first, cancelling a recognition still finishing, whose `end` then lands after the new `start` and whose handler
resets whatever recognition is current, the new one. `jstack-app/lib/mic.ts` dropped the previous session's
listeners at the next start and took any `end` as the session's own, so MC-01's second start, a double press and
Talk's Mute then Unmute each showed "listening" and ended "off" with the microphone closed. A native start now
waits for the previous recognition's `end`, bounded at 1.5 seconds, after which that recognition is treated as
ended; each session's listeners stay until its own `end`, so the words a stopped recognition hands back reach the
field that asked for them. A `busy` refusal is a wait: the start is asked again after that attempt's `end`, three
times, 300 ms apart, before the field says the microphone is unavailable. `service-not-allowed`, a recogniser
switched off (Siri and Dictation, or the language's assets), reads "Mic unavailable here · type instead" instead of
asking for a permission that was granted, and after any error the next start waits for the device's own `end`.
*Red first:* `tests/native/micNative.test.ts`'s mock follows the module's order now; it had emitted `end` inside
`stop()`, which no device does, and MC-07's case counts listeners after the device's late `end` rather than inside
the stop. "a second start stops the first recogniser: never two at once (MC-01)" printed `Expected: 1 / Received:
0` for the recognitions listening, and "Talk's Mute then Unmute, at once, leaves a microphone that stays open" the
same; "the words a stopped recognition hands back reach its own field, never the next one's" received `[]`; "a
device still busy with an earlier recognition is waited for, not reported as a failure" received `"Mic unavailable
here · type instead"`; "a recogniser the device has switched off says the microphone is unavailable, not that
permission is needed" received `"Microphone permission needed — typing still works."`. "a recognition that never
ends holds the next start only as long as the wait allows" passes on the old code, which never waited, so it was
seen red against a wait that never runs out: `thrown: "Exceeded timeout of 5000 ms for a test."`.
*Commit:* `fix(v2.3): wpb-11 — a native start waits for the previous recognition's end, and keeps its microphone`.

## WPG — `v23/wpg`, worktree `v23-wpg`

**WPG-1 · LL-03: Life › Learning had no "all" — the acceptance ID quoted "podcast finds the listen
item" against a fixture with no listen item and no searchable list at all.** `layout/sources.ts`'s
`SECTION_VERBS` had `open-files-archive` (Brain › Files' "all") but nothing for Learning, and
`data/mock/fixtures/life.json`'s two learning rows carried no `kind` and no "podcast" text — LL-03
could not be made to pass as written without a third fixture row. Red first, with `le3` (the podcast
item) pulled out of the fixture, `tests/native/screens.test.tsx` printed:

```
● LL-03 · … › opens with every learning item, 'podcast' narrows to the listen item, and pressing it opens the learning detail
  Expected: 1  Received: 0
```

Fixed with the same shape `open-files-archive` already is (OP-08): `open-learning-archive` added to
`SectionVerbAction` (`data/types.ts`) and `SECTION_VERBS`, `sections.json`'s `learning` entry gained
the `verb`, and a new `components/life/LearningAllDialog.tsx` uses `SearchableListDialog`'s
`source`/`text` archive shape over the existing `adapter.getLearning()` — no new route, since
`/learning` already serves the whole list and there is no `?q=` to round-trip to (LL-01, still
PARTIAL, is the row that would add one). A third fixture item (`le3`, `kind: "listen"`, "podcast" in
its meta) makes the acceptance wording actually testable. Rows open the same `learning` detail every
Learning row opens (OP-06). Guards: `tests/native/screens.test.tsx` (LL-03), `tests/unit/opens.test.ts`
(OP-07's `LIST_COMPONENTS` registry), `tests/unit/sections.test.ts` and `tests/unit/usage.test.ts`
(the catalogue is a closed list; `SECTION_VERBS`'s keys are derived, not hand-counted).

`layout/sources.ts` was already sitting at the SM-03 250-line limit with nothing added; `SECTION_VERBS`
moved to a new `layout/sourcesVerbs.ts`, re-exported from `sources.ts`, the same split `sourcesBrain.ts`
already is for `BRAIN_BINDS` — no caller's import path changed.

LL-03 moves to PASS in `QA_REPORT_v22.md` §1 (`tools/qa-rows.mjs`, regenerated); the PARTIAL count and
list, the completion statement's tally, and `KNOWN_GAPS.md`'s row all move with it. `getLearning` moves
from `evidence/wiring-orphans.json`'s `uncalled` bucket to `componentCalled` (LearningAllDialog now
calls it directly), so LV-02's "nineteen uncalled routes" becomes eighteen — updated in
`QA_REPORT_v22.md` §2/§3 and `HANDOVER.md` §2 (not in `AUDIT_v22.md`, `HANDOVER_v22.md` or
`EXECUTION_HANDOFF_v22.md`, which are signed or explicitly kept as history). The Jest total moved to
2153 (one new native case); `HANDOVER_v2.md` and `QA_REPORT_v2.md` updated to match, gates green in
both zones across three full reruns.

**WPG-2 · CL-04: no test proved the delta review's own visual claim — two sections collapsed does
not break the tab around them, at 393 and 1366.** `e2e/matrix/theme.spec.ts`'s RL-11 runs the same
two sweeps (`horizontalScrollViolations`, `overlapViolations` from `e2e/lib/sweeps.ts`) but only on
the fully-expanded page; nothing exercised them with sections actually folded, which is the state
CL-01..CL-03 put the app in and the state the delta review is taken in. Under the E2E_LOCK rule
(PROTOCOL §3): lock checked absent, port 4173 checked free, lock written, `node tools/build-web.mjs`,
`pnpm exec playwright test --project=w393-light --project=w1366-light e2e/core/collapse.spec.ts`,
lock deleted after. Added a CL-04 case to `e2e/core/collapse.spec.ts` (the file CL-01..CL-03 already
live in): for each of the five tabs, collapse the first two `disclose-*` controls found, then run
both sweeps scoped to that tab's screen. 17 passed, 1 skipped (CL-03's pre-existing Arrange-is-
desktop-only skip on w393, unrelated) — the sweeps found nothing to fix, so this is a coverage gap
closed rather than a bug found.

CL-04 moves to PASS in `QA_REPORT_v22.md` §1; the PARTIAL count/list, the completion statement's
tally, the "acceptance IDs named by no test" bullet, and `KNOWN_GAPS.md`'s row all move with it
(nineteen→eighteen PARTIAL, eight→seven no-test IDs — the wiring-orphans count from WPG-1 is
unaffected, CL-04 names no route). No Jest count change: this is an e2e-only addition, and the
e2e board itself is the planner's to run after integration (PROTOCOL §3) — `evidence/e2e-summary.json`
is untouched. Gates green in both zones.

**WPG-1b · LF-08 regressed on `v23-build` (`cd756da5`): "two rows" resolved to 4 elements.**
Found by the planner running the interim full board post-integration. Two real causes, both from
WPG-1: `layout/SectionHeaderRight.tsx`'s `SectionVerb` renders `${id}-verb` for any section with a
`config.verb` — Learning had none before LL-03, so `e2e/core/life.spec.ts`'s row locator
(`[data-testid^="learning-"]`, already excluding `learning-configure` and `learning-act-*` from an
earlier B-15/B-23 case) had never needed to exclude it; and the fixture's third item (`le3`, the
podcast/listen one LL-03 needed to make "podcast finds the listen item" testable) is a genuine third
row, not a selector artefact. Fixed both: the locator also excludes `learning-verb` (B-15/B-23's own
shape — name what a row is, don't relax the count for a coincidental prefix match), and the
expectation moved from `toHaveCount(2)` to `toHaveCount(3)`, honestly, since the row count itself did
change. Verified under E2E_LOCK: lock checked absent, port 4173 checked free, lock written,
`node tools/build-web.mjs`, `pnpm exec playwright test --project=w393-light --project=w1366-light
e2e/core/life.spec.ts -g "LF-08"` — red (`Received: 4`) before, green after at both widths; the full
`life.spec.ts` run at both widths confirms no other row-count assumption nearby broke (a first attempt
against a stale, unscoped `~/.jstack-dist` — another session's build had landed on it between builds —
gave flaky counts and unrelated LG-0x failures; a rebuild immediately before the rerun came back fully
green). Lock deleted after. Gates green in both zones.

**WPG-1c · LL-03's own case never pressed the real "All" link, and `GET /learning?q=` (C-7c)
disagreed with the dialog it was meant to back.** QA found both on the interim board (`cd756da5`).
First: `tests/native/screens.test.tsx`'s LL-03 case mounted `LearningAllDialog` directly, so a plant
swapping the Learning section's verb action onto the Files archive
(`open-files-archive` instead of `open-learning-archive` in `sections.json`, or the same swap in
`SECTION_VERBS`) still passed — the dialog opens correctly no matter which section verb told it to.
Rewrote the case to press `learning-verb` on a real `SectionRenderer` over the fixture's own
"learning" config, through `DialogHost` (`files.spec.ts`'s own `files-verb` e2e case is the same
shape, pressed instead of mounted). Confirmed by planting the exact swap QA named in
`sections.json`, watching the case go red, then reverting it to green. Second: the route
(`data/mock/handlers/life.ts`) searched title, body and kind; the dialog's own client-side filter
(`LearningAllDialog.tsx`) searches title and meta — and the fixture's podcast item carried "podcast"
only in its meta, so `GET /learning?q=podcast` answered `[]` even though the dialog found the row.
Added `meta` to the route's searched fields, fixed the route's own comment (it had claimed the
podcast case already worked), and fixed `LearningAllDialog.tsx`'s header comment, which still said
`/learning` had no `?q=` to round-trip to — it does now (C-7c). Red first:
`tests/unit/learningShape.test.ts`'s new `q=podcast` case against the unfixed handler —
`Received: []` where the listen item was expected; green with `meta` added. Gates green in both
zones.

**WPG-1d · LF-08's row count was bent to the fixture instead of the fixture staying honest to
LF-08.** QA on the WPG-1c delta: `02_ACCEPTANCE_TESTS_v2.md` (the frozen V2 pack) states LF-08 as
"Two rows with meta from GET /learning," and `QA_REPORT_v2.md` marks it PASS citing that literal
describe title — WPG-1b's fix for LF-08's regressed row count (WPG-1's own fixture addition, `le3`)
moved the claim itself to "three rows" rather than keeping the V2 acceptance ID's own wording true.
Fixed by giving the listen/podcast role to an EXISTING item instead of adding a new one:
`data/mock/fixtures/life.json`'s `le2` now carries `kind: "listen"`, "podcast" in its meta, and a
real `url`; `le3` removed. `e2e/core/life.spec.ts`'s LF-08 case is back to `toHaveCount(2)` and its
original title, keeping the `learning-verb` exclusion WPG-1b added (that part was never the
problem). LL-03's native case and `learningShape.test.ts`'s `q=podcast` case now point at `le2`,
confirmed still green and structurally the same red-first proof (the meta-search mechanism WPG-1c
fixed does not care which row's id carries the text). Verified under E2E_LOCK: lock checked absent,
port 4173 checked free, lock written, `node tools/build-web.mjs`, the targeted LF-08 case and the
full `life.spec.ts` file both green at both widths, lock deleted after. Gates green in both zones.

## WPF — `v23/wpf`, worktree `v23-wpb`

**WPF-1 · every request to a base URL with a path went to the host's root.** Finding 1 of `CODE_REVIEW_v23.md`:
`jstack-app/data/transport/http.ts` built each URL as `new URL(req.path, API_BASE_URL)`, and a route path begins
with "/", which replaces the base's own path. With the base `HANDOVER.md` gives, `https://<host>/api/v1`, a call
to `/today` went to `https://<host>/today`. `jstack-app/tools/conformance.mjs` strips the slash, so the runner
passed against a server the app could not reach, and no test used a base with a path. The route path is resolved
relative to the base now, the runner's own rule, and `tests/unit/conformance.test.ts` drives the transport and the
runner under a base with a path and compares the request lines the server received.
*Red first:* `tests/unit/transport.test.ts` › "WPF-1: a base URL with a path keeps it — a call goes under /api/v1,
not to the origin's root" printed `Expected: "/api/v1/today" / Received: "/today"`, and
`tests/unit/conformance.test.ts` › "both keep the base's /api/v1 in front of the route path" printed `Expected:
"/api/v1/brain/dump" / Received: "/brain/dump"`.
*Merged with WP-D:* the transport reads `API_TIMEOUT_MS` (D-4), so the conformance case's config mock carries D-4
and D-5's three values, as WP-D gave the file's other mocks (without them the abort timer fired at once), and
`tests/unit/transport.test.ts`'s `loadWithBase` takes the base path after D-5's credentials, so this row's case calls
`loadWithBase("same-origin", "/api/v1")`. The assertions are unchanged.
*Commit:* `fix(v2.3): wpf-1 — every request keeps the base URL's /api/v1`.

**WPF-2 · a replay listed queued captures on a 429, a 408 or an HTML error page.** Finding 2 of
`CODE_REVIEW_v23.md`: `jstack-app/data/transport/outbox.ts` kept an entry only on a network error, a `401`/`403`
or a `5xx`, so a `429` (which `CONTRACT.md` Q8 promises on `/brain/dump`, a capture route) and a `408` took the
entry off the queue onto the conflicts list, which lives only in memory. `jstack-app/data/transport/http.ts`
parsed the body before looking at the status, so a proxy's HTML 502 threw a `SyntaxError` that replay read as a
bug, and listed that entry too. An error answer keeps its status whatever its body now (a success that is not JSON
is still the fault it was); a `408` and a `429` keep the entry and stop, as a `5xx` does; and a `429`'s
`retryAfter` holds the next replay back until then (`jstack-app/stores/sync.ts`).
*Red first:* `tests/unit/outbox.test.ts` › "WPF-2: a 429 keeps the entry and stops, and says how long the server
asked for" received both captures on the conflicts list (`"serverReason": "slow down"`), and "WPF-2: a 408 keeps
the entry for the next attempt rather than listing it" the one it held; `tests/unit/transport.test.ts` › "WPF-2: an
HTML error page keeps its status, and a replay behind it keeps the capture queued" printed `Rejected to value:
[SyntaxError: Unexpected token '<', "<html><bod"... is not valid JSON]`; `tests/unit/stores/sync.test.ts` › "after
a replay told to wait, syncNow does not replay again until the wait is over" printed `Expected number of calls: 1 /
Received number of calls: 2`.
*Merged with WP-D:* the error-page case's config mock carries D-4 and D-5's three values, as WP-D gave the file's
other mocks, and `jstack-app/data/transport/http.ts` reads the body through `bodyOf` after D-4's abort and D-5's
credentials. The assertions are unchanged.
*Commit:* `fix(v2.3): wpf-2 — a replay keeps the queue on a 408, a 429 and a non-JSON error page`.

**WPF-3 · a locked app refused the passkey ceremony that opens it.** Finding 3 of `CODE_REVIEW_v23.md`:
`jstack-app/lib/lockGate.ts` let through, while locked, a hand-kept list (`/auth/nonce`, `/auth/register-device`,
`/auth/refresh`, `/recover`, `/lock`) without `POST /auth/webauthn/{step}`, the ceremony `CONTRACT.md` §4.1 says is
server-verified on every open, so the request that unlocks the app would have been refused before it left; and
`jstack-app/data/mock/server.ts` kept a list of its own, which had no `/lock`. One flag on the route row,
`whileLocked` in `jstack-app/data/routes.ts`, drives both halves now, and the nonce, registration, refresh, the
ceremony, recovery and the emergency lock carry it. The pinned literal in `tests/unit/lockGate.test.ts` changes on
purpose: it read `["POST /auth/refresh", "POST /auth/register-device", "POST /lock", "POST /recover"]` and reads
`["POST /auth/refresh", "POST /auth/register-device", "POST /auth/webauthn/{step}", "POST /lock", "POST /recover"]`,
and the server-half case skips the ceremony and `/lock` as it skips recovery.
*Red first:* `tests/unit/lockGate.test.ts` › "the client gate lets the passkey ceremony through while locked" threw
`LockedError: refused: the session is locked (/auth/webauthn/assertion)`, and "the server answers the passkey
ceremony and a second emergency lock while locked, rather than 401" printed `Expected: 200 / Received: 401`.
*Commit:* `fix(v2.3): wpf-3 — a locked app lets through the passkey ceremony that opens it`.

**WPF-4 · the emergency lock did nothing without a network, and said nothing; its wipe kept the refresh token.**
Finding 5 of `CODE_REVIEW_v23.md`. `jstack-app/stores/session.ts`'s `lock` waited on `POST /lock` before it locked
or wiped anything, and nothing caught the failure (`jstack-app/components/agents/EmergencyLock.tsx`), so on a weak
connection "Lock everything now" stopped the microphone and nothing else, silently; and when the lock did go
through, `wipeAllLocalData` deleted the cipher key but not `jstack.auth.refresh`, though
`jstack-app/lib/emergencyWipe.ts` promised the refresh token goes. Built as the planner set it, Josh's A-0 row 5
kept: a REFUSAL (the server answered no) locks and wipes nothing, as before, and the dialog now says the server's
reason; an UNREACHABLE server locks this device at once — the microphone off, the emergency screen up, the access
token dropped — wipes nothing, remembers that the server has not been told, and tries again with the press's own
nonce and assertion, held in memory only, when the connection returns or the app regains focus; after a reload the
lock screen reads "Locked on this device · the server has not confirmed" with "Tell the server now", which asks for
a fresh passkey. The wipe runs only when the server confirms, and it clears the tokens too (`clearTokens()`). The
round trip is `jstack-app/lib/emergencyLock.ts`, because `stores/session.ts` is at its size cap. Whether an
unreachable server should ever wipe stays Josh's question.
*Red first:* `tests/unit/hardening.test.ts` › "WPF-4: a server that cannot be reached still locks this device at
once, and wipes nothing" and "WPF-4: the retry on reconnect tells the server with the press's own assertion, once,
and only then wipes" each threw `TypeError: Failed to fetch` out of `lock()`; "WPF-4: the wipe after a confirmed
lock takes the refresh token and the access token too (finding 5)" left `jstack.auth.refresh` in the keychain
(`Expected: false / Received: true`). "a lock the server refuses wipes nothing — the device is not emptied on a
failed request" is unchanged, and green.
*Commit:* `fix(v2.3): wpf-4 — the emergency lock locks this device when the server cannot be reached, and its wipe takes the tokens`.

**WPF-5 · `openapi.yaml` published the upload with no request body, and `offlineId` on one capture body in nine.**
Finding 8 of `CODE_REVIEW_v23.md`: `jstack-app/tools/read-routes.mjs` read only quoted fields and never asked for
`multipart`, so `multipart: true` on `postFile` never reached `jstack-app/tools/gen-openapi.mjs`, whose multipart
branch could not run, and `POST /files` was published with no request body — which
`jstack-app/tools/validate-openapi.mjs` would have refused had it been emitted; and of the nine JSON bodies the
`offline: true` routes take, only `BrainDumpBody` declared the `offlineId` the outbox puts on every one of them. The
reader reads the flag, the validator accepts a multipart body, and the nine body types declare `offlineId?: string`
(`jstack-app/data/types.ts`); `openapi.yaml` and `data/requestSchemas.json` are regenerated from them.
*Red first:* `tests/unit/openapi.test.ts` › "the upload publishes its multipart body, and every offline route's JSON
body declares offlineId" received `[]` for the content types of `POST /files`'s request body, where
`["multipart/form-data"]` was expected.
*Commit:* `fix(v2.3): wpf-5 — the OpenAPI publishes the upload's body and offlineId on every offline body`.

**WPF-6 · a failed load became an empty list, and the slicer editor saved whole sets from it.** Finding 9 of
`CODE_REVIEW_v23.md`: `jstack-app/stores/taskFilters.ts` loaded slicers with `.catch(() => [])`, and
`jstack-app/stores/sections.ts` loaded the configured sections the same way, so a 5xx, a 401 or a dropped connection
read as "no slicers" and "no configured sections" over lists that were right; and
`jstack-app/components/tasks/SlicerEditDialog.tsx` composed its whole-set `PUT` from the empty list, which a server
without the mock's fixed-slicer rule would take as deleting every custom slicer. Only a `404` (a backend without the
route) means an empty list now; any other failure keeps the list on screen; and the slicer editor offers nothing to
save until a list has loaded (`slicersLoaded`, the gate the rules editor has, A4R5-03), asking for a load when it
opens over one that failed. Merged with WP-A (`v23-build` at `9e11fb50`), at the planner's word, a failed load fails the way every WP-A load
does, through `jstack-app/lib/loadError.ts`'s `recordLoad`: it resolves and keeps its reason, the sections store's in
a `loadError` of its own and the slicers' in the tasks store's `slicersLoadError`, beside the list's `loadError` rather
than in it, because `recordLoad` clears the slot a load gets through on, and a slicer load landing after a failed list
load would have wiped the list's failure and shown an empty list. No surface reads either yet; the slicer editor
still waits for a list that loaded.
*Red first:* `tests/unit/writePaths.test.ts` › "a slicer load that fails keeps the chips it had, and does not count
as loaded" received `[]` for the five slicers it had; "only a 404 — a backend without the slicer routes — means no
slicers" found no `slicersLoaded` on the store; "a sections load that fails keeps the configured sections" received
`[]`.
*Red first (merged with WP-A):* `tests/unit/writePaths.test.ts` › "a sections load that fails records why and resolves,
and the next that gets through clears it" received `failed: undefined, after: undefined` where it expected
`"Failed to fetch"` and then `null`; "a slicer load that fails records why in its own slot, and leaves the list's
loadError to the list" received `slicers: undefined` both times, beside the list's own failure.
*Commit:* `fix(v2.3): wpf-6 — a failed load is not an empty list, and the slicer editor waits for a loaded one`.

**WPF-14 · dictation promised to stay on the phone, and could be transcribed on a server.** Assigned by the planner:
the permission strings in `jstack-app/app.json` say "JSTACK transcribes your voice on this device. Nothing leaves
your phone." and "transcription happens on this device", but `jstack-app/lib/mic.ts` started the device's recogniser
without `requiresOnDeviceRecognition`, which defaults to false; and even with the flag, the module applies it on iOS
only where the recogniser supports on-device recognition (`ExpoSpeechRecognizer.swift`) and opens Android's on-device
recogniser only from API 33 (`ExpoSpeechService.kt`). The native start asks for on-device recognition now, and before
the permission prompt the app asks whether this phone transcribes on the device (`supportsOnDeviceRecognition`, and
API 33 on Android); a phone that cannot is told "Mic unavailable here · type instead · no on-device dictation" and
nothing is started, rather than having its audio transcribed elsewhere. On iOS the module answers for the phone's own
language rather than en-AU, which the device check notes (`DEVICE_RUNBOOK_v22.md` §3).
*Red first:* `tests/native/micNative.test.ts` › "the device's recogniser is asked to transcribe on the device"
received start options without `requiresOnDeviceRecognition`; "a phone that cannot transcribe on the device is told
to type, and nothing is started" printed `Expected: 0 / Received: 1` for the recognitions started.
*Commit:* `fix(v2.3): wpf-14 — dictation transcribes on the phone, or tells the person to type`.

**WPF-7 · an answer's Undo was registered after two reloads, and a revert that failed was swallowed.** Finding 10
of `CODE_REVIEW_v23.md`: `jstack-app/stores/today.ts`'s `answer` awaited the verb, then `load()` and
`refetchFor(card)`, and only then registered the Undo, so a reload that failed after the verb landed took the way
back with it; and its revert's `catch { return; }` read every failure as a late 409, so a revert that failed on the
network cleared the toast, restored nothing and was never offered again (`session.undoLatest` re-offers only a
revert that throws, A4R7-12). `jstack-app/stores/agents.ts`'s `actIssue` had both shapes, and
`jstack-app/stores/brain.ts`'s `resolveProposal` the first. In all three the Undo is registered straight after the
verb now, before the reloads, and a revert returns quietly only on a `409`; any other failure rethrows and is offered
again.
*Red first:* `tests/unit/writePaths.test.ts` › "a decision whose reload fails after the verb still offers its Undo"
and "a memory proposal whose reload fails after it was accepted still offers its Undo" each printed `Expected
length: 1 / Received length: 0`; "a decision's Undo that fails on the network is offered again, not swallowed" and
"an issue's Undo that fails on the network is offered again" each printed `Received promise resolved instead of
rejected`.
*Merged with WP-A:* a load no longer throws (A-2's `recordLoad` keeps its reason in `loadError`), so the two reload
cases check that the reload's failure was recorded where they checked a rejection; what they prove, that a reload
that fails does not take the Undo away, is unchanged.
*Commit:* `fix(v2.3): wpf-7 — an Undo is registered when its verb lands, and a revert that fails is still owed`.

**WPF-7b · after the merge with WP-A, WPF-7's two reload cases no longer proved the Undo's order.** QA on `3259bd7d`:
since A-2 a failed Today or Brain load resolves, so the decision and memory-proposal cases stayed green with the pre-fix
order planted back. The order still matters wherever a reload still rejects, and a rule card's answer awaits one:
`refetchFor` in `jstack-app/stores/today.ts` loads `jstack-app/stores/rules.ts`, which has no `recordLoad`. The decision
case now answers a rule card proposed through `POST /settings/autonomy/propose`, with `getAutonomyRules` refused once:
its answer rejects, and its Undo is still offered. Brain has no rejecting reload left, so the memory proposal's case keeps
the order without proving it. Test and record only; no source changes.
*Red first:* with `answer`'s two reloads planted back before the Undo in `jstack-app/stores/today.ts`,
`tests/unit/writePaths.test.ts` › "a decision whose reload fails after the verb still offers its Undo" printed
`Expected length: 1 / Received length: 0`; restored, the file is green, 68 of 68.
*Commit:* `fix(v2.3): wpf-7b — the decision reload case proves the Undo's order again, through a rule card`.

**WPF-8 · a refused subtask delete left the subtask gone, and a refused mark-read rolled back a reload.** Finding 11
of `CODE_REVIEW_v23.md`: `jstack-app/stores/taskEdits.ts`'s `deleteSubtask` put a refusal back with
`apply: (values) => (values === removed ? drop() : undefined)`, but `optimisticWrite` hands its rollback a copy of
the record (`jstack-app/lib/optimistic.ts`), so the identity test never matched and nothing was restored, and
`jstack-app/components/tasks/SubtaskMenu.tsx` discarded the refusal; and `jstack-app/stores/replies.ts`'s
`markRead` rolled back by restoring the whole list as it stood before the PATCH, over any reload that landed while
the PATCH was out. A refused delete puts the subtask back where it was now, and the menu says the server's reason; a
refused mark-read sets that one reply back to unread.
*Red first:* `tests/unit/writePaths.test.ts` › "a subtask delete the server refuses puts the subtask back where it
was" came back without `"t1-2"`; "a mark-read the server refuses rolls back that reply only, not a reload that
landed meanwhile" printed `- "r2": true, + "r2": false`, the reload undone.
*Commit:* `fix(v2.3): wpf-8 — a refused subtask delete is put back, and a refused mark-read rolls back one reply`.

**WPF-9 · the conformance run wrote to any server it was pointed at, and called any revert "put back".** Finding 16
of `CODE_REVIEW_v23.md`: `jstack-app/tools/conformance.mjs` promised "nothing a person would see", while every run
posted a capture twice for the dedupe check, logged `done: true` on the server's first habit for today's UTC date,
changed and reverted Today's layout, posted an invalid body and, against a server that asked, registered a device —
and `HANDOVER.md` says to run it first and after every deploy. Its layout check printed "changed and put back"
without comparing the order the revert returned with the order it found. The writes, device registration included,
run only with `--writes` now; the header, `README.md` and `HANDOVER.md` say what they leave on the server; and the
layout check fails a revert that lands on another order. The four cases in `tests/unit/conformance.test.ts` that ran
a whole sweep, or waited on one server beside the sweeps, on Jest's 5000 ms default carry a timeout of their own, as
the file's beforeAll sweeps already did: under the full suite in the Brisbane zone two of them passed 5000 ms (the
first Brisbane runs of WPF-14 and WPF-8).
*Red first:* `tests/unit/conformance.test.ts` › "without --writes it makes no write at all — a person's own server is
left as it was found" received six writes (`POST /brain/dump` three times, `POST /habits/h1/log`,
`PUT /layout/today` and `POST /layout/today/revert`); the case for a revert that lands on a different order printed
`Expected length: 1 / Received length: 0` for its FAIL line.
*Commit:* `fix(v2.3): wpf-9 — the conformance runner writes only with --writes, and checks the order it put back`.
*Reworded:* the case ran red under a title that used a form of a verb SEC-15 bans; it reads "makes no write" now, and
two `jstack-app/lib/mic.ts` comments (WPF-14) and one `jstack-app/tests/native/micNative.test.ts` comment (WPB-11) are
worded the same way. *Commit:* `docs(v2.3): wpf-9, wpf-14 — a test title and three comments worded without SEC-15's verbs`.

**WPF-10 · the pre-commit hook left three regenerated files unstaged, skipped a commit that touched only a root file
the maps read, and named its work tree twice.** Finding 18 of `CODE_REVIEW_v23.md`: `pnpm codemap` also rewrites
`jstack-app/PARAMETERS.md`, `jstack-app/data/requestSchemas.json` and `jstack-app/evidence/todo-backend-grep.txt`,
and `.githooks/pre-commit` staged only the other six, so a commit could carry stale copies that passed locally and
failed the board — a new `TODO(BACKEND)` marker, REMAP's most ordinary change, is one; its early exit looked only at
`jstack-app/` and the V2 and V2.1 decision and buglog files, though `jstack-app/tools/gen-handover-html.mjs` reads
the root `HANDOVER.md`, `jstack-app/tools/gen-codemap.mjs` reads `DECISIONS.md` and `jstack-app/tools/gen-wiring.mjs`
reads `02_ACCEPTANCE_TESTS_v2.md` and `02_ACCEPTANCE_TESTS_v21.md`; and the WP-B merge left the `GIT_WORK_TREE`
export in twice (WPB-0's block beside row 0's). The hook stages all nine files now, regenerates for a commit that
touches any of those four root files, and keeps row 0's block. The red case names `HANDOVER.md`, the file the finding
named; the other three were found reading the generators for this fix.
*Red first:* `tests/unit/hooks.test.ts` › "every file `pnpm codemap` rewrites is staged by the hook" received
`["PARAMETERS.md", "data/requestSchemas.json", "evidence/todo-backend-grep.txt"]`; "a commit that touches only
HANDOVER.md is not skipped — the handover page is made from it" found no `HANDOVER` in the early exit; "names its
work tree once" printed `Expected length: 1 / Received length: 2`.
*Commit:* `fix(v2.3): wpf-10 — the pre-commit hook stages every file the maps regenerate`.

**WPF-11 · the free gaps were counted in UTC, and a taught share rule covered any host whose name sat inside its
own.** Finding 19 of `CODE_REVIEW_v23.md`: `jstack-app/data/mock/handlers/calendar.ts`'s `gapsFor` built its day
from `${anchor}T06:00:00.000Z` to `T20:00:00.000Z` while `rangeFor` beside it used the reader's own midnight, so
for a Brisbane reader the working day ran from 4pm to 6am and the Calendar card's free gaps named the wrong hours;
and `jstack-app/data/mock/ingest.ts`'s `ruleFor` counted a share as covered when a rule's words `.includes(host)`,
so the rule taught for afr.com covered fr.com (and one for dropbox.com would cover x.com), and a share covered by
accident filed without its triage card, the human check `CONTRACT.md` Q24 relies on for shared content. The day is
the reader's own 6am to 8pm now (`atTime`, as `rangeFor` builds it), and a rule covers a host only when its words
name that host whole. The first corrects what the Today calendar card shows, so its captures move.
*Red first:* `tests/unit/server.test.ts` › "an empty day is free from six in the morning to eight at night, local
time — not in UTC" received `2026-09-14T06:00:00.000Z` to `2026-09-14T20:00:00.000Z`, the UTC hours;
`tests/unit/share.test.ts` › "WPF-11: a taught rule covers its own host, not another host whose name sits inside it"
received `undefined` for fr.com's triage card.
*Commit:* `fix(v2.3): wpf-11 — the free gaps are the reader's own day, and a share rule matches its whole host`.

**WPF-12 · CODEMAP's first page stated the retired date rule.** Finding 12 of `CODE_REVIEW_v23.md`: §1 of
`jstack-app/CODEMAP.md` said "Dates are Brisbane, held as UTC fields — never read a local date field", and its §4
invariant row "One date basis: no app source reads a local date field", while `jstack-app/lib/time.ts` (ADR-47) reads
instants in the device's own zone through the local getters and is the one file allowed to. §1 now reads "An instant
travels with its offset and is read in the device's own zone, and no file but `lib/time.ts` touches a `Date` getter
(ADR-47)", and the row "One date basis (ADR-47): instants read in the device's zone, and no file but `lib/time.ts`
touches a `Date` getter". No test reads either sentence; the quoted words are the record.
*Commit:* `docs(v2.3): wpf-12 — CODEMAP states ADR-47's date rule`.

**WPF-13 · four comments promised a relock on a 401 that no code performs (the honest half of finding 4).**
`jstack-app/lib/autoLock.ts`, `jstack-app/stores/session.ts`, `jstack-app/lib/mic.ts` and `CONTRACT.md` Q12 said a
`401` locks the app. What locks is the inactivity timer, the emergency hold, a server's sign-out (SH-09) and a refresh
the server answers as reuse (ID-04, `jstack-app/lib/authTokens.ts`); any other `401` fails its call. They say so now.
The first reads "Any other `401` does not lock yet: that relock is REMAP's, with the token refresh"; the second "a
server's sign-out or refresh reuse — is an EXIT PATH for the microphone"; the third "auto, emergency, a server sign-out
or refresh reuse"; and Q12 "The app is meant to relock on `401`; today only a refresh the server answers as reuse locks
(ID-04), any other `401` fails its call". The relock itself, the ignored token lifetime and a single-flight refresh are
WP-E's KNOWN_GAPS row.
*Commit:* `docs(v2.3): wpf-13 — the comments promising a relock on 401 say what the app does today`.

## WPE — `v23/wpe`, worktree `v23-wpb`

**WPE-1 · the release records were four drafts, and v2.3 had no completion statement.** `CHANGES_v23.md` had four
top-level headers from the packages' own drafts, WP-C's acceptance line twice (once under Writes), lines under working ids
(`A-1`, `C-1`, `D-1`) where this log says `WPA-1`, `WPC-1`, `WPD-1`, and no line for `A-01`, `B-01`, `WPB-0`,
`WPD-B01` or `WPG-1b`; this log held `WPD-B01` inside WP-C's section and WP-C's QA follow-up under a heading that
still said "(this commit)"; `DONE_v23.md` did not exist; and `QA_REPORT_v22.md` said nothing of v2.3. Now
`CHANGES_v23.md` has one header and one line per row, grouped as the packages grouped them and worded without the four
verbs PROTOCOL §5 bans; the two blocks sit under their own packages, their words unchanged; `DONE_v23.md` follows
`DONE_v22.md`'s shape at a third of its length, its board left for the tag; and `QA_REPORT_v22.md` §0 carries a dated
v2.3 note with the nine rows moved to PASS. No Jest count line moves.
*Quoted before:* `CHANGES_v23.md` "# CHANGES_v23.md — JSTACK V2.3 (draft)", "# CHANGES_v23.md — JSTACK V2.3 (draft, per
work package)", "# CHANGES_v23.md — JSTACK V2.3" and "# CHANGES_v23.md — one line per shipped item"; this log "## C-3 and
C-7 — QA fail on 4f5406f2, fixed (this commit)".
*Commit:* `docs(v2.3): wpe-1 — the release records: one CHANGES_v23.md, DONE_v23.md, the log in its packages, QA_REPORT_v22.md §0`.

**WPE-2 · the phone check and the handover page still carried v2.2 in their names.** They are the current copies,
not history, and REMAP reads them at go-live. `DEVICE_RUNBOOK.md` and `REMAP_HANDOVER.html` now (`git mv`, so their
history follows), and every live reference moves with them: `jstack-app/tools/gen-handover-html.mjs` writes the new
name, and the page's title, heading and footer say V2.3; `.githooks/pre-commit` stages it by that name;
`jstack-app/tests/unit/consolidation.test.ts` (the consolidated set, RM-08's list, the runbook's checks) and
`jstack-app/tests/unit/handover.test.ts` (RM-06's page) read the new names; a comment in
`jstack-app/tests/native/micNative.test.ts` follows; and `HANDOVER.md`, `HANDOVER_OUTLINE.md`, `README.md`,
`KNOWN_GAPS.md`, `QA_REPORT_v22.md`, `DONE_v23.md` and the runbook's own title name the new files. The versioned
records that name the old files keep the names they were written with. `NATIVE_RUNBOOK.md` names the old runbook twice
and is WP-D's while D-11..D-17 land, so it is left for that package.
*Quoted before:* `jstack-app/tests/unit/consolidation.test.ts` "const runbook = read("DEVICE_RUNBOOK_v22.md");";
`jstack-app/tools/gen-handover-html.mjs` "const OUT = join(repo, "REMAP_HANDOVER_v22.html");".
*Commit:* `docs(v2.3): wpe-2 — DEVICE_RUNBOOK.md and REMAP_HANDOVER.html lose their version suffix`.

**WPE-3 · the consolidated set still described v2.2.** `KNOWN_GAPS.md` listed fourteen carried defects v2.3 had fixed, a row
saying native dictation was not wired, a second copy of the swap-lane row, and seven acceptance IDs "named by no test" that
are PASS now; `HANDOVER.md` §1.8 said "native dictation is still to wire", and §2 kept a timeout sentence beside the
cursor rule; the outline stopped at tag `v2.2` and ADR-01..65 and said REMAP receives no EAS project; `DECISIONS.md`
ended at ADR-67. Now the fourteen rows are gone from `KNOWN_GAPS.md` and marked `CLOSED at v2.3 (<commit>)` with their
`BUGLOG_v23.md` ids in `CARRIED_DEFECTS_v22.md`; WP-A's three found-and-left rows are in; `HANDOVER.md` gives §1.3's
credentials and timeouts as WP-D built them, §1.8 in five lines (Josh's store track, `jstack-app/eas.json`, the demo
channel, dictation on the device) and the three audits at §5; the outline names the v2.3 records and `V23_REQUIREMENTS.md`
(copied unchanged); `REMAP_READINESS.md` gains the connect-check row; `DECISIONS.md` gains ADR-68 and ADR-69; and
`jstack-app/tests/unit/consolidation.test.ts`'s RM-09 accepts `CLOSED at v2.3 (<commit>)` beside `CLOSED at A-6` and
counts ADR-01..69. The one `DEVICE_RUNBOOK_v22.md` reference WPE-2 missed, a comment in
`jstack-app/tests/unit/pwa.test.ts`, is renamed here. The packaged mock followed at the merge of v23-build `f4a303aa`: it is
`jstack-mock-v15.html` now (`git mv`, so its history follows), `jstack-app/tools/build-mock.mjs` writes that name, the
current documents and `jstack-app/tests/unit/pwa.test.ts` name it, and it was rebuilt from the merged source (WPE-3c).
Not done: `AUDIT_v23.md` joins the outline and the readiness list when it exists.
*Red first:* against the new content, before the guard changed, `jstack-app/tests/unit/consolidation.test.ts` › "every id
carried in CARRIED_DEFECTS_v22.md from §4 on has a line" received the fourteen closed ids, `"MH-A"` to `"A4R11-08"`, and
"one row per decision, 01 to 67, in order" received `68, 69` past the 67. The same run's RM-01 in
`jstack-app/tests/unit/handover.test.ts` caught this item's own `(§1.8)` in §1.6, read as a `CONTRACT.md` section
(received `"1.8"`); the cross-reference is gone.
*Commit:* `docs(v2.3): wpe-3 — the consolidated set says v2.3`.

**WPE-3b · `KNOWN_GAPS.md` said the mock did more than it does, and the code review's open findings were in no file REMAP
receives.** The review (the planner's `CODE_REVIEW_v23.md`) left seven findings for REMAP. They are rows now, in the file's
own terms, under `KNOWN_GAPS.md` §1 "From the v2.3 code review and QA": the `401` that neither relocks nor refreshes, and the
refresh trap (Review 4); server events from the mock alone, with the mock in a production bundle (Review 7); the patchable
`TaskPatch` (Review 13); no single error convention (Review 14); one slot serving two views (Review 15); the conformance
verdict's limits (Review 17); and the phone's idle lock (Review 20) — with QA's native dialog semantics (C-3b) and iOS's
1.5 s recognition finish (WPB-11). Finding 6 has no row: `WPA-12` fixed it. Four rows overstated the mock and now say what
it does: §2's second user, §3's silo gate, §3's history rule and §3's server events. §4 asks Josh whether a device should
wipe itself when the server cannot confirm an emergency lock — the row gives what the app does, which is to lock at once and
wipe only on confirmation (`WPF-4`), where the planner's note gave the default as a wipe — and whether rules keep history.
*Quoted before:* `KNOWN_GAPS.md` "every record already carries `silo` and the mock filters by it", "The mock filters at one
list-read chokepoint", "The mock does all of it" and "The client subscribes and refetches".
*Commit:* `docs(v2.3): wpe-3b — KNOWN_GAPS.md carries the code review's rows, and says what the mock does`.

**WPE-3c · QA on `ea5ee141`: the runbook still pointed Josh at the old device check, and Review 4's row gave the gap's
cause without its cost.** `NATIVE_RUNBOOK.md` named `DEVICE_RUNBOOK_v22.md` for §1's check and for §6's offline replay, a
file WPE-2 renamed; both lines name `DEVICE_RUNBOOK.md` now. `KNOWN_GAPS.md`'s Review 4 row now says in "Why open" what
finding 4 costs: fifteen minutes after sign-in every call answers `401`, the app stays unlocked on stale data, writes fail
through each store's own convention, replay holds the queue with no unlock prompt, and the naive refresh trips reuse
detection into an emergency state only the recovery key clears. From the planner's merge notes, in the same commit:
`HANDOVER.md` §4 and §5 name `pnpm connect:check` beside `node tools/conformance.mjs`; `CHANGES_v23.md` has a line for
every row that landed since `b35d2a9f` (WPA-1b to WPA-4b, WPA-13, WPD-11 to WPD-17, WPD-12b, WPD-13b, WPC-5b, GS-02,
WPC-3c, WPG-1c, WPG-1d) and no longer says Life's learning rows are three; `DONE_v23.md` names the merged tree for the
acceptance tally, which reads the same there; and the packaged mock is `jstack-mock-v15.html` (WPE-3's row).
*Quoted before:* `NATIVE_RUNBOOK.md` "`DEVICE_RUNBOOK_v22.md` §1 is the same check" and "`DEVICE_RUNBOOK_v22.md` §6, on the
device"; `KNOWN_GAPS.md` "Needs the real token flow; LK-05 specifies the relock".
*Commit:* `merge(v2.3): origin/v23-build f4a303aa into v23/wpe, by intent, with WPE-3c`.

## v2.3.1

Josh answered eight open questions on 15 Sep (P-3, P-7, P-9, P-10, Q1, Q2, Q3, Q4; P-1 and P-2's crypto
half are WP-I's and WP-J's). WP-K writes them where REMAP reads them — documents only, no app code.

**WPK-1 · `DECISIONS.md` had no record of Josh's 15 Sep answers, and ADR-66 still read "stands" though P-3
changes what it decided.** Five new rows, ADR-70..74, quote Josh verbatim: 70 amends ADR-66 (the last-seen
cache keeps sensitive records too — the code is WP-I's); 71 says Teach feeds V3's memory-curation agent
(P-7/Q2); 72 moves Money and Health to V5 (P-9); 73 records the lock's local-vs-full behaviour and what a
wipe touches (P-10); 74 confirms rules and memory history is append-only (Q4). ADR-66's status now reads
"amended by ADR-70". `jstack-app/tests/unit/consolidation.test.ts`'s RM-09 counts ADR-01..74, and
`CODEMAP.md` §7 is regenerated (`pnpm codemap`) to index the five new rows.
*Quoted before:* `DECISIONS.md` "# DECISIONS.md — every JSTACK architecture decision, ADR-01..69, in one
list"; ADR-66's status cell, "stands"; `jstack-app/tests/unit/consolidation.test.ts` "one row per decision,
01 to 69, in order" and `Array.from({ length: 69 }, ...)`.
*Commit:* `docs(v2.3.1): wpk-1 — DECISIONS.md ADR-70..74, Josh's 15 Sep answers`.

**WPK-2 · `V23_REQUIREMENTS.md` still staged Money, Health and the calendar write-back as "later"/open,
and named memory curation's stage as REMAP's to pick.** Money and Health's status cells now read **V5**
(P-9); the calendar row names the four routes with no caller and quotes Q1's answer — one Google calendar's
write-back is V2 stage 2, a second calendar and the combined view are V3; a new 15 Sep row in §2 answers
memory curation's stage as **V3** (P-7), stacked above the 14 Sep row it resolves rather than editing that
historical quote. §6's "Josh's" and "REMAP's" open-question lists drop what fifteen September answered and
move native dictation to REMAP's list, to confirm in planning (P-2).
*Quoted before:* `V23_REQUIREMENTS.md` "**later** (Josh, 14 Sep)" (Money and Health, two rows); "**open,
Josh to confirm** whether stage 3 or later" (the calendar row); "**Josh's**: what Teach stores on a
non-triage card; calendar write-back and gap proposals (stage 3 or later); the Talk-after-lock copy
...; native dictation (planner's default: wired, device check on his build); accept the security
assumptions ..."; "**REMAP's**: which stage memory curation lands in; the voice provider ...".
*Commit:* `docs(v2.3.1): wpk-2 — V23_REQUIREMENTS.md stages money, health and the calendar per Josh's 15
Sep answers`.

**WPK-3 · `KNOWN_GAPS.md` had no Deferred-to-V5 list, no row for the calendar's V2/V3 split, no REMAP task
for native dictation or the unreachable-lock threat model, and its rules-history row still asked which of
two answers was right.** A "Deferred to V5" list under §2 (Money, Health, P-9); §2 gains a memory-curation
row (V3, P-7/Q2) and a second-calendar-and-combined-view row (V3, Q1); §3 gains the one-Google-calendar
stage-2 row naming the four orphan routes (Q1), the native-dictation row (P-2) and the unreachable-lock
threat-model row naming the four scenarios REMAP is to check (Q3); the rules-history row now quotes Q4's
answer instead of asking which is right.
*Quoted before:* `KNOWN_GAPS.md` "a rules write replaces the set, so a removed rule keeps no history where
§1.5 says nothing is overwritten (`jstack-app/tests/unit/rules.test.ts` pins the removal; §4 asks which is
right)".
*Commit:* `docs(v2.3.1): wpk-3 — KNOWN_GAPS.md carries the V5 deferral, the calendar split and two new
REMAP tasks`.

**WPK-4 · `SECURITY.md`'s emergency-lock section did not separate what the device clears from what the
server does, and named no threat-model task.** Restructured under Josh's own 15 Sep words (P-10) into what
the device clears (tokens, keys, the outbox queue, caches, preferences) and what the server does (revokes
sessions, pauses agents, keeps every record); names the "Unreachable-lock threat model" row REMAP owns
(Q3, `KNOWN_GAPS.md` §3).
*Quoted before:* `SECURITY.md` "`POST /lock` revokes every session and token server-side; once the server
has confirmed it, the app wipes THIS device — the encrypted store (the refresh token on native, every
persisted record) ...".
*Commit:* `docs(v2.3.1): wpk-4 — SECURITY.md's emergency lock section: the device's half and the server's
half, in Josh's words`.

**WPK-5 · `CONTRACT.md`'s `POST /lock`/`POST /recover` rows said nothing about what a wipe does and does
not touch, and the rules route said nothing about append-only history or who reads what Teach finds.**
`POST /lock` now names what the device wipes and that the server's memory and information store are never
touched; `POST /recover` says a record is reloaded, never rebuilt; §4.22's rules row says a removal is a
new entry (Q4) and names V3's memory-curation agent as Teach's consumer (P-7/Q2). Checked, not changed:
`data/routes.ts`'s route descriptions name no "delete" for rules or memory — only `deleteEvent`,
`deleteSubtask`, `deleteSection` and `deletePushSubscription` use the word, none of them rules or memory —
so nothing contradicts Q4 and nothing is flagged to the planner.
*Quoted before:* `CONTRACT.md` "`{ locked: true, at }`; fresh assertion required; the app then wipes this
device's cache and queue"; "`{ restored: true, agentsResuming: [...] }`" (row ends there); "PUT refuses a
set with two rules sharing an id (`422`, naming which). `teach` on a card appends here with an id derived
from the card" (row ends there).
*Commit:* `docs(v2.3.1): wpk-5 — CONTRACT.md's lock, recover and rules rows carry Josh's 15 Sep answers`.

**WPM-1 · The repository root carried V1's own eleven documents, twenty-one numbered build prompts,
`prompts/`, `reference/` and `jstack-mock-v11.html` at the same level as the current, consolidated set —
Josh, 15 Sep: "delete nothing from v2 onwards that REMAP may reasonably want; if in doubt keep it, in a
history/archive folder."** 105 files moved to `history/v1/` by `git mv`, history intact, nothing deleted.
The brief's own list named `backend-starter/` and an empty `App/` for this folder; neither exists in the
tree — `backend-starter/` was deleted at ADR-06 — so nothing was moved for those two. Guards touched:
`jstack-app/tests/unit/consolidation.test.ts`'s `VERSIONED` array (`HANDOVER_v1.1.md`) and its cold-start
prompt read (`19_CC_V22_AUDIT_PROMPT.md`); `jstack-app/CODEMAP.md` §4 and §10's hand-written mentions of
`jstack-mock-v11.html`, `BUILD_PLAN_v2.md`'s sibling `11_CC_V2_EXEC_PROMPT.md`.
*Quoted before:* the root held `00_CC_BUILD_PROMPT.md` through `20_CC_V22_RESUME_PROMPT.md`, `AUDIT.md`,
`BUGLOG.md`, `BUILD_PLAN.md`, `BUILD_PLAN_v1.1.md`, `BUILD_PLAN_v1.2.md`, `CHANGES_v1.2.md`, `CONTROLS.md`,
`DEVICE_RUNBOOK_v1.2.md`, `DONE.md`, `HANDOVER_v1.1.md`, `JSTACK_ADBP_v0.5.docx`, `QA_REPORT.md`,
`jstack-mock-v11.html`, `prompts/` and `reference/` at the root, each now at `history/v1/<same name>`.
*Commit:* `docs(v2.3.1): wpm-1 — history/v1/: the numbered build prompts, V1's own docs, prompts/, reference/`.

**WPM-2 · V2's own eighteen documents, the brief pages and `jstack-mock-v12.html` sat at the root the same
way.** 23 files moved to `history/v2/`.
*Quoted before:* the root held `AUDIT_v2.md`, `BRAIN_PROPOSAL.md`, `BUGLOG_v2.md`, `BUILD_PLAN_v2.md`,
`CARRIED_DEFECTS_v2.md`, `CHANGES_v2.md`, `CONTRACT_v2.md`, `CONTROLS_v2.md`, `DATA_LABELS.md`,
`EXECUTION_HANDOFF.md`, `EXECUTION_HANDOFF_v2.md`, `HANDOVER_v2.md`, `JOSH_QA.md`, `"JSTACK overview
v2.html"`, `"JSTACK why build an app - brief v2.html"`, `MIGRATION_PLAN.md`, `NEEDS_JOSH.md`,
`PLAN_READY.md`, `PLAN_STATE.md`, `QA_REPORT_v2.md`, `V2_DECISIONS.md`, `V2_HANDOVER_OUTLINE.md` and
`jstack-mock-v12.html` at the root, each now at `history/v2/<same name>`.
*Commit:* `docs(v2.3.1): wpm-2 — history/v2/: V2's handover, contract, decisions, carried defects, controls, bug log, build plan, execution handoff, plan state and ready files, the brief and overview pages, jstack-mock-v12.html`.

**WPM-3 · V2.1's own sixteen documents and `jstack-mock-v13.html` sat at the root the same way.** 16 files
moved to `history/v21/`.
*Quoted before:* the root held `BUGLOG_v21.md`, `BUILD_PLAN_v21.md`, `CARRIED_DEFECTS_v21.md`,
`CHANGES_v21.md`, `CONTRACT_v21.md`, `CONTROLS_v21.md`, `DEVICE_RUNBOOK_v21.md`, `DONE_v21.md`,
`EXECUTION_HANDOFF_v21.md`, `HANDOVER_v21.md`, `PLAN_READY_v21.md`, `PLAN_STATE_v21.md`,
`QA_REPORT_v21.md`, `REMAP_PREVIEW_v21.md`, `V21_DECISIONS.md` and `jstack-mock-v13.html` at the root,
each now at `history/v21/<same name>`.
*Commit:* `docs(v2.3.1): wpm-3 — history/v21/: V2.1's own versions of the same file families, its device runbook, REMAP preview, jstack-mock-v13.html`.

**WPM-4 · V2.2's own fourteen documents and `demo/` — the device-pass frames, 2,088 files including its
own `v2/`, `v21/`, `v22/` and `responsive/` subfolders — sat at the root the same way.** 2,088 files moved
to `history/v22/`, the largest of the five moves. `demo/` moved whole rather than split by its internal
subfolders, matching the brief's own listing of `demo/` as one item under `history/v22/`.
*Quoted before:* the root held `BUGLOG_v22.md`, `BUILD_PLAN_v22.md`, `CHANGES_v22.md`, `CONTRACT_v22.md`,
`CONTROLS_v22.md`, `DONE_v22.md`, `EXECUTION_HANDOFF_v22.md`, `HANDOVER_v22.md`, `JOSH_QA_v22.md`,
`PLAN_READY_v22.md`, `PLAN_STATE_v22.md`, `SIMPLIFICATION_v22.md`, `TREE_ANCHORS_v22.md`, `V22_DECISIONS.md`
and `demo/` at the root, each now at `history/v22/<same name>`.
*Commit:* `docs(v2.3.1): wpm-4 — history/v22/: V2.2's own versions of the same file families, SIMPLIFICATION_v22.md, TREE_ANCHORS_v22.md, demo/ (the device-pass frames)`.

**WPM-5 · `EXPO_GO_LINK.md` and `EXPO_GO_QR.png` sat at the root as the EAS Update / Expo Go demo channel's
evidence — Josh, 15 Sep: "Expo is only a temp solution … Expo stuff not needed."** 2 files moved to
`history/expo-go/`; `eas.json` and `NATIVE_RUNBOOK.md` stay at the root (his own Apple-account build).
`DEPLOY.md`'s Expo Update/Expo Go paragraph is one paragraph now, pointing at the new location, and
`HANDOVER.md`'s Connect-and-run bullet says the channel is retired.
*Quoted before:* `DEPLOY.md` "**Published, at A-6.** EAS Update is configured and an iOS update is live
... The link, the ids and the two manifest proofs are in `EXPO_GO_LINK.md`, with `EXPO_GO_QR.png` beside
it. Republishing is one command ... **The one step the publish does not do for you.** ..."; `HANDOVER.md`
"**EAS Update and Expo Go are a demo channel only** (`EXPO_GO_LINK.md`, `DEPLOY.md`)."
*Commit:* `docs(v2.3.1): wpm-5 — history/expo-go/: the EAS Update / Expo Go demo channel, retired 15 Sep`.

**WPM-6 · Every kept file's link to a moved one, and every guard that reads a moved file, still pointed at
the root.** 28 files updated: the doc set (`KNOWN_GAPS.md`, `HANDOVER_OUTLINE.md`, `HANDOVER.md`,
`DEVICE_RUNBOOK.md`, `CONTRACT.md`, `CONTRACT_MAP.md`, `CONTRIBUTING.md`, `DECISIONS.md`, `SECURITY.md`,
`README.md`, `DEPLOY.md`, `history/README.md` new), the guard tests (`consolidation.test.ts`,
`buglogRows.test.ts`, `qa-citations.test.ts`, `qaReport22.test.ts`, `workflows.test.ts`,
`handover.test.ts` — including its own QA_REPORT_v21.md evidence-path resolver, taught to follow a bare
citation into `history/`, — `brainProposalApplied.test.ts`, `captureRig.test.ts`), the live tools
(`tools/capture-v2.mjs`'s `PASS_DIR`, `tools/gen-codemap.mjs`'s bug-row reader), and the repo's own
process files (`.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`). `.githooks/pre-commit`'s regen
trigger drops its four now-frozen entries (`V2_DECISIONS.md`, `V21_DECISIONS.md`, `BUGLOG_v2.md`,
`BUGLOG_v21.md`) rather than re-pointing them into `history/` — a deliberate behaviour change, not a path
fix: none of the four is ever edited again once moved, so nothing should still trigger a regen on their
account; the comment above the pattern says so now.
`jstack-app/CODEMAP.md` regenerated; its hand-written §4 mentions of the moved files fixed by hand and
verified green with `node tools/codemap-check.mjs` (the same check `.githooks/pre-commit` runs). Folded in
from QA on WP-K, no separate commit: `KNOWN_GAPS.md`'s native-dictation and unreachable-lock rows move
Josh's quote out of the "Contract" column into the "app's side" cell, matching the calendar row's shape;
`CONTRACT.md`'s Teach line says the rule is a free line with no classification, which V3's memory-curation
agent classifies, not a field the app sends.
*Quoted before:* `KNOWN_GAPS.md` (the native-dictation and unreachable-lock rows put Josh's quote in the
"Contract" cell); `CONTRACT.md` "`teach` on a card appends here with an id derived from the card, carrying
the one line Josh typed (`TeachSheet.tsx`) as the conflict, gap or improvement it found"; every guard and
doc listed above, each at the bare root-relative name it cited before.
*Commit:* `docs(v2.3.1): wpm-6 — the guards and the pointers: every kept file's link to a moved one follows it`.

**WPM-7 · A targeted run of the guard tests wpm-6 named came back green; a full `pnpm test` did not — nine more test files read a moved file directly, none of them named in the brief.** `tests/unit/controls.test.ts`, `controls-v21.test.ts` and `controls-v22.test.ts` read `CONTROLS_v2.md`/`v21.md`/`v22.md` at module scope (`controls-v22.test.ts` also reads `BUILD_PLAN_v22.md`, a second bare name past the one wpm-6 already found in it); `tests/unit/contract.test.ts` has two more `CONTRACT_v2.md`/`v21.md`/`v22.md` reads besides the one wpm-6 fixed; `tests/unit/bnCaptureCarried.test.ts` reads `QA_REPORT_v2.md`/`v21.md`; `tests/unit/bundle-budget.test.ts` scans `HANDOVER_v22.md`, `CHANGES_v22.md` and `EXECUTION_HANDOFF_v22.md` for stale budget figures; `tests/unit/openapi.test.ts` reads the same three contracts' §6/§7. `tests/unit/handover.test.ts`'s `readV2Doc` helper silently read `HANDOVER_v2.md`/`QA_REPORT_v2.md` as "not written yet" once they moved — both carry a live count line the QA-02 guard keeps in step with the board (D-12b), so the silent read was itself a real regression, not cosmetic; it now follows both into `history/v2/` first. `tools/gen-expo-qr.mjs` — a manual, not automatically-run tool — follows `EXPO_GO_LINK.md`/`EXPO_GO_QR.png` too, so a future republish (there will not be one, but the tool should not lie about where it writes) does not recreate a stray pair at the root.
*Quoted before:* each file at the bare root-relative name it read before, as listed above.
*Commit:* `docs(v2.3.1): wpm-7 — the full board found five more bare references the targeted guards missed`.

**WPI-1 · The offline copies dropped every record marked sensitive; Josh's P-3 revision keeps them (15 Sep 2026: "all including sensitive").**
`lib/lastSeen.ts` removed any record marked `sensitivity: "sens"` or `"sensitive"` before the write (`markedRecord`,
`withoutSensitive`, and the gate that skipped a marked payload), so a plan made on a plane was missing its money and
health items. The cache now keeps the whole tab. The header gives the three reasons that is safe, and each is untouched
here: the copy is ciphertext at rest (`encryptedSet`); it goes with the emergency wipe, and the key that sealed it with
it (WPA-14); and nothing is written while the emergency state is set (A-13) — that gate and the wipe-count check are as
they were. The service worker's own rule (`public/sw.js` caches no body carrying `sens`) is unrelated, since it caches
the shell only. ADR-70, WP-K's amendment of ADR-66, records the decision (the merge of `v231-build` took WP-K's `DECISIONS.md` over this row's own edit of ADR-66's line), and WPA-3's CHANGES line and `lib/encryptedStore.ts`'s header say it; `SECURITY.md`,
`HANDOVER.md` and `DONE_v23.md` carried no line saying the cache never holds sensitive items; `jstack-app/CODEMAP.md` §4's row for `lastSeen.test.ts` did, and WPI-2's commit makes it true.

*Files:* `jstack-app/lib/lastSeen.ts`, `jstack-app/lib/encryptedStore.ts` (its header).

*Red first:* `lastSeen.test.ts` — "a record marked sensitive is cached like any other: its words are in the copy read back, and the bytes at rest are ciphertext" printed `"todayKeptSens": false` and `"brainKeptSensitive": false`. "still nothing while the emergency state is set — a record marked sensitive included" holds A-13's gate for a marked record: with the gate planted out it printed `"copyOnDevice": true`. The Brain case now expects every recent item back, marked ones included; before the fix its list went red without `"b1"`, the marked item.

*The audit's plant:* `AUDIT-BRIEF.md`'s P1, the `sens` strip, is gone with the strip. Its replacement is "`encryptedSet` writes the plaintext": planted, the A-3 case "a record marked sensitive is cached like any other…" printed `"ciphertext": false` and `"plaintextOnDisk": true`.

*Commit:* `fix(v2.3.1): wpi-1 — the offline copies keep sensitive items too` — its sha is in the report to the planner.

**WPI-2 · A phone whose runtime gives no `crypto.getRandomValues` refused offline captures, lost its Files answers, and said nothing (the audit's native-crypto question; Josh: "Important we protect against this failure mode").**
Nothing in the v2.3 tree provides `crypto.getRandomValues` on Hermes, and the native key mint and every native seal in
`lib/encryptedStore.ts` call it. On such a phone a capture made offline was refused where the queue should have held
it, a Files load threw its own answer away for the empty cache, every offline-copy and preference write failed quietly,
and the queue still reported itself persistent, so nothing on screen said so. A capture made online already went live.
The store now answers for itself: `secureStoreStatus()` says "unavailable", with the reason, the moment
`getRandomValues` is missing, and boot's probe (`probeSecureStore`, once, from `lib/syncInstall.ts`) seals a short
value and opens it again through the store's own cipher under a key minted for the probe and thrown away — it keeps
nothing, mints no key the wipe would have to find, and never throws. A phone that cannot seal gets the answer, with the
reason, in the session store's `secureStoreStatus`. While it is unavailable the native queue is held in memory, decided
at each call, and the outbox reads `persistent` at each call, so the dot says A-7's "captures are not being saved on
this device"; the offline copies, the file cache and the preferences try no write; and Settings › Sync reads "Secure
storage is unavailable on this device — captures are sent live and held in memory only; nothing is saved offline" in
place of A-7's line. Web is untouched, and no dependency is added. `NATIVE_RUNBOOK.md`'s first check on a development
build reads that line; `HANDOVER.md` §1.8 gains "Native crypto — what to do" for REMAP, and `KNOWN_GAPS.md`'s Review 20
row points at it. Not changed here: `lib/emergencyLock.ts` writes the flag that carries an unconfirmed emergency lock
across a reload through the same store, and on such a phone that write fails quietly (its `.catch`): the lock holds
while the app is open, but the next launch does not restore it.

*Files:* `jstack-app/lib/encryptedStore.ts` (the native cipher now takes its key, for the probe),
`jstack-app/lib/queueStore.ts`, `jstack-app/data/transport/outbox.ts`, `jstack-app/stores/session.ts`,
`jstack-app/lib/syncInstall.ts`, `jstack-app/lib/lastSeen.ts`, `jstack-app/lib/recentFiles.ts`,
`jstack-app/stores/device.ts`, `jstack-app/components/settings/Sync.tsx`.

*Its first full board (10:48, under the lock):* red, nothing committed. RM-01 found `encryptedStore.ts` named bare in `HANDOVER.md`'s new section (now its full path), and the new test's first case outran Jest's 5 s default ("Exceeded timeout of 5000 ms for a test"): each of its three cases loads the app afresh, and each now carries `FRESH_APP_CASE_MS` (60 s) with the reason beside it.

*Red first (native lane):* `tests/native/secureStore.test.ts`, over a fresh launch of the app's modules — "with no crypto.getRandomValues (Hermes gives no `crypto` at all): boot throws nothing and says unavailable, the queue is held in memory, no write is tried, a Files load shows what it fetched, a capture still goes live and an offline one is held" printed `"probe": "none"`, `"persistent": true`, `"sealsTried": 3`, `"filesShown": false` and `"held": false`; "with a crypto.getRandomValues that throws: boot's round trip says unavailable with the reason, and the queue is held in memory" printed `"probe": "none"` and `"persistent": true`; "with crypto.getRandomValues present: boot says ok, and the queue is the persistent native one" printed `"probe": "none"`. `tests/native/screens.test.tsx` — "Settings › Sync says secure storage is unavailable, once, in place of the memory line, and the dot says what A-7's does" printed `"memoryLine": 1` and `"secureLine": 0`.

*Plants, each alone against `secureStore.test.ts`:* the queue ignoring the store's answer — the missing case printed `"persistent": true`, `"held": false` and `"sealsTried": 1`, and the throwing case `"persistent": true`; the outbox reading `persistent` once, when it is built — the throwing case printed `"persistent": true`, while the missing case stayed green, since at build time the store already knew; boot running no probe — the missing case's probe printed `"status": "ok"`, and the throwing case's `"status": "ok"` with `"persistent": true`; the file cache's gate gone — the missing case printed `"filesShown": false` and `"sealsTried": 1`; the offline copies' gate gone — `"sealsTried": 1`. The present case stayed green under every plant. The preferences' gate has no case of its own: their write is a `void` call whose failure nothing awaits, so only the attempt would show.

*Commit:* `fix(v2.3.1): wpi-2 and wpi-3 — a phone with no secure store runs, keeps nothing offline and says so; the cases that load the app afresh carry a budget sized to that load` — one commit with WPI-3, whose budget is what lets this row's board pass (the planner's decision).
Its sha is in the report to the planner.

**WPI-3 · Three security cases that build a fresh app per case went red under load — a security case that flakes cannot guard (the planner and QA, 15 Sep).**
`tests/unit/stores/sync.test.ts`'s WPA-15 cases on the app's own outbox ("web: refused as a locked write, and nothing of
it — no queued row, no key row — is at rest" and its native twin) failed on most `-t` runs in the `v231-build` worktree
and passed on some, and the web case went red once in a loaded Brisbane board; QA saw WPA-17's "native: no refused list on
disk, and no key minted for one" red in three of four loaded full runs and green in five of five alone. The cause is none
of the suspects — no order dependence on a module singleton, the session store's state or the fake IndexedDB's
lifetime, and no race between the provider's outbox build and the emergency flag: each case loads the app's modules
afresh (`jest.resetModules()`, then the provider or the wipe, the session and sync stores and everything under them)
inside Jest's 5 s default, and that load is synchronous and CPU-bound, and each then waits on a timer, which is where
Jest's timeout can land. Beside QA's board, with ten other test processes on the machine, the WPA-15 web case took
8918 ms and its native twin 16798 ms, each red on `thrown: "Exceeded timeout of 5000 ms for a test."`, and WPA-17's web
case timed out in the same run (6463 ms); on a quiet machine — no other test process, this session holding the board lock — the three named cases took 527–937 ms (web), 544–1069 ms (native) and 544–949 ms (WPA-17's native case) over 10 of the ten runs alone, after the fix, which changes only the time a case is allowed. Four more cases in the file are built and timed the same way — A-5's
reload case (three loads) and WPA-17's other three that settle after a Dismiss — so the one fix covers seven: each carries
`FRESH_APP_CASE_MS`, 60 s, sized to the work (the slowest load seen beside a board was 16.8 s) and the same as A-1b's
`TIMER_CASE_MS` for the two reachability cases that load the app afresh too, with the reason beside it; WPI-2's new
`tests/native/secureStore.test.ts` carries the same budget on its three. A-7's memory-only sync store and WPA-17's wipe
case load the app afresh too but carry none: nothing in either waits on a timer, so Jest's timeout cannot interrupt them
however long the load takes — the first plant, on all nine, left exactly those two green. No assertion changed, and a load
that truly hangs still fails. Alone and in the suite: 10/10 alone and 10/10 of the whole file (the planner's ten), every run under this session's board lock with 0 other test processes on the machine; alone the three named cases took 527–937 ms (web), 544–1069 ms (native) and 544–949 ms (WPA-17's native case), and the slowest case of each run of the file took 774–1269 ms.

*Note (WP-J's loaded boards, 15 Sep):* the sync store's cases that timed out there at 5000 ms are exactly the seven that
carry the budget — A-5's reload case, WPA-17's four and WPA-15's two. Beside them Stage 6 A-3's native screens case ("the
mini Gantt and the Calendar list are sections of their own", `tests/native/screens.test.tsx`) and serveMock's D-1 and D-2
cases (`tests/unit/serveMock.test.ts`) timed out too: that is load alone, and they get no budget change.

*Files:* `jstack-app/tests/unit/stores/sync.test.ts`.

*Red first, under load, before the fix:* "web: refused as a locked write, and nothing of it — no queued row, no key row — is at rest" printed `thrown: "Exceeded timeout of 5000 ms for a test."` at 8918 ms, and "native: refused as a locked write — no queue on disk, and no key minted for it" the same at 16798 ms (a run of the file's cases under `-t` that also loaded the other unit files, beside another session's board); WPA-17's native case is QA's three reds in four loaded full runs. In WPI-2's first board under the lock (10:48) A-5's reload case and WPA-17's two web cases timed out the same way. A red that comes from the machine does not come back on a quiet revert, so the deterministic check is the plant: planted to 1 ms and run one case at a time, all seven budgeted cases in `sync.test.ts` went red on "Exceeded timeout of 1 ms" (the load took 1.6–9.6 s before the budget caught it) and so did all three in WPI-2's `secureStore.test.ts` (1.6–2.1 s), while the two that carry no budget stayed green — A-7's memory-only store (2.7 s) and WPA-17's wipe case (0.4 s). The first plant, on all nine in one run of the file, had left exactly those two green; a whole-file plant is no clean test, though — planted so, `secureStore.test.ts`'s second case passed at 27.9 s because the timed-out first case ran on into it — so each case is planted alone.

*Commit:* `fix(v2.3.1): wpi-2 and wpi-3 — a phone with no secure store runs, keeps nothing offline and says so; the cases that load the app afresh carry a budget sized to that load` — one commit with WPI-2, as the planner decided: this budget is what lets WPI-2's board pass, and a
commit made from a tree that was never green on its own is not honest. Its sha is in the report to the planner.

### WP-J — `v23/wpj`, worktree `v23-wpb`

Round v2.3.1, from tag `v2.3` (`290e2708`) toward `v231-build`. Josh, 15 Sep: "When talk / dictation is on — the app
and phone/ipad/app should ensure the device remains open and screen on. If I lock the device, voice locks too."

**WPJ-1 · While Talk or dictation was on, nothing kept the screen awake.** `jstack-app/lib/wakeLock.ts` held a browser
wake lock for car mode alone (VP-07), and on a phone nothing held anything, so the phone's own auto-lock could put the
screen to sleep in the middle of a sentence. The one owner, `jstack-app/lib/mic.ts`, now holds the screen awake from the
press of every session and gives it back in `stop()`, which every way a session ends goes through: Stop, a lock, Talk's
End and Mute, the silence auto-stop, a refused permission, a recogniser's error or its own end, and a second start.
`jstack-app/lib/wakeLock.ts` holds by tag, one per holder, so car mode's hold and the microphone's cannot give back each
other's: on a phone through `expo-keep-awake`, in a browser through `navigator.wakeLock` where it exists (one lock for
every tag, and a lock granted after its last holder let go goes straight back), and nothing where it does not.
`expo-keep-awake` is declared at `~15.0.8` in `jstack-app/package.json`: 15.0.8 was already installed as `expo`'s own
dependency (`node_modules/expo/package.json:92`), so `jstack-app/pnpm-lock.yaml` gains its importer entry only and
nothing new is on disk (`pnpm install --lockfile-only --frozen-lockfile --offline` agrees). No guard reads
`package.json`'s dependencies — `pnpm unused` reads exports — so none had to accept the declaration. The packaged mock, `jstack-mock-v15.html`, is rebuilt from this source (QA-06).
*Red first:* `jstack-app/tests/unit/micAwake.test.ts` › "a session takes one wake lock from its start, and words heard do
not take another" received `[]` where `[false]` was expected, and every end path in its table stopped at the same line;
`jstack-app/tests/native/micAwake.test.ts` › "a session activates it once, under the owner's tag" received `[]` where
`[["on", "jstack-mic"]]` was expected. 18 of the 19 cases were red; the one green, a browser with no wake lock, asks for
nothing either way.
*Commit:* `feat(v2.3.1): wpj-1 — the screen stays on while a microphone is open`.

**WPJ-2 · JSTACK's own inactivity lock could lock the app, and the microphone with it, in the middle of dictation.**
`jstack-app/lib/autoLock.ts` re-armed its timer only on a touch, a key or a wheel in a browser, and on a phone nothing re-arms
it at all (Review 20 in `KNOWN_GAPS.md`), so a person speaking without touching the screen reached `lock.afterMinutes` and
`relock()` took the microphone mid-sentence (MC-07). The timer now holds while a microphone is open — `stores/mic.ts`'s
`micIsOpen`, which counts the permission prompt too — and a fresh window starts the moment the session ends. Hold-to-lock,
the emergency lock and a phone put down still lock at once and end the microphone through `relock()` (P-1); the last is
pinned beside the new cases. The packaged mock is rebuilt from this source (QA-06).
*Red first:* `jstack-app/tests/unit/autoLock.test.ts` › "a desktop: a session open past the timeout does not lock, and the
window starts again when it ends" printed `Expected number of calls: 0` / `Received number of calls: 1`; the phone's case and
the permission prompt's failed at the same line, with 2 and 3, since an earlier failure's install never reached `stop()`; "a
phone put down still locks at once with a microphone open (P-1)" was green before and after.
*Commit:* `merge(v2.3.1): origin/v231-build debf9996 into v23/wpj, by intent, with WPJ-2`.

**WPJ-3 · Locking the phone or leaving the app ended voice only when JSTACK locked too.** With `lock.lockOnHideTouch` on (the
default) a phone put down locks JSTACK (`jstack-app/lib/autoLock.ts`), and that lock already released the microphone and
paused Talk as "Paused — locked" (A4R11-06): that half held, and `jstack-app/tests/native/screens.test.tsx`'s A4R11-06 case and
`jstack-app/tests/unit/autoLock.test.ts` › "hiding locks at once" prove it. With the parameter off, and in a desktop browser,
which never locks on a hidden tab, a microphone session stayed open behind the lock screen or another app. Now the one owner,
`jstack-app/lib/mic.ts`, watches `AppState` for each session and ends it on "background" the way a pause does: the words
already heard stay where they went, keep-awake goes back (WPJ-1), and nothing reopens on the way back. "inactive" is not
leaving — iOS passes through it for a permission prompt or Control Center, and a session must survive its own prompt.
`jstack-app/stores/voice.ts` pauses Talk through the one path a lock takes, as "away", so
`jstack-app/components/brain/TalkScreen.tsx` reads "Paused" — or "Paused — locked" when JSTACK did lock, which a lock always
says — and only Resume reopens the microphone. `DECISIONS.md` records it as ADR-75, "P-1 clarified", with the two locks named,
and `HANDOVER.md` §1.8 says the three behaviours in Josh's terms. RM-09 in `jstack-app/tests/unit/consolidation.test.ts` and
`DECISIONS.md`'s title move from 74 (WPK-1's ADR-70..74) to 75, and the "ADR-01..69" still in `README.md`,
`HANDOVER_OUTLINE.md` and `jstack-app/tools/gen-codemap.mjs` (so `jstack-app/CODEMAP.md` §7) moves to 75 with them.
`SECURITY.md` lists no lock effect on the microphone, so it is unchanged. The packaged mock is rebuilt from this source (QA-06).
*Red first:* `jstack-app/tests/native/micAwake.test.ts` › "background: the session ends, the words already heard stay, keep-awake
goes back, and nothing reopens on return" printed `Expected: false` / `Received: true` for the device still running;
`jstack-app/tests/native/screens.test.tsx` › "background leaves 'Paused' and no open stream; coming back opens nothing; Resume
opens exactly one" printed `Expected: 0` / `Received: 1` open streams; and with ADR-75 in before the guard moved,
`jstack-app/tests/unit/consolidation.test.ts` › "one row per decision, 01 to 74, in order" received `75` past the 74, and
RM-06 printed `ADR-75: not in §7` until `pnpm codemap` indexed it. The "inactive" case was green before and after.
*Commit:* `feat(v2.3.1): wpj-3 — locking the phone or leaving the app ends voice the way a pause does`.

**WP-L — the handover's pictures, made with the archify skill.** Josh, 15 Sep: "Utilise Archify to improve the
visuals in this handover. They are barely C grade quality now." Six diagrams were briefed; Josh trimmed the scope
to four before the fifth and sixth were authored (WPL-5/6 never started — no row for them). Each was authored
fresh from this repository's own evidence (not from the archify examples, which were read for field shape only),
validated at showcase quality, and delivered as a standalone interactive HTML page under `diagrams/` with its
exact archify spec JSON beside it (so REMAP can regenerate the page as the code moves) and a PNG for inline use
in the pack (`REMAP_v23_pack.html`'s "Pictures" blocks, tab 1 for WPL-1, tab 2 for WPL-2/3, tab 3 for WPL-4).

**WPL-1 · architecture — "The app and its seams."** `diagrams/1-architecture-seams.html` /
`diagrams/1-architecture-seams.json`. Validate receipt: 9 checks, 0 errors, 0 warnings. Three facts a reviewer
can check against the code:
1. `data/provider.ts`'s `build()` wires `withOutbox(inner, createQueueStore(), () => useSessionStore.getState().online, () => useSessionStore.getState().emergency)` around either `httpTransport` or `mockTransport`, and `getAdapter()` is the only way a component ever reaches it.
2. `lib/emergencyWipe.ts`'s `wipeThisDevice()` calls, in order, `useSyncStore.setState({conflicts:[], entriesNow:[], queued:0})`, then `wipeAllLocalData()` (`lib/encryptedStore.ts` — clears every `AsyncStorage` key plus the Keychain key on native / IndexedDB key on web), then `getOutbox().clear()`, then `clearTokens()`.
3. `SECURITY.md`'s emergency-lock section: `POST /lock` revokes server-side first, and only once that confirms does the device wipe; nothing on the server is touched (memory and databases stay), restored later via `POST /recover`.
*QA FAIL, fixed:* the transport↔sync edge was backwards — `stores/sync.ts` is the only caller of `replay()`
(`sync.ts:27` imports `getOutbox`; `outbox.ts` imports nothing from `sync.ts`), and every sibling edge is
call-direction, as WPL-2 draws it (`sync → outbox "replay()"`). Reversed: `sync → transport`, labelled
`replay()`. Also relabelled the transport box (`data/transport/{http,outbox}.ts`, sublabel naming
`lib/lockGate.ts` separately) so `lockGate.ts` is not read as living in `data/transport/` — it is `lib/`.
Re-validated (9/9, 0/0), re-delivered, PNG refreshed.

**WPL-2 · sequence — "A capture offline, end to end."** `diagrams/2-offline-capture.html` /
`diagrams/2-offline-capture.json`. Validate receipt: 9 checks, 0 errors, 0 warnings. Three facts:
1. Every queueable write gets a minted `offlineId` attached to the body before it is sent, online or offline — `data/transport/outbox.ts` (the header comment cites this as OF-01) — and while offline the write is sealed into a row keyed by `offlineId` in `lib/queueStore.ts`'s `webQueue().put`.
2. The emergency lock is checked before any row is written to the queue: `outbox.ts`'s `enqueue` throws `LockedError(req.path)` when `isEmergency()` before it ever calls `queue.put(...)` — this is BUGLOG row WPA-15, which closed exactly this gap (a capture whose request failed after the wipe was being queued onto the wiped device).
3. During `replay()`, a `2xx` response removes the entry and increments `sent`; a `409` pushes the entry onto the `conflicts` array and removes it from the queue, persisted via `keepConflicts` → `queue.saveConflicts`, and can be cleared per entry by `dismissConflict` in `stores/sync.ts`.
*QA PASS, citation tightened:* the offlineId/dedupe claim (fact 1 above, and the "Sealed and Idempotent" card)
cited OF-01 — the allow-list case (`outbox.test.ts:47`) — when the dedupe behaviour is OF-02's
(`outbox.test.ts:92`, "offline, a capture is accepted rather than lost") and `CONTRACT.md` §1.12. All three
occurrences (a view note, a message label, a card item) now cite OF-02 and §1.12. Re-validated (9/9, 0/0),
re-delivered, PNG refreshed.

**WPL-3 · lifecycle — "The session's lock states."** `diagrams/3-lock-states.html` /
`diagrams/3-lock-states.json`. Validate receipt: 9 checks, 0 errors, 0 warnings. Three facts:
1. `lib/emergencyLock.ts`'s `emergencyLock()` posts the lock; when the server answers, it goes straight to `confirmed()` (the ordinary case) — `lockHere()` (the Unconfirmed branch) only runs from the `catch` when `isUnreachable(error)` is true (`emergencyLock.ts:71-82`).
2. A lock the server refuses re-throws from that same `catch` without calling `lockHere` or `confirmed` — state stays Unlocked, nothing is written (`emergencyLock.ts:76`, `if (!isUnreachable(error)) throw error;`).
3. `lib/emergencyWipe.ts`'s `wipeThisDevice` is the ONLY path that touches caches, the queue or tokens: it runs only once the server confirms, zeroing the sync store, wiping the encrypted store (including the web cipher key, P-12), clearing the outbox and clearing both tokens — confirming nothing is destroyed in the Unconfirmed state.
*QA FAIL, fixed:* the diagram's only route into Confirmed was via Unconfirmed ("reconnect confirms"), but the
ordinary case never passes through Unconfirmed — `emergencyLock()` goes Unlocked → Confirmed directly the
moment the server answers; `lockHere()`'s Unconfirmed branch is only the `catch` for an unreachable server
(`emergencyLock.ts:71-82`). Added `unlocked → emergencyConfirmed` ("lock — server confirms (the ordinary
case)") as the main transition (routed `top-channel` so it does not cross the Unconfirmed state), kept the
unreachable route as a dashed branch, and added the refused case — the server says no, nothing changes, one
of Q3's four threat-model scenarios — as a line on the Unlocked card rather than a state transition (a
same-state self-loop is not geometry-legal on this renderer; tried and reverted). Re-validated (9/9, 0/0),
re-delivered, PNG refreshed.
*Note for QA (unchanged from the first pass):* `visual-check` (browser evidence, not the acceptance gate)
still shows bounded desktop overflow after the edge/label rework — comparable to before the fix (roughly the
same range, 1296–1452px scrollHeight across the four checked sizes). The validate/deliver contract (9/9, 0/0)
is unaffected; a human should know it may still ask for a scrollbar on a smaller desktop.

**WPL-4 · workflow — "The stage-2 plug-in, human and agent."** `diagrams/4-stage2-plugin.html` /
`diagrams/4-stage2-plugin.json`. Validate receipt: 9 checks, 0 errors, 0 warnings. Three facts:
1. `WP-E.md` §B's Day 1 row: agent lane "Scaffold; migrations; §4.1 session and lock ... conformance in CI", gate "Conformance green for §4.1; a deliberately broken response proven red" — reflected in nodes `agent1`/`gate1`.
2. `WP-E.md` §C's artefact list — "the agent is given ... `AGENTS_BACKEND.md` ... `FAMILIES.md` ... the boundary list ... the verification rule" before it starts — reflected in node `agent0`, and the diagram's cards quote AGENTS_BACKEND.md's five rules and its "stops you and sends you back to a human" list in substance.
3. `WP-E.md` §B's Days 3–4 gate — "Each family's GETs and safe writes conformance-green ... `pnpm connect:check` green end to end" — reflected in node `gate3`.

`build_pack_v23.py` gains a `DIAGRAMS` registry and `pictures_block()`, called at the top of `pack_tab()` (tab 1,
diagram 1), `connect_tab()` (tab 2, diagrams 2 and 3) and `stage2_tab()` (tab 3, diagram 4) — each PNG inline
(`b64img`, the same pattern `screens_section()` already uses) linking out to its interactive page. A diagram
whose files are not yet at the pack's ref is silently omitted, the same honesty rule the mock/audit fallbacks
already use in this script. WP-L.md's brief named `tools/gen-codemap.mjs` as the generator to gain a "Diagrams"
section in `REMAP_HANDOVER.html`; that file has no reference to `REMAP_HANDOVER.html` at all — the real
generator is `tools/gen-handover-html.mjs`, and it renders `HANDOVER.md`'s markdown generically (headings,
lists, links), so no code change to either tool was needed: `HANDOVER.md` §1 gained a "1.9 The pictures"
subsection with the four links, and it appears in the generated page for free. Flagging this correction for QA
rather than forcing an edit to a tool with no involvement.

Also landed, from sonnet 2's WP-K handoff: `build_pack_v23.py`'s `QUESTIONS` list marks tags `calendar` and
`teach` answered (Josh, 15 Sep, quoted in place — the four-route calendar write-back is stage 2, a second
calendar and combined view are V3; Teach's rule-writing is unchanged, a V3 "librarian" agent reads what Teach
finds), and `STAGE2_A`'s task table gains two rows: the unreachable-lock threat model re-check (Q3) and
confirming the native dictation approach before committing past the device check (P-2), both flagged by Josh
15 Sep as REMAP planning tasks, not code changes.

**WPM-9 · Merged `origin/v231-build` (WP-I, WP-J, WP-L) into `v23/wpm` by intent, and three lines QA found on
the merged tree.** Five real conflicts (`BUGLOG_v23.md`, `CHANGES_v23.md` — both append-only, both sides kept
in full), `HANDOVER.md` (§1.8's Expo Go and dictation bullets — WP-M's retirement wording and WPJ-3's
keep-awake/pause sentence both kept, combined into one bullet), `REMAP_HANDOVER.html` and
`jstack-app/CODEMAP.md` (both regenerate from source, so either side was a placeholder pending `pnpm codemap`)
— plus five sha-stamp-only conflicts inside `CODEMAP.md`'s `<!-- generated:start -->` markers, resolved the
same way. `pnpm codemap` regenerated after; `node tools/codemap-check.mjs CODEMAP.md` and a grep for
`<<<<<<<`/`>>>>>>>` across the tree both came back clean. Folded in from QA on `ad377057`, no separate
commit: `CHANGES_v23.md`'s WPM-1..5 line split into five (one BUGLOG row each); `history/README.md` names
`demo/`'s 2,074 frames precisely (V2's own 156, V2.1's 508, V2.2's 1,060-plus); `.githooks/pre-commit`'s
dropped regen triggers are named a deliberate behaviour change in WPM-6's row, not a path fix; `tools/qa-rows.mjs`'s
STAGE 6 fallback label points at `history/v1/19_CC_V22_AUDIT_PROMPT.md`. Folded in from QA on WP-I: `DECISIONS.md`
ADR-66's own decision cell — not ADR-70's — now says in place "(amended by ADR-70: since v2.3.1 those records
are kept too, encrypted at rest)", since REMAP reads the decision line first and the status cell alone
undersold what changed; a `KNOWN_GAPS.md` row (owner REMAP) records that on a phone with no secure store the
unconfirmed emergency lock holds while the app is open but is not restored at the next launch, because
`lib/emergencyLock.ts`'s unconfirmed flag writes and reads through the same encrypted store WPI-2 already
guards. Folded in from QA on WP-J: a `KNOWN_GAPS.md` row (owner Josh's device check, then REMAP) records that
on an iPhone with `lock.lockOnHideTouch` on, the first dictation's microphone-permission prompt reports
`AppState` `"inactive"`, and the auto-lock treats any non-`"active"` state as a hide — `lib/mic.ts`'s own
session-end listener already carves out `"inactive"` for exactly this reason (WPJ-3), the auto-lock does not
yet; device-only, unproven on a device.
*Quoted before:* `DECISIONS.md` ADR-66's decision cell, ending "...not to carry the database" with no
parenthetical; `KNOWN_GAPS.md` had neither row; the four WPM-1..8 items each as WPM-6/CHANGES/history/README.md/
qa-rows.mjs stood before this package's own earlier commits, quoted in those rows already.
*Commit:* the merge of `origin/v231-build` `c37290f3` into `v23/wpm`, carrying the folded-in lines above.

### WP-N — `v23/wpn`, worktree `v23-wpb`

Round v2.3.1, from `v231-build` at `c37290f3`. Josh, 15 Sep 13:05: "I can't open the mock 14 or mock 15 in html. Saying
'this browser has no authenticator'. I have flagged this before and sick of having to re-solve the same errors. As part of
v2.3 final deliverables make sure the mock html can be opened on chrome, brave and safari browsers. It's a mock."

**WPN-1 · The packaged mock, opened from a file, dead-ended at the Enter screen in every browser.** Double-clicked from
Dropbox, `jstack-mock-v15.html` is a file page, and no browser will run a passkey ceremony on one: Chrome and Brave keep
`PublicKeyCredential` and refuse the ceremony itself (a SecurityError for the file's opaque origin), so
`jstack-app/components/chrome/Gate.tsx` printed "Passkey required — this browser has no usable authenticator", and a browser
with no WebAuthn got "This browser has no passkey support". Either way the gate stayed shut. Now
`jstack-app/lib/webauthnGate.ts` says how a ceremony ended (`webAuthnCeremony`: a SecurityError or NotAllowedError is
"refused") and whether a page can run one at all (`passkeyCannotRunHere`: not a secure context, or a file). When the page
cannot — no `PublicKeyCredential`, not a secure context, a file, or a refused ceremony — and the app runs on its in-process
mock (`USE_API_ADAPTER` false: a build pointed at a server never renders it), the gate keeps its honest sentence and adds the
mock's own sign-in at the top of the locked screen (`MockSignIn` in `jstack-app/components/chrome/LockedScreen.tsx`, outside
the tap-anywhere `facelock` Pressable, whose tap still runs the ceremony and nothing else): "Continue — passkeys unavailable
here, mock sign-in", with one line saying why (`jstack-app/lib/unlockCopy.ts`). It opens the fixture session the way a
completed ceremony does. Where a passkey can run — localhost with an authenticator, the e2e board, a device — nothing changes,
and the emergency lock and a signed-out device keep their own screens. `jstack-app/tools/build-mock.mjs`'s note on the gate
(B7-05) says what the app now does; `CONTROLS_v2.md` §9.1 lists `mock-sign-in`; `jstack-app/CODEMAP.md` §4 names the new
test. The packaged mock is rebuilt from this source (QA-06).
*Red first:* `jstack-app/tests/native/gateMockSignIn.test.tsx` › "no PublicKeyCredential and no secure context, on the
in-process mock: the mock sign-in is offered before any tap, beside the honest sentence, and it opens Today" and "a ceremony
the page refuses — the SecurityError a file page throws in Chrome and Brave — offers the mock sign-in after the tap, and it
opens the app" printed `Unable to find an element with testID: mock-sign-in`; the API-adapter case and the page that can run
a passkey were green before and after. `jstack-app/e2e/core/mockfile.spec.ts`, opening the committed mock by its file URL
with no virtual authenticator, failed all six runs (three cases at 393 and 1366) at `waiting for
getByTestId('mock-sign-in')`, each after the Enter screen itself had rendered, in Chromium and in WebKit.
*Commit:* `fix(v2.3.1): wpn-1 — the packaged mock signs in from a file, with no authenticator`.

**WPN-2 · Nothing stopped the file-open failure coming back, and the documents said to serve the mock.** QA-06 proves the
mock was built from this source, not that it opens: v14 and v15 both passed it, and both dead-ended from a file (Josh, 15
Sep). `jstack-app/e2e/core/mockfile.spec.ts` is the permanent guard, in the core project the e2e board runs — "the packaged
mock opens from a file with no authenticator": the committed `jstack-mock-v15.html` by its file URL, with no virtual
authenticator, through the Enter screen to Today's fixture data, in Chromium with WebAuthn removed, in Chromium as a file
page has it, and in WebKit wherever Playwright's WebKit is installed (the case skips, saying so, where it is not).
`DEVICE_RUNBOOK.md` §1 asks for the same by hand in Chrome, Brave and Safari, and `HANDOVER.md` §1.1 and `README.md` say the
mock opens from disk, where `README.md` said to serve it rather than open it. `KNOWN_GAPS.md` needs no row.
*Red first:* the file-open cases' six red runs against the mock built before WPN-1, recorded there; the runbook's new line
quotes only a string the app renders (`jstack-app/tests/unit/consolidation.test.ts`).
*Commit:* `docs(v2.3.1): wpn-2 — the file-open case guards the mock; the runbook, HANDOVER.md and README.md say it opens from disk`.

**WPM-10 · Merged `origin/v231-build` `9a612e5c` (WP-N) into `v23/wpm`, four conflicts, and the two files' combined
edits put `README.md` over its 300-word cap.** `BUGLOG_v23.md` and `CHANGES_v23.md` (both append-only, both sides
kept), `REMAP_HANDOVER.html` and `jstack-app/CODEMAP.md` (both regenerate, either side a placeholder) plus the same
five sha-stamp-only conflicts inside `CODEMAP.md`'s generated markers. `pnpm codemap` regenerated after; the
conflict-marker grep and `codemap-check.mjs` both clean. WP-N's mock-sign-in bullet in `README.md`'s own "See it
running" section, added on top of this package's own edit a few lines below (the `history/` row), read 303 words —
over the RM-10 cap Josh set 11 Sep ("concise and accurate, never long-winded"). Trimmed the mock-sign-in bullet to
say the same thing shorter (double-click, or serve and unlock with a passkey) without dropping either path; 284 words.
*Quoted before:* `README.md` "Double-click it and open it in Chrome, Brave or Safari: from disk, where no browser
will run a passkey, its lock screen offers "Continue — passkeys unavailable here, mock sign-in". Or serve it and
unlock with your device's passkey: from the repository root run `JSTACK_DIST=. node jstack-app/tools/serve-web.mjs
4190` and open `http://localhost:4190/jstack-mock-v15.html`."
*Commit:* the merge of `origin/v231-build` `9a612e5c` into `v23/wpm`, carrying the `README.md` trim above.

## v2.3.2

### WP-P — `v23/wpp`, worktree `v23-wpp`

Josh's evening review of the v2.3.1 pack, 15 Sep: "the handover still looks WAAAY too complex … bring
back the previous format and improve it"; on the pictures, "less cute AI titles, more clear professional
language I can handover (what, who, when, why)." WP-P is the pack's format restored to the V2.2 shape
with `PLAN_BY_STAGE.md` on top, and the four diagrams rewritten for a reader instead of a file tree.

**WPP-1 · `REMAP_v23/build_pack_v23.py` built the V2.3 page in the shape a third tab (`stage2_tab()`), a
16-row ranked questions table and two full-text embeds (`FAMILIES.md`, `AGENTS_BACKEND.md`) made — 95,972
words once `PLAN_BY_STAGE.md` was accounted for, over the 84,000-word cap the V2.2 page set.** Restored the
V2.2 shape at `v2.3.2`: `pack_tab()`'s ten sections (Start here · See it · User stories · What you build ·
What changed · Honest limits · Orientation · For the developer · Consolidated set · Files in the pack) and
`connect_tab()` are the only two tabs; `plan_by_stage_section()` renders `PLAN_BY_STAGE.md` verbatim as the
first thing in Start here (WP-O writes the file; the generator prints an honest "not at this ref yet" note
until it does); the questions table, `qref()`/`resolve_qrefs()`, `STAGE2_A..F` and `stage2_tab()` are
deleted outright, not hidden; `FAMILIES.md` and `AGENTS_BACKEND.md` stay in the pack folder, named once in
the reading order as "for the coding agent" rather than embedded; the "10a" section's four facts (offline
verb-disabling, credentials/timeout, certificate pinning, native dictation/Talk-after-lock) fold into
`CHANGES_SINCE_ADBP_v0.5.md` domains 6, 7 and 11 by literal substitution, not backreference. `CODEMAP.md`'s
full-text embed (27,006 of the run's 95,972 words) drops from "for the developer" the same way
`AGENTS_BACKEND.md` already did — named and word-counted, not reproduced. `verify()` gained a word-count
gate (`text_words()` strips tags, sums the page and the `#start` section) and asserts `stage2-tab`,
`id="questions"` and `id="stage2"` are absent. Re-run against the `v2.3.1` tag (`776b8726`, the newest tag
that exists while `v2.3.2` is not yet cut) three times while fixing the fold-in and the count: final page
71,745 words, Start here 4,912 words — both under budget; the only self-check note is the expected
"`PLAN_BY_STAGE.md` is not at this ref yet".
*Quoted before:* `build_pack_v23.py` `DIAGRAMS`'s `pictures_block()` call sites in `pack_tab()` and
`connect_tab()`; `QUESTIONS`, `QUESTIONS_INSERT_AFTER_3`, `questions_table()`, `qref()` (the 16-row table);
`STAGE2_A` through `STAGE2_F` and `stage2_tab()` (the third tab's A–F prose); `CHANGES_SINCE_ADBP_v0.5.md`'s
"## 10a. Offline reachability, credentials, pinning, voice on native (V2.3)" section; `start_section()`'s
"Tab 3 is new …" sentence and its ranked-questions insertion block; the "for the developer" section's full
`doc_details()` embed of `maps/CODEMAP.md`.
*Commit:* `docs(v2.3.2): wpp-1 — build_pack_v23.py restored to the V2.2 page shape, PLAN_BY_STAGE.md on top, under the 84k/6k word caps`.

**WPP-2 · `diagrams/1-architecture-seams.json`'s box names were file paths (`data/provider.ts`,
`data/transport/{http,outbox}.ts`) and its title didn't say who builds what — Josh: "what the fuck are the
first three?"** Renamed to reader-facing boxes — "Screens and local state", "Sync and the offline queue",
"Identity: passkeys, sessions, tokens", "Encrypted device store", "The mock backend (today)", "REMAP's
backend (stage 2)" — with every file path moved into a sublabel; "Expo App" is now "Screens and local
state" and the word "Expo" appears nowhere on the page. Three technical bug-citation cards (One data path /
What the wipe clears / What it never touches) are replaced with four cards headed What · Who · When · Why,
in Josh's plain words. Two layout errors the new copy caused (crossing connections, a label overlapping a
box) fixed by removing the direct identity→store connection and adding `labelAt` to the remaining labels.
Re-validated at `--quality showcase` (9/9 checks, 0 errors/0 warnings), delivered, `visual-check` passes all
four viewports both themes.
*Quoted before:* `diagrams/1-architecture-seams.json` component labels `"Expo App"`, `"data/provider.ts"`,
`"data/transport/{http,outbox}.ts"`, `"lib/authTokens.ts"` as the primary label (not a sublabel); `cards`
titled "One data path", "What the wipe clears", "What it never touches", each citing a WPA/WPF/BS bug id.
*Commit:* `docs(v2.3.2): wpp-2 — diagram 1: reader-facing box names, no "Expo", What/Who/When/Why cards`.

**WPP-3 · `diagrams/2-offline-capture.json` named its participants after source files (`withOutbox`, "Queue
Store", "Sync Store") and its title didn't say what a reader would see happen.** Renamed to "Josh", "The
app", "The offline queue", "REMAP's API" (four participants, down from six); messages reworded to plain
verbs — "saved on the device, encrypted", "sent when back online", "accepted", "refused: shown to Josh to
dismiss or retry" — and the emergency-lock branch collapsed to one dashed message ("locked — nothing is
saved while locked") instead of a sub-sequence. Three technical cards replaced with What/Who/When/Why.
`meta.viewBox`, `participants[].label` and `sublabel` adjusted once for a schema width error ("The offline
queue (encrypted)" too wide for its box — moved "(encrypted)" into the sublabel). Re-validated (9/9, 0/0),
delivered, `visual-check` passes all four viewports both themes.
*Quoted before:* `diagrams/2-offline-capture.json` participants `"withOutbox"`, `"Queue Store"`, `"Sync
Store"`, `"Server"`; nine messages including a three-step locked-branch sub-sequence with a technical note
citing WPA-15 inline; `meta.title` "A capture offline, end to end".
*Commit:* `docs(v2.3.2): wpp-3 — diagram 2: four plain-word participants, the lock branch as one message, What/Who/When/Why cards`.

**WPP-4 · `diagrams/3-lock-states.json` floated a stray "Auto-lock hold" box in a second lane that overlapped
its own lane title, and the ordinary lock path wasn't drawn as the main route — the exact defects Josh's
round v2.3.2 review named.** Rebuilt on the lifecycle renderer's single `main` lane, four states left to
right — Unlocked → Locked (unreachable) → Locked (wiped) → Recovered — with the confirmed-lock path
(Unlocked → Locked (wiped)) as the emphasis main route and the unreachable branch as a dashed side path that
rejoins it; the `autoLock`/`hold`-lane state that caused the overlap is gone, not repositioned. Each state's
sublabel says what happens to the mic and the queue; the fourth What/Who/When/Why card names the wipe's
effect on the queue, the caches and the tokens in full. The lifecycle renderer reserves a fixed three-band
canvas regardless of lane count (`renderBands()` always draws "01/02/03", empty or not) and a fixed 930px
diagram column at a 1440px viewport — both outside the JSON's control — so closing a genuine 1440×900
`visual-check` overflow (999px of 900, after the state-width fixes alone) took three more real levers:
`meta.viewBox` widened to 1080 (the readability ceiling — `938×7px context font ÷ 6px minimum` — leaves
`~1085` as the largest width that keeps sublabel text legible), `meta.legend.mode: "hidden"` (the type
legend is redundant with the cards' own colour dots), and every card item trimmed to fit one row without
dropping a required fact. Final `visual-check`: 900/1000/1080/1320px, all four viewports, both themes, 0
diagnostics.
*Quoted before:* `diagrams/3-lock-states.json` `lanes` `[{"id":"main",...},{"id":"hold","label":"autoLock.ts
— inactivity hold"}]`; `states` included `{"id":"autoLock","type":"waiting","label":"Auto-lock hold",...,
"lane":"hold","col":0}`; `meta.title` "The session's lock states"; three cyan/amber/rose cards citing
WPA/MC/P bug ids instead of What/Who/When/Why.
*Commit:* `docs(v2.3.2): wpp-4 — diagram 3: the lane-overlap bug fixed, Unlocked to Locked(wiped) as the main path, What/Who/When/Why cards, visual-check clean at all four viewports`.

**WPP-5 · `diagrams/4-stage2-plugin.json` named files and products in its node titles — "Reads
AGENTS_BACKEND.md", "§4.11 voice + n8n", "connect-check gate" — instead of plain words a person can read at
a glance.** Every node label rewritten to a plain sentence ("Agent reads the rules", "Agent wires up voice",
"Gate: conformance ok"), with every section number, file name and product name (AGENTS_BACKEND.md, n8n,
Twenty, Dropbox, connect-check) moved into the sublabel only; lane labels shortened to "Josh", "The coding
agent", "The gates"; `meta.title` renamed. Fifteen node-width and one desktop-readability error worked
through iteratively (each plain-word label needed a wider box than its old file-name label did, which then
pushed the whole-page viewBox past the 1440px-viewport legibility floor) by widening boxes first, then
shortening the labels a second pass once the total viewBox width made the smallest sublabel project under
6px; the two cards (the five rules, the three stops) are unchanged in substance, reworded to drop the raw
"§A" notation. Re-validated (9/9, 0/0), delivered, `visual-check` passes all four viewports both themes,
including the desktop-readability check that failed twice mid-round.
*Quoted before:* `diagrams/4-stage2-plugin.json` node labels `"Reads AGENTS_BACKEND.md"`, `"Scaffold
§4.1"`, `"Families: Today→Cal."`, `"Twenty & Google"`, `"Dropbox OAuth"`, `"connect-check gate"`, `"§4.11
voice + n8n"`; `meta.title` "The stage-2 plug-in, human and agent".
*Commit:* `docs(v2.3.2): wpp-5 — diagram 4: plain-word node titles, files/products/section numbers moved to sublabels only`.

**WPP-6 · `HANDOVER.md` §1.9 and `HANDOVER_OUTLINE.md` rows 1b–1e still named the four diagrams by their old
titles and the pack's retired third tab.** All four titles updated to the exact strings above; §1.9 drops
"and inline in the REMAP pack itself as a PNG that links out to the page" (P-1 removes the pack's inline
picture blocks — the pages are linked once from `diagrams/`, not reproduced); row 1e's "When" column reads
"With `PLAN_BY_STAGE.md`" in place of "With the pack's tab 3".
*Quoted before:* `HANDOVER.md` §1.9's four `[...]` links under their v2.3.1 titles; `HANDOVER_OUTLINE.md`
row 1e "When" cell, "With the pack's tab 3".
*Commit:* `docs(v2.3.2): wpp-6 — HANDOVER.md §1.9 and HANDOVER_OUTLINE.md name the four diagrams' new titles`.

**WPP-7 · Josh's second pass on the pack, the same evening: "ensure the remap handover is based on the
previous format (v2.2) and improved. Not word salad like your most recent version."** Two corrections to
WPP-1..6. First, the pictures: WPP-6 read them as files only, linked once from the reading order — Josh's
word this time was to place each "where it explains the section," so `build_pack_v23.py` now embeds one
PNG per picture at the point that names it (`diagram_figure()`, reused from the existing `figure.dia` CSS
the v2.2 page already carried for its own inline SVGs) — the stage-2 picture inside Start here, right after
`PLAN_BY_STAGE.md`; the architecture picture at the end of "What you build"; the offline picture at the end
of "What changed"; the lock-states picture at the end of "Honest limits". `README_FIRST.md`'s reading-order
row for `diagrams/` now says the pictures repeat there as their own interactive pages, not that they are
files only. Second, the prose: WP-Q.md's Q-1 rules (one idea a sentence, about 20 words, active voice, no
filler, no row ids outside a trailing parenthesis) applied to the pack's own authored text — the "How we
got here" timeline `start_section()` added across all seven versions is gone outright (a v2.3.2-round
addition with no v2.2 original to match, and the version stamp two sentences above it already says what is
built and where); the honest-state paragraph's one run-on sentence split in two; the "three more files"
paragraph in "For the developer" shortened from one long dashed sentence to two short ones. Re-run against
the `v2.3.1` tag: page 71,745 words (cap 84,000, unchanged — the timeline's loss and the four new
figcaptions net out close to even), Start here 300 words (cap 6,000, well under); `verify()` clean apart
from the expected "`PLAN_BY_STAGE.md` is not at this ref yet" note.
*Quoted before:* `build_pack_v23.py`'s `DIAGRAMS` dict comment, "the four diagrams under diagrams/ are
files in the folder, not embedded on the page"; `start_section()`'s `timeline` variable, the full
"<b>How we got here.</b> v1.2 (1 Sep, what you saw) → V2 (6 Sep, ...) → ... → this pack (...) →
go-live (your backend)." paragraph; the honest-state paragraph's "...at `{ref}` `{short}`; the board,
every acceptance ID..." (one sentence, semicolon-joined); the "for-the-developer" section's "Three more
files stay in the folder rather than reproduced on the page — a generated, grep-sized reference is a
worse read here than it is open in an editor: ..." (one sentence).
*Commit:* `docs(v2.3.2): wpp-7 — the four pictures inline where they explain the section; Q-1's plain-words pass on the pack's own prose; the timeline addition dropped`.

**WPP-8 · Josh's amendment, 18:50: "one handover" — the pack's Start-here tab is `HANDOVER.md` rendered,
nothing else; sonnet 2 (WP-Q) is consolidating the stage-2 plan, the agent prompts, the outline and the
readiness list into it.** `build_pack_v23.py`: `COVER_NOTE.md`, `README_FIRST.md`, `WHATS_NEW_*.md`,
`CHANGES_SINCE_ADBP_v0.5.md` and `AGENT_HANDOVER.md` are retired — deleted from the pack folder and from
`build_markdown()` outright, not just unlinked; `USER_STORIES.md` keeps its own tab. `start_section()`
rewritten: it reads the repository's `HANDOVER.md`, splits on every `##` heading, and wraps each section
in the page's own collapsible (`doc_details()`, already used elsewhere on the page) — the first section
open, the rest closed, with an expand-all/collapse-all control. The "for the developer and the coding
agent" section is now a plain reference list — `FAMILIES.md`, `AGENTS_BACKEND.md`, `maps/CODEMAP.md`,
`maps/CONTRACT_MAP.md`, `maps/WIRING.md`, `maps/openapi.yaml` — none of them embedded, matching how
`CODEMAP.md` already was. `nav()` drops the "Orientation" entry and renumbers; the hero's lede names
"Start here" as `HANDOVER.md` itself. Re-run against the `v2.3.1` tag: page **57,574 words** (well under
the 84,000 cap, down from 71,745 now that five files' text is gone), Start here **4,175 words** (the whole
of `HANDOVER.md`, under the 6,000 cap); `verify()` clean apart from a genuine, expected note —
`HANDOVER.md`'s own §5 names `PLAN_BY_STAGE.md`, which does not exist at the `v2.3.1` ref (WP-O lands it
on `v232-build`).
*Quoted before:* `build_pack_v23.py`'s `COVER_NOTE.md`/`README_FIRST.md`/`WHATS_NEW_v22_v23.md`/
`AGENT_HANDOVER.md`/`CHANGES_SINCE_ADBP_v0.5.md` blocks in `build_markdown()` (five `read(V22 / ...)` +
`apply_subs()` + `out[...] =` groups); `start_section()`'s v2.2-lifted "Start here" prose (the 1/2/3
cards, the honest-state keyline, the data-path SVG); `pack_tab()`'s "Orientation" section (four
`doc_details()` embeds) and the "for-the-developer" section's `AGENT_HANDOVER.md` embed plus three
`maps/*` embeds; `nav()`'s ten-item list including "Orientation".
*Commit:* `docs(v2.3.2): wpp-8 — one handover: Start here is HANDOVER.md rendered, collapsible, the five retired files gone`.

**WPP-9 · The same amendment: "the four pictures sit inside the Start-here tab where HANDOVER.md's
sections mention them."** `diagram_for_heading()` matches each diagram's keywords (architecture/overview/
security boundary; offline capture; session security/lock states/emergency lock; stage 2/delivery plan)
against every `##` heading's text, case-insensitively, and inserts that diagram once, inside the matching
section — not a section number, since WP-Q is still moving them. At the `v2.3.1` ref, two of the four
match today's headings (§3 "The architecture, and the alternative rejected" → the architecture picture;
§1 "Connect and run" → the stage-2 picture, via its "connect and run" keyword) — the other two wait on
WP-Q's headings to use their own words ("offline", "session security"); nothing else changes when they do.
`jstack-app/tools/gen-handover-html.mjs` gets the same treatment for `REMAP_HANDOVER.html`, the second of
the two renderings Josh asked after: every `##` section a collapsible, §0 open and the rest closed, an
expand-all/collapse-all control, the four pictures embedded the same way. That page opens from disk with
no script (RM-06, `handover.test.ts`'s script-ban assertion) — pure CSS does the expand-all/collapse-all
instead: a hidden checkbox styled as a button, `:checked` forcing every section but the first open or
closed regardless of its own `open` attribute. `loading="lazy"` dropped from both generators' diagram
`<img>` tags — the data is already inline, and lazy-loading a `data:` URI bought nothing but a blank gap
while the browser waited to decide the image was in view. The four PNGs move from `REMAP_v23/diagrams/`
into the repository's own `diagrams/` folder so `REMAP_HANDOVER.html` can embed them too.
*Sizes, both renderings, at this sha:* the pack's Start-here tab (inside `REMAP_v23_pack.html`, the whole
page) — 3,624,122 bytes; `REMAP_HANDOVER.html` on its own — 623 kB (up from 64 kB, the four embedded
PNGs).
*Quoted before:* `gen-handover-html.mjs`'s `render(source)`/`render(connectAndRun(source))` calls (no
section splitting, no collapsibles, no diagrams); its two-tab CSS with no `.expand-controls`,
`details.sec` or `figure.dia` rules; `diagramFigure()`'s `<img ... loading="lazy">`.
*Commit:* `docs(v2.3.2): wpp-9 — the four pictures inside HANDOVER.md's own sections, both renderings collapsible, gen-handover-html.mjs restyled to match`.

### WP-O — `v23/wpo`, worktree `v23-wpo`

Round v2.3.2, from Josh's evening review, 15 Sep: "Why is there still references to Expo? It has zero interaction
with JStack from today forward … Delete everything expo unless it's required for the final App, assume this is
just legacy you never cleaned out." And: "database backend requirements made clear, security checks needed, remap
questions to answer still … Show them a clear view of JStack V2 stage capability & tasks, then what V3 multi agent
changes needed, V4 etc."

**WPO-1 · Every Expo account or service the app used to assume is gone; the SDK modules it is built from stay.**
`expo-updates` and `@expo/ngrok` drop from `jstack-app/package.json` (117 packages removed, 8 added, net, on
`pnpm install`); `app.json`'s `extra.eas`, `updates` and `runtimeVersion` blocks go, leaving `extra.router`,
`owner` and the `ios`/`android`/`web`/`plugins` content untouched. `jstack-app/eas.json` moves to
`history/expo-services/eas.json` (`git mv`); `jstack-app/tools/gen-expo-qr.mjs`, which only the removed QR guard
called, is deleted with it. `NATIVE_RUNBOOK.md` is rewritten around `npx expo prebuild --platform ios` → Xcode →
Josh's own Apple developer account → TestFlight/App Store, with no EAS step; `DEPLOY.md`'s native section follows.
`.github/dependabot.yml` is deleted (Josh: no more emails; its three workflows are already disabled in GitHub's
settings). Every other "Expo" mention in `README.md`, `HANDOVER.md`, `HANDOVER_OUTLINE.md` becomes the one honest
sentence — open-source SDK modules compiled into the app, no Expo account or service — or goes; `CONTRACT.md` §3.22
and `DECISIONS.md`'s share-extension row, which assumed an EAS build for the native share extension, now say a
native Xcode build. Guards follow rather than weaken: `handover.test.ts`'s A-6 (a live `app.json`↔QR-code check
whose fields no longer exist) and `jstack-app/tests/unit/deploy.test.ts` (the whole file, validating the now-frozen
`eas.json`'s live shape) are removed with a comment saying why; `workflows.test.ts`'s dependabot block follows the
file it guarded. `jstack-app/CODEMAP.md` regenerates at 370 mapped files (down one), `codemap-check.mjs` clean.
*Red first:* the four targeted suites (`consolidation.test.ts`, `handover.test.ts`, `workflows.test.ts`,
`capabilities.test.ts`) run clean after the edits, 132/132; the full board both zones green, 2432 passed, 1
skipped by design / 2433, 127 suites (down from 2444/128 — `deploy.test.ts` and two removed blocks account for
the difference), after fixing the D-12 count line in `history/v2/HANDOVER_v2.md`, `history/v2/QA_REPORT_v2.md`
and `QA_REPORT_v22.md` §3 to the new totals.
*Commit:* `chore(v2.3.2): wpo-1 — Expo services out, the SDK modules the app is built from stay`.

**WPO-2 · `PLAN_BY_STAGE.md`, the one page REMAP reads first.** A new root file, under 900 words, plain English:
what V2 does today; stage 2 as a table (area, what the backend must provide, where specified) plus a security
checklist and the day-by-day order of work, plus the still-open questions REMAP must answer (the two phone checks
— secure storage on the development build, the iOS microphone-prompt lock — are REMAP's now, per Josh); V3's
multi-agent changes (the librarian agent, Teach on every card, a second calendar, true background sync); V4's
unstaged hardening from the code review; V5's money and health; what works at the end of each stage. Every section
ends "Source:" naming the files it came from. `HANDOVER_OUTLINE.md` row 1 is now `PLAN_BY_STAGE.md`, every other
row shifted down one; `README.md`'s table gains it (the file trimmed to 295 words to hold the 300-word cap);
`REMAP_READINESS.md` names it as RM-08 checks.
*Commit:* `docs(v2.3.2): wpo-2 — PLAN_BY_STAGE.md, the plan by stage for REMAP`.

### WP-Q — `v23/wpq`, worktree `v23-wpq`

Round v2.3.2, from Josh's evening review, 15 Sep. WP-Q began as a plain-words pass over ten documents plus a
new `REMAP_AGENT_PROMPTS.md`; mid-round Josh amended it twice — "I don't want 4 different read-me docs.
Consolidate. Handover is the handover" — then tightened the cap from 6,000 words to 4,000 and banned section
overlap ("a fact appears once, in the section a developer would look for it"). What shipped is the amended
scope, not the original brief.

**WPQ-1 · `HANDOVER.md` becomes the one document.** `PLAN_BY_STAGE.md`, `HANDOVER_OUTLINE.md` and
`REMAP_READINESS.md` are deleted, folded in; `REMAP_AGENT_PROMPTS.md` (drafted for the original brief) is
deleted too, its three prompts folded into §7 rather than shipped as its own file. `HANDOVER.md` is now eight
numbered sections plus an opening five-check list ("Read this first, check these"): §1 the plan by stage
(all of `PLAN_BY_STAGE.md`, plus a table of what works today on the mock versus what waits for a real backend
— dictation, sync, agents); §2 run it, as a numbered process (who · what · the command or file · the check
that proves it) — clone and run on the mock, point at your server, identity first, each record family in
order, voice, agents and notifications, the security checks, the release build; §3 the build (a "what changed
since the ADBP v0.5 brief" table by domain, replacing a longer essay, plus a "Proven, not claimed" evidence
table folded in from `REMAP_READINESS.md`); §4 what the backend must provide (a database schema table — name,
wire shape, key fields, relations, append-only or mutable, routes, storage — derived from `data/types.ts` and
`data/routes.ts`, plus the triage/append-only/wipe rules); §5 security checks (the checklist, a prompt-injection
discussion point for shared-content and YouTube-transcript scraping, and the hosting line — Cloudflare or
Vercel, Josh does not care); §6 carried and not received (what you do not receive, plus the two `KNOWN_GAPS.md`
rows Josh named — timezone and identity — the other two he named, phone performance and repo readiness,
`KNOWN_GAPS.md` does not hold and are correctly omitted); §7 the three agent prompts; §8 every reference file,
one line each, including the four re-titled pictures WP-P delivered and `history/v1/JSTACK_ADBP_v0.5.docx`
(checked and confirmed current against `data/routes.ts`, so `BACKEND_HANDSHAKE.md` stays rather than being
replaced by §7 per Josh's own conditional). Every section links to the others rather than repeating them (the
emergency lock's row in §5 says "Passes §4's wipe rule" instead of restating it). 950 words of prose (the
repo's own `proseWords` convention), against the 4,000 cap.

*Guards relocated, not weakened:* `consolidation.test.ts`'s `CONSOLIDATED` array drops the two deleted files;
its RM-08 block now scans `HANDOVER.md` itself for paths and reads the "names the consolidated set" check from
its §8 (was `HANDOVER_OUTLINE.md`'s whole text); the README/HANDOVER word-cap test's HANDOVER threshold moves
from 3,000 to 4,000. `handover.test.ts`'s RM-01 now scans §2+§4's union instead of a "Connect and run" section
that no longer exists (four checks: paths resolve, `data/types.ts` shapes in §4 are real exports, every `§d.d`
citation anywhere in the file is a `CONTRACT.md` heading, `EXPO_PUBLIC_API_BASE_URL` is read where the app
reads it); RM-02 now reads its two checks (the nine required words, every evidence path resolving) from §3's
"Proven, not claimed" table instead of the deleted `REMAP_READINESS.md`. `tools/gen-handover-html.mjs`'s tab 2
follows the content it names — "Run it" (§2) instead of "Connect and run" (the old §1) — with the test's label
assertion moved to match. `history/v2/V2_HANDOVER_OUTLINE.md`'s banner now names `HANDOVER.md` as what
supersedes it. `02_ACCEPTANCE_TESTS_v22.md`'s RM-02 and RM-08 rows, `CONTRIBUTING.md`'s RM-03 line, both point
at the new location rather than a deleted file.
*Red first:* the relocated RM-01 checks failed twice while the new §2/§4 content was still catching up to the
old section's coverage — the path-count floor (was calibrated to the old, much larger section; lowered to match
the deliberately terser new one) and the wire-shape check (zero matches until §4's schema table gained an
explicit `data/types.ts` column) — both fixed by adding real content, not by loosening what the guard checks.
RM-02's evidence-path check failed on two rows ("the app builds", "types and lint") that named the `pnpm`
command itself rather than a file; fixed to cite `.github/workflows/board.yml`, the same evidence the original
readiness file used. Full board both zones green: see the report.
*Commit:* `docs(v2.3.2): wpq-1 — HANDOVER.md, the one document; three files folded in, one guard relocation each`.

**WPQ-2 · Merged `origin/v232-build` `2921a457` (WP-P) into `v23/wpq` by intent.** WP-P's four re-titled
pictures (their PNGs included) and sonnet 1's rework of `gen-handover-html.mjs` — every `##` section a
collapsible `<details>`, an expand-all control, the four pictures embedded by keyword match against the
section heading text — land on top of WP-Q's consolidated `HANDOVER.md`. `HANDOVER.md` and
`HANDOVER_OUTLINE.md` resolved by taking WP-Q's side wholesale. `gen-handover-html.mjs` taken from origin,
then patched: its tab-2 extractor and label still assumed §1 was "Connect and run" (the pre-consolidation
shape) — moved to §2 ("Run it"), the same fix WP-Q had already made to the pre-merge tool. `jstack-app/CODEMAP.md`'s
six conflicts (five sha-stamp-only generated-marker diffs, one hand-written line-count row for
`gen-handover-html.mjs`) resolved to origin's side, then `pnpm codemap` regenerated the whole file against
the merged, patched tree. Five of `HANDOVER.md`'s headings (§1, §3, §4, §5) gained a keyword phrase ("stage 2",
"architecture", "offline capture", "session security") so the keyword-matched embedding places each picture
where WP-Q's own Amendment 5 mapping intended — confirmed by reading the rendered page: §1 carries the
stage-2 delivery-plan picture, §3 the system-overview picture, §4 the offline-capture picture, §5 the
session-security picture. The four manual "(Picture: …)" pointers WP-Q had written inline are removed as
redundant now that the renderer embeds the image in the same place.
*Commit:* the merge of `origin/v232-build` `2921a457` into `v23/wpq`, carrying the heading and tool fixes above.

**WPQ-3 · Three gaps found only by the full board, not by the seven named guards.** `tests/unit/ingestionThreatModel.test.ts`
(UP-10, not one of the brief's seven) checks `HANDOVER.md` names Q24 — the consolidation had dropped the
explicit citation when §5's prompt-injection paragraph was written fresh; restored, naming all three of
`CONTRACT.md` §8 Q24's options. `tests/unit/share.test.ts` (UP-07, also not one of the seven) checks a whole
"Send to JSTACK" iOS Shortcut recipe section exists with its routes table — the consolidation had dropped it
entirely rather than folding it in; restored as a subsection of §2 ("Run it"), word for word from the
pre-consolidation `HANDOVER.md`. Both found by running the full board under `BOARD_LOCK`, which the targeted
seven-guard runs do not reach. The board's own D-12 lag then needed one more fix once those two landed: the
live count line in `history/v2/HANDOVER_v2.md`, `history/v2/QA_REPORT_v2.md` and `QA_REPORT_v22.md` §3 moved
2432→2430 passed / 2433→2431 total (WP-Q's own test relocation nets a handful fewer `it()` cases than the
pre-consolidation shape had). Full board both zones green after convergence: 2430 passed, 1 skipped by
design / 2431, 127 suites.
*Commit:* `docs(v2.3.2): wpq-3 — the two full-board-only gaps and the D-12 count line`.

## v2.3.3, 16 Sep

### WP-S — `v23/wps`, worktree `v23-wps`

Round v2.3.2, its 16 September update, from Josh: "How long would it take to add 'needs you' schedule to be adjustable, in the settings
schedule like all the others." — "Add it."

**WPS-1 · Needs you has a schedule, set in Settings › Schedules after the seven and carried by quiet hours' record.**
The seven rows there are the routines and EA tasks of `GET /schedules` — a fixed cadence, pause/resume and run — and
no route among them changes a time. The brief's own terms fit a field rather than a route: the same store action,
route family, handler and fixture, and "if the route's body shape gains a field". So the schedule is an optional
field of quiet hours' record, `QuietHours.needsYou { windows: [{ start, end }], respectsQuietHours, paused }`
(`data/types.ts`), saved whole through `putQuietHours` and `PUT /settings/quiet-hours`, kept by the mock's
`putQuietHours` handler and carried in `fixtures/settings.json`'s quiet hours. The body is checked against the contract
like every other, and a malformed schedule is a 422 naming the field. A separate `/settings/needs-you` route was built
first and taken back: it moved the route table from 135 to 137 and the backend markers from 142 to 144, which six
`handover.test.ts` guards pin as V2.2's counts and `HANDOVER.md`, `history/v2/HANDOVER_v2.md` and
`history/v22/HANDOVER_v22.md` quote — keeping it would have meant editing those guards, and the brief says they stay
green. In Settings the entry follows the seven in their row's shape — "Needs you", its times in accent ink ("8:00 ·
16:00"), pause/resume — with a field for the windows ("8:00–9:00, 16:00–17:00", saved once every part reads as a
window, the typed text kept until then) and a "Respect quiet hours" switch; a record with no schedule shows it
paused. Today reads it (`lib/needsYouSchedule.ts`): outside every window, and inside quiet hours when respected, the
cards wait — the label keeps the count, and one line reads "5 waiting · next at 8:00am" in place of the card, the
rows and the end line; inside a window the stack is as it was, and a Today left open follows the next edge. Paused,
or no schedule, raises the cards as they come, and a schedule that can never open holds nothing. The desktop keys A,
R and L answer no card while Needs you waits (`keyableCard`), because none is on the screen. The fixture ships the
schedule paused, so nothing else changes until it is resumed; its windows start at 8am and 4pm, the times
Notifications' "Needs you" group already says it batches at and Today's end line names.

*The model:* windows rather than bare times. A window's start is when the cards are raised; its end is when a card
left unanswered waits again. A card carries no time it arrived — `ActionItem` has no such field, and `setAt` is when
its labels were set — so "only new cards wait" cannot be told apart from "the cards wait" without a new wire field;
outside the windows the whole stack waits.

*Seen in the built mock* (served without an authenticator, as the file page is, and signed in with its own mock
sign-in; on the route-based build, whose screens these are): Settings › Schedules shows Needs you after Spend report,
and at 375px its row, field and switch each fit a line; with the schedule resumed at 07:07 Today read "NEEDS YOU 5"
over "5 waiting · next at 8:00am", with no card, rows or end line.

*Red first* (the tests written for the field, run on v2.3.2's implementation): the store — `load()` read `Received:
undefined` for `quietHours.needsYou`; the mock — the fixture's quiet hours had no `needsYou`, and a malformed schedule
answered `status: 200`; `openapi.yaml` — `QuietHours` had no `needsYou` (`fields: []`); the keys — still answered card
`c1`; the Settings entry — "Unable to find an element with testID: schedule-needs-you"; Today — `cards: 1, endLine:
1, waitingLine: 0` where the schedule said wait. The gate and window cases ran against the new
`lib/needsYouSchedule.ts` from the first run. Two cases were green before and stay as guards: a quiet-hours PUT with a
schedule round-trips, and the store's `putQuietHours` carries one — nothing on v2.3.2 refuses a property it does not
know.

*Files:* `jstack-app/lib/needsYouSchedule.ts` (new), `jstack-app/data/types.ts`,
`jstack-app/data/mock/fixtures/settings.json`, `jstack-app/components/settings/Schedules.tsx`,
`jstack-app/components/today/NeedsYou.tsx`, `jstack-app/lib/cardVerbs.ts`; tests
`jstack-app/tests/unit/needsYouSchedule.test.ts` (new), `jstack-app/tests/unit/stores/settings.test.ts`,
`jstack-app/tests/native/screens.test.tsx`; `CONTRACT.md` §4.9's quiet-hours row, `HANDOVER.md` §2 step 6 and §4's settings row, `history/v2/CONTROLS_v2.md` §7.9,
`jstack-app/CODEMAP.md` §4; `openapi.yaml`, the request schemas and the maps regenerated; the mock rebuilt.

*Commit:* `feat(v2.3.2): wps-1 — Needs you's schedule in Settings › Schedules, and Today holds the cards outside it`.

### WP-T — `v23/wpt`, worktree `v23-wpt`

Round v2.3.2, 16 Sep 06:40, Josh's own stage definitions replacing HANDOVER.md §1's V2–V5 wording verbatim
("V1: stand up aws env, security, openclaw, memory, telegram (mvp), infisical, connect input sources. V2:
user interface Jstack app... V3: multi agent... V4: cost optimisation... V5: review and refinement of the
whole stack"), plus: "Make questions and decisions needed more prominent early in. Emphasise security and
threat protection needs their full review early — don't assume the current code does this," and appendix
files "for 'claude defined user stories (draft)', notes on JO preferences, and anything they might want to
dig into if they need more context from me — I don't like repeating myself."

**WPT-1 · `HANDOVER.md` renumbered and rewritten: questions and security first, the real V1–V5, an
appendix.** Ten sections now, in this order: §1 Questions for you, and decisions you must make (new — seven
rows gathered from the file's own open points and `KNOWN_GAPS.md` §3–§4: hosting, the dictation approach, the
unreachable-lock threat model, prompt injection on shared content, the two phone checks, the voice
provider/Web Push vs APNs, the Google Calendar account); §2 Session security (moved up from the old §5,
opening with "review the whole security design before you rely on any of it... nothing here proves a server
is secure," its own open-question rows pulled out to link back to §1 instead of repeating them); §3 The plan
by stage — V1 to V5, Josh's own five stages verbatim (tidied only) as a table with the app's part in each,
the old V4 "unstaged hardening" wording folded into V5's app-part cell, "what works at the end of each
stage" re-keyed to the five; §4 Run it (was §2); §5 The build (was §3); §6 What the backend must provide
(was §4); §7 Carried and not received (was §6); §8 Agent prompts (was §7, its own internal §-citations moved
with it); §9 Reference files (was §8); §10 a new Appendix, one line each for three new files under
`appendix/`. A re-tag note is in §0 (before §1) and at the top of `DONE_v23.md`'s v2.3.1 section, since
`DONE_v23.md` has no separate v2.3.2 section to carry it. 1092 prose words, against the 4,000 cap (unchanged
from WP-Q's convention).
*Guards renumbered, not weakened:* `handover.test.ts`'s RM-01 (`§2`→`§4` for "run it", `§4`→`§6` for "what the
backend must provide") and RM-02 (its slice boundary moved the same way); `consolidation.test.ts`'s "names the
consolidated set" check (`§8`→`§9`). `tools/gen-handover-html.mjs`'s tab-2 extractor, hardcoded to a section
NUMBER twice now across two rounds, is rewritten to match the heading TEXT ("run it") instead, so the next
renumbering does not break it a third time. Two headings needed a keyword phrase restored for the
picture-embedding match sonnet 1's tool does by keyword: §2's "Session security" and §3's "(stage 2 is now)" —
both dropped when this round's rewrite touched those exact headings; put back, and the rendered page checked
by hand: §2 carries the lock-states picture, §3 the stage-2 picture, §5 the architecture picture, §6 the
offline-capture picture, all four correct.
*New:* `appendix/USER_STORIES_DRAFT.md`, `appendix/JO_PREFERENCES.md` (597 words, sourced from
`V23_REQUIREMENTS.md`, `history/v2/JOSH_QA.md`, `history/v22/JOSH_QA_v22.md`, `DECISIONS.md` ADR-70..75, and
`_v23-command/COMMAND.md` §0/§2), `appendix/CONTEXT_INDEX.md`.
*Blocked, noted, not silently worked around:* the brief's instruction to move `REMAP_v23/USER_STORIES.md`'s
content into `appendix/USER_STORIES_DRAFT.md` could not be followed as written — that path does not exist in
this repository (it belongs to the separate pack-building tree, `REMAP_v23/build_pack_v23.py`'s own
directory, outside this worktree). `appendix/USER_STORIES_DRAFT.md` is instead a fresh draft written from
`CONTRACT.md` and the acceptance tests, clearly marked as this build's own draft — whoever has access to the
real `REMAP_v23/USER_STORIES.md` should compare and replace it if the two disagree.
*Verified before report, top to bottom as REMAP's lead:* every path (`ls`), every command (`package.json`
scripts: `check`, `lint`, `test`, `test:e2e`, `serve:web`, `serve:mock`, `connect:check`, `build:web`,
`build:web:prod`), every number against its evidence file (142 markers against
`jstack-app/evidence/todo-backend-grep.txt`'s own line count), no other version name anywhere, every internal `§N`
citation resolved to the section it now names (checked by hand, listed above), the four pictures against
their sections. Full board both zones green: 2430 passed, 1 skipped by design / 2431, 127 suites — unchanged
from WP-Q's count, since this round touched no test file's case count.
*Commit:* `docs(v2.3.2): wpt-1 — questions and security first, Josh's real V1-V5, the appendix`.

**WPT-2 · QA fable 1 (acting planner): the FAIL above — T-4 asked to move `REMAP_v23/USER_STORIES.md`'s real
content into the appendix; WPT-1 shipped a fresh, unsourced 19-bullet reconstruction instead, self-flagged
as blocked.** Build sonnet 1 has direct filesystem access to that path — a Dropbox pack-building tree,
outside every git worktree, not reachable from `v23/wpt`. `appendix/USER_STORIES_DRAFT.md` now keeps its
heading and the two-sentence "draft written by the build, not by Josh" disclaimer; everything after is
`REMAP_v23/USER_STORIES.md`'s real content verbatim — 469 rows across the three acceptance-ID parts (V2,
V2.2, V2.3), copied by direct file concatenation and diffed byte-for-byte against the source rather than
retyped, so nothing invented remains. `build_pack_v23.py` (Dropbox, not run this round — the pack stays at
`v2.3.2` until the next tag) is changed so the pack's own User-stories tab reads this repo file from now on,
verbatim, no per-round substitution, since it is already dated and complete at the ref — T-4's last clause.
The dead V2.2-vintage substitution block that used to reconstruct `USER_STORIES.md` from a separate pack-side
source (a "Part C · V2.2" regex that had stopped matching anything, since that heading reads "Part B" today)
is removed with it. `appendix/JO_PREFERENCES.md` trimmed 624 → 597 words against T-4's under-600 cap, every
sourced rule kept, wording only tightened (WPT-1's own text above corrected from 594 to 597 to match).
*Quoted before:* `appendix/USER_STORIES_DRAFT.md`'s 19 "As Josh, I want X, so Y" bullets with no acceptance
IDs and no evidence/wire columns; `build_pack_v23.py`'s `read(V22 / "USER_STORIES.md")` plus a dead
`apply_subs()` block matching `^## Part C · V2\.2 — .*$`.
*Commit:* `docs(v2.3.2): wpt-2 — the appendix holds the real user stories`.

### WP-R — `v23/wpr`, worktree `v23-wpb`

Round v2.3.3 (Josh, 16 Sep 12:55: a new tag rather than a re-tag of v2.3.2), from `main` at the v2.3.2 tag,
`3fef302f`. Josh, 16 Sep, on his iPhone, on the mock built from `3fef302f`: the mic orb no longer floats — it sits in a
band with the demo strip, wasting space; it should be push-to-talk and do what Brain's "Dictate to EA" does; the mic
button in Dictate to EA is far too small and should be a large orb at the bottom centre, like Talk's; and focusing the
Brain dump or Find zooms the page, which stays zoomed and cropped after Enter.

**WPR-1 · The orb sat in a band the tab page kept for it, and looked the same at rest as pressed.** A6-07 (v2.3) had the
phone's tab page END above a 140 px band (`ORB_BAND`) so that neither the orb nor the demo watermark could cover a live
control; on a phone that band was a strip across the foot of every tab. `jstack-app/layout/TabScreen.tsx` runs the page to
the tab bar again, with a bottom PADDING of the orb's reach (`ORB_CLEARANCE` in `jstack-app/components/chrome/Orb.tsx`:
bottom 88, the 44 px circle, the 12 px press slop and the 8 px step — 152 px), so the last card still scrolls clear; the
page's margin is the toast's and the mic banner's only. The orb's drawn circle rests at 55 % with no shadow and, while held,
is opaque, carries the card shadow and grows 6 %; its press target reaches 12 px beyond the circle on every side (`hitSlop`
on a phone, a padded box on the web, where react-native-web ignores `hitSlop`). The demo watermark
(`jstack-app/components/chrome/DemoWatermark.tsx`) keeps its one-line caption and sits 2 px above the tab bar's top edge.
`jstack-app/e2e/core/identity.spec.ts`'s A-6 case asserted the band — the requirement this row replaces — and now asserts
the new one under its old title, which B-256 and B-260 cite: on every tab the page runs under the orb and the mark, and
scrolled to its end its last card sits above both. `history/v2/CONTROLS_v2.md` describes `mic-orb` as push-to-talk. Its
testID is a literal on the shared control's tag, so QA-01 finds it from the document; its handlers are `onPressIn` and
`onPressOut`, which the source-to-document scan does not read as a press, so `mic-orb` leaves that direction, as
`dictate-mic` does in WPR-3.
*Red first:* `jstack-app/tests/unit/orbPushToTalk.test.tsx` against `3fef302f` — "at rest the drawn circle is about
half-transparent with no shadow; held, it is opaque, lifted and 6% larger" (`Received: null`, no `mic-orb-circle`), "the
press lands 12 px or more outside the drawn circle on every side" (`TypeError: Cannot read properties of undefined (reading
'top')`, no `hitSlop`), and "the tab page reserves no band for the orb" (`Expected substring: not "ORB_BAND"`). On this tree
the old A-6 assertions failed at 393 with `"overlaps": true` for `tab-screen-today` — the band gone; the new first check,
that the page runs under the orb, is the negation of the `scrollBox.bottom <= orb.y + 1` the `3fef302f` board passed.
*Commit:* `fix(v2.3.2): wpr-1..4 — the orb floats and is push-to-talk, Dictate to EA's large orb, the keyboard shares the screen`.

**WPR-2 · The orb was a toggle, not push-to-talk.** At `3fef302f` a tap on `mic-orb` started Brain dictation and a second
tap stopped it. `jstack-app/lib/pushToTalk.ts` (`useBrainPushToTalk`) opens a Brain session through `jstack-app/lib/mic.ts`
on press-in — keep-awake, the lock rules and the release on every way out come with the one owner — and on release closes
it, waits for the session to end (the last words can arrive after the stop), and files what it heard with the Brain store's
`dump("voice", …)`: `POST /brain/dump` with `source: "voice"`, and the offline queue and the toast every capture gets. A
release inside 250 ms is a tap — the microphone closes and nothing is filed — and a hold that heard nothing files nothing.
The orb stays mounted through its own hold (at `3fef302f` it vanished the moment any microphone opened, which would take
the release with it) and still stands down for another surface's microphone, an overlay and a phone toast.
*Red first:* `jstack-app/tests/unit/orbPushToTalk.test.tsx` against `3fef302f` — "press-in opens a Brain session; a release
after a real hold closes it and files what was heard, as voice" (`Expected: ObjectContaining {"purpose": "brain"}`,
`Number of calls: 0`) and "a tap shorter than a hold closes the microphone and files nothing" (`Number of calls: 0`); "a
hold that heard nothing files nothing" was green before and after.
*Commit:* the same.

**WPR-3 · Dictate to EA's microphone was a small button inside its field.** The control Josh called far too small is the
mic at the right of the Dictate to EA sheet's "Say it or type it" field (his second screenshot, through the planner).
`jstack-app/components/chrome/Orb.tsx` now exports the drawn orb and its press target as `OrbControl`, which the floating
orb renders, and `jstack-app/components/brain/DictateDialog.tsx` renders the same control at Talk's 96 px, centred in the
sheet's foot — a `footer` on `jstack-app/components/chrome/Dialog.tsx`, below the scrolling content, which on a phone is
the bottom of the screen Josh asked for — as `dictate-mic`: press-in starts the sheet's dictation through `useDictation`, the release stops it
(`stopMicFor("dictate")`, which reads no render's state, so a tap too quick for a re-render cannot open a second session),
and the words land in the field for review as they did — nothing reaches the thread until the field's arrow. MC-02's state
reads under the orb, and the floating orb stands down while the sheet is open, as over any overlay. The first cut read R-3
as Brain's tab and put a large orb in the floating orb's place there; that is gone, and every tab carries the floating orb.
`jstack-app/e2e/core/talk.spec.ts`'s TS-04 case toggled the old button with two clicks — the interaction this row
replaces — and now holds the orb with the mouse down while the words arrive, and lets go to stop.
*Red first:* `jstack-app/tests/native/dictateOrb.test.tsx` against `3fef302f`'s sheet and the first cut's tabs — "the orb
is Talk's size, centred in the sheet's foot below its scrolling content, and the field keeps only its arrow" (`Unable
to find an element with testID: dictate-mic-circle`; then, against the orb under the field, `Unable to find an element
with testID: dictate-dialog-footer`), "a hold starts the dictation, the words land in the field, and the release stops it — nothing
reaches the thread" (`Expected: ObjectContaining {"purpose": "dictate"}`, `Number of calls: 0`), and "the tabs keep the
floating orb on every tab, Brain's included, and the tab page pads for that one alone" (`Expected pattern: not /<Orb
variant=/`).
*Commit:* the same.

**WPR-4 · Focusing Brain's field or Find zoomed the phone, and Enter left the page zoomed and cropped.** TE-01 (v2.2)
answered iOS's focus zoom in the head alone (`maximum-scale=1`) and kept inputs at the pack's 12.5 px; the mock built from
`3fef302f` still zoomed. At the root: (a) `jstack-app/theme/ui/fields.tsx` renders its input at 16 px or more on the web
(native keeps the body size), and a static guard proves `Field` renders the only text input in the app; (b) the tab bar
and the orb ride where the visual viewport ends while the keyboard is up (`useKeyboardBottom` in `jstack-app/lib/keyboard.ts`,
from the `visualViewport` subscription the expanded editor already used) and stand down over the expanded editor, which
owns that band (UX-02), as the watermark already did (TE-03); (c) Enter, or leaving a field once the collapse's grace has
passed, scrolls the page back to the top (`resetPageScroll`); (d) the viewport meta in `jstack-app/tools/build-web.mjs` and
`jstack-app/tools/build-mock.mjs` keeps `viewport-fit=cover` and gains `interactive-widget=resizes-content`. The first cut
of (b) and (c) lost two presses on e2e run 1 at 393, `jstack-app/e2e/core/textentry.spec.ts:91` (`waiting for
getByTestId('toast')`) and `:157` (`Received: "Quiet day, good progress."`): the reset also rewrote the keyboard band at the
blur, which moved the button beside the field before the press landed, and the tab bar rode up over the expanded editor's
foot. The reset now leaves the band to the viewport's own events and waits for the grace, and the bar and the orb stand
down over the editor. TE-01's e2e case asserted body-size inputs — the requirement this row replaces — and now asserts 16 px
or more and the two meta parts; `jstack-app/design/DISCREPANCIES.md` row 23 says so. At 16 px Find's desktop question ran
18 px past its field at 1366 (`jstack-app/e2e/core/brain.spec.ts` BR-04, `"over": 18` on e2e run 2), so every web page now
asks the phone's shorter one (`jstack-app/components/brain/Find.tsx`). What only a real phone proves: that iOS Safari no
longer zooms, that the tab bar and the orb sit above the real keyboard, and that the page is whole after Enter —
Playwright's WebKit has no soft keyboard and never zooms on focus, and iOS Safari does not honour `interactive-widget`;
`DEVICE_RUNBOOK.md` §2 asks for it by hand.
*Red first:* `jstack-app/tests/unit/keyboardZoom.test.tsx` against `3fef302f` — "on the web a Field's input renders at 16
px or more" (`Expected: >= 16`, `Received: 12.5`), the Enter and leave cases (`Expected: 0, 0`, `Number of calls: 0`), the
tab bar (`Expected: 304`, `Received: 0`) and the orb (`Received: 0`, once its lookup reached the positioned ancestor —
and, since WPR-3, read the styleless `OrbControl` between them as having no bottom rather than throwing);
`jstack-app/tests/unit/pwa.test.ts` › "WPR-4 · the viewport meta resizes the content for the keyboard, and still covers the
notch" (`Received string: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"`);
`jstack-app/e2e/core/keyboard.spec.ts` in WebKit at 393 (`expect(size).toBeGreaterThanOrEqual(16)`, `Received: 12.5`).
Against the first cut: "leaving a field … once a press that took the focus has landed" (`Expected number of calls: 0`,
`Received number of calls: 1`) and "over the expanded editor the tab bar and the orb stand down", with the two e2e cases
above. The static guard first matched `useRef<TextInput | null>` in `jstack-app/components/today/CloseDay.tsx` and was
narrowed to a JSX tag before any fix; it is green on `3fef302f` too, where every input already came through `Field`. The
visual-viewport subscription case was green before and after.
*Commit:* the same.

**WPR-5 · The Gantt handle cases read the drag's result before it existed.** Three full boards on `311ed6f8` failed
the same case — `jstack-app/e2e/core/gantt.spec.ts`'s "GT-04/GT-05 … dragging the end handle moves only the end" at
w1366-light, `Expected: "2026-09-20"`, `Received: "2026-09-19"` — while the case run alone was green. Two readings
were wrong before the right one. That a loaded board had dropped the second move of the gesture: the same gesture
driven in `{ steps: 4 }` with an animation frame before the release went 2 red of 10, and the untouched gesture went
1 of 10 on the same idle machine, so the board's load was never the variable. And that +28 px sat exactly on
`components/tasks/GanttBar.tsx:116`'s day-rounding boundary, `Math.round((pointer − press) / DAY_WIDTH)` with
`DAY_WIDTH` 28: at +34 px, clear of the boundary, the end case still went 2 of 10.
What settled it was measuring the responder instead of theorising about it. Temporary probes on GanttBar's grant, its
moves, `onStart`, every `onMove` with its `d`, `onTap`, `onDrop` and terminate, with the end case printing one
self-classifying line per repeat: 7 green and 3 red, and all ten BYTE-IDENTICAL in the gesture —
`GRANT pageX=536`, which is the press position and not the first move (so the origin is captured where the finger
went down, and B-46's stolen-grant mechanism has stayed fixed), `onMove … d=1` on both moves, and
`onDrop moved=1 edge=end` in the RED repeats as well, with `detail=0` — no card opened, so no tap path. The app
computed and committed the one-day resize every single time.
What a red repeat differs in is only the READ. `dates()` reads the mock's own state, the commit is a store → adapter
→ mock round trip, and both handle cases read it once, immediately after `mouse.up()`. The bar drag at `:156` awaits
its undo toast before reading and has never flaked. Both handle cases poll for the moved edge now — `expect.poll`,
the idiom already at `:162` — and then read the other edge, which is unchanged. The gesture stays at +28, the app is
untouched, and nothing either case asserts changed.
*Red first:* the shipped case at w1366-light with `--repeat-each=10` under E2E_LOCK, 3 of 10 red
(`Expected: "2026-09-20"`, `Received: "2026-09-19"`), with the probe showing `onDrop moved=1 edge=end` in each of
those three — the proof that what failed was the read and not the drag. After the poll: the end handle 0 of 10 red,
the start handle 0 of 10, and the whole gantt file 7 skipped 25 passed (38.6s).
*Files:* `jstack-app/e2e/core/gantt.spec.ts`.
*Commit:* `test(v2.3.2): wpr-5 — the Gantt handle cases await the write they read`.

**WPR-6 · A hold released after the app locked dropped the spoken words (the audit's R5-05).** `lib/pushToTalk.ts` fired
`void useBrainStore.getState().dump("voice", text)` on release; while the session is locked — a device lock or leaving the app
mid-hold with `lockOnHideTouch`, the emergency lock, a relock — the gate refuses `POST /brain/dump` (`lib/lockGate.ts`,
`LockedError`) and the rejection was unhandled: no toast, no draft, the words gone. Now a refused or failed filing keeps the
words as Brain's own draft (only when the field is empty, so nothing typed since is overwritten) and the toast says "Locked ·
your words are kept in Brain"; the next unlock finds them in the field. Nothing changes while unlocked.
*Red first:* `tests/unit/orbPushToTalk.test.tsx` — "WPR-6: a hold released after the app locked keeps its words as Brain's
draft and says so, and files nothing", with the gate closed by `setLockSource(() => true)`: on the tree before the fix it printed
`"draft": ""` and no toast of the lock's (the case fails; with the fix reversed again after landing, `1 failed, 6 skipped`).
*Commit:* `fix(v2.3.2): wpr-6..8, wpt-3 — the audit's round 5: a locked hold keeps its words, the budget, the scroll case, the document lines`.

**WPR-7 · One loaded board timed `orbPushToTalk.test.tsx` out (the audit's R5-01).** A case that runs in 177 ms alone hit
Jest's 5000 ms under a full board beside the audit's own runs. The file carries `jest.setTimeout(60_000)`, the budget WPI-3 gave
the fresh-app cases; nothing asserted changed. *Red first:* the audit's board, `thrown: "Exceeded timeout of 5000 ms for a test."`
*Commit:* the same.

**WPR-8 · The visual viewport's "scroll" half had no case (the audit's R5-08).** `lib/keyboard.ts` subscribes to `resize` and
`scroll` — the comment says why: iOS scrolling the page up under the keyboard fires only `scroll`, and that is when `offsetTop`
moves — but `tests/unit/keyboardZoom.test.tsx`'s "resize and scroll" case drove `resize` alone, so the scroll listener could go
and every board stay green. The case now moves `offsetTop` and fires `scroll`, and asserts the unsubscribe of both.
*Red first:* with `vv.addEventListener("scroll", onChange)` planted out, `Expected: "function"` / `Received: "undefined"`.
*Commit:* the same.

**WPR-9 · With a draft already typed, a locked release still dropped the spoken words and said they were kept (the audit's R5b-01).**
WPR-6 kept the words only when the field was empty — the right half of "never overwrite a newer draft", with the wrong other
half: the words went nowhere, and the toast claimed otherwise; the same sentence also read "Locked" on any throw while unlocked.
Now the words join the existing draft on a new line, nothing spoken is dropped either way, and the toast names the reason —
"Locked · your words are kept in Brain" while the session is locked or in the emergency state, "Not sent · your words are kept in
Brain" otherwise. *Red first:* `tests/unit/orbPushToTalk.test.tsx` — "WPR-9: a locked release with a draft already in the field
keeps both" printed `"draft": "a note I typed first"` where the words should have joined it. *Commit:* `fix(v2.3.3): wpr-9 — a
locked release keeps the spoken words beside a typed draft; two document lines`.

**WPT-3 · The audit's document lines (R5-02, R5-03, R5-04, R5-06, R5-07).** `appendix/USER_STORIES_DRAFT.md` gains a guard
(`consolidation.test.ts` RM-11: at least 400 acceptance-ID rows and the three parts — reverting it to the 37-line sketch had
left every test green); the native-crypto guidance the consolidation had dropped is back as one paragraph in `HANDOVER.md` §7
("Native crypto — what to add") and `KNOWN_GAPS.md`, `NATIVE_RUNBOOK.md` and `lib/encryptedStore.ts`'s comment cite it there;
`BACKEND_HANDSHAKE.md`, `DONE_v23.md` and `CONTRIBUTING.md` cite `HANDOVER.md` §4 where they said §1.3 and §1.7;
`history/v2/QA_REPORT_v2.md` dates the evidence 2026-09-16 and `QA_REPORT_v22.md` names the commits the summaries were committed at;
`KNOWN_GAPS.md` carries WPR-4's phone-only checks as a row with Josh as owner; `appendix/JO_PREFERENCES.md` cites in-repo
sources only (586 words). *Red first:* RM-11 against the sketch; the rest are document lines. *Commit:* the same.
