---
name: dispatch-settings
description: Creates, displays, and updates project-level settings for the /dispatch multi-agent workflow, including per-agent models and context caps. Project settings always override the machine-wide settings managed by /dispatch-global-settings.
argument-hint: "[show|set|remove|replace|clear] [project instructions]"
disable-model-invocation: true
allowed-tools: Read Glob Grep Bash(git rev-parse --show-toplevel) Bash(git -C * check-ignore -- .claude/personal/.dispatcher/settings.md)
---

# Project development workflow settings

Manage project-specific instructions for `/dispatch`.

Invocation:

`/dispatch-settings $ARGUMENTS`

Store settings only in:

`<project-root>/.claude/personal/.dispatcher/settings.md`

Machine-wide settings live in `~/.claude/personal/.dispatcher/settings.md` and are managed only by `/dispatch-global-settings`. Never modify that file from this skill. On any topic covered by both files, project settings always win.

Do not modify a project or global `CLAUDE.md`. This keeps these instructions scoped to the multi-agent development workflow.

## Supported usage

Examples:

`/dispatch-settings show`

`/dispatch-settings In this project the backend runs with docker compose and the frontend with npm run dev.`

`/dispatch-settings set Do not run tests or linters without separate permission.`

`/dispatch-settings set use claude-opus-5-1 with high effort for the developer agent`

`/dispatch-settings remove the rule about running pytest`

`/dispatch-settings replace Use only the instructions below: ...`

`/dispatch-settings clear`

If the first argument is not a recognized operation, treat all arguments as a `set` operation.

If no arguments are provided:

1. Show the current settings if they exist.
2. Ask the human what should be added, changed, or removed.
3. Do not modify anything until the human responds.

## Resolve the project root

Prefer the Git repository root:

`git rev-parse --show-toplevel`

If the command succeeds, use its canonical result as `<project-root>`.

If the current directory is not inside a Git repository:

1. Look for a unique nearest ancestor containing `.claude/personal/.dispatcher/settings.md`.
2. If found, show the resolved root and use it.
3. Otherwise propose the current working directory and ask the human to confirm it as the project root.

Never silently use the global user directory such as `~/.claude` or `C:\Users\<user>\.claude` as the project root.

Resolve and display the absolute target path before writing.

## Git-ignore check

For a Git repository, check whether the target is ignored:

`git -C "<project-root>" check-ignore -- .claude/personal/.dispatcher/settings.md`

If the target is ignored, continue.

If the target is not ignored:

1. Warn that project workflow settings may appear in Git.
2. Ask whether to continue.
3. Do not modify `.gitignore` automatically.
4. Do not run `git add`, `git commit`, or `git push`.

The human may intentionally commit the file in another project, but this must be an explicit decision.

## File creation

If `.claude/personal/.dispatcher/` does not exist, create only that exact directory under the confirmed project root.

Create `settings.md` with these headings:

- `# Project development workflow`
- `## Project facts`
- `## Setup and services`
- `## Development and verification`
- `## Manual testing`
- `## Constraints and prohibited actions`
- `## Environment`
- `## Agent models`
- `## Additional notes`

Include this introductory text:

`Managed through /dispatch-settings.`

`These instructions apply only to /dispatch.`

Populate only sections supported by human-provided information.

Do not invent commands, paths, ports, dependencies, services, credentials, or architecture facts.

Use `Write` or `Edit` for the exact settings file. These tools are intentionally not pre-approved in frontmatter; normal session permission rules apply.

## Agent models

The `## Agent models` section holds one line per specialist role with any of the fields `model`, `effort` and `context`, for example:

- `- developer: model=claude-opus-5-1 effort=high`
- `- researcher: model=haiku`
- `- architect: effort=max`
- `- developer: model=sonnet context=300000`

Valid roles: `architect`, `developer`, `manual-tester`, `code-reviewer`, `security-reviewer`, `database-reviewer`, `researcher`. Valid `model` values: the aliases `sonnet`, `opus`, `haiku`, `fable` (always the latest version), or a full model ID starting with `claude-` (a pinned version). Valid `effort` values: `low`, `medium`, `high`, `xhigh`, `max`. Valid `context` values: the maximum active context of that role's agents as a whole number of tokens written in digits only, at least 50,000 (a smaller cap would leave no room for a fresh agent); the default is 500,000.

Translate requests such as "use opus 5.1 for the developer with high reasoning" or "limit the developer's context to 300k" (`context=300000`) into this exact form; ask when a version is ambiguous instead of guessing an ID. Refuse any other role or value and list the valid ones. A full model ID is checked only for its form here; tell the human that a mistyped ID fails when that agent is started. A field left out falls back to the other settings file, then to the default: the agent's own model in its latest version, the effort Claude Code chooses, and a context cap of 500,000 tokens. When a role line is changed, keep the fields of that line the request does not mention.

## Show operation

For `show`:

1. Resolve the project root.
2. Read the project `settings.md` if it exists and display its contents, or report `NO_PROJECT_SETTINGS`.
3. Read `~/.claude/personal/.dispatcher/settings.md` if it exists and list which of its settings this project overrides, or report `NO_GLOBAL_SETTINGS`.
4. Show the effective model, effort and context cap per agent role and where each comes from (`project`, `global`, or `default`).
5. Do not create or modify files.

## Set operation

For `set`, or free-form arguments without an explicit operation:

