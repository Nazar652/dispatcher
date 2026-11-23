---
name: analyze
description: Answer questions about a project's behavior or data with verifiable evidence. Supports quick codebase questions and resumable benchmarks or client reports.
argument-hint: "<question or analysis task>"
disable-model-invocation: true
---

# Analyze a project

$ARGUMENTS

Open with the SessionStart header once in chat. Use the current session title and Claude session ID (`${CLAUDE_SESSION_ID}`); if unnamed, label a short task description as a working title. If the runtime provides no ID, say so.

Answer a focused question directly in the main chat using the relevant code, documents or data. Cite the evidence and distinguish observed behavior from inference. A single-turn answer needs no run directory, plan approval or specialist. If the question is empty, ask what the user wants to learn.

## Resumable analysis

When work needs multiple stages, an external input, a specialist, or a deliverable that will be verified separately, keep a checkpoint. Update the phase, status, evidence pointers and next action at each handoff, interruption and delivery. Use the Workflow storage root and Workflow settings sections of the sibling `../dispatch/SKILL.md` for project location and applicable settings. Reading shared policy does not start a development run.

- Create a fresh task slug with a timestamp under `.claude/personal/.dispatcher/runs/`. With native file tools initialize `state.md` (plain `STATUS: RUNNING` header, task ID, title, `Mode: ANALYSIS`, phase, pending action), `task-contract.md` (questions, sources, method and requested deliverable), and `decision-log.md` (material choices and checkpoints). Register `orchestrator-session.json` under the shared Session-scoped role restoration protocol with workflow `analyze` and the current runtime session ID. Show the resumable task ID to the user.
- Start in `ANALYSIS`. Agree on a method only when a choice changes what the result means. For a benchmark, record the cohort, time window, denominator, baseline, and variables held constant where relevant. Identify selection bias and distinguish illustrative examples from population estimates.
- Read authorized sources and analyze local data. Keep scratch scripts and intermediate results in the run's `work/` directory. Leave project source and operational data intact. Honor user-run exports and access boundaries. Record the precise missing input, its owner and the next action as `NEEDS_INPUT` before waiting. Ask only for what is still needed.
- Delegate only when it helps. Use `dispatcher:architect` for a static project or methodology question and `dispatcher:developer` for reproducible calculations or preparing a bounded export. Pass `MODE: ANALYSIS`, question, scope, sources, output location and a fresh role-owned report path. Apply the shared agent settings, continuity, context-budget and report-delivery mechanics. Use the analysis report format in the role instructions. Record agent/task IDs, evidence paths and checkpoint before and after each handoff.
- In `VERIFICATION`, match checks to claims. Trace a factual answer to its source. For material metrics reconcile counts or independently recompute them from the recorded input. For comparisons check the baseline and competing explanations. Save dataset version, filters, calculation and check results sufficient to reproduce important numbers. Use focused independent scrutiny when the result will guide a decision or go to a client.
- In `DELIVERY`, answer each question with evidence, assumptions and material limitations. Verify any requested artifact exists at its agreed destination before marking `DONE`. An inconclusive result can close a question when supported by the evidence. A pending agreed export, check or deliverable keeps the run open. Update state, deactivate the session marker on completion, and return the result or the verified artifact link.

## Resume

Use the existing run. Read its state, relevant contract sections and latest evidence for the pending action. Apply the Session and agent continuity boundary of `../dispatch-resume/SKILL.md` if a specialist was delegated. Preserve existing registrations and use the current chat's session ID for the greeting. On a correction, record the decision and revisit only affected claims. Continue `ANALYSIS`, `VERIFICATION` or `DELIVERY` at its recorded checkpoint. For a paused or waiting run, process the outstanding input or blocker first. For unfinished cancellation, direct the user to `/dispatch-cancel <task-id>` and leave analysis suspended. Leave `DONE` and `CANCELLED` terminal. If the phase or evidence conflicts, resolve the specific discrepancy before advancing. Never repeat a completed export or external document creation just because the conversation resumed.
