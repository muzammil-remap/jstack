/**
 * `pnpm web:n8n` — runs the app on REMAP's n8n build (ADR-76) with its settings on the command,
 * never in `.env.local`.
 *
 * Why not `.env.local`: Expo loads it for `expo start` AND for `expo export` (`@expo/env` reads it
 * in every mode but `test`), so a data source set there would quietly turn `node
 * tools/build-web.mjs` — the mock build the gates and the e2e board run — into an n8n build. The
 * settings live in `.env.n8n.local` instead: a name neither Expo nor Jest reads, gitignored like
 * every `.env.*`, and passed only to the command that should see them. Its keys are the
 * `EXPO_PUBLIC_*` names in `CONTRIBUTING.md`; `EXPO_PUBLIC_DATA_SOURCE` is always `n8n` here, and
 * `EXPO_PUBLIC_N8N_BASE_URL` defaults to the local proxy (`node ../remap/dev-proxy.mjs`).
 *
 *   node tools/web-n8n.mjs          → `expo start --web --clear` on n8n (the dev server)
 *   node tools/web-n8n.mjs --build  → the test-flavoured export on n8n, into ~/.jstack-dist-n8n
 *   node tools/web-n8n.mjs --serve  → serves that export on http://localhost:4174
 *
 * Metro's transform cache does not key the inlined `EXPO_PUBLIC_*` values (`metro.config.js` says
 * so; on 29 Sep an n8n export came out with the mock build's `DATA_SOURCE = "mock"` compiled in).
 * Worse is the other direction: n8n values cached where the next mock build would pick them up.
 * So this tool gives Metro a cache of its own — `os.tmpdir()`, where Metro keeps it, pointed at
 * `~/.jstack-metro-n8n` — and empties it before every n8n build; the mock builds' cache never sees
 * an n8n value. The export goes to its own directory for the same reason. No secret belongs in
 * `.env.n8n.local`: the header auth lives in `remap/.env.local`, which only the proxy reads.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const settingsFile = join(app, ".env.n8n.local");

/** `KEY=value` lines, `#` comments; only the app's public names are taken, so a secret pasted in
 * here by mistake never reaches a bundle. */
function settings() {
  if (!existsSync(settingsFile)) return {};
  const out = {};
  for (const line of readFileSync(settingsFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m != null) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Metro's cache, and every other temp file of the run, away from the mock builds' (`TMPDIR` is what
 * `os.tmpdir()` reads on macOS and Linux, `TEMP`/`TMP` on Windows). */
const temp = join(homedir(), ".jstack-metro-n8n");
rmSync(temp, { recursive: true, force: true });
mkdirSync(temp, { recursive: true });

const env = {
  ...process.env,
  EXPO_PUBLIC_N8N_BASE_URL: "http://127.0.0.1:8787/n8n",
  ...settings(),
  EXPO_PUBLIC_DATA_SOURCE: "n8n",
  JSTACK_DIST: process.env.JSTACK_N8N_DIST ?? join(homedir(), ".jstack-dist-n8n"),
  TMPDIR: temp,
  TEMP: temp,
  TMP: temp,
};

/** Node runs directly — a shell would split `C:\Program Files\nodejs\node.exe` at the space — and
 * `npx` through the shell, which is how Windows finds `npx.cmd`. */
const node = (script, ...args) => spawnSync(process.execPath, [join(app, "tools", script), ...args], { cwd: app, stdio: "inherit", env });
const npx = (...args) => spawnSync(`npx ${args.join(" ")}`, { cwd: app, stdio: "inherit", shell: true, env });

const res = process.argv.includes("--build") ? node("build-web.mjs") : process.argv.includes("--serve") ? node("serve-web.mjs", "4174") : npx("expo", "start", "--web", "--clear");
process.exitCode = res.status ?? 1;
