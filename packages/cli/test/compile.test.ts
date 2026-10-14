import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { afterEach, expect, it } from "vitest";

const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const dirs: string[] = [];
const invocationSchema = z.object({
  agent: z.string(),
  args: z.array(z.string()),
  stdin: z.string(),
  cwd: z.string(),
});
const rubric = {
  version: 1,
  compiledAt: "test",
  sources: [{ path: "AGENTS.md" }],
  rules: [],
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const fixture = (agents: string[]) => {
  const root = mkdtempSync(path.join(tmpdir(), "abide-compile-"));
  dirs.push(root);
  const home = path.join(root, "home");
  const executables = path.join(root, "bin");
  const record = path.join(root, "invocation.json");
  for (const dir of [home, executables, path.join(root, ".git"), path.join(root, ".abide")])
    mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(root, "AGENTS.md"), "Use type, never interface\n");
  writeFileSync(path.join(root, ".abide", "rubric.json"), JSON.stringify(rubric));
  for (const agent of agents) {
    writeFileSync(
      path.join(executables, agent),
      `#!${process.execPath}
const fs = require("node:fs");
if (process.argv.includes("--version")) process.exit(0);
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => stdin += chunk);
process.stdin.on("end", () => {
  fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({agent:${JSON.stringify(agent)},args:process.argv.slice(2),stdin,cwd:process.cwd()}));
  process.exit(Number(process.env.TEST_AGENT_EXIT || 0));
});
`,
      { mode: 0o755 },
    );
  }
  const env = {
    ...process.env,
    ABIDE_HOME_DIR: home,
    PI_CODING_AGENT_DIR: path.join(home, ".pi", "agent"),
    PATH: executables,
  };
  const run = (args: string[], extraEnv: NodeJS.ProcessEnv = {}) =>
    execFileSync(process.execPath, [bin, ...args], {
      cwd: root,
      env: { ...env, ...extraEnv },
      encoding: "utf8",
      timeout: 15_000,
    });
  const failure = (args: string[], extraEnv: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [bin, ...args], {
      cwd: root,
      env: { ...env, ...extraEnv },
      encoding: "utf8",
      timeout: 15_000,
    });
  const invocation = () => invocationSchema.parse(JSON.parse(readFileSync(record, "utf8")));
  return { root, home, record, run, failure, invocation };
};

it.each(["compile", "tune"])("runs %s with Pi print mode and the compile skill", (command) => {
  const f = fixture(["pi", "claude"]);
  const output = f.run([command, "--agent", "pi"]);
  const call = f.invocation();
  expect(call.agent).toBe("pi");
  expect(call.cwd).toBe(f.root);
  expect(call.args.slice(0, 2)).toEqual(["--print", "--no-session"]);
  expect(call.stdin).toContain("compile-skill.md");
  expect(call.stdin).toContain("Do not skip the validate and calibrate steps");
  expect(output).toContain("Pi");
  expect(output).not.toContain("This runs on your subscription");
  if (command === "tune") expect(call.stdin).toContain("Calibration and firing statistics");
});

it("passes the global target and statistics to Pi for tune --global", () => {
  const f = fixture(["pi"]);
  mkdirSync(path.join(f.home, ".abide"));
  writeFileSync(path.join(f.home, "AGENTS.md"), "Use type, never interface\n");
  writeFileSync(path.join(f.home, ".abide", "global.json"), JSON.stringify(rubric));
  f.run(["tune", "--global", "--agent", "pi"]);
  expect(f.invocation().stdin).toContain(path.join(f.home, ".abide", "global.json"));
  expect(f.invocation().stdin).toContain("Calibration and firing statistics");
});

it("leaves a manual rubric alone, even with no instruction file to compile from", () => {
  const f = fixture(["claude"]);
  unlinkSync(path.join(f.root, "AGENTS.md"));
  writeFileSync(
    path.join(f.root, ".abide", "rubric.json"),
    JSON.stringify({ ...rubric, manual: true }),
  );
  expect(f.run(["compile"])).toContain("maintained by hand");
  expect(existsSync(f.record)).toBe(false);
});

it("prefers Claude when both runners are available", () => {
  const f = fixture(["pi", "claude"]);
  f.run(["compile"]);
  expect(f.invocation().agent).toBe("claude");
});

it("falls back to Pi when Claude is unavailable", () => {
  const f = fixture(["pi"]);
  f.run(["compile"]);
  expect(f.invocation().agent).toBe("pi");
});

it("does not fall back when an explicitly selected runner is unavailable", () => {
  const f = fixture(["pi"]);
  const result = f.failure(["compile", "--agent", "claude"]);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("HEADLESS_UNAVAILABLE");
  expect(existsSync(f.record)).toBe(false);
});

it("returns a Pi failure without starting Claude", () => {
  const f = fixture(["pi", "claude"]);
  const result = f.failure(["compile", "--agent", "pi"], { TEST_AGENT_EXIT: "7" });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("pi exited with 7");
  expect(f.invocation().agent).toBe("pi");
});

it("prints the prompt when neither runner is available", () => {
  const f = fixture([]);
  expect(f.run(["compile"])).toContain("compile-skill.md");
  expect(existsSync(f.record)).toBe(false);
});

it("keeps --print independent of runner availability", () => {
  const f = fixture([]);
  expect(f.run(["tune", "--agent", "pi", "--print"])).toContain(
    "Calibration and firing statistics",
  );
  expect(existsSync(f.record)).toBe(false);
});

