# Deploying JSTACK with Dokploy

JSTACK is deployed as **one Docker container** built from the `Dockerfile` at the repo root. There's
no database or volume, and the container keeps no state. Inside it:

- the app's production web build (Expo, static files);
- `remap/deploy/server.mjs`, a small Node server with no dependencies. It does three things:
  1. It asks for a **site user name and password on every page** (HTTP Basic Auth). That password is
     the only lock in front of Josh's data. The passkey in the app only locks the device.
  2. It serves the app, with its security headers (CSP, HSTS, caching).
  3. It forwards the app's calls on `/n8n/<key>` to n8n's JSTACK webhooks, and adds the webhook auth
     header there. The browser never sees the n8n secret or an n8n path. Only 9 keys are allowed;
     anything else gets a 404.

The container listens on plain HTTP, port **8080**. Dokploy's Traefik provides the domain and HTTPS.

## Set it up in Dokploy

1. **Create an Application.** Provider: Git, this repo, the branch you were given.
2. **Build type: Dockerfile.** Docker file `Dockerfile`, build context `.` (the repo root).
3. **Environment variables** (runtime; these are the secrets):

   | Name | What it is | Example |
   |---|---|---|
   | `N8N_BASE` | n8n's address as the container can reach it. No trailing slash, and no `/webhook`. | n8n's public `https://…` address, or `http://<n8n service>:5678` if both are on Dokploy's network |
   | `N8N_AUTH_HEADER` | The header name of the n8n credential **"JSTACK Webhook Auth"** | from n8n › Credentials |
   | `N8N_AUTH_VALUE` | That credential's value | secret |
   | `BASIC_AUTH_USER` | The site's user name | `josh` |
   | `BASIC_AUTH_PASSWORD` | The site's password: **16 characters or more**, random | `openssl rand -base64 24` |
   | `PORT` | Optional; defaults to `8080` | |

   The container **refuses to start** if any of the first five is missing, or if the password is
   shorter than 16 characters. The log says which one.

4. **Build-time arguments.** These are compiled into the browser bundle, so **never put a secret
   here**:

   | Name | What it does |
   |---|---|
   | `EXPO_PUBLIC_N8N_RECORDS_NAMESPACE` | **For a test deployment, set `dashtest-deploy`.** Testers' settings, layouts, goals and habit ticks then go into a test corner of the records store instead of Josh's own. Leave it empty once Josh uses it for real. Changing it needs a rebuild. |
   | `EXPO_PUBLIC_TWENTY_APP_URL` | Twenty's web address, e.g. `https://twenty.…`. Turns on the "open in Twenty" links and the Twenty portal. Empty hides them. |

5. **Domain:** host `jstack.josh.useprivate.ai`, path `/`, **container port `8080`**, HTTPS on,
   certificate Let's Encrypt.
6. **Deploy.** The first build takes several minutes: it installs dependencies and runs the Expo export.
   **The build fails on purpose** if the bundle check finds any of these in what the browser would
   receive: an n8n path, a workflow name, the test hook, a dev address, or a missing `/n8n`. The log
   names the file and the finding.

## Check it after deploying

1. `https://jstack.josh.useprivate.ai/healthz` answers `ok`, without a password.
2. Opening the site shows the browser's user name and password prompt.
3. After that, the JSTACK lock screen appears. Tap it: the first time, Face ID, Touch ID or Windows
   Hello creates a passkey for the site. After that the same tap unlocks.
4. **Today** shows today's date (Brisbane) and the calendar. **Tasks** shows Josh's Twenty tasks.
   **Agents** says "not connected yet"; that's expected.
5. **The container log** has one line per n8n call, e.g. `tasks → 200 640ms`. It never logs request
   or response bodies.
6. Two quick refusals from a terminal:
   - `curl -i https://jstack.josh.useprivate.ai/` answers `401`.
   - `curl -i -u 'user:pass' -X POST -H 'content-type: application/json' -d '{}' https://jstack.josh.useprivate.ai/n8n/memory` answers `404`.

## When something is wrong

| You see | It means |
|---|---|
| Log: `jstack: not starting — … is not set` | A runtime variable is missing. Set it and redeploy. |
| Log: `tasks → 401` or `→ 403` | `N8N_AUTH_HEADER` or `N8N_AUTH_VALUE` is wrong. |
| Log: `tasks → 404` | The JSTACK-DASH workflow isn't active, or `N8N_BASE` includes `/webhook`. |
| Log: `tasks → failed … (network)` or `(timeout)` | The container can't reach `N8N_BASE`. |
| The app: "Couldn't load · tap to retry" on every tab | Same as the two rows above; check the log. |
| The browser keeps asking for the password | Wrong user name or password. |
| Build log: `bundle check FAILED` | Something that must never reach a browser got into the build. Don't bypass it; tell REMAP. |

## Updating

Push to the branch, then **Redeploy** in Dokploy (or turn on auto-deploy). The HTML is never cached,
so people get the new version the next time they open the app.

## Security notes

- **The site password is the only access control.** Use a long random one and share it only with
  the people who need it. Nothing locks an address out after wrong passwords; a long random password
  makes guessing impractical. If you want a limit anyway, add a Traefik rate-limit middleware in
  Dokploy. Before Josh uses this for real, he has to agree to the site password standing in for
  server-checked passkeys (`DECISIONS.md` ADR-77).
- **Only through Traefik.** Don't publish port 8080 on the host. The app won't make its data calls
  from a non-HTTPS page anyway.
- **Secrets live only in Dokploy's environment.** None are in the repo, the image or the bundle.
- **The allow-list:**
  - The keys are `remap/dev-proxy.mjs`'s `ALLOW`, minus `memory` and `people` (`remap/deploy/server.mjs`).
  - `jstack-app/tests/unit/n8nServe.test.ts` keeps it equal to the keys the app actually calls.
  - A workflow that sends email or messages, pays, books or revokes must never get a key.
- **Calls to `/n8n/…`:**
  - Only JSON, from this site's own pages. A form on another site can't send JSON, and the `Origin`
    header must match. This matters because the browser would attach the site password to that form's
    request.
  - Nothing from the browser is passed on to n8n: not the site password, not cookies.

## Building and running it without Dokploy

```
docker build -t jstack --build-arg EXPO_PUBLIC_N8N_RECORDS_NAMESPACE=dashtest-deploy .
docker run --rm -p 8080:8080 -e N8N_BASE=… -e N8N_AUTH_HEADER=… -e N8N_AUTH_VALUE=… \
  -e BASIC_AUTH_USER=… -e BASIC_AUTH_PASSWORD=… jstack
```

Then open `http://localhost:8080`. Browsers treat `localhost` as secure, so the passkey works there.

## What was tested, and what wasn't

On REMAP's machine (Windows, Node 24) these were checked:

- the production build with these settings, and the bundle check on it;
- the server in front of Josh's live n8n:
  - the password prompt, and the headers;
  - the refusals: `memory`, sending workflows, other sites, non-JSON, wrong methods, big bodies,
    `../` paths;
  - every tab at 1440 and 390 px on live data, with the console clean.

**The Docker image itself was never built:** that machine has no Docker. So the first Dokploy build is
the image's first build. If it fails, the build log names the step.
