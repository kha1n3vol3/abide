# Beads memory import landing validation

Issue: `abide-bfg`. Integrated onto `origin/master` at `341800b` in `/home/user/abide-bfg-landing`. The operator approved `master` as the landing target and an isolated worktree. The original dirty checkout was not used for integration.

## Review and acceptance evidence

No remaining blocker was found. The earlier E2BIG defect is fixed by stdin transport in both runners. Only the import implementation, tests, approved design/plan, and verification documents are included; Beads setup, the modified user rubric, and other untracked work are excluded.

| Criterion | Evidence                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1       | Bounded read-only reader inspected; real redirected Beads read and both compile agents passed with a 169,627-byte prompt; no memory export                                                                         |
| AC2       | Canonical URI, exact-value SHA and original line-1 provenance verified live; Unicode/prototype/malformed URI regressions pass                                                                                      |
| AC3       | Real memories-only compilation with both agents produced error-copy model rules and no rules for factual padding; prior mixed-source/process evidence inspected; conflict-preservation skill instructions retained |
| AC4       | Live removal compilation passed; prior edit/add/no-op and offline preservation evidence inspected; empty/order/freshness regressions pass                                                                          |
| AC5       | Live validators passed after both agents and removal; one-batch/hash-mismatch/pre-write/global-rejection regressions pass                                                                                          |
| AC6       | Missing executable/workspace, nonzero exit, timeout, overflow, invalid output, conflicting flags, pipe failure, and offline hook regressions pass; destructive shared-service failure tests were not attempted     |
| AC7       | README/help/skill/schema documentation reviewed; print disclosure, offline enforcement, explicit refresh, and process limits retained                                                                              |
| AC8       | Integrated build exercised against real Beads, Claude, Pi, and Jev; full build/typecheck/tests and scoped formatting passed                                                                                        |

Detailed earlier evidence: [initial verification](beads-memory-import-verification.md) and [transport correction](beads-memory-import-transport-verification.md).

## Integration

Four routine conflicts were resolved in source discovery, path imports, compile planning, and test imports. Upstream `manual` rubric behavior, home-directory exclusion, and configured Claude source paths were retained. A regression confirms explicit Beads import still reads once but neither overwrites a manual rubric nor launches an agent.

The first full suite failed in `homeRoot.test.ts` (4), `piMutations.test.ts` (2), and `replayCommand.test.ts` (15): pre-existing `.git`/`.abide` markers in `/tmp` and `/var/tmp` made fixtures resolve to those ancestor roots. No product code was changed to mask this. Running with a clean temp ancestor passed.

## Integrated live validation

Commands used the integrated `packages/cli/dist/bin.js` in disposable repo `/tmp/bfg-stdin-live-7hF0wG`, with `.beads/redirect` pointing to the existing workspace. Four unique validation keys were added, then removed.

- `compile --beads --print`: exit 0, 1,063 ms
- `compile --beads --agent claude`: exit 0, 47,391 ms
- `rubric validate`: exit 0, 1,435 ms
- `report --json`: exit 0, 965 ms
- `compile --beads --agent pi` from a missing rubric: exit 0, 113,233 ms
- `rubric validate`: exit 0, 1,507 ms
- Removal recompile/validation: exit 0, 28,233/1,493 ms

Both agents quoted the error-copy instruction at `beads://memory/bfg-stdin-validation-2687580`, line 1, hash `4c2f6fdcb618d37ca0560d630754bbf923908aeaa448400176e18866b1004a84`. Neither invented rules for the three descriptive padded values. The real read took 160 ms for six memories; normalized input was 167,133 bytes.

`check sample.js --json` sent real `POST https://api.typesafe.ai/v1/systemone` requests with `model: jev-latest`, `state.file: sample.js`, the actual Git diff, and six compiled questions. Responses were HTTP 200 with model `jev-1.13.0`; response answers matched displayed probabilities. No credential headers were recorded.

Baseline: `export const message = "Please try again.";`

| Replacement message                                       | Blame / next-step probability | Band          | Jev latency | CLI exit |
| --------------------------------------------------------- | ----------------------------- | ------------- | ----------- | -------- |
| `You broke this because you cannot follow instructions.`  | 0.98 / 0.84                   | act / act     | 429 ms      | 1        |
| `The upload failed. Check your connection and try again.` | 0.05 / 0.07                   | clear / clear | 295 ms      | 0        |

