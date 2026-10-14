# Live Beads memory import implementation plan

> For agentic workers: use `superpowers:executing-plans` for inline execution after design approval. Do not delegate unless the user requests it. Steps use checkbox syntax for tracking.

Goal: read project memories live and compile them into Abide's rubric without exporting memory text to a file.

Architecture: an explicit `compile --beads` invocation collects bounded, validated Beads output into memory. Memory-key URIs and content hashes fit the existing rubric; hooks enforce the compiled rules without contacting Beads.

Tech stack: existing Node.js 22+, TypeScript, Zod, Vitest, pnpm, and Beads CLI. No new dependencies.

Spec: [Live Beads memory import design](../specs/2026-10-14-beads-memory-import-design.md)

Issue: `abide-bfg`. The user approved this live-import plan on 2026-10-14. This plan replaces the earlier snapshot proposal. Implementation results and remaining validation limits are in [the verification report](../../operations/beads-memory-import-verification.md).

## Global constraints

- `compile --beads` imports live project memories. `tune` does not acquire that flag.
- No memory export, cache, or sidecar. Persist the existing rubric only; normal existing events/skill installation are unchanged and must not capture full memory bodies.
- Run `bd -C <repo-root> --readonly memories --json` without a shell; require the existing workspace and preserve its redirect/configuration behavior.
- Each read has a 5,000 ms timeout, `SIGKILL`, ignored stdin, and a 1,048,576-byte buffer limit. Reject partial output; do not retry or administer Dolt.
- Memory sources use canonical `beads://memory/<encoded-key>` paths and exact-value UTF-8 hashes. Keep rubric version 1 and existing field shapes.
- Hooks never query Beads. Explicit import/validation failures are nonzero CLI results, not reasons to change hook exit/output contracts.
- Add only `BEADS_UNAVAILABLE` and `BEADS_IMPORT_FAILED` to the error-code union. Use existing `SETTINGS_INVALID`/`RUBRIC_INVALID` for flag and rubric failures.
- Preserve original text and source lines. Keep credentials out of memory material, diagnostics, and evidence. `--print` deliberately reveals supplied source text; document that behavior.
- Use Zod at the subprocess boundary, exhaustive switches for closed states, `type` declarations, and no casts. Do not build a source-plugin framework or upgrade dependencies.
- Leave existing unrelated changes intact, especially the modified `.abide/rubric.json`. Perform live compilation in a disposable repository.
- Leave the BD issue open. No automatic merge, push, or Git commit.

## Review focus

1. Empty live results mean removed memories; an unrequested read means preserve prior memory rules. Tasks 2 and 3 test the distinction.
2. Memory-key URIs must never reach `path.resolve`, file reads, or file canonicalization. Task 2 tests key round trips and hashing.
3. A memory changing between prompt collection and rubric validation must fail rather than certify stale content. Task 2 tests this; Task 4 inspects live hashes.
4. Existing worktree redirects must resolve the intended database without global fallback. Task 4 uses the real workspace; Task 1 tests missing-workspace preflight.
5. Beads being absent, offline, or hung must not affect compiled-rule enforcement. Tasks 1 and 3 test bounded failure and offline hook behavior.

## Files and responsibilities

- Create `packages/cli/src/lib/beadsMemories.ts`: live-output parser/reader, URI owner/parser, and closed read-state type. No filesystem publication.
- Modify `packages/schema/src/errors.ts`: extend the error-code union.
- Modify `packages/schema/src/rubric.ts`: comments documenting memory paths/value hashes/lines; no field/version changes.
- Modify `packages/cli/src/lib/sources.ts`: file/memory candidate union, loaded-memory candidates, and optional live freshness context.
- Modify `packages/cli/src/lib/paths.ts`: preserve canonical memory URIs; do not generalize the filesystem resolver into an I/O adapter.
- Modify `packages/cli/src/lib/rubricFile.ts` and `packages/cli/src/commands/rubric.ts`: one live validation batch and memory hash comparison before writes.
- Modify `packages/cli/src/hooks/sessionStart.ts`: thread a default no-live-read state through compile planning, recognize previously compiled memory-only rubrics, and preserve hook offline behavior.
- Modify `packages/cli/src/commands/compile.ts` and `packages/cli/src/lib/compilePrompt.ts`: flag/preflight, live candidates, source-content blocks, and preservation/refresh instructions.
- Modify `packages/cli/src/ui/views/HelpView.tsx`, `README.md`, and `skills/abide-compile/SKILL.md`: document live import, provenance and refresh semantics.
- Create `packages/cli/test/beadsMemories.test.ts` and `packages/cli/test/beadsRubric.test.ts`; extend `packages/cli/test/sources.test.ts`, `packages/cli/test/compile.test.ts`, and `packages/cli/test/hook.test.ts` using their current fixture patterns.
- Create `docs/operations/beads-memory-import-verification.md` during implementation to record safe live evidence and limitations.

