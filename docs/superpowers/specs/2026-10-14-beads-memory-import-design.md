# Live Beads memory import

Issue: `abide-bfg`
Status: approved by the user on 2026-10-14

## Requirement and scope

Abide must read Beads memories live and compile them into its rubric. The user explicitly rejected exporting memories to a new text file. Memory-only instructions must not require copying into `AGENTS.md`.

Add `abide compile --beads` for explicit project-memory import. Read the existing project workspace, include memory text in the compile input, and persist only the ordinary rubric with memory source references and hashes. Do not write an exported memory file, cache, or sidecar. Existing file-only workflows require no Beads installation.

The user approved the explicit import flag and offline hook checks after requiring live imports without text exports.

## Live Beads boundary

Invoke once per requested read, without a shell:

```text
bd -C <repo-root> --readonly memories --json
```

Require a `.beads` workspace at the resolved repository root; let Beads resolve an existing worktree redirect. Use its ordinary connection configuration and environment. Do not initialize, select another database, pass `--global`, query raw Dolt tables, migrate, start/stop services, retry, or write issues/memories as part of import.

Resolve the executable with the existing utility. Bound each read to 5,000 ms, use `SIGKILL` on timeout, ignore stdin, and limit buffered output to 1,048,576 bytes. Never truncate or compile partial output. A missing executable/workspace, redirect failure, timeout, exit failure, overflow, or invalid output fails explicitly before launching the compile agent.

Parse JSON into `unknown`, then Zod-validate an object with nonempty memory keys and string values, plus an optional `schema_version: 1` metadata property. Exclude only that numeric metadata property. Support empty objects and empty string values; reject arrays, nested/non-string values, and unsupported versions. Memory values are source data, not commands to execute.

Observed on this host, `bd` v1.3.0 returned a flattened key/value object from `bd memories --json` with numeric `schema_version: 1`. `bd recall --json` has a different envelope and is not needed. The read-only list invocation also succeeded. No import has been implemented during planning.

## In-memory sources and provenance

Extend the internal source candidate type as a discriminated union using `origin`: file candidates retain their existing fields; `origin: "beads"` candidates carry the memory key, exact text, source path, hash, required flag, and `**/*` scope, with no fake absolute file path. Update only consumers that need to distinguish those shapes.

Memory source paths use `beads://memory/<encoded-key>`, with `encodeURIComponent` applied to the full key. One creation function owns this format, and one parser decodes and validates canonical round trips. Reject malformed reserved Beads URIs; never pass them to filesystem path resolution or hashing. File references retain existing canonicalization, symlink handling, and hash behavior.

Hash the exact UTF-8 bytes of the memory value using existing `createSourceSha`; key identity is in the URI. Source lines are 1-based lines within that value, not lines in an export or in CLI output. Preserve whitespace, Unicode, Markdown, and multiline wording. Sort memory candidates by ordinal key comparison for stable prompts; ordering alone cannot change source hashes.

The rubric's existing `sources[].path`, `sources[].sha`, and `rules[].source.path/line` fields can represent these references. Keep rubric version 1 and its field shapes unchanged. Update their documented meaning to include memory references. No timestamp, database credential, or connection configuration becomes source content.

The compile prompt includes explicitly delimited memory key/path/hash/text blocks in memory. It must identify them as supplied source material, with line numbers counted within the unmodified value. The compile skill reads file sources normally and reads Beads sources from these blocks. `--print` prints these source blocks intentionally; document that it reveals memory contents. Normal status/errors do not print memory text or raw subprocess diagnostics.

## Compilation and validation

Live collection happens before freshness planning, including the fresh-rubric early return. Add the live candidates to project file candidates, retaining both origins. A memories-only repository can compile. A successful empty result permits compilation of an empty rubric or removal of previously imported rules; it must not leave removed memories silently enforced.

Reject `compile --beads --global` before any read. `tune` does not acquire an import flag in this issue; it preserves previously imported memory rules/hashes while tuning eligible compiled questions. Ordinary file-only compilation must likewise preserve existing memory-derived rules/source references when memories were not requested. Make this requirement explicit in prompt/skill instructions; do not drop memories just because only files were discovered.

`abide rubric validate` recognizes memory references. When a project rubric contains them, it loads the live memory set once through the same bounded reader, compares each supplied memory hash with the current value, and leaves memory paths unchanged. The compile prompt instructs the agent to write the supplied hash for every Beads source, unlike file hashes that validation can fill. Missing memory, missing supplied hash, or a hash mismatch fails before validator writes: request recompilation instead of certifying stale text. Validate all memory references against the same batch, not one command per rule/source. File-only validation never calls Beads. Global validation rejects Beads references.

A memory can change between collection and the agent's validation command. The hash comparison catches that race. An agent may already have written an unvalidated rubric when validation fails; do not promise atomic rollback of the existing headless compile workflow or add a new staging framework to solve it. Surface the failure and preserve evidence.

