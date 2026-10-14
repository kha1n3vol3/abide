import { parseArgs } from "node:util";
import { AbideError } from "@coldtea/abide-schema";
import { parseBeadsSourcePath, readBeadsMemories, type BeadsRead } from "../lib/beadsMemories.js";
import { findRepoRoot, globalRubricPath, homeDir, rubricPath } from "../lib/paths.js";
import { fillSourceShas, readRubric, writeRubric } from "../lib/rubricFile.js";
import { showStatic } from "../ui/render.js";
import { RubricView } from "../ui/views/RubricView.js";

/** Parses the rubric the agent just wrote, fills in real source hashes, writes it back. */
export const runRubric = async (argv: string[]): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { global: { type: "boolean", default: false } },
  });
  const sub = positionals[0] ?? "validate";
  if (sub !== "validate")
    throw new AbideError(
      "RUBRIC_INVALID",
      `unknown rubric command "${sub}"; try: abide rubric validate`,
    );
  const root = values.global ? homeDir() : findRepoRoot(process.cwd());
  const file = values.global ? globalRubricPath() : rubricPath(root);
  const read = readRubric(file);
  switch (read.kind) {
    case "missing":
      throw new AbideError("RUBRIC_MISSING", `${file} does not exist yet`);
    case "invalid":
      await showStatic(RubricView({ data: { kind: "invalid", root, file, issues: read.issues } }));
      return 1;
    case "ok": {
      const hasMemories = read.rubric.sources.some(
        (source) => parseBeadsSourcePath(source.path).kind === "beads",
      );
      if (values.global && hasMemories)
        throw new AbideError("RUBRIC_INVALID", "Global rubrics cannot import Beads memories");
      const beads: BeadsRead = hasMemories
        ? { kind: "loaded", memories: readBeadsMemories(root) }
        : { kind: "not-requested" };
      const { rubric, missing } = fillSourceShas(read.rubric, root, beads);
      const listed = new Set(rubric.sources.map((s) => s.path));
      const orphaned = rubric.rules
        .filter((r) => !listed.has(r.source.path))
        .map((r) => `${r.id} (${r.source.path})`);
      writeRubric(file, rubric);
      await showStatic(
        RubricView({ data: { kind: "ok", root, file, rules: rubric.rules, missing, orphaned } }),
      );
      return missing.length + orphaned.length > 0 ? 1 : 0;
    }
    default:
      return 1;
  }
};
