# Running JSTACK locally on Josh's real data

This page shows how to run the app on your own machine, talking to Josh's n8n through the local proxy. Nothing
here is for production (that's nginx; see `CLAUDE.md` §5).

**This is live data.** Anything you approve, tick, edit, capture or block really goes to Josh's
systems: Twenty, Google Calendar, Gmail Drafts, and the EA's inbox. See "What not to click" at the
bottom before you try the buttons.

## What you need, once

- Node 20 or newer and pnpm 10. On Windows, if `corepack enable` fails with `EPERM`, see
  `remap/PROGRESS.md` › Toolchain.
- The app's packages. In `jstack-app/`, run `pnpm install --frozen-lockfile`.
- **`remap/.env.local`**: copy `remap/.env.local.example` and fill in three values. Ask whoever holds
  the n8n credential for them; never commit this file, it's gitignored.
  - `N8N_BASE`: Josh's n8n address, with no trailing slash.
  - `N8N_AUTH_HEADER` and `N8N_AUTH_VALUE`: the header name and value from the "JSTACK Webhook Auth"
    credential.
  - Leave `PROXY_PORT=8787`.
- Optional: **`jstack-app/.env.n8n.local`** (gitignored). The app works without it. It holds public
  settings only, never a secret:
  - `EXPO_PUBLIC_TWENTY_APP_URL=https://…`: Josh's Twenty address. This adds the "open in Twenty"
    links and the Twenty portal on Agents.
  - `EXPO_PUBLIC_N8N_RECORDS_NAMESPACE=dashtest-<you>`: keeps your settings, layouts, goals and habit
    ticks in a test corner of the records store, apart from Josh's. **Use it whenever you test.** It
    covers only those records, nothing else.

## Start it

You need two terminals.

**1. The proxy** (from the repo root):

```
node remap/dev-proxy.mjs
```

It prints `dev-proxy on http://127.0.0.1:8787/n8n/{calendar,tasks,…} → <your n8n>`. Leave it running.
Each call the app makes shows up as one line (`tasks → 200 640ms`). That's the quickest way to see what
the app is doing.

**2. The app** (from `jstack-app/`), pick one of these:

- **Dev server** (reloads when you edit code): `pnpm web:n8n`. Expo prints the address, usually
  `http://localhost:8081`.
- **The built app** (what the checks use; a bit faster): `pnpm web:n8n --build`, which takes about
  a minute, then `pnpm web:n8n --serve`. Open `http://localhost:4174`. Run `--build` again after any code
  or `.env.n8n.local` change.

Stop either one with Ctrl+C.

## Open it

- Open the address in **Chrome** and type **`localhost`**, not `127.0.0.1`. On 127.0.0.1 the passkey
  can't run and the app stays locked.
- **Unlock:** tap anywhere on the lock screen. The first time, Windows Hello (or Touch ID) asks you to
  create a passkey for this site. After that, the same tap unlocks with it.
  - Each address gets its own passkey, so `:8081` and `:4174` each ask once.
  - There's no demo sign-in in this mode.
  - If Chrome says no passkey can be used, the machine has no Windows Hello set up. Set up a PIN in
    Windows › Accounts › Sign-in options.
- **Brisbane time.** The app is built for Brisbane (UTC+10, no daylight saving). If your machine is on
  another time zone, "today", the calendar and due dates shift. Either:
  - **Machine-wide (easiest):** Windows › Settings › Time & language › Date & time › Time zone
    "(UTC+10:00) Brisbane". Turn off "Set time zone automatically" first, then restart Chrome.
  - **This tab only:** open DevTools (F12) › ⋮ › More tools › **Sensors** › Location: pick *Other…* and
    set **Timezone ID** to `Australia/Brisbane`, then reload. It only lasts while DevTools stays open
    on that tab.
  - To check: in the DevTools console, `Intl.DateTimeFormat().resolvedOptions().timeZone` should print
    `Australia/Brisbane`, and Today's heading should show Brisbane's day.

## What to check on each tab

Every tab has the same top row:
- The focus chips (Everything, Personal, Family, Work) filter what's shown.
- **Arrange** (the grid icon) reorders and hides sections; it's saved in the records store.
- **Help** and **Theme**.

"Real" below means the button changes Josh's data.

**Today**
- *Needs you*: the EA's cards, from the actions store. It shows `0` until the EA writes a card. *history*
  lists the answered ones. Approve, Never and Later are **real**: an approved email becomes a Gmail draft
  that Josh sends himself.
- *From your EA*: the EA's open insight and replies, from the brain store. Empty until the EA writes one.
  - *Block it* is **real**: it makes a protected event in Google Calendar.
  - *Leave it* and *Dismiss* answer the EA.
  - *Talk with EA* opens a screen saying two-way voice isn't in this build.
  - *Dictate to EA* sends a line to the EA (**real**: it lands in the EA's inbox) and shows the thread.
    The EA's answer arrives later, in the same thread.
- *All calendars* and *Calendar*: Google Calendar; Today, 3 days, Week and Month; "Free until …" for the
  gaps. Check the times are Brisbane's.
- *Your tasks*: Twenty tasks due soon. Ticking one completes it in Twenty (**real**).
- *At a glance*:
  - Habits: tracked habits done today.
  - People `0`: no source yet (N8N-17).
  - Money: blank, it's V5.
  - Goals.
- *Close the day*: the habit chips are ticks in the records store. "How was today?" sends a journal line
  to the EA's inbox (**real**).

**Tasks**
- List, Board, Gantt and Done, all from Twenty. The heading reads "N open · M waiting".
- The default slicer, *Next 90 days*, hides overdue tasks. That's Josh's spec (TF-01).
- Opening a task and changing its title, status or due date saves to Twenty (**real**).
- These are refused with "Couldn't · …": priority, moving a card to another stage, dragging a Gantt bar
  (N8N-14/15).
- *Waiting on › Draft a nudge* says "Couldn't · not connected yet".

**Brain**
- The *Mind dump* box files a capture for the EA (**real**). It shows "→ filing · Librarian" until the EA
  files it.
- *Latest in* and *Replies*: from the brain store.
- *Memory*: "Not connected yet".
- *Files*: Dropbox metadata only, empty for now.
- *Find*: searches nothing yet (N8N-18).
- *edit* on an item, and *configure › save*, say "Couldn't · not connected yet" (N8N-20).

**Life**
- *Goals* and *Habits*: the records store.
- *People*: empty (Josh's decision, N8N-17).
- *Money* and *Health*: later (V5). Health shows its own "when the health source is gated in" line.
- *Learning*: empty.
- *configure › save* says "Couldn't · not connected yet".

**Agents**
- The heading says "not connected yet".
- *Runs and spend*, *Spend*, *Agent issues*, *Last 24 hours* and *Security checks* each say "Not connected
  yet". Nothing claims to be healthy.
- *Portals*: Gmail, Calendar and Dropbox open in a new tab. Twenty appears once
  `EXPO_PUBLIC_TWENTY_APP_URL` is set.
- *Decision history*: the answered cards. *reopen* says "Couldn't · not connected yet".
- *Usage*: empty. *Copy as CSV* says "Nothing to copy".
- *Emergency lock*: hold *Hold to lock* for 1.2 s. It asks for the passkey, then says "Nothing was locked
  · the server said: not connected yet". The app stays unlocked and working.

**Settings** (the rail, or the gear icon on a phone)
- Theme, devices, sync, privacy blur, quiet hours, autonomy, rules, the lock and voice settings. All of
  them save to the records store.
- The autonomy toast says "enforced server-side", but nothing enforces it yet (N8N-21).

**Find** (the rail, or the search icon on a phone): searches nothing yet (N8N-18).

**Everywhere**
- Check that the DevTools console stays empty.
- Check that no button ever gives the red "Something broke" screen.
- A refused write says "Couldn't · <reason>" and the screen goes back to how it was: a card returns to
  its column, a tick unticks.

## What not to click (on Josh's real data)

On Josh's real data, these buttons really do something. Use a `dashtest-` card or task, or leave them
alone:

- **Approve, Never or Later on a card Josh hasn't seen.** The EA acts on answered cards.
- **Undo right after approving an email.** The card goes back, but the Gmail draft stays (N8N-19).
  Delete it from Gmail Drafts by hand.
- **Ticking a task, or editing its title, status or due date.** It changes Twenty. A test task can't be deleted
  afterwards either: Twenty answers the workflow PERMISSION_DENIED. Use a task named `[DASHTEST] …` and
  delete it in Twenty by hand.
- ***Block it* on a real insight.** It makes a Google Calendar event.
- **Mind dump, "How was today?" and Dictate to EA.** Each one lands in the EA's inbox. Start the text with
  "dashtest" and tell whoever runs the EA.
- **Settings, Arrange, goals and habits, without `EXPO_PUBLIC_N8N_RECORDS_NAMESPACE`.** They save into
  Josh's own records.

These are harmless: they say "Couldn't · …" and nothing changes. Priority, moving a card to another
stage, Gantt drags, *reopen*, *Draft a nudge*, *configure › save*, editing a Brain item.

## When something looks wrong

| You see | It means |
|---|---|
| "Not connected yet" on a section | That section has no n8n source yet. This is on purpose, not a failure (`KNOWN_GAPS.md` N8N-2). |
| "Coming soon" from the floating mic | Voice isn't in this build (ADR-92). |
| "Couldn't · …" toast after a button | The write was refused or isn't connected; the screen goes back to how it was. The reason is after the dot. |
| "offline · captures queue" in the rail, or a tab saying "You're offline" or "Couldn't load · tap to retry" | The proxy isn't running, or `N8N_BASE` is wrong. Check the proxy's terminal. |
| The proxy logs `404` (`NOT_ALLOWED`) for a key | The app asked for a key the proxy doesn't allow. The allow-list is in `remap/dev-proxy.mjs`, and must match `data/n8n/registry.ts` and nginx. |
| The proxy logs `401`/`403` from n8n | `N8N_AUTH_HEADER`/`N8N_AUTH_VALUE` are wrong. |
| The lock screen won't unlock | You're on `127.0.0.1` (use `localhost`), or Windows Hello isn't set up. |
| An old version after a change | Run `pnpm web:n8n --build` again (the served app is a snapshot). |