1. Read the existing file when present.
2. Interpret the human text as authoritative project workflow information.
3. Place each instruction in the most relevant section.
4. Preserve unrelated existing settings and useful formatting.
5. Update an existing instruction instead of creating a duplicate.
6. Save the result without separate approval when the update is additive and unambiguous.
7. Show a concise summary of what was added or changed.

If new information materially contradicts an existing instruction, show the conflict and ask the human which version should remain.

Do not silently combine incompatible commands or constraints.

## Remove operation

For `remove`:

1. Find the instruction described by the human.
2. If exactly one setting clearly matches, remove only that setting.
3. If multiple settings may match, show them and ask which one to remove.
4. Preserve all unrelated content.
5. Remove empty duplicate headings, but preserve the standard document structure.

Do not delete the entire settings file through `remove`.

## Replace operation

`replace` discards existing project settings and replaces them with the supplied instructions.

Because this can remove important setup and safety information:

1. Show a short summary of what will be replaced.
2. Ask for explicit confirmation.
3. Preserve the old file until confirmation is received.
4. After confirmation, write the new structured settings.
5. Report which previous sections were removed.

## Clear operation

`clear` resets the settings file to the basic empty structure.

It does not delete the file.

Before clearing:

1. Show that existing settings will be removed.
2. Ask for explicit confirmation.
3. Do nothing if confirmation is not received.

## Secret handling

Never store secret values in `settings.md`, even when `.claude/` is ignored by Git.

Do not store:

- passwords
- access tokens
- API keys
- private keys
- connection strings containing credentials
- session cookies
- recovery codes

The file may safely contain:

- environment-variable names
- secret-manager references
- instructions explaining how a human provides credentials
- non-secret service URLs
- required permission or scope names

If the human pastes a credential value:

1. Do not write it to disk.
2. Explain which environment-variable name or secret reference can be stored instead.
3. Recommend rotating the credential if it was exposed unintentionally.

## Scope of stored information

Appropriate settings include:

- project architecture facts
- important directories and entry points
- dependency-installation procedure
- Docker or service startup procedure
- backend and frontend startup commands
- automated verification commands
- instructions to skip particular tests or linters
- manual browser-testing steps
- required Playwright setup
- known ports and local URLs
- generated-file rules
- prohibited operations
- environment-variable names
- project-specific acceptance criteria
- cleanup procedures
- platform-specific instructions

Record commands as instructions only. Do not execute setup, Docker, builds, tests, linters, migrations, browsers, or cleanup commands while running `/dispatch-settings`.

Do not invoke agents.

## Legacy files

Earlier versions of this workflow stored project settings in `.claude/personal/project.md` (optionally overridden by `.claude/personal/project.local.md`) and run state in `.claude/personal/runs/`. `/dispatch` no longer reads them.

If any of these exist under the project root:

1. Tell the human which ones were found.
2. Offer to copy them: merge the non-secret contents of `project.md` and then `project.local.md` (the local file wins on conflicts) into `.claude/personal/.dispatcher/settings.md`, and copy `runs/` to `.claude/personal/.dispatcher/runs/`.
3. Show the conflicts and the target paths, and act only after explicit confirmation.
4. After a confirmed copy, leave the old files in place and tell the human they can delete them; never delete them yourself.

## Effect on workflow runs

A project instruction may explicitly skip individual tests, linters, formatters, type checkers, or all automated checks.

Future `/dispatch` runs must record each such omission as `SKIPPED_BY_PROJECT_POLICY`, including its policy source and residual risk. A skipped check is never reported as `PASS`.

Updated settings automatically apply to future `/dispatch` runs. A changed `context` cap in `## Agent models` is the exception: the plugin hook reads the settings files on every measurement, so it applies at once, including to running agents, and the run's recorded value follows the limit in the latest plugin line. A changed `model` or `effort` applies only when that role is next created fresh.

All run paths below are relative to the resolved `<project-root>`. Workflow state belongs only in `<project-root>/.claude/personal/.dispatcher/runs/`, never at the repository top level or in the global user-level `~/.claude` directory.

An existing run may already contain a frozen copy at:

`.claude/personal/.dispatcher/runs/<task-id>/project-context.md`

Do not silently rewrite active-run state.

To apply new settings to an existing paused run (a changed `context` cap already applies through the plugin hook; resuming only refreshes the recorded value), tell the human to use:

`/dispatch-resume <task-id> apply the updated project settings`

The resume orchestrator must record the change, refresh the resolved project context, and invalidate any affected gates.

## Safety boundaries

Modify only:

`<confirmed-project-root>/.claude/personal/.dispatcher/settings.md`

and, only after explicit confirmation under Legacy files, create `<confirmed-project-root>/.claude/personal/.dispatcher/runs/` contents copied from the legacy run directory.

Do not modify:

- source code
- tests
- dependency files
- lockfiles
- Git configuration
- `.gitignore`
- the global settings file `~/.claude/personal/.dispatcher/settings.md`
- global skills
- agent definitions
- workflow run state
- `CLAUDE.md`
- deployment configuration

Do not stage, commit, push, publish, deploy, or invoke another skill automatically.

## Result report

Report:

- confirmed project root
- absolute settings path
- requested operation
- whether the file was created or updated
- sections changed
- whether the target is ignored by Git
- detected conflicts or unresolved questions
- whether an existing active run needs its project-context refreshed