## Task 1: bounded live reader and memory reference identity

Acceptance criteria: 1, 2, 6.

Interfaces in `beadsMemories.ts`:

```ts
export type BeadsMemory = { key: string; text: string };
export type BeadsRead =
  | { kind: "not-requested" }
  | { kind: "loaded"; memories: readonly BeadsMemory[] };
export type BeadsReference =
  | { kind: "file" }
  | { kind: "beads"; key: string };
export const parseBeadsMemories = (raw: unknown): BeadsMemory[];
export const readBeadsMemories = (root: string): BeadsMemory[];
export const createBeadsSourcePath = (key: string): string;
export const parseBeadsSourcePath = (sourcePath: string): BeadsReference;
```

The reader resolves the executable with `findExecutable`, calls the one read-only command, and throws typed domain errors. The reference parser returns `file` for normal paths and throws `RUBRIC_INVALID` for malformed reserved Beads URIs. The state has no error variant: reads either produce a complete loaded batch or throw.

- [ ] Add failing parser tests: `{z: "Z", a: "A", schema_version: 1}` produces two string-valued memories with exact text; metadata is excluded. Cover omitted version, `{}`, empty values, Unicode/multiline text, whitespace preservation, and nonempty keys. Reject arrays, nested values, non-string memory values, and unsupported metadata versions. Sorting belongs to candidate/prompt construction, not source hashing.
- [ ] Add URI tests: `createBeadsSourcePath("a/b #é")` is `beads://memory/a%2Fb%20%23%C3%A9` and parses back to that key. Assert file paths remain file references. Reject malformed percent encoding, empty keys, unsupported reserved forms, and noncanonical encodings without filesystem access.
- [ ] Run `pnpm --filter @coldtea/abide exec vitest run test/beadsMemories.test.ts`. Expected: new tests fail because these helpers are absent.
- [ ] Implement the Zod boundary, URI helpers, and two new error codes. Run the same command. Expected: parser/reference cases pass with no product file writes.
- [ ] Add importer tests with temporary `.beads` directories and small executable scripts, using the child-process approach in `compile.test.ts`. Assert exact command argv/root and read-only mode, no shell, no new files, and no changes to an existing rubric. Cover missing workspace/executable, malformed JSON, nonzero exit with sensitive diagnostics, a child that never exits, and stdout/stderr overflow. These scripts isolate subprocess failures; they are not synthetic Jev integration evidence.
- [ ] Run the focused command; expected: reader cases fail until implemented. Add the single bounded read with the prescribed timeout/kill/buffer settings. Do not include raw stdout/stderr or exception payloads in visible failures. Timeout assertions allow only the 5-second budget plus bounded process teardown tolerance. Expected: all Task 1 cases pass and no administrative command is recorded.

## Task 2: non-file provenance, hashing, validation, and freshness

Acceptance criteria: 2, 4, 5.

Consumes Task 1's types/helpers. Existing file candidates retain their fields. Define a Beads candidate with `origin: "beads"`, `path`, `scope`, `required`, `key`, `text`, and `sha`; it has no `absolute` field. `SourceCandidate` becomes their discriminated union, switched exhaustively by `origin` where shapes differ.

Produce these internal extensions without breaking existing file-only calls:

