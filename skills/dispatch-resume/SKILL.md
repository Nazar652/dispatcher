---
name: dispatch-resume
description: Resumes a paused, blocked, or interrupted multi-agent development run from its durable checkpoint while preserving agent continuity when the original Claude Code session is available.
argument-hint: "<task-id> [correction or instruction]"
disable-model-invocation: true
---

# Resume a development run

Resume an existing multi-agent development workflow.

Invocation:

`/dispatch-resume $ARGUMENTS`

The first argument is the task ID. Everything after it is an optional human correction, clarification, or instruction.

## Orchestrator responsibility

The current main Claude Code conversation is the orchestrator.

Do not delegate orchestration to a subagent. The orchestrator reads durable state, determines the safe resume point, resumes the appropriate specialist, and maintains workflow state.

## Workflow storage root

Resolve `<project-root>` from the current project context before accessing workflow files. When invoked from a subdirectory, use native `Read` and `Glob` inspection of ancestor directories to find the nearest Git repository or worktree root (`.git` may be a directory or a file). For a non-Git project, use the explicitly established project root; ask if it is ambiguous.

All `.claude/...` paths in this skill are relative to `<project-root>`, never to the current subdirectory or the global user-level `~/.claude` directory.

The only workflow-state location is `<project-root>/.claude/personal/.dispatcher/runs/`. Do not create or use a top-level workflow-state directory in the repository root. Pass the resolved absolute run path to delegated specialists when applicable.

## Locate the run

Locate:

`.claude/personal/.dispatcher/runs/<task-id>/`

Read state.md first. Apply the Agent continuity and focused handoffs and Reports and current state sections of sibling ../dispatch/SKILL.md as shared rules, without invoking GUIDED mode. When creating a specialist, dispatch it by its plugin-scoped agent type `dispatcher:<role>` (for example `dispatcher:architect`), never the bare role name, and with the model resolved under the Workflow settings > Agent models section of ../dispatch/SKILL.md, re-reading both settings files when creating it. Then read only:

- current task-contract.md sections needed for the persisted phase, including approval and relevant policy;
- applicable project-context.md sections when needed;
- latest relevant report headers and the sections/evidence needed for the next action;
- specific decision-log.md entries only to resolve pending decisions, succession, or inconsistencies.

Do not read the full report archive or entire decision log by default. Preserve legacy artifact paths (including research-<request-id>.md); no bulk conversion or repeat research is required. Missing current state permits targeted recovery from known evidence, not an automatic full-history import.

Use native `Read`, `Glob`, and `Grep` operations for inspection.

If the task ID is missing, ask the human for it.

If the run directory does not exist, report `RUN_NOT_FOUND`. Do not create a new run and do not silently invoke `/dispatch`.

## Validate durable state

Before resuming, validate at least:

- task ID
- workflow mode
- current status
- current phase
- last durable checkpoint
- active or last agent role
- stored agent IDs
- pending questions
- repair-cycle count
- unresolved blockers
- approval state
- pending research question/requester/return phase and existing result path, when present
- per-role context observations, compaction outcomes, retired/successor IDs, and pending context handoffs (report missing fields as unknown for older runs)

If the artifacts disagree or the resume point cannot be determined safely, report `STATE_INCONSISTENT`, explain the conflict, and ask the human how to proceed.

Do not guess a resume phase when conflicting persisted evidence exists.

Do not resume a workflow whose status is `DONE` or `CANCELLED`.

A `BLOCKED` workflow may resume only after the blocker has been resolved or the human provides an instruction that resolves it.

## Session and agent continuity boundary

Exact subagent continuation depends on access to the original or resumed parent Claude Code session.

Before selecting an instance, load and apply the Per-agent context budget section of sibling `../dispatch/SKILL.md` as data. When a stored agent ID can be resumed and remains eligible under that protocol, resume that exact agent. Do not resume a context-retired instance; select its recorded successor or complete the pending handoff.

A persisted agent ID alone does not prove that the agent is currently running. Check the available native task or agent state when possible. If live state cannot be established, tell the human to inspect `/tasks`. Do not start a duplicate specialist.

If the stored agent cannot be resumed:

1. Record `AGENT_RESUME_UNAVAILABLE` in `decision-log.md`.
2. State which role and agent ID became unavailable.
3. Explain that durable artifacts remain available but hidden conversation context may be lost.
4. Ask for explicit human approval before creating a replacement agent.
5. Never describe a replacement as the same agent.

This approval is required for ordinary continuity loss. The sole standing exception is replacement under the shared Per-agent context budget protocol: the user has already authorized that action, so record CONTEXT_LIMIT and proceed without asking again once the old invocation is confirmed inactive. An unavailable agent ID or missing telemetry alone does not establish a context-limit trigger.

When replacement is approved or authorized by the context-budget protocol, give the replacement the relevant persisted task contract, project context, decisions, latest checkpoint, existing worktree state, and reports as a focused handoff, not a full transcript. Record both the unavailable ID and replacement ID. Re-run every verification gate that may have depended on unavailable context.

## Human correction

If `$ARGUMENTS` includes a correction or new instruction:

1. Persist it in `decision-log.md` before delegating further work.
2. Determine whether it changes scope, acceptance criteria, architecture, or verification.
3. Update or invalidate the task contract when necessary.
4. Record which completed gates are no longer valid.
5. Route the change to the appropriate existing specialist.

Do not silently discard work already present in the working tree.

