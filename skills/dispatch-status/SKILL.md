---
name: dispatch-status
description: Reports the persisted status of a /dispatch multi-agent development run without modifying state or starting agents.
argument-hint: "[task-id]"
disable-model-invocation: true
allowed-tools: Read Glob Grep
---

# Development workflow status

Report the persisted status of this development run:

$ARGUMENTS

This command is strictly read-only.

## Boundaries

- Do not edit or create files.
- Do not update checkpoints.
- Do not invoke or resume agents.
- Do not run Bash, PowerShell, project commands, tests, linters, applications, or Git commands.
- Do not change workflow status.
- Do not claim that persisted state proves an agent is currently running.
- Do not infer successful verification when evidence is absent.

## Workflow storage root

Resolve `<project-root>` from the current project context before accessing workflow files. When invoked from a subdirectory, use native `Read` and `Glob` inspection of ancestor directories to find the nearest Git repository or worktree root (`.git` may be a directory or a file). For a non-Git project, use the explicitly established project root; ask if it is ambiguous.

All `.claude/...` paths in this skill are relative to `<project-root>`, never to the current subdirectory or the global user-level `~/.claude` directory.

The only workflow-state location is `<project-root>/.claude/personal/.dispatcher/runs/`. Do not create or use a top-level workflow-state directory in the repository root. Pass the resolved absolute run path to delegated specialists when applicable.

## Select the run

The run root is:

`.claude/personal/.dispatcher/runs/`

When a task ID is supplied:

1. Read `.claude/personal/.dispatcher/runs/<task-id>/state.md`.
2. Report `RUN_NOT_FOUND` if it does not exist.
3. Do not silently select another run.

When no task ID is supplied:

1. Find `.claude/personal/.dispatcher/runs/*/state.md`.
2. If none exist, report `NO_RUNS_FOUND`.
3. Prefer the single non-terminal run when exactly one exists.
4. When multiple candidate runs exist, inspect their task IDs and persisted statuses.
5. A task ID ending in `YYYYMMDD-HHMMSS` may be ordered by that timestamp.
6. If the intended run remains ambiguous, list the candidates and ask the user to invoke `/dispatch-status <task-id>`.
7. Do not guess between ambiguous active runs.

Terminal statuses include:

- `DONE`;
- `CANCELLED`;
- `BLOCKED`.

A run waiting at `NEEDS_INPUT`, `CLARIFICATION`, `PLAN_APPROVAL`, `PAUSED`, `ARCHITECTURE`, `RESEARCH`, `IMPLEMENTATION`, `MANUAL_TESTING`, `CODE_REVIEW`, `SECURITY_REVIEW`, `DATABASE_REVIEW`, `QUALITY_GATES`, or `REWORK` is non-terminal.

## Read persisted artifacts

Read when present:

- `state.md`;
- the status/header portion of `task-contract.md`;
- only specifically needed entries in `decision-log.md` or sections in `project-context.md` when current state leaves a relevant status question unresolved;
- a latest report header only when necessary to resolve a missing/contradictory status. Do not load full report history.

Do not load unnecessarily large sections when the summary fields are sufficient.

If an expected file is absent, report it explicitly.

## Freshness rules

Treat `state.md` as persisted workflow state, not live runtime truth. Context counts and compaction outcomes are last recorded observations, not live measurements; missing values are unknown, never zero or proof of staying below the limit.

If it says an agent is running:

- report `persisted as running`;
- report the stored agent ID;
- tell the user to check `/tasks` for live runtime status.

If a checkpoint appears incomplete or contradictory:

- report `STATE_INCONSISTENT`;
- describe the conflicting fields;
- do not repair them.

If the last checkpoint was written before an interruption:

- report that work after that checkpoint may require inspection.

## Required report

Use this structure:

STATUS REPORT

Task ID:
Mode:
Persisted status:
Current phase:
Active agent:
Active agent ID:
Agent IDs by role:
Last recorded per-agent context usage, source/time, and effective limit (or unknown):
Compaction/replacement outcome and pending handoff:
Last checkpoint:
Repair cycle:
Pending questions:
Research request/question, requester, return phase, result status/path (if used):
Hard blockers:
Plan approval:
Changed files reported by agents:
Automated verification recorded:
Checks skipped by project policy:
Manual-test result:
Code-review result:
Security-review requirement:
Security-review result:
Database-review requirement:
Database-review result:
Unresolved findings:
Known risks:
Project-context path:
State path:
Contract path:
Decision-log path:

FRESHNESS

- Persisted state timestamp or task timestamp:
- Live agent state independently verified: no
- Working tree independently verified: no
- Potentially stale or incomplete fields:

NEXT SAFE ACTION

- Describe the next action implied by the persisted phase.
- Do not perform that action.
- When another command is appropriate, name it:
  - `/dispatch-resume <task-id>`;
  - `/dispatch-cancel <task-id>`;
  - answer pending questions;
  - approve or revise the plan.

Keep the report concise and respond in the same language as the user.