```ts
export const beadsSourceCandidates = (
  memories: readonly BeadsMemory[],
): SourceCandidate[];

// Additional trailing parameter, defaulting to { kind: "not-requested" }:
checkStaleness(rubric, candidates, root, beads: BeadsRead);
fillSourceShas(rubric, root, beads: BeadsRead);
```

Use existing `createSourceSha(text)` for value bytes. Keep `hashFile` strictly filesystem-only. `canonicalSourcePath` returns valid memory URIs unchanged, while all file paths retain current handling. Before filesystem access, branch on the parsed reference. Missing loaded memory hashes are not filled silently: the agent must supply the hash from its compile input.

- [ ] Add source tests for exact-value hashing, deterministic candidate order, reversible key identity, unchanged canonical URI, and file/memory coexistence. Assert a loaded batch makes changed text, added keys, and removed keys stale; `loaded: []` removes old references. Reordered keys alone remain fresh. In `not-requested` state, preserve memory hashes/references and continue checking file changes. Spy only to assert memory URIs never reach file hashing/resolution.
- [ ] Add `beadsRubric.test.ts` cases for memory-only/mixed `fillSourceShas`. Valid supplied hashes survive unchanged; file hashes still fill normally. Missing key/hash, malformed URI, and a changed current value throw `RUBRIC_INVALID` before writes. Two memory sources require one CLI reader invocation, not two. A file-only validator requires none. Global validation rejects memory references before querying Beads.
- [ ] Run `pnpm --filter @coldtea/abide exec vitest run test/sources.test.ts test/beadsRubric.test.ts`. Expected: new memory behavior fails while existing file cases retain their results.
- [ ] Implement candidates and loaded/not-requested freshness semantics with exhaustive closed-state handling. Extend `fillSourceShas` to validate memory hashes from the supplied loaded batch; invoking it with memory references and no live batch is an error rather than fabricated validation. Keep ordinary canonicalization/hashing for files.
- [ ] Update `runRubric` to identify memory references, collect once when needed, reject global imports, and pass the loaded batch into `fillSourceShas`. Memory validation failures must occur before its existing `writeRubric` call. Preserve all file-only behavior. Update schema comments to say that path/line/hash may identify a live Beads value; do not modify schema fields/version.
- [ ] Rebuild before built-bin validator cases: `pnpm build`. Repeat the focused command and `pnpm typecheck`. Expected: all Task 2 cases pass and no type errors.

## Task 3: compile live source content and preserve offline enforcement

Acceptance criteria: 1, 3, 4, 6, 7.

Consumes the reader, read state, and memory candidates from Tasks 1 and 2. Extend internal `planCompile(root, beads: BeadsRead = {kind: "not-requested"})`. Each `CompileTarget` carries the read state (`not-requested` for global targets), enabling the prompt to distinguish an empty live set from an unrequested import. Update `runCompile`'s tune target construction accordingly without adding a tune import flag.

