# PR body compliance-event policy validation

Validated target `407854aa7a48d6724e65c7d9cc8eaef58c50d25f` against base
`3bc434120e1c69486c4a1b371e302c96a811521a`.

## End-user replay

The workflow's actual `Verify no-mistakes signature in PR body` shell step was
extracted from the parsed YAML and executed three times for the same simulated
PR:

```text
signed-1: exit=0 | Found no-mistakes signature in PR #842 body.
unsigned: exit=1 | ::error::This PR was not raised through no-mistakes.
signed-2: exit=0 | Found no-mistakes signature in PR #842 body.
```

This demonstrates the required deterministic signed, unsigned, signed body
replay from a contributor's perspective.

## Event identity and coalescing

The workflow expressions render these event identities:

```text
opened      | group=no-mistakes-required-842-9001          | PR #842 body compliance - opened - event 41 (run 9001)
edited      | group=no-mistakes-required-842-9002          | PR #842 body compliance - edited - event 42 (run 9002)
edited      | group=no-mistakes-required-842-9003          | PR #842 body compliance - edited - event 43 (run 9003)
synchronize | group=no-mistakes-required-842-head-change   | PR #842 body compliance - synchronize - event 44 (run 9004)
reopened    | group=no-mistakes-required-842-head-change   | PR #842 body compliance - reopened - event 45 (run 9005)
```

Each opened or edited body event receives its immutable `github.run_id`, so
none share a pending concurrency slot. Synchronize and reopened retain their
shared `head-change` group. Every run name exposes PR number, action, monotonic
run number, and immutable run ID.

## Preservation checks

```text
YAML parse: PASS
Preservation: PASS - reversing only the two requested hunks reproduces the base workflow byte-for-byte.
Scope: PASS - the commit changes only .github/workflows/no-mistakes-required.yml.
```

The preserved bytes include the `pull_request` trigger and event types,
read-only contents permission, `cancel-in-progress: true`, stable job/check
name, signature marker and failure copy, and all three bot exemptions. The
workflow still contains neither checkout nor secret access.

No screenshot was captured because this change has no rendered application UI,
and the branch does not yet have a PR or GitHub Actions run. This transcript is
the closest end-user-visible evidence available during targeted local
validation.
