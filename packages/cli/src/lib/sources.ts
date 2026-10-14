import { readdirSync, existsSync, type Dirent } from "node:fs";
import path from "node:path";
import { assertNever, createSourceSha, type Rubric } from "@coldtea/abide-schema";
import {
  claudeConfigDir,
  homeDir,
  isHomeDir,
  piAgentDir,
  resolveSourcePath,
  toSourcePath,
} from "./paths.js";
import {
  createBeadsSourcePath,
  parseBeadsSourcePath,
  type BeadsMemory,
  type BeadsRead,
} from "./beadsMemories.js";
import { readRegularFile } from "./regularFile.js";

type FileSourceCandidate = {
  /** Rubric spelling: repo-relative or "~/...". */
  path: string;
  absolute: string;
  /** Glob the file's rules apply to. */
  scope: string;
  /** Required candidates must appear in the rubric for it to be fresh. */
  required: boolean;
  origin: "root" | "nested" | "global" | "contributing";
};

type BeadsSourceCandidate = {
  origin: "beads";
  path: string;
  scope: string;
  required: boolean;
  key: string;
  text: string;
  sha: string;
};

export type SourceCandidate = FileSourceCandidate | BeadsSourceCandidate;

export const beadsSourceCandidates = (memories: readonly BeadsMemory[]): SourceCandidate[] =>
  [...memories]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((memory) => ({
      origin: "beads",
      path: createBeadsSourcePath(memory.key),
      scope: "**/*",
      required: true,
      key: memory.key,
      text: memory.text,
      sha: createSourceSha(memory.text),
    }));

export const beadsSourceHashes = (beads: BeadsRead): ReadonlyMap<string, string> | undefined => {
  switch (beads.kind) {
    case "not-requested":
      return undefined;
    case "loaded":
      return new Map(
        beads.memories.map((m) => [createBeadsSourcePath(m.key), createSourceSha(m.text)]),
      );
    default:
      return assertNever(beads);
  }
};

const CONTEXT_NAMES = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];
const contextNames = (dir: string): string[] => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const findName = (wanted: string): string | undefined =>
    entries.find(
      (name) =>
        name === wanted ||
        (process.platform === "win32" && name.toLowerCase() === wanted.toLowerCase()),
    );
  return [
    ...new Set(
      ["AGENTS.override.md", ...CONTEXT_NAMES].flatMap((wanted) => {
        const name = findName(wanted);
        return name === undefined ? [] : [name];
      }),
    ),
  ];
};
const globalFiles = (): string[] => [
  path.join(claudeConfigDir(), "CLAUDE.md"),
  path.join(homeDir(), ".codex", "AGENTS.md"),
  path.join(homeDir(), ".config", "opencode", "AGENTS.md"),
];
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  "vendor",
  "coverage",
  ".turbo",
  ".cache",
  "target",
  ".abide",
  ".claude",
  ".codex",
  ".opencode",
]);
const MAX_DEPTH = 6;

const walkNested = (root: string, dir: string, depth: number, out: FileSourceCandidate[]): void => {
  if (depth > MAX_DEPTH) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    const sub = path.join(dir, entry.name);
    for (const name of contextNames(sub)) {
      const file = path.join(sub, name);
      if (existsSync(file)) {
        const rel = toSourcePath(root, sub);
        out.push({
          path: toSourcePath(root, file),
          absolute: file,
          scope: `${rel}/**/*`,
          required: true,
          origin: "nested",
        });
      }
    }
    walkNested(root, sub, depth + 1, out);
  }
};

export const discoverProjectSources = (root: string): FileSourceCandidate[] => {
  const found: FileSourceCandidate[] = [];
  if (isHomeDir(root)) return found;
  for (const name of [...contextNames(root), ".cursorrules"]) {
    const file = path.join(root, name);
    if (existsSync(file)) {
      found.push({ path: name, absolute: file, scope: "**/*", required: true, origin: "root" });
    }
  }
  walkNested(root, root, 1, found);
  const contributing = path.join(root, "CONTRIBUTING.md");
  if (existsSync(contributing)) {
    found.push({
      path: "CONTRIBUTING.md",
      absolute: contributing,
      scope: "**/*",
      required: false,
      origin: "contributing",
    });
  }
  return found;
};

