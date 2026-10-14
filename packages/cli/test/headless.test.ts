import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runHeadless } from "../src/lib/headless.js";

const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const fixture = (agent: string, body: string) => {
  const root = mkdtempSync(path.join(tmpdir(), "abide-headless-"));
  dirs.push(root);
  writeFileSync(path.join(root, agent), `#!${process.execPath}\n${body}`, { mode: 0o755 });
  vi.stubEnv("PATH", root);
  return root;
};

it.each(["claude", "pi"] as const)(
  "%s delivers an entire near-limit memory prompt through stdin without argv interpretation",
  async (agent) => {
    const prompt = "-@not-a-file\n" + "é漢🙂\n".repeat(104_000) + "\nEND\n";
    vi.stubEnv("TEST_PROMPT_SHA", createHash("sha256").update(prompt).digest("hex"));
    const root = fixture(
      agent,
      `
const { createHash } = require("node:crypto");
if (process.argv.some(arg => arg.includes("not-a-file"))) process.exit(21);
const hash = createHash("sha256");
process.stdin.on("data", chunk => hash.update(chunk));
process.stdin.on("end", () => process.exit(hash.digest("hex") === process.env.TEST_PROMPT_SHA ? 0 : 22));
`,
    );
    expect(await runHeadless(agent, root, prompt)).toBe(0);
  },
);

it.each(["claude", "pi"] as const)("%s delivers small prompts unchanged", async (agent) => {
  const root = fixture(
    agent,
    `
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => process.exit(input === "Small prompt\\n" ? 0 : 23));
`,
  );
  expect(await runHeadless(agent, root, "Small prompt\n")).toBe(0);
});

it.each(["claude", "pi"] as const)("%s preserves a child failure exit code", async (agent) => {
  const root = fixture(
    agent,
    `process.stdin.resume(); process.stdin.on("end", () => process.exit(7));`,
  );
  expect(await runHeadless(agent, root, "prompt")).toBe(7);
});

it.each(["claude", "pi"] as const)(
  "%s returns failure when the executable is missing",
  async (agent) => {
    const root = fixture("unrelated", "");
    expect(await runHeadless(agent, root, "prompt")).toBe(1);
  },
);

it.each(["claude", "pi"] as const)(
  "%s fails safely when the child closes its input early",
  async (agent) => {
    const root = fixture(
      agent,
      `require("node:fs").closeSync(0); setTimeout(() => process.exit(0), 100);`,
    );
    expect(await runHeadless(agent, root, "x".repeat(1_048_576))).toBe(1);
  },
);