const addBeads = (f: ReturnType<typeof fixture>, value: unknown, exit = 0) => {
  mkdirSync(path.join(f.root, ".beads"));
  writeFileSync(
    path.join(f.root, "bin", "bd"),
    `#!${process.execPath}\nconst fs=require("node:fs");fs.appendFileSync(${JSON.stringify(path.join(f.root, "beads-reads"))},"x");process.stdout.write(${JSON.stringify(JSON.stringify(value))});process.exit(${exit});`,
    { mode: 0o755 },
  );
};

it("prints live memory source content and compiles a memories-only project without an export", () => {
  const f = fixture([]);
  rmSync(path.join(f.root, "AGENTS.md"));
  addBeads(f, { "copy/key": "Rule line one\nRule line two\n", schema_version: 1 });
  const before = readFileSync(path.join(f.root, ".abide/rubric.json"), "utf8");
  const output = f.run(["compile", "--beads", "--print"]);
  expect(output).toContain("beads://memory/copy%2Fkey");
  expect(output).toContain('"text": "Rule line one\\nRule line two\\n"');
  expect(output).toContain(
    createHash("sha256").update("Rule line one\nRule line two\n").digest("hex"),
  );
  expect(readFileSync(path.join(f.root, "beads-reads"), "utf8")).toBe("x");
  expect(readFileSync(path.join(f.root, ".abide/rubric.json"), "utf8")).toBe(before);
  expect(readdirSync(path.join(f.root, ".abide")).sort()).toEqual([
    "compile-skill.md",
    "rubric.json",
  ]);
});

it("checks live freshness before the fresh-rubric early return", () => {
  const f = fixture(["pi"]);
  rmSync(path.join(f.root, "AGENTS.md"));
  const memoryRubric = {
    ...rubric,
    sources: [
      { path: "beads://memory/copy", sha: createHash("sha256").update("old").digest("hex") },
    ],
  };
  writeFileSync(path.join(f.root, ".abide/rubric.json"), JSON.stringify(memoryRubric));
  addBeads(f, { copy: "changed", schema_version: 1 });
  f.run(["compile", "--beads", "--agent", "pi"]);
  expect(f.invocation().stdin).toContain('"text": "changed"');
});

it("preserves a manual rubric during explicit live import", () => {
  const f = fixture(["pi"]);
  rmSync(path.join(f.root, "AGENTS.md"));
  const file = path.join(f.root, ".abide/rubric.json");
  const before = JSON.stringify({
    ...rubric,
    manual: true,
    sources: [{ path: "beads://memory/copy", sha: "0".repeat(64) }],
  });
  writeFileSync(file, before);
  addBeads(f, { copy: "changed", schema_version: 1 });
  expect(f.run(["compile", "--beads", "--agent", "pi"])).toContain("maintained by hand");
  expect(readFileSync(file, "utf8")).toBe(before);
  expect(readFileSync(path.join(f.root, "beads-reads"), "utf8")).toBe("x");
  expect(existsSync(f.record)).toBe(false);
});

it("empty live imports explicitly remove old memory rules", () => {
  const f = fixture([]);
  rmSync(path.join(f.root, "AGENTS.md"));
  writeFileSync(
    path.join(f.root, ".abide/rubric.json"),
    JSON.stringify({
      ...rubric,
      sources: [{ path: "beads://memory/removed", sha: "0".repeat(64) }],
    }),
  );
  addBeads(f, { schema_version: 1 });
  const output = f.run(["compile", "--beads", "--print"]);
  expect(output).toContain("0 live Beads memories");
  expect(output).toContain(
    "Remove rules and source references for memories absent from this live set",
  );
});

it("keeps memory rules offline without claiming a live freshness check", () => {
  const f = fixture([]);
  rmSync(path.join(f.root, "AGENTS.md"));
  writeFileSync(
    path.join(f.root, ".abide/rubric.json"),
    JSON.stringify({ ...rubric, sources: [{ path: "beads://memory/copy", sha: "0".repeat(64) }] }),
  );
  const output = f.run(["compile"]);
  expect(output).toContain("not refreshed");
  expect(output).toContain("compile --beads");
});

it.each([
  ["compile", "--beads", "--global"],
  ["tune", "--beads"],
])("rejects conflicting flags before reading Beads: %j", (...args) => {
  const f = fixture(["pi"]);
  addBeads(f, {});
  const result = f.failure(args);
  expect(result.status).toBe(1);
  expect(existsSync(path.join(f.root, "beads-reads"))).toBe(false);
  expect(existsSync(f.record)).toBe(false);
});

it("does not launch the compile agent or change the rubric after a failed live read", () => {
  const f = fixture(["pi"]);
  addBeads(f, {}, 7);
  const before = readFileSync(path.join(f.root, ".abide/rubric.json"), "utf8");
  const result = f.failure(["compile", "--beads"]);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("BEADS_IMPORT_FAILED");
  expect(existsSync(f.record)).toBe(false);
  expect(readFileSync(path.join(f.root, ".abide/rubric.json"), "utf8")).toBe(before);
});

it("rejects unsupported headless agents", () => {
  const f = fixture(["claude"]);
  const result = f.failure(["compile", "--agent", "codex"]);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("HOST_UNKNOWN");
  expect(existsSync(f.record)).toBe(false);
});
