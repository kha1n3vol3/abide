import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { rubricSchema, type Rubric } from "@coldtea/abide-schema";
import { beadsSourceCandidates, checkStaleness } from "../src/lib/sources.js";
import { canonicalSourcePath } from "../src/lib/paths.js";
import { fillSourceShas } from "../src/lib/rubricFile.js";
import type { BeadsRead } from "../src/lib/beadsMemories.js";

const dirs: string[] = [];
const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const sha = createHash("sha256").update("Use helpful error messages\n").digest("hex");
const loaded: BeadsRead = {
  kind: "loaded",
  memories: [{ key: "error-copy", text: "Use helpful error messages\n" }],
};
const makeRubric = (): Rubric => ({
  version: 1,
  compiledAt: "test",
  sources: [{ path: "beads://memory/error-copy", sha }],
  rules: [],
});
const root = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "abide-beads-rubric-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it("keeps memory identity, original-value hashes, and canonical order", () => {
  const candidates = beadsSourceCandidates([{ key: "z", text: "Z" }, ...loaded.memories]);
  expect(candidates.map((c) => c.path)).toEqual(["beads://memory/error-copy", "beads://memory/z"]);
  expect(candidates[0]).toMatchObject({
    origin: "beads",
    text: "Use helpful error messages\n",
    sha,
    required: true,
    scope: "**/*",
  });
  expect(candidates[0]).not.toHaveProperty("absolute");
  expect(canonicalSourcePath(root(), "beads://memory/error-copy")).toBe(
    "beads://memory/error-copy",
  );
});

it("compares live changed, added and removed memories without reading URIs as files", () => {
  const dir = root();
  const rubric = makeRubric();
  expect(checkStaleness(rubric, beadsSourceCandidates(loaded.memories), dir, loaded)).toEqual({
    status: "fresh",
  });
  const changed: BeadsRead = { kind: "loaded", memories: [{ key: "error-copy", text: "Changed" }] };
  expect(
    checkStaleness(rubric, beadsSourceCandidates(changed.memories), dir, changed),
  ).toMatchObject({ status: "stale", changed: ["beads://memory/error-copy"] });
  expect(checkStaleness(rubric, [], dir, { kind: "loaded", memories: [] })).toMatchObject({
    status: "stale",
    removed: ["beads://memory/error-copy"],
  });
  const added: BeadsRead = {
    kind: "loaded",
    memories: [...loaded.memories, { key: "new", text: "New" }],
  };
  expect(checkStaleness(rubric, beadsSourceCandidates(added.memories), dir, added)).toMatchObject({
    status: "stale",
    added: ["beads://memory/new"],
  });
  const both = {
    ...rubric,
    sources: [
      ...rubric.sources,
      { path: "beads://memory/new", sha: createHash("sha256").update("New").digest("hex") },
    ],
  };
  expect(
    checkStaleness(both, beadsSourceCandidates([...added.memories].reverse()), dir, added),
  ).toEqual({ status: "fresh" });
});

it("offline freshness preserves memory sources but still notices file changes", () => {
  const dir = root();
  expect(checkStaleness(makeRubric(), [], dir)).toEqual({ status: "fresh" });
  writeFileSync(path.join(dir, "AGENTS.md"), "changed");
  expect(
    checkStaleness(
      { ...makeRubric(), sources: [...makeRubric().sources, { path: "AGENTS.md", sha }] },
      [],
      dir,
    ),
  ).toMatchObject({ status: "stale", changed: ["AGENTS.md"], removed: [] });
});

it("validates supplied memory hashes and fills file hashes normally", () => {
  const dir = root();
  writeFileSync(path.join(dir, "AGENTS.md"), "file instructions");
  const rubric = { ...makeRubric(), sources: [...makeRubric().sources, { path: "AGENTS.md" }] };
  const result = fillSourceShas(rubric, dir, loaded);
  expect(result.missing).toEqual([]);
  expect(result.rubric.sources[0]).toEqual({ path: "beads://memory/error-copy", sha });
  expect(result.rubric.sources[1]?.sha).toBe(
    createHash("sha256").update("file instructions").digest("hex"),
  );
});

it("refuses missing, changed, unhashed, malformed, or unqueried memory sources", () => {
  const dir = root();
  for (const state of [
    { kind: "not-requested" } as const,
    { kind: "loaded", memories: [] } as const,
    { kind: "loaded", memories: [{ key: "error-copy", text: "changed" }] } as const,
  ])
    expect(() => fillSourceShas(makeRubric(), dir, state)).toThrow(
      expect.objectContaining({ code: "RUBRIC_INVALID" }),
    );
  for (const source of [{ path: "beads://memory/error-copy" }, { path: "beads://memory/%GG", sha }])
    expect(() => fillSourceShas({ ...makeRubric(), sources: [source] }, dir, loaded)).toThrow(
      expect.objectContaining({ code: "RUBRIC_INVALID" }),
    );
});

const validationFixture = (sources: Rubric["sources"]) => {
  const dir = root();
  for (const sub of [".git", ".beads", ".abide", "bin", "home/.abide"])
    mkdirSync(path.join(dir, sub), { recursive: true });
  const file = path.join(dir, ".abide/rubric.json");
  writeFileSync(file, JSON.stringify({ ...makeRubric(), sources }));
  writeFileSync(
    path.join(dir, "bin/bd"),
    `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync('reads','x');process.stdout.write(JSON.stringify({'error-copy':'Use helpful error messages\\n',other:'Other',schema_version:1}));`,
    { mode: 0o755 },
  );
  const run = (args: string[] = []) =>
    spawnSync(process.execPath, [bin, "rubric", "validate", ...args], {
      cwd: dir,
      env: { ...process.env, PATH: path.join(dir, "bin"), ABIDE_HOME_DIR: path.join(dir, "home") },
      encoding: "utf8",
      timeout: 15000,
    });
  return { dir, file, run };
};

it("validates multiple live references with one read", () => {
  const f = validationFixture([
    ...makeRubric().sources,
    { path: "beads://memory/other", sha: createHash("sha256").update("Other").digest("hex") },
  ]);
  expect(f.run().status).toBe(0);
  expect(readFileSync(path.join(f.dir, "reads"), "utf8")).toBe("x");
  expect(rubricSchema.parse(JSON.parse(readFileSync(f.file, "utf8"))).sources[0]).toEqual(
    makeRubric().sources[0],
  );
});

it("rejects a changed live memory before validator publication", () => {
  const f = validationFixture([{ path: "beads://memory/error-copy", sha: "0".repeat(64) }]);
  const before = readFileSync(f.file, "utf8");
  expect(f.run().status).toBe(1);
  expect(readFileSync(f.file, "utf8")).toBe(before);
});

it("file-only validation never reads Beads and global memory validation is rejected", () => {
  const f = validationFixture([{ path: "AGENTS.md" }]);
  writeFileSync(path.join(f.dir, "AGENTS.md"), "rule");
  expect(f.run().status).toBe(0);
  expect(() => readFileSync(path.join(f.dir, "reads"))).toThrow();
  const global = path.join(f.dir, "home/.abide/global.json");
  writeFileSync(global, JSON.stringify(makeRubric()));
  const before = readFileSync(global, "utf8");
  expect(f.run(["--global"]).status).toBe(1);
  expect(readFileSync(global, "utf8")).toBe(before);
  expect(() => readFileSync(path.join(f.dir, "reads"))).toThrow();
});