export const discoverGlobalSources = (): FileSourceCandidate[] => {
  const found: FileSourceCandidate[] = globalFiles().flatMap((absolute) =>
    existsSync(absolute)
      ? [
          {
            path: toSourcePath(homeDir(), absolute),
            absolute,
            scope: "**/*",
            required: true,
            origin: "global" as const,
          },
        ]
      : [],
  );
  const agentDir = piAgentDir();
  const name = contextNames(agentDir)[0];
  if (name !== undefined) {
    const absolute = path.join(agentDir, name);
    found.push({
      path: toSourcePath(homeDir(), absolute),
      absolute,
      scope: "**/*",
      required: true,
      origin: "global",
    });
  }
  return found;
};

export const hashFile = (absolute: string): string | undefined => {
  const bytes = readRegularFile(absolute);
  return bytes === undefined ? undefined : createSourceSha(bytes);
};

export type Staleness =
  | { status: "missing" }
  | { status: "fresh" }
  | { status: "manual" }
  | { status: "stale"; changed: string[]; added: string[]; removed: string[]; unhashed: string[] };

export const checkStaleness = (
  rubric: Rubric | undefined,
  candidates: SourceCandidate[],
  root: string,
  beads: BeadsRead = { kind: "not-requested" },
): Staleness => {
  if (rubric === undefined) return { status: "missing" };
  if (rubric.manual === true) return { status: "manual" };
  const changed: string[] = [];
  const removed: string[] = [];
  const unhashed: string[] = [];
  const memoryHashes = beadsSourceHashes(beads);
  for (const source of rubric.sources) {
    const reference = parseBeadsSourcePath(source.path);
    let now: string | undefined;
    switch (reference.kind) {
      case "beads":
        if (memoryHashes === undefined) continue;
        now = memoryHashes.get(source.path);
        break;
      case "file":
        now = hashFile(resolveSourcePath(root, source.path));
        break;
      default:
        return assertNever(reference);
    }
    if (now === undefined) removed.push(source.path);
    else if (source.sha === undefined) unhashed.push(source.path);
    else if (source.sha !== now) changed.push(source.path);
  }
  const listed = new Set(
    rubric.sources.map((s) => {
      const reference = parseBeadsSourcePath(s.path);
      switch (reference.kind) {
        case "beads":
          return s.path;
        case "file":
          return path.resolve(resolveSourcePath(root, s.path));
        default:
          return assertNever(reference);
      }
    }),
  );
  const identity = (c: SourceCandidate): string => {
    switch (c.origin) {
      case "beads":
        return c.path;
      case "root":
      case "nested":
      case "global":
      case "contributing":
        return path.resolve(c.absolute);
      default:
        return assertNever(c);
    }
  };
  const added = candidates.filter((c) => c.required && !listed.has(identity(c))).map((c) => c.path);
  if (changed.length + removed.length + unhashed.length + added.length === 0) {
    return { status: "fresh" };
  }
  return { status: "stale", changed, added, removed, unhashed };
};

export const needsCompile = (s: Staleness): boolean => {
  switch (s.status) {
    case "missing":
    case "stale":
      return true;
    case "fresh":
    case "manual":
      return false;
    default:
      return assertNeverStaleness(s);
  }
};

export const describeStaleness = (s: Staleness): string => {
  switch (s.status) {
    case "missing":
      return "no rubric yet";
    case "fresh":
      return "up to date";
    case "manual":
      return "maintained by hand";
    case "stale": {
      const parts: string[] = [];
      if (s.changed.length) parts.push(`changed: ${s.changed.join(", ")}`);
      if (s.added.length) parts.push(`new: ${s.added.join(", ")}`);
      if (s.removed.length) parts.push(`gone: ${s.removed.join(", ")}`);
      if (s.unhashed.length) parts.push(`never hashed: ${s.unhashed.join(", ")}`);
      return parts.join("; ");
    }
    default:
      return assertNeverStaleness(s);
  }
};

const assertNeverStaleness = (value: never): never => {
  throw new Error(`Unhandled staleness: ${JSON.stringify(value)}`);
};
