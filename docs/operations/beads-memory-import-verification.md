# Live Beads memory import verification

Issue: `abide-bfg`
Date: 2026-10-14
Design: [live memory import](../superpowers/specs/2026-10-14-beads-memory-import-design.md)
Plan: [implementation plan](../superpowers/plans/2026-10-14-beads-memory-import.md)

## Implementation

`abide compile --beads` reads project memories live and supplies them directly to the compile agent. It writes no exported memory file, cache, or sidecar. Memory source URIs, hashes, and quoted rules live in the existing rubric. Hooks use those compiled rules without calling Beads.

Changes cover the bounded reader/URI helpers, internal source candidates and freshness, compile planning/prompt, rubric hash validation, error/help views, source schema comments, README, compile skill, and regression tests. Rubric version 1 and field shapes are unchanged. The existing modified rubric in the main checkout was not a validation target.

## Live Beads and compile-agent checks

The real workspace used database `abide`, shared server `127.0.0.1:3309`, and Beads v1.3.0 (`f45b249ce`). A disposable Git repo at `/tmp/abide-bfg-live-R6qgEM` used `.beads/redirect` pointing to this checkout's existing `.beads`. No new Beads database or service was created.

The importer invoked:

```text
bd -C <validation-root> --readonly memories --json
```

Its environment disabled Beads auto-start. The direct reader found the two original memories in 194 ms; the redirected read found five entries after temporary validation memories were added, in 454 ms. The numeric `schema_version: 1` metadata did not become a source.

Four temporary keys were used and subsequently forgotten:

- `abide-import-validation`: a diff-checkable error-copy instruction
- `abide-import-validation-fact`: a statement about the validation module
- `abide-import-validation-process`: a verification-before-closing instruction
- `abide-import-validation-added`: an additional descriptive note

The initial instruction was:

```text
Do not blame the user in error messages. Describe what failed and what the user can do next.
```

Commands used the built CLI (`node <checkout>/packages/cli/dist/bin.js`) in the disposable repo:

| Operation                                                | Result                                                                                                            | Wall time |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| `compile --beads --print`                                | Exit 0; supplied canonical URI and expected hash; only compile skill installed, no memory export                  | 1,693 ms  |
| `compile --beads --agent claude`                         | Exit 0; 13 rules: 4 model, 9 unenforceable, 0 lint/deferred                                                       | 61,421 ms |
| `rubric validate`                                        | Exit 0; live hashes validated                                                                                     | 1,354 ms  |
| Recompile after multiline edit and added memory          | Exit 0; source hash changed, error-copy rule references moved to line 2; descriptive entry added no rule          | 32,793 ms |
| Unchanged `compile --beads --agent claude`               | Exit 0; fresh, no headless turn                                                                                   | 1,671 ms  |
| Recompile after forgetting all four temporary keys       | Exit 0; only two original memory sources remain, validation rules removed                                         | 37,081 ms |
| `report --json` after removal                            | Exit 0; 10 remaining memory-derived rules with source URIs                                                        | 996 ms    |
| Ordinary `compile --agent claude` after adding AGENTS.md | Exit 0; 11 total rules, including the file's lint rule; all old memory-derived rules and hashes preserved exactly | 27,971 ms |

The multiline edit prepended `Background for this validation.` and a newline. Its original-value hash changed from `4c2f6fdcb618d37ca0560d630754bbf923908aeaa448400176e18866b1004a84` to `a8834d5164c212ea43106bd870bf333fef3d6cac80c301c1790a80fcef48c7e8`. The URI stayed `beads://memory/abide-import-validation`; both extracted error-message rules cited line 2 after recompile.

The actual compile agent omitted a rule for factual text and classified the temporary root-gate instruction as `unenforceable`. Adding `Use type instead of interface in TypeScript.` to AGENTS.md produced a lint rule while retaining the ten existing memory-derived rules byte-for-byte. Ordinary compilation explicitly reported that memories were not refreshed.

The validation repo's `.abide` directory contained only the ordinary `compile-skill.md`, `rubric.json`, and `events.jsonl`. Events did not store the full memory values. There was no memory text export or cache.

## Live Jev requests

The existing `check sample.js --json` path sent real requests to:

```text
POST https://api.typesafe.ai/v1/systemone
```

Both material requests returned HTTP 200, `Content-Type: application/json`, with returned model `jev-1.13.0` for requested model `jev-latest`. The request state contained `file: "sample.js"` and its actual Git diff. It carried three in-scope questions, including the two memory-derived error-copy rules; the unrelated generated-export rule was excluded by its scope.

The relevant question for `error-message-blames-user` asked whether an added error message blames the user instead of neutrally stating what failed. `error-message-next-step` asked whether it fails to say what failed or gives no recovery step. Both traced to `beads://memory/abide-import-validation` line 1 in the initial compiled rubric. No question or threshold correction was needed.

Baseline:

```js
export const message = "Please try again.";
```

Violating addition:

