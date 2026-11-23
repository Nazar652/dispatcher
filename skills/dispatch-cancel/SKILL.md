---
name: dispatch-cancel
description: Permanently cancels a development or analysis run, stops its exact known background tasks when possible, and preserves durable state and working-tree changes for inspection.
argument-hint: "<task-id> [reason]"
disable-model-invocation: true
allowed-tools: Read Glob Grep Edit TaskList TaskGet TaskStop
---

# Cancel a workflow

Permanently cancel an existing development or analysis workflow.

Invocation:

`/dispatch-cancel $ARGUMENTS`

The first argument is the exact task ID. Everything after it is an optional cancellation reason.

Invoking this skill explicitly authorizes cancellation of that run. Do not ask for routine confirmation when the task ID is valid and unambiguous.

## Terminal cancellation

Cancellation is a terminal workflow state.

After a run reaches `CANCELLED`, `/dispatch-resume` must refuse to resume it.

If the human wants a temporary pause, correction, or later continuation, they should interrupt the current operation and use `/dispatch-resume` instead of `/dispatch-cancel`.

Do not reinterpret temporary wording such as “pause”, “hold”, or “continue later” as permanent cancellation. Explain the distinction and ask which operation the human intends.

## Workflow storage root

Resolve `<project-root>` from the current project context before accessing workflow files. When invoked from a subdirectory, use native `Read` and `Glob` inspection of ancestor directories to find the nearest Git repository or worktree root (`.git` may be a directory or a file). For a non-Git project, use the explicitly established project root; ask if it is ambiguous.

All `.claude/...` paths in this skill are relative to `<project-root>`, never to the current subdirectory or the global user-level `~/.claude` directory.

The only workflow-state location is `<project-root>/.claude/personal/.dispatcher/runs/`. Do not create or use a top-level workflow-state directory in the repository root. Pass the resolved absolute run path to delegated specialists when applicable.

## Locate the exact run

Locate:

`.claude/personal/.dispatcher/runs/<task-id>/`

Read:

- `state.md`
- `task-contract.md`
- `decision-log.md`
- `project-context.md`, if present
- relevant checkpoints and reports

If the task ID is missing, ask the human for it.

Never select a run merely because it is the newest run.

If the run does not exist, report `RUN_NOT_FOUND`. Do not create a new run or new workflow files.

If multiple matching directories or inconsistent task IDs are found, report `TASK_ID_AMBIGUOUS` and stop.

## Validate current state

Before modifying state, record:

- current status
- current phase
- last checkpoint
- active specialist role
- stored agent IDs
- stored background task IDs
- pending questions
- repair-cycle count
- unresolved blockers

For ANALYSIS runs, use the recorded questions, evidence and pending action in place of development-only fields. A run can have no specialist.

If required workflow artifacts disagree, report `STATE_INCONSISTENT` and do not modify them.

If the run is already `CANCELLED`, report `ALREADY_CANCELLED`. Treat the command as an idempotent no-op.

If the run is `DONE`, report `ALREADY_DONE`. Do not rewrite it as cancelled.

## Agent IDs and background task IDs

An agent ID and a background task ID are not automatically interchangeable.

Use `TaskList` and `TaskGet` to inspect live background work in the current parent session.

Use `TaskStop` only with an exact background task ID confirmed to belong to this workflow.

Never pass a stored agent ID to `TaskStop` unless native task state explicitly confirms that it is also the relevant background task ID.

Never stop all background tasks. Never stop a task based only on role name, recency, or a partial ID.

Do not invoke, resume, or create any agent during cancellation.

## Cancellation protocol

Perform cancellation in this order:

1. Append a `CANCEL_REQUESTED` entry to `decision-log.md`.
2. Record the human reason, previous status, previous phase, active role, agent IDs, background task IDs, and last checkpoint.
3. Change workflow status to `CANCEL_REQUESTED` while preserving the previous phase.
4. Persist a `PRE_CANCEL` checkpoint before stopping anything.
5. Inspect current-session background tasks.
6. Stop each exact confirmed task belonging to this run with `TaskStop`.
7. Record the result for every attempted stop.

If no active task exists and persisted state is otherwise consistent:

1. Set status to `CANCELLED`.
2. Set active role and active task to `none`.
3. Preserve all historical agent IDs.
4. Record the cancellation timestamp and reason.
5. Append a final `CANCELLED` checkpoint.

If every exact active task is confirmed stopped, finalize the run as `CANCELLED` using the same procedure.

## Unconfirmed active work

If persisted state says work may still be active but the exact task cannot be found or stopped:

1. Set status to `CANCEL_PENDING_AGENT_STOP`.
2. Record `STOP_UNCONFIRMED` in `decision-log.md`.
3. Preserve the suspected role, agent ID, and task ID.
4. Tell the human to inspect `/tasks` in the original or resumed parent session.
5. Do not claim that cancellation is complete.
6. Do not continue to another workflow phase.

After the task is manually stopped, the human may invoke `/dispatch-cancel <task-id>` again to finalize the cancellation.

## Foreground work

The skill cannot run concurrently with a foreground specialist response.

If foreground work is misbehaving, the human should first interrupt it with `Ctrl+C` or the Desktop stop control, then invoke `/dispatch-cancel`.

Record that the foreground operation was human-interrupted. Do not claim that its partial file changes were reverted.

## External processes

Stopping a Claude background task does not prove that Docker containers, development servers, browser sessions, test runners, or other detached operating-system processes were stopped.

Do not run broad process-kill commands.

Do not stop Docker, databases, shared services, or unrelated application processes automatically.

Only report exact run-owned processes recorded in durable state. List them as possible cleanup items for the human.

## Preserve evidence and source changes

Cancellation must preserve:

- the complete run directory
- task contract
- decision log
- checkpoints
- specialist reports
- agent IDs
- test and review evidence
- source-code changes already present in the working tree

Do not delete the run directory.

Cancellation does not automatically roll back source-code changes.

Do not delete, reset, revert, overwrite, clean, stash, stage, commit, push, publish, or deploy source changes.

Do not promise automatic rollback.

## State editing

Use native `Read`, `Glob`, `Grep`, and `Edit` operations for workflow state.

Do not use Bash, PowerShell, shell redirection, heredocs, `sed`, or `cat` to maintain `.claude/personal/.dispatcher` files.

Modify only the exact run identified by the supplied task ID.

When cancellation is finalized as CANCELLED, keep a plain `STATUS: CANCELLED` header at the start of state.md. If this exact run has orchestrator-session.json, set active to false with native Edit; preserve the marker and other evidence. Do not create a registration or touch another run. CANCEL_PENDING_AGENT_STOP remains an unfinished cancellation.

## Cancellation report

Report:

- task ID
- cancellation reason
- previous status and phase
- last checkpoint
- active role
- stored agent IDs
- confirmed background task IDs
- stop result for each exact task
- final status: `CANCELLED` or `CANCEL_PENDING_AGENT_STOP`
- final checkpoint
- possible external processes still running
- confirmation that durable artifacts were preserved
- confirmation that working-tree changes were not reverted
- safe next action