## Specialist-review compatibility

For a legacy run whose finalized task contract does not explicitly classify both `security-reviewer` and `database-reviewer`:

1. Record `REVIEW_CLASSIFICATION_MISSING` in `decision-log.md`.
2. Do not default either review to `NOT_REQUIRED`.
3. Resume the stored architect for classification when that exact agent is available.
4. If the architect cannot be resumed, follow the replacement-approval protocol before creating another architect.
5. Continue to quality gates only after both classifications and reasons are persisted.

## Review-evidence compatibility

Load the current shared Coding policy from `../dispatch/SKILL.md` as data, including Requirements-to-plan check, Complete review package, and Evidence-based finding resolution; keep GUIDED approval rules. Preserve explicit recorded overrides and supply relevant policy changes to the reused agents. If an older contract lacks requirement coverage, resume the same architect to map the existing scope without inventing new work. Before further code review, require a reliable original task baseline and current review package; a current HEAD alone cannot reconstruct earlier dirty changes. Follow the shared protocol for missing evidence rather than inventing it.

If a finding objection is awaiting a ruling, resume its originating reviewer in the matching review phase before requiring the disputed fix. Preserve IDs, evidence, rulings, and the original baseline across interruptions; the developer cannot mark a dispute resolved. Do not increment repair cycles for an evidence-only exchange.

## Phase routing

First handle a pending CONTEXT_LIMIT handoff under the shared protocol; preserve the work phase and do not route this maintenance signal to the user as a routine question. All references below to the same or stored specialist mean the eligible instance or its recorded successor. For a pending RESEARCH_REQUIRED request, load the On-demand external research section of sibling `../dispatch/SKILL.md` as data and route it before generic user clarification. Then resume according to the persisted phase:

- `CLARIFICATION` or `NEEDS_INPUT`: present pending questions to the human, persist the answers, then resume the stored specialist.
- `PLAN_APPROVAL`: present the finalized plan and wait for explicit approval.
- `ARCHITECTURE`: resume the stored architect, or create it when not yet dispatched; apply GUIDED plan-approval rules.
- `RESEARCH`: load the shared On-demand external research protocol and inspect the request's result and live agent state. Resume the eligible researcher only if the answer is still pending; if a report already exists, deliver it to the recorded requester and restore the return phase instead of searching again. Missing/contradictory requester or return-phase state is STATE_INCONSISTENT, not permission to guess.
- `IMPLEMENTATION`: resume the stored developer.
- `MANUAL_TESTING`: resume the stored manual-tester.
- `CODE_REVIEW`: resume the stored code-reviewer.
- `SECURITY_REVIEW`: resume the stored security-reviewer when classified `REQUIRED`; otherwise report `STATE_INCONSISTENT`.
- `DATABASE_REVIEW`: resume the stored database-reviewer when classified `REQUIRED`; otherwise report `STATE_INCONSISTENT`.
- `QUALITY_GATES`: inspect persisted per-role results and live task state, then resume only required incomplete specialists without duplicating a running agent.
- `REWORK`: resume the developer with persisted findings from the manual tester and every required reviewer.
- `PAUSED`: use the recorded `resume_phase` or last unambiguous checkpoint.
- `BLOCKED`: require a recorded resolution before continuing.

If the appropriate specialist never existed, create it only when the persisted workflow authorizes that phase and no approval gate or blocker prevents it.

Preserve any existing orchestrator-session.json registration and the state STATUS header during updates. Do not create/rebind that registration or activate /dispatch hooks merely by invoking /dispatch-resume in another session. Session-scoped restoration applies only to the originally registered /dispatch session while its hook is available.

## Durable resume protocol

Before resuming or creating any specialist:

1. Update the current snapshot and append a short `PRE_RESUME` event with artifact references to decision-log.md; assign a fresh REPORT_PATH for the resumed specialist.
2. Set the workflow status to `RESUMING`.
3. Record the target phase, role, stored agent ID, and human instruction.
4. Persist state before invoking the specialist.

After successful delegation:

1. Store the active agent ID.
2. Set the workflow status and phase to their active values.
3. Update the current snapshot and append a short post-delegation event, without copying full reports or previous snapshots.
4. Report what resumed and whether it was the exact agent or an approved replacement.

Use native `Read`, `Write`, `Edit`, and `Glob` operations for `.claude/personal/.dispatcher` state. Do not use shell heredocs, `sed`, `cat`, or shell redirection to maintain workflow state.

Shell commands may be used only for necessary project diagnostics or specialist work, subject to the original task contract and project rules.

## Interruption and rollback limits

The human may interrupt at any time and provide a correction.

On interruption, persist the latest known phase, checkpoint, agent IDs, unresolved findings, and the human instruction before continuing.

Stopping or resuming does not automatically roll back source-code changes. Do not claim otherwise. Existing working-tree changes remain until explicitly inspected and handled.

Do not delete, reset, revert, overwrite, stage, commit, push, publish, or deploy unless the human separately and explicitly authorizes that action.

## Resume report

Report:

- task ID and mode
- previous and current status
- previous and current phase
- checkpoint used
- correction applied, if any
- role selected
- stored agent ID
- whether exact-agent resume succeeded
- replacement agent ID and authorization source, including CONTEXT_LIMIT when applicable
- last recorded per-agent context usage/source or unknown and any compaction/handoff outcome
- invalidated or repeated gates
- remaining blockers or required human decisions
- next expected phase
