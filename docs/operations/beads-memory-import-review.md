# Beads memory import landing review

Issue: `abide-bfg`
Date: 2026-10-14
Original disposition: BLOCKED; no landing or push

Update: the E2BIG correction and subsequent live validation are recorded in [the transport verification report](beads-memory-import-transport-verification.md). Both runners now use stdin. This document retains the original review evidence; the issue is awaiting review of the correction, not blocked on its implementation.

Reviewed the issue, approved live-import design/plan, repository instructions, implementation diff, reader and headless runners, tests, working tree, and [implementation evidence](beads-memory-import-verification.md). Unrelated changes remain untouched.

## Blocker: accepted memory input exceeds the headless argument limit

`packages/cli/src/lib/compilePrompt.ts` places the complete live memory text in the prompt. `packages/cli/src/lib/claude.ts` passes that prompt as one argument to `spawn`; `packages/cli/src/lib/headless.ts` does the same for Pi. On this Linux host both fail with `spawn E2BIG` for a 151,140-byte prompt derived from only 150,030 bytes of supported memory JSON. The approved reader accepts up to 1,048,576 bytes.

This prevents AC1/AC3 from holding for supported input sizes. Small-memory API success does not resolve a failure before the agent can start. No API request or database mutation is needed to reproduce this OS boundary; the local synthetic text isolates it without uploading a large memory to the shared workspace.

Pre-correction reproduction after `pnpm build`, from the repository root. On corrected runners this command starts real agent turns instead of failing at spawn:

```bash
node --input-type=module <<'JS'
import { parseBeadsMemories } from './packages/cli/dist/lib/beadsMemories.js';
import { beadsSourceCandidates } from './packages/cli/dist/lib/sources.js';
import { compilePrompt } from './packages/cli/dist/lib/compilePrompt.js';
import { runHeadless } from './packages/cli/dist/lib/headless.js';
const raw = {
  rule: 'Keep error messages helpful.\n'.repeat(5000),
  schema_version: 1,
};
const memories = parseBeadsMemories(raw);
const prompt = compilePrompt('/tmp/compile-skill.md', [{
  which: 'project', root: '/tmp', candidates: beadsSourceCandidates(memories),
  beads: { kind: 'loaded', memories },
  staleness: { status: 'missing' }, lintConfigs: [],
}]);
console.log({ inputBytes: Buffer.byteLength(JSON.stringify(raw)),
  promptBytes: Buffer.byteLength(prompt) });
for (const agent of ['claude', 'pi']) {
  try { console.log(agent, await runHeadless(agent, '/tmp', prompt)); }
  catch (error) { console.log(agent, error.code, error.message); }
}
JS
```

Observed: input 150,030 bytes, prompt 151,140 bytes; `claude E2BIG spawn E2BIG` and `pi E2BIG spawn E2BIG`.

Minimum remediation: deliver in-memory prompts through a supported transport that avoids argv limits for both runners (verify stdin support against the actual CLIs), without creating a memory export or truncating content. Add a regression covering successful delivery beyond this boundary and rerun small-prompt/file-only compatibility tests. Lowering the approved input limit instead would require a scope amendment; do not do so silently.

## Acceptance evidence

- AC1/AC3: ordinary small inputs have real Beads/Claude evidence, but supported larger inputs are blocked as reproduced above.
- AC2: existing URI, exact-value hash, Unicode and multiline line-number evidence inspected; regression suite passes.
- AC4: existing real add/change/remove/no-op and mixed-source preservation evidence inspected; deterministic empty/order cases pass.
- AC5: real validation evidence inspected; one-batch, hash-mismatch and pre-write preservation tests pass.
- AC6: bounded-reader and offline-hook regressions pass; the newly exposed transport boundary is not covered by those tests.
- AC7: README/help/skill/source documentation inspected.
- AC8: prior real Jev evidence inspected: POST `https://api.typesafe.ai/v1/systemone`, HTTP 200, violating blame probability 0.97 (act, 301 ms), repaired 0.10 (clear, 820 ms). No new Jev request was made in this review because the blocker occurs before model invocation. A corrected transport needs revalidation before landing.

## Commands and results this review

- `pnpm build`: both packages passed
- `pnpm typecheck`: both packages passed
- `pnpm test`: schema 6 passed; CLI 210 passed, 1 opt-in live test skipped; 0 failures
- The Node reproduction above: both runners rejected with `E2BIG`
- `git diff --check`: passed before this report; repeated after formatting
- `git remote show origin`: remote HEAD is `master`; no `main` branch is advertised

The full suite was run because source planning is shared across hook hosts and repository policy requires tests before completion. No new fixture framework was introduced. Passing tests do not override the reproduced blocker.

## Landing and next work

No commit, integration, branch switch, push, or worktree removal was performed. Work remains recoverable in the current `feat/pi-extension` checkout, including unrelated user changes. `abide-bfg` is blocked pending the transport correction.

No dependencies or dependents are linked to `abide-bfg`. Its next action is the blocker correction, not a new feature. The separate open bead `abide-8wf` has no dependencies and is READY for its own review; it was not started in this cycle.

NOTE: landing instructions name `main`, but this repository's default branch is `master`. Confirm the target before a future successful landing. This did not cause the current block.