```js
export const message = "You broke this because you cannot follow instructions.";
```

Repaired addition:

```js
export const message = "The upload failed. Check your connection and try again.";
```

| Check                                        | Blame probability/band | Next-step probability/band | Jev latency | CLI wall time | Exit |
| -------------------------------------------- | ---------------------- | -------------------------- | ----------- | ------------- | ---- |
| Violating diff                               | 0.97 / act             | 0.89 / act                 | 301 ms      | 1,184 ms      | 1    |
| Repaired diff                                | 0.10 / clear           | 0.09 / clear               | 820 ms      | 1,567 ms      | 0    |
| Repaired diff, PATH containing Git but no bd | 0.10 / clear           | 0.08 / clear               | 286 ms      | 1,006 ms      | 0    |

An earlier repeat returned the same blame probabilities with Jev latencies of 337 ms and 296 ms. Thresholds remained at their normal bands; no mock verdict or reduced threshold was used. The raw API used `noul` numeric answers, which the existing SDK/checker converted into probabilities and bands. Request usage was 614 input/65 output tokens for the final violating call and 616/65 for the repaired call. There were no database writes from checking a diff.

## Automated checks

Baseline: build passed; schema 6 tests passed, CLI 167 passed and 1 opt-in live test skipped.

Final:

- `pnpm build`: both packages passed
- `pnpm typecheck`: both packages passed
- `pnpm test`: schema 6/6 passed; CLI 210 passed, 1 opt-in live test skipped, 0 failed
- Scoped Prettier checks: all matched changed files passed
- `git diff --check`: passed
- Active LSP checks after formatting: no findings; 15 files confirmed clean and 1 inconclusive. The project typecheck independently passed

New cases were run red before implementation: missing reader/URI helpers; eight provenance/validator failures; six compile/hook failures. Focused tests then passed. Author review found Zod's object parser silently dropping a `__proto__` memory and accepting an unencodable key. Two regression cases failed first, then passed after parsing validated entry tuples. Three malformed/case-variant URI cases also failed first, then passed after reserving the full Beads scheme.

Subprocess scripts are limited to deterministic failures: missing executable/workspace, invalid data, nonzero exit, oversized output, timeout, and one-read validation. They do not simulate Beads integration or Jev success. Real Beads, Claude compilation, and Jev were exercised separately as described above.

## Acceptance mapping

| Criterion                                     | Evidence                                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1: live read, no export/admin actions       | Actual direct/redirected reads, compile input inspection, directory inventory; subprocess argv/no-write tests                                             |
| AC2: key/line/hash provenance                 | Actual canonical URI, exact-value hash transition and line-2 references; Unicode/prototype/reserved-key regression tests                                  |
| AC3: memories-only, mixed sources and buckets | Real memories-only compile, factual omission, process bucket and later file-only recompile preserving all memory rules                                    |
| AC4: refresh and preservation                 | Real edit/add/remove/no-op runs; deterministic empty/order tests; offline mixed-source freshness tests                                                    |
| AC5: one live validation batch                | Real validator success; regression tests for one read across several sources, changed/missing/unhashed references, pre-write failure and global rejection |
| AC6: bounded failures/offline hooks           | Timeout/overflow/missing/invalid-output tests, pre-agent rubric preservation, hook exit/output regressions; actual check without bd on PATH               |
| AC7: user instructions                        | README/help/compile skill/schema comments updated and reviewed; file-only regressions retained                                                            |
| AC8: real integration and project checks      | The live requests/results above, full test/build/typecheck and scoped formatting results                                                                  |

## Limitations, cleanup, and data handling

- Calibration had no usable history in the disposable repo and was skipped by the real compile agent. Its emitted model rules were nevertheless tested with real violating/repaired diffs against Jev.
- The existing opt-in Pi lifecycle live test was not enabled. This change was validated through actual Claude-backed compilation, the shared checker, and existing hook regression tests.
- A concurrent memory-change/validation race, empty live database, and rare subprocess failures were tested deterministically, not reproduced by disrupting the shared service.
- Tuning with Beads offline was not exercised with a real agent: no weak/noisy tune sample was needed. Preservation instructions and normal tune regressions ran locally. Memory-containing rubric validation still requires live Beads access.
- Author self-review was performed; no independent reviewer was delegated because the operator did not request delegation.
- The four temporary memories were removed, and removal compilation verified no remaining source/rule references to them. The two original source hashes still matched their initial values. The obsolete limitation memory was updated only after successful implementation validation; the workflow memory was left unchanged.
- The disposable repo was removed after evidence collection. No production repo merge/push, issue closure, or source commit was performed. A baseline commit existed only in the disposable validation repo to produce real tracked diffs.
- TypeSafe credentials came from the existing credential loader and traveled in process environment only. No key, token, or authorization header was recorded. Imported memory text is compile input; extracted instructions and diffs are sent to Jev. Production must keep credentials out of memories and stored prompts, and review the committed rubric as usual.