- [ ] Add CLI tests for `compile --beads --print` with exact multiline memory text/path/hash in the compile input, no generated memory file, and no changed rubric in print mode. Assert a memories-only repo gets a project target. A loaded empty set must target a missing rubric or remove old memory-derived rules; importing an identical set with a fresh rubric may return without an agent turn.
- [ ] Test `compile --beads --global` and `tune --beads` rejection before reads/writes; import failure must not launch an agent or change the existing rubric. Assert ordinary compilation of a rubric containing memories reports that live freshness was not checked. File-only cases must still work without Beads installed.
- [ ] Test prompt instructions for loaded content versus unrequested content: loaded memory text is the source; line numbers refer to its unchanged value and supplied hashes must be written. With no live batch, retain existing memory rules/source hashes, including when recompiling changed file instructions or tuning. Loaded empty means remove previously imported memory rules, not preserve them. Flag conflicts without discarding either origin. Prompt unit assertions verify the directions; Task 4 verifies actual agent behavior.
- [ ] Add SessionStart tests: valid compiled memories-only rubric with Beads absent remains usable and is not reported as missing instruction files; changed file sources still prompt compilation with preservation instructions. Assert hooks never call the Beads reader, retain exit-0/host-output contracts, and use cached compiled rules when the database is unavailable.
- [ ] Build, then run `pnpm --filter @coldtea/abide exec vitest run test/compile.test.ts test/hook.test.ts test/sources.test.ts`. Expected: new compile/planning cases fail until integrated.
- [ ] Add the compile-only flag and preflight checks. Collect before `planCompile`; combine file candidates with loaded memory candidates. Extend `planCompile`'s target/no-sources logic to handle explicit empty imports and valid existing memory-only rubrics. Hook calls use the default unrequested state and perform no reads. Preserve old memory-derived rules through prompt instructions when imports were not requested.
- [ ] Render delimited memory source blocks in `compilePrompt` and update the compile skill to use supplied text instead of opening a virtual path. Escape/serialize block boundaries and keys so unusual source content is clearly data; do not renumber or alter the value itself. Preserve original quoted wording and existing bucket rules. Do not emit memory bodies through status/error messages or events.
- [ ] Update help/README/skill for `compile --beads`, live refresh after `bd remember`/`bd forget`, URI/line provenance, no exported source file, environment overrides, offline hooks, source conflicts, `--print` disclosure, and process-only limitations. Humanize the prose. Existing reports/repair messages can retain canonical URI strings; add assertions that they remain readable and never invent a local path. Change report formatting only if required by a failing provenance test.
- [ ] Rebuild and rerun all four focused files including `beadsRubric.test.ts`, plus `beadsMemories.test.ts`. Expected: all pass. Run typecheck and scoped formatting checks; expected: no new failures.

## Task 4: real Beads, compile-agent, and Jev validation

Acceptance criteria: 1 through 8, with live evidence for extraction and enforcement.

Use installed `bd` and a real supported compile agent. Create a disposable Git repository with a `.beads/redirect` to this checkout's existing workspace. Do not overwrite the user's modified rubric or create a new Beads database. If the installed redirect behavior differs, record its response and stop that validation rather than selecting/initializing another database.

- [ ] Confirm Beads version, read-only list output shape, workspace database identity, and the redirected read. Record duration, status, key count, and metadata exclusion. Never dump unrelated memories or credentials into evidence.
- [ ] Confirm a temporary key `abide-import-validation` is absent; otherwise choose and record a unique key. Through real `bd remember`, store: `Do not blame the user in error messages. Describe what failed and what the user can do next.` Also use temporary factual/process memories where the existing live set cannot demonstrate those buckets. Record all created keys for cleanup. Do not overwrite existing memories.
- [ ] In the disposable repo run the built CLI's `compile --beads --print`. Inspect exact source text, key URI, hash and line mapping, status, and elapsed time. Verify there is no memory export/cache/sidecar. Run `compile --beads --agent claude` (or an available Pi runner), `rubric validate`, and `report --json`. Verify real extraction: a memory-derived model rule, no invented rule for factual text, and process instructions marked unenforceable. Normal credentials stay in environment/permitted key files, never copied into memory or evidence.
- [ ] Change only a temporary memory and recompile. Verify a changed hash and changed source/rule text. Add/remove a temporary key and repeat to show live addition/removal. Repeat unchanged content in a different returned order only in the deterministic unit test; the real service need not be manipulated to change ordering. Real unchanged re-import must not cause a unnecessary agent turn when the rubric is fresh.
- [ ] If a memory changes between collection and validation, inspect the validator's actual mismatch behavior; use the deterministic Task 2 test for this race if live orchestration would be unreliable. Do not claim the race was reproduced live when only tested locally.
- [ ] Create a tracked baseline file, then a small user-blaming error-message diff and a repaired recovery-message diff. Run `check <file> --json` through the built CLI against live Jev. Record selected provider/model endpoint without credentials, memory source path/line/hash, rule ID/question, material diff, elapsed time, returned probability/band, and displayed provenance. Keep configured thresholds; do not lower them or substitute mock success. If results are inconclusive, inspect actual compiled questions, make only a source-supported question correction through the existing skill, validate, and repeat with evidence of both observations.
- [ ] With Beads absent from PATH, run ordinary offline checks and inspect that existing memory-derived rules remain selected. Trigger file-only recompilation/tuning with the real agent if applicable and verify it preserves memory references/rules without pretending to refresh them. Document the available regression evidence if no safe meaningful tune sample exists.
- [ ] Read installed `bd forget --help` and remove only the recorded temporary keys. Recompile and verify their rules/source references disappear. Confirm unrelated memory values remain intact. Clean up the disposable repo or retain safe failure artifacts with an explicit cleanup note. Do not change the existing limitation memory to claim support before successful validation; afterward update it to describe live import rather than manual copying.
- [ ] Write `docs/operations/beads-memory-import-verification.md` with safe commands/results, measured timings, source/hash evidence, extraction corrections, unexpected responses, cleanup, and unavailable validation. It may include short nonsensitive validation texts, never a full export or secrets. No claim that mocked success proves the live integration.
- [ ] Run `pnpm build`, `pnpm typecheck`, and `pnpm test`. Full tests are justified by changed source/freshness behavior shared by hook hosts and the repository's completion requirement. Run scoped `pnpm exec prettier --check <changed-files>` and `git diff --check`. Expected: exit 0; record pre-existing failures separately without cleaning unrelated work.
- [ ] Self-review against each criterion, particularly no memory file writes, no database calls in hooks, and no schema/version changes. Update `abide-bfg` with the evidence and exact results. Leave the issue open and do not merge/push.

