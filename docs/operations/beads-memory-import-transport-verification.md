# Beads memory prompt transport correction

Issue: `abide-bfg`
Date: 2026-10-14
Status: correction verified in the working tree; awaiting review, not landed

The [landing review](beads-memory-import-review.md) reproduced `spawn E2BIG` in both supported runners. They passed the entire memory prompt as one argument. Claude and Pi now receive it through piped stdin, closed after the complete prompt is sent. Stdout/stderr remain streamed to the caller. A failed input pipe stops the child and returns failure. No memory export, cache, truncation, reader-limit change, or schema change was introduced.

## Regression evidence

`packages/cli/test/headless.test.ts` exercises the real runners against small executable fixtures at the external CLI boundary. Both runners must deliver a 1,040,018-byte prompt with Unicode and newlines, verified by the receiving process's SHA-256. Leading `-` and `@` text must remain input rather than options or file arguments. Cases also cover small prompts, child exit code 7, missing executables, and early stdin closure. These fixtures test transport, not model success.

Before the fix, both large-input cases failed with `E2BIG`; the small Claude stdin cases timed out because stdin was inherited rather than supplied, and Pi received empty input. After the fix, all ten transport cases pass. Compile fixtures now read stdin and continue to check file-only compile, tune, global tune, live memory refresh, and runner selection. The focused suite passes 29 tests.

The input transport keeps the existing credential filtering and permissions. `claude.test.ts` still confirms that inherited Anthropic API credentials cannot override the Claude login. Self-review found no additional transport blocker. No independent reviewer was delegated.

## Actual CLI and Beads validation

Installed versions: Claude Code 2.1.296 and Pi 1.2.0. Both accepted a small stdin-only prompt and returned `STDIN_SUPPORTED`, exit 0. Claude help documents print-mode text input; Pi's installed CLI documentation supports piped stdin. Pi trims the enclosing prompt's outer whitespace, but memory values are JSON-encoded inside the prompt, so their original whitespace and source lines remain intact.

A disposable Git repo at `/tmp/bfg-stdin-live-7yiXln` redirected `.beads` to this checkout's existing workspace. Four unique temporary memories were added: the error-copy instruction below and three descriptive background values padded with spaces. Each write was below the Beads CLI's own argv limit; together they supplied an actual live batch beyond the failing headless argument boundary.

```text
Do not blame the user in error messages. Describe what failed and what the user can do next.
```

The redirected read returned six memories in 202 ms. The normalized memory JSON measured 167,086 bytes, and its compile prompt measured 169,568 bytes. The instruction's exact-value hash was `4c2f6fdcb618d37ca0560d630754bbf923908aeaa448400176e18866b1004a84`; both agents produced line-1 rules referring to `beads://memory/bfg-stdin-validation-2553186`. Neither agent invented rules for the padded factual memories.

| Operation                                          | Exit | Wall time  |
| -------------------------------------------------- | ---- | ---------- |
| `compile --beads --print`                          | 0    | 1,102 ms   |
| `compile --beads --agent claude`                   | 0    | 50,594 ms  |
| `rubric validate` after Claude                     | 0    | 1,481 ms   |
| `report --json`                                    | 0    | 1,009 ms   |
| `compile --beads --agent pi` from a missing rubric | 0    | 115,762 ms |
| `rubric validate` after Pi                         | 0    | 1,498 ms   |
| Recompile after forgetting the four temporary keys | 0    | 36,922 ms  |
| Final `rubric validate`                            | 0    | 1,416 ms   |

The `.abide` directory contained only `compile-skill.md`, `events.jsonl`, and `rubric.json`. No exported memory file or sidecar was created. Near-1-MiB delivery was tested locally with exact-content subprocess checks; the actual model runs used the 169,568-byte prompt. Transport support does not promise that every model accepts every token count.

## Live Jev checks

The existing `check sample.js --json` path checked actual tracked Git diffs using existing credentials, supplied in environment only. The Pi-compiled questions were used without lowering thresholds or changing their wording. The rule `no-user-blame-in-errors` asked whether an added user-facing error message accuses or scolds the user; `actionable-error-messages` checked for a failed operation and a concrete next step.

Baseline: `export const message = "Please try again.";`

| Added message                                             | Blame probability / band | Next-step probability / band | Jev latency | Wall time | Exit |
| --------------------------------------------------------- | ------------------------ | ---------------------------- | ----------- | --------- | ---- |
| `You broke this because you cannot follow instructions.`  | 0.97 / act               | 0.89 / act                   | 786 ms      | 1,958 ms  | 1    |
| `The upload failed. Check your connection and try again.` | 0.04 / clear             | 0.07 / clear                 | 270 ms      | 1,407 ms  | 0    |

Each check made one real call for seven edit-phase questions. This run recorded CLI probabilities and latency, not raw HTTP metadata. The earlier verification report contains the separate endpoint/status evidence.

## Project checks and cleanup

- `pnpm build`: both packages passed
- `pnpm typecheck`: both packages passed
- `pnpm test`: schema 6 passed; CLI 220 passed, 1 opt-in lifecycle test skipped; 0 failures
- Active LSP probe on both runners and both changed test files: no errors or warnings; one pre-existing auxiliary hint on `parseCompileAgent(value: unknown)`, which already parses that boundary with Zod
- Scoped Prettier and `git diff --check`: passed

All four temporary keys were forgotten. Recompilation removed their source/rule references and left two original memory sources. A fresh read confirmed that the original two memory values had unchanged hashes and no validation keys remained. The disposable repo was removed. Credentials and full padded memory bodies were not recorded in evidence.

The modified user rubric and unrelated working-tree changes remain untouched. No source commit, merge, push, or issue closure was performed. The E2BIG correction is ready for review; `abide-8wf` was not worked in this cycle.