Questions checked blaming/scolding language and omission of a failed operation or concrete next step. Thresholds and questions were unchanged. Usage was 811/128 and 813/128 input/output tokens. The `.abide` directory contained only the normal skill, events, and rubric. After removal compilation, only the two original sources remained; their live memory hashes were unchanged. Temporary keys and the disposable repo were removed.

## Final checks

Executed in the landing worktree:

```sh
pnpm install --frozen-lockfile
pnpm exec prettier --write $(git diff --cached --name-only)
pnpm build
pnpm typecheck
TMPDIR=/run/user/1000/bfg-test-tmp pnpm test
```

Build/typecheck passed. Schema: 6 passed. CLI: 332 passed, 1 opt-in lifecycle test skipped. Active diagnostics on conflict-resolved files found no type errors; auxiliary style hints were not concrete defects. Scoped Prettier check and `git diff --check` also passed before commit.

No independent reviewer was delegated. Real integration was repeated after conflict resolution. The optional lifecycle test remains skipped; shared hook regressions and both actual compile runners passed.

## Next work

`abide-bfg` has no linked dependencies or dependents. Separate bead `abide-8wf` is READY for workflow-memory persistence/session-delivery verification. Its historical E2BIG wording needs updating after landing; it was not started here. The original checkout must be retained because it contains unrelated uncommitted work.

## Fork validation before the upstream PR

The operator's fork, `kha1n3vol3/abide`, contains the feature at `a4b7c05`. Upstream `coldteadotai/abide` is at `f68770d`, with `master` as its default branch. A new `feat/beads-memory-import` branch applies the feature to that upstream base with a descriptive commit message, without rewriting fork `master`. Runtime code matches the previously landed feature; this section adds the fresh validation record. No local Beads setup, generated rubric, or unrelated dirty-checkout changes are included.

Fresh checks in the isolated PR worktree:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
TMPDIR=/run/user/1000/abide-pr-tests pnpm test
pnpm exec prettier --check $(git diff --cached --name-only)
git diff --cached --check
```

All passed: schema 6 tests, CLI 332 tests, one opt-in lifecycle test skipped. `pnpm format:check` reported one warning in the unchanged upstream file `docs/video/release-0.0.7.html`; it was not reformatted. No fork Actions workflows were listed. Automatic Pi lifecycle validation and package release validation were not performed.

The built fork feature was exercised again against live Beads, Claude, Pi, and Jev. A redirected read returned six memories in 201 ms, producing a 169,592-byte prompt. Both agents compiled the original instruction at line 1 of `beads://memory/bfg-stdin-validation-2729948` with hash `4c2f6fdcb618d37ca0560d630754bbf923908aeaa448400176e18866b1004a84`; neither turned padded facts into rules.

| Operation                                          | Exit  | Wall time         |
| -------------------------------------------------- | ----- | ----------------- |
| `compile --beads --print`                          | 0     | 1,238 ms          |
| `compile --beads --agent claude`                   | 0     | 48,695 ms         |
| `rubric validate` after Claude                     | 0     | 1,414 ms          |
| `report --json`                                    | 0     | 976 ms            |
| `compile --beads --agent pi` from a missing rubric | 0     | 105,111 ms        |
| `rubric validate` after Pi                         | 0     | 1,486 ms          |
| Removal recompile / validation                     | 0 / 0 | 49,083 / 1,467 ms |

Real `POST https://api.typesafe.ai/v1/systemone` calls requested `jev-latest` with `state.file: sample.js`, the tracked Git diff, and three compiled questions. Both returned HTTP 200 and `jev-1.13.0`. The same baseline, violating message, and repair shown above yielded blame/next-step probabilities of 0.97/0.86 (act, CLI exit 1, Jev 295 ms) and 0.05/0.05 (clear, CLI exit 0, Jev 265 ms). Questions asked whether the new error message blamed/scolded the user or omitted the failed operation/next action. Response answers matched the CLI verdicts; no thresholds or questions were changed.

The disposable repo and four temporary memories were removed. Original memory values were unchanged, and removal recompilation left only the two original sources. No memory export appeared in `.abide`; it held only the normal rubric, skill, and events. Credential headers and keys were not recorded. `abide-8wf` was subsequently verified and closed with the operator-approved status wording; both Beads issues are closed.