## Landing-review correction: headless prompt transport

The first landing review found `E2BIG` for valid input below the approved reader limit. Correction evidence: [transport verification](../../operations/beads-memory-import-transport-verification.md).

- [x] Verify stdin-only prompts with the installed Claude and Pi CLIs
- [x] Run failing large-prompt transport tests before implementation
- [x] Pipe complete prompts to both runners; fail safely on a closed input pipe
- [x] Preserve small-prompt, file-only compile, tune, credential, and runner-selection behavior
- [x] Verify near-limit exact-content delivery locally and actual larger-than-argv-boundary Beads compilation with both agents
- [x] Repeat real rubric validation/report, Jev violating/repaired checks, and removal compilation; remove validation memories/repo
- [x] Run build, typecheck, full tests, active diagnostics, scoped formatting, and diff checks
- [ ] Operator/team review of the correction; leave the issue open without commit or push

## Validation matrix

| Criterion | Implementation                                | Evidence                                                                     |
| --------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| AC1       | live reader and compile preflight             | Tasks 1/3 subprocess/CLI tests; Task 4 actual redirected workspace read      |
| AC2       | URI owner, raw-value hash and source lines    | Task 1 URI/text tests; Task 2 hashing tests; Task 4 real rubric provenance   |
| AC3       | in-memory prompt sources and existing buckets | Task 3 prompt/source tests; Task 4 actual extraction/report/Jev              |
| AC4       | loaded/not-requested state and live freshness | Tasks 2/3 add/change/remove/empty/order/preservation tests; Task 4 recompile |
| AC5       | one-batch hash validation before writes       | Task 2 CLI invocation counts and race/failure tests; Task 4 live validation  |
| AC6       | bounded typed errors and offline hooks        | Tasks 1/3 negative cases, no-write assertions, and hook regressions          |
| AC7       | help, README, skill and schema comments       | Task 3 copy/provenance review and file-only regressions                      |
| AC8       | live Beads/agent/Jev plus project checks      | Task 4 verification record and exact command results                         |

## Planning evidence and limitations

During planning, `bd memories --json`, `bd recall abide-workflow --json`, and `bd -C /home/user/abide --readonly memories --json` succeeded on v1.3.0. The issue had no acceptance criteria or linked plan before this work. The file collector and hash filler assumed filesystem sources at planning time, which required the non-file references and read-state distinction.

No importer, compile integration, tests, or live Jev checks were implemented/run during planning. The product did not import Beads memories at that point; subsequent implementation results are in the verification report. Compilation remains the existing headless workflow; if an agent writes a rubric and then live validation detects a changed memory, the result is explicitly unvalidated, not automatically rolled back.
