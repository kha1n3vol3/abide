import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createBeadsSourcePath,
  parseBeadsMemories,
  parseBeadsSourcePath,
  readBeadsMemories,
} from "../src/lib/beadsMemories.js";

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const fixture = (body: string) => {
  const root = mkdtempSync(path.join(tmpdir(), "abide-beads-"));
  dirs.push(root);
  mkdirSync(path.join(root, ".beads"));
  mkdirSync(path.join(root, "bin"));
  mkdirSync(path.join(root, ".abide"));
  const rubric = path.join(root, ".abide", "rubric.json");
  writeFileSync(rubric, "prior rubric");
  writeFileSync(path.join(root, "bin", "bd"), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  vi.stubEnv("PATH", path.join(root, "bin"));
  return { root, rubric };
};

it("parses exact memory values and excludes numeric metadata", () => {
  expect(parseBeadsMemories({ z: "", a: " é\n## heading\n rule  ", schema_version: 1 })).toEqual([
    { key: "z", text: "" },
    { key: "a", text: " é\n## heading\n rule  " },
  ]);
  expect(parseBeadsMemories({})).toEqual([]);
  expect(parseBeadsMemories({ rule: "text" })).toEqual([{ key: "rule", text: "text" }]);
});

it.each([
  [],
  null,
  { "": "rule" },
  { rule: 1 },
  { rule: {} },
  { schema_version: 2 },
  { schema_version: "rule" },
])("rejects unsupported memory output %j", (value) => {
  expect(() => parseBeadsMemories(value)).toThrow(
    expect.objectContaining({ code: "BEADS_IMPORT_FAILED" }),
  );
});

it("preserves prototype-named memories and validates their values", () => {
  const raw: unknown = JSON.parse('{"__proto__":"Keep this rule","constructor":"Other rule"}');
  expect(parseBeadsMemories(raw)).toEqual([
    { key: "__proto__", text: "Keep this rule" },
    { key: "constructor", text: "Other rule" },
  ]);
  expect(() => parseBeadsMemories(JSON.parse('{"__proto__":12}'))).toThrow(
    expect.objectContaining({ code: "BEADS_IMPORT_FAILED" }),
  );
  expect(() => parseBeadsMemories([["key", "rule"]])).toThrow(
    expect.objectContaining({ code: "BEADS_IMPORT_FAILED" }),
  );
});

it("rejects keys that have no URI encoding", () => {
  expect(() => parseBeadsMemories({ "\ud800": "rule" })).toThrow(
    expect.objectContaining({ code: "BEADS_IMPORT_FAILED" }),
  );
});

it("round-trips encoded memory keys without treating them as files", () => {
  expect(createBeadsSourcePath("a/b #é")).toBe("beads://memory/a%2Fb%20%23%C3%A9");
  expect(parseBeadsSourcePath("beads://memory/a%2Fb%20%23%C3%A9")).toEqual({
    kind: "beads",
    key: "a/b #é",
  });
  expect(parseBeadsSourcePath("AGENTS.md")).toEqual({ kind: "file" });
  expect(createBeadsSourcePath("newline\nkey")).toBe("beads://memory/newline%0Akey");
});

it.each([
  "beads://memory/",
  "beads://other/key",
  "beads://memory/%GG",
  "beads://memory/%61",
  "beads://memory/a/b",
  "beads:/memory/key",
  "beads:key",
  "BEADS://memory/key",
])("rejects malformed or noncanonical Beads reference %s", (value) => {
  expect(() => parseBeadsSourcePath(value)).toThrow(
    expect.objectContaining({ code: "RUBRIC_INVALID" }),
  );
});

it("reads one bounded read-only command without creating memory files", () => {
  const { root, rubric } = fixture(`
const fs = require("node:fs");
fs.writeFileSync("call.json", JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),auto:process.env.BEADS_DOLT_AUTO_START}));
process.stdout.write(JSON.stringify({rule:"Keep it simple",schema_version:1}));`);
  expect(readBeadsMemories(root)).toEqual([{ key: "rule", text: "Keep it simple" }]);
  expect(
    z
      .object({ args: z.array(z.string()), cwd: z.string(), auto: z.string() })
      .parse(JSON.parse(readFileSync(path.join(root, "call.json"), "utf8"))),
  ).toEqual({
    args: ["-C", root, "--readonly", "memories", "--json"],
    cwd: root,
    auto: "0",
  });
  expect(readdirSync(path.join(root, ".abide"))).toEqual(["rubric.json"]);
  expect(readFileSync(rubric, "utf8")).toBe("prior rubric");
});

it("requires an existing local workspace and executable", () => {
  const { root } = fixture('process.stdout.write("{}");');
  rmSync(path.join(root, ".beads"), { recursive: true });
  expect(() => readBeadsMemories(root)).toThrow(
    expect.objectContaining({ code: "BEADS_UNAVAILABLE" }),
  );
  mkdirSync(path.join(root, ".beads"));
  vi.stubEnv("PATH", "");
  expect(() => readBeadsMemories(root)).toThrow(
    expect.objectContaining({ code: "BEADS_UNAVAILABLE" }),
  );
});

it.each([
  'process.stderr.write("sensitive diagnostic"); process.exit(7);',
  'process.stdout.write("sensitive diagnostic");',
  'process.stdout.write("x".repeat(2 * 1024 * 1024));',
  'process.stderr.write("x".repeat(2 * 1024 * 1024));',
])("fails without leaking raw output or replacing a rubric", (body) => {
  const { root, rubric } = fixture(body);
  expect(() => readBeadsMemories(root)).toThrow(
    expect.objectContaining({ code: "BEADS_IMPORT_FAILED" }),
  );
  try {
    readBeadsMemories(root);
  } catch (error) {
    expect(String(error)).not.toContain("sensitive diagnostic");
  }
  expect(readFileSync(rubric, "utf8")).toBe("prior rubric");
});

it("kills a Beads command that does not finish", () => {
  const { root } = fixture("setInterval(() => {}, 1000);");
  const start = performance.now();
  expect(() => readBeadsMemories(root)).toThrow(
    expect.objectContaining({ code: "BEADS_IMPORT_FAILED" }),
  );
  expect(performance.now() - start).toBeLessThan(8000);
}, 10000);
