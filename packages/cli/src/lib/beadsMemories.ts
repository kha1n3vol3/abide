import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AbideError } from "@coldtea/abide-schema";
import { findExecutable } from "./executable.js";

export type BeadsMemory = { key: string; text: string };
export type BeadsRead =
  { kind: "not-requested" } | { kind: "loaded"; memories: readonly BeadsMemory[] };
export type BeadsReference = { kind: "file" } | { kind: "beads"; key: string };

const memoryKeySchema = z
  .string()
  .min(1)
  .refine((key) => {
    try {
      encodeURIComponent(key);
      return key !== "schema_version";
    } catch {
      return false;
    }
  });

// Object schemas can discard a valid memory named __proto__.
const memoriesSchema = z.preprocess(
  (raw) =>
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? Object.entries(raw)
      : undefined,
  z.array(
    z.union([
      z.tuple([z.literal("schema_version"), z.literal(1)]),
      z.tuple([memoryKeySchema, z.string()]),
    ]),
  ),
);

export const parseBeadsMemories = (raw: unknown): BeadsMemory[] => {
  const parsed = memoriesSchema.safeParse(raw);
  if (!parsed.success)
    throw new AbideError("BEADS_IMPORT_FAILED", "Beads returned unsupported memory data");
  return parsed.data.flatMap(([key, text]) =>
    key !== "schema_version" && typeof text === "string" ? [{ key, text }] : [],
  );
};

const PREFIX = "beads://memory/";
export const createBeadsSourcePath = (key: string): string => {
  try {
    if (key.length > 0) return PREFIX + encodeURIComponent(key);
  } catch {
    // A lone surrogate has no UTF-8 URI encoding.
  }
  throw new AbideError("RUBRIC_INVALID", "Invalid Beads memory key");
};

export const parseBeadsSourcePath = (sourcePath: string): BeadsReference => {
  if (!sourcePath.toLowerCase().startsWith("beads:")) return { kind: "file" };
  const invalid = new AbideError("RUBRIC_INVALID", "Invalid Beads memory source reference");
  if (sourcePath.startsWith(PREFIX)) {
    try {
      const key = decodeURIComponent(sourcePath.slice(PREFIX.length));
      if (createBeadsSourcePath(key) === sourcePath) return { kind: "beads", key };
    } catch {
      throw invalid;
    }
  }
  throw invalid;
};

export const readBeadsMemories = (root: string): BeadsMemory[] => {
  let workspace = false;
  try {
    workspace = statSync(path.join(root, ".beads")).isDirectory();
  } catch {
    workspace = false;
  }
  const executable = findExecutable("bd");
  if (!workspace || executable === undefined)
    throw new AbideError(
      "BEADS_UNAVAILABLE",
      "Live import needs an existing .beads workspace and bd on PATH",
    );
  const result = spawnSync(executable, ["-C", root, "--readonly", "memories", "--json"], {
    cwd: root,
    env: { ...process.env, BEADS_DOLT_AUTO_START: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    timeout: 5_000,
    killSignal: "SIGKILL",
    maxBuffer: 1_048_576,
  });
  if (result.error !== undefined || result.status !== 0)
    throw new AbideError(
      "BEADS_IMPORT_FAILED",
      "Beads memory read failed or exceeded its time or size limit",
    );
  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new AbideError("BEADS_IMPORT_FAILED", "Beads returned invalid memory JSON");
  }
  return parseBeadsMemories(raw);
};