## Freshness and offline hooks

Use a closed read state to distinguish `not-requested` from `loaded`, including a valid empty loaded set. In the loaded state, compare memory references and hashes with that batch: changed values, new keys, and removed keys make the rubric stale. No command retries or per-source queries.

Without a requested live read, freshness checks apply to files and leave memory references/hashes untouched. They must not misinterpret a URI as a missing local file or claim that the database was checked. If a rubric includes memories, ordinary CLI compilation explains that `compile --beads` refreshes them. SessionStart can recompile changed file sources while instructing the agent to retain unrefreshed memory-derived rules. A valid memories-only compiled rubric remains usable without local instruction files.

SessionStart, edit, and stop hooks never query Beads or persist memory content. They use the committed rubric. Preserve their exit-0, bounded-time, and host JSON contracts when Beads is missing or offline. Memory changes take effect after another explicit live compile, not after every edit.

## Extraction and conflicts

Only imperative memory statements become rules. Descriptive facts and observations create no invented rules. Reuse the existing lint/model/deferred/unenforceable buckets. Process instructions such as running a verification gate before closing work are `unenforceable` because a diff cannot establish them.

Keep memory references and quoted wording readable in existing reports/verdicts. Decode the key for people if needed; do not invent a local filename. Preserve both origins when files and memories differ, with distinct rule IDs using existing conventions. Flag contradictory instructions for review rather than silently selecting a winner. No precedence or merge framework is added.

## Failures and sensitive data

Add only `BEADS_UNAVAILABLE` (missing executable/workspace) and `BEADS_IMPORT_FAILED` (read/parse/version/size failure) to the existing stable error-code union. Use `SETTINGS_INVALID` for incompatible flags and `RUBRIC_INVALID` for malformed memory references, missing hashes, removed memories, or changed-during-validation source content. Fail explicit CLI operations with nonzero status and concise messages; do not print Beads stdout/stderr or wrap an exception containing memory text into visible diagnostics.

Reader failure before compile agent launch leaves the prior rubric unchanged. Validation failure occurs before that command writes hashes. Nothing writes a memory export/cache file in either path.

Memory text reaches the compile agent, and extracted instructions reach the judge. Users must keep credentials and sensitive data out of imported memories, just as they must keep them out of instruction files. No arbitrary-secret detector is promised. Import never copies credentials/config files or logs tokens. `--print` exposes source values by design, so do not save it to repository logs when memories contain sensitive data. All implementation evidence must omit real secrets.

## Acceptance criteria

1. `abide compile --beads` reads the existing project workspace live via one bounded, read-only list command and supplies the validated memory values to the compile agent. No memory export, cache, sidecar, admin operation, or issue mutation occurs.
2. Every imported source/rule traces to a canonical memory-key URI and 1-based line within the original value. Hashes use the original UTF-8 bytes. Unicode, multiline text, reserved characters in keys, empty values, and metadata exclusion work without a rubric field/version change.
3. Memories-only projects compile; file and memory sources coexist. Descriptive content creates no rules; process-only instructions use `unenforceable`; diff-checkable instructions use the existing buckets and checker. Conflicts retain readable provenance instead of silent precedence.
4. Explicit recompile detects changed, added, and removed live memories, including a successful empty list. Key order alone is fresh. No false URI-as-file removal occurs. Unrequested memory reads preserve already compiled memory rules and do not claim live freshness.
5. Project rubric validation makes at most one bounded memory read, confirms supplied hashes, and fails before writes on missing/changed/invalid memory references. File-only validation does not need Beads. Global Beads import/validation is rejected.
6. Missing workspace/executable, redirect failure, timeout, exit failure, overflow, malformed/unsupported output, and conflicting flags return useful typed errors. Pre-agent failures preserve the existing rubric; hooks remain offline, bounded, exit 0, and emit only host-compatible output.
7. Help, README, compile skill, and source schema documentation explain live import, URI/line provenance, explicit refresh, preservation of unrefreshed rules, offline enforcement, `--print` disclosure, and process-rule limits. Existing file-only behavior remains compatible.
8. Evidence includes a real project/worktree Beads read, real compile/validate/report behavior, memory change/removal recompilation, and a memory-derived diff-checkable rule exercised against live Jev with latency measured. Run relevant tests, build, typecheck, and scoped formatting checks; document unavailable live access instead of claiming mocked success.

## Non-goals and handoff

Automatic live reads in hooks, global memories, import of issues/dependencies, Beads administration, an exported text file or memory cache, new rubric version, automatic conflict resolution, enforcing process rules through diffs, dependency upgrades, and unrelated refactoring.

The prior snapshot proposal is superseded by this approved live design. Implementation evidence is recorded in [the verification report](../../operations/beads-memory-import-verification.md). The issue stays open for the operator's review.
