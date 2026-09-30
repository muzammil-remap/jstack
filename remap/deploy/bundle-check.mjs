#!/usr/bin/env node
/**
 * The bundle check (Phase 7, ADR-93): after `build:web:prod`, nothing that reaches a browser may name an n8n
 * path, a workflow, the dev proxy or the test hook, and the app must call its own origin's `/n8n`. The Dockerfile runs it after the build, so an image with
 * any of them is never made.
 *
 *   node remap/deploy/bundle-check.mjs <export dir>
 *
 * It also looks for N8N_AUTH_VALUE when that is set (run it by hand with the value to check an export; the
 * image is built without it, so there it cannot be in the bundle by construction).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOW } from "../dev-proxy.mjs";

const TEXT = /\.(html|js|css|json|webmanifest|map|txt|svg)$/i;

export function bundleProblems(dir, secret = process.env.N8N_AUTH_VALUE) {
  const needles = [
    ["an n8n webhook path", /webhook\//i],
    ["a JSTACK workflow name", /jstack-dash-|jstack-memory-search|jstack-(calendar-create|gmail-compose|gmail-reply|dropbox-fetch)|send-or-queue/i],
    ...Object.values(ALLOW).map((path) => [`the workflow path ${path}`, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")]),
    ["the test hook (__JSTACK__)", /__JSTACK__/],
    ["the dev proxy's address", /(127\.0\.0\.1|localhost):878\d/],
    ...(secret ? [["the n8n auth value", new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))]] : []),
  ];
  const problems = [];
  let namesProxy = false;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const file = join(d, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (TEXT.test(name)) {
        const text = readFileSync(file, "utf8");
        for (const [what, re] of needles) if (re.test(text)) problems.push(`${relative(dir, file)}: ${what}`);
        if (/.js$/i.test(name) && text.includes('"/n8n"')) namesProxy = true;
      }
    }
  };
  walk(dir);
  // the app must call its own origin: a build without the literal "/n8n" was given another base URL (on
  // Windows, Git Bash rewrites a leading slash to C:/Program Files/Git/… unless MSYS_NO_PATHCONV=1)
  if (!namesProxy) problems.push('the app never names "/n8n": EXPO_PUBLIC_N8N_BASE_URL was not the same-origin /n8n');
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node remap/deploy/bundle-check.mjs <export dir>");
    process.exit(2);
  }
  const problems = bundleProblems(dir);
  if (problems.length > 0) {
    console.error(`bundle check FAILED — ${problems.length} finding(s):\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`bundle check: clean (${dir})`);
}
