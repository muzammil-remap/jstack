/**
 * D-1 — `pnpm serve:mock` stands the real mock up as a server a conformance
 * run (or a browser) can point at, the way `tests/unit/conformance.test.ts`
 * does in-process. This spawns the actual command, waits for the base URL
 * it prints, hits it over real HTTP, then kills the whole process tree —
 * `tools/serve-mock.mjs` shells out to a `jest --runInBand` child to host
 * the rig, so killing only the direct child would leave that grandchild
 * bound to the port.
 */
import { execFile, spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const root = join(__dirname, "..", "..");
const CMD = join(root, "tools", "serve-mock.mjs");

function killTree(child: ChildProcessWithoutNullStreams): void {
  if (child.pid == null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

/** Spawns `node tools/serve-mock.mjs <args>` and resolves with its base URL
 * once the rig prints it, or rejects if the process exits first. */
function startServeMock(args: string[]): Promise<{ child: ChildProcessWithoutNullStreams; base: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CMD, ...args], {
      cwd: root,
      detached: process.platform !== "win32",
    });
    let out = "";
    let settled = false;
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      const m = /JSTACK_MOCK_BASE=(\S+)/.exec(out);
      if (m && !settled) {
        settled = true;
        resolve({ child, base: m[1] });
      }
    });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf8")));
    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`serve-mock exited (code ${code}) before printing its base URL:\n${out}${err}`));
      }
    });
  });
}

describe("D-1 · pnpm serve:mock", () => {
  it("serves /capabilities in its default (non-test) shape, then can be killed", async () => {
    const { child, base } = await startServeMock(["--port", "0"]);
    try {
      const res = await fetch(`${base}/capabilities`);
      const json = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(typeof json.liveRouting).toBe("boolean");
      expect(typeof json.fileStore).toBe("boolean");

      // D-1: rig routes are refused unless --test was passed.
      const rig = await fetch(`${base}/__test__/user`, { method: "POST", body: "{}" });
      expect(rig.status).toBe(404);
    } finally {
      killTree(child);
    }
  }, 60_000);

  it("serves the test-only rig routes when started with --test", async () => {
    const { child, base } = await startServeMock(["--port", "0", "--test"]);
    try {
      const res = await fetch(`${base}/__test__/user`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).not.toBe(404);
    } finally {
      killTree(child);
    }
  }, 60_000);
});

describe("D-2 · pnpm connect:check", () => {
  const evidenceDir = join(root, "evidence", "connect", new Date().toISOString().slice(0, 10));

  afterEach(() => {
    if (existsSync(evidenceDir)) rmSync(evidenceDir, { recursive: true, force: true });
  });

  it("prints an OK verdict and writes evidence, against the served mock", async () => {
    const { child, base } = await startServeMock(["--port", "0"]);
    try {
      const { stdout } = await execFileAsync(process.execPath, [join(root, "tools", "connect-check.mjs"), base], {
        cwd: root,
      });
      expect(stdout).toMatch(/^CONNECT OK — \d+ passed/m);
      expect(existsSync(evidenceDir)).toBe(true);
      expect(readdirSync(evidenceDir).some((f) => f.startsWith("conformance-"))).toBe(true);
    } finally {
      killTree(child);
    }
  }, 60_000);

  it("prints a FAILED verdict naming the first failing field against a host that answers wrong", async () => {
    // D-1's server refuses everything under /__test__/ by default, which is
    // enough of a "wrong server" for this: GET /session (the first call
    // connect-check's own authenticate step makes) answers fine, but nothing
    // else on the API prefix does once we point it at the WRONG prefix.
    const { child, base } = await startServeMock(["--port", "0"]);
    try {
      await expect(
        execFileAsync(process.execPath, [join(root, "tools", "connect-check.mjs"), `${base}/not-the-real-prefix`], { cwd: root }),
      ).rejects.toMatchObject({ stdout: expect.stringMatching(/^CONNECT FAILED — /m) });
    } finally {
      killTree(child);
    }
  }, 60_000);

  it("refuses with no base URL", async () => {
    await expect(execFileAsync(process.execPath, [join(root, "tools", "connect-check.mjs")], { cwd: root })).rejects.toMatchObject({
      code: 2,
    });
  });
});
