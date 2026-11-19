---
name: dev-settings
description: Creates, displays, and updates project-specific instructions used exclusively by the /develop multi-agent workflow.
argument-hint: "[show|set|remove|replace|clear] [project instructions]"
disable-model-invocation: true
allowed-tools: Read Glob Grep Bash(git rev-parse --show-toplevel) Bash(git -C * check-ignore -- .claude/personal/project.md)
---

# Project development workflow settings

Manage project-specific instructions for `/develop`.

Invocation:

`/dev-settings $ARGUMENTS`

Store settings only in:

`<project-root>/.claude/personal/project.md`

Never create `.claude/personal/project.local.md`.

Do not modify a project or global `CLAUDE.md`. This keeps these instructions scoped to the multi-agent development workflow.

## Supported usage

Examples:

`/dev-settings show`

`/dev-settings In this project the backend runs with docker compose and the frontend with npm run dev.`

`/dev-settings set Do not run tests or linters without separate permission.`

`/dev-settings remove the rule about running pytest`

`/dev-settings replace Use only the instructions below: ...`

`/dev-settings clear`

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

1. Look for a unique nearest ancestor containing `.claude/personal/project.md`.
2. If found, show the resolved root and use it.
3. Otherwise propose the current working directory and ask the human to confirm it as the project root.

Never silently use the global user directory such as `~/.claude` or `C:\Users\<user>\.claude` as the project root.

Resolve and display the absolute target path before writing.

## Git-ignore check

For a Git repository, check whether the target is ignored:

`git -C "<project-root>" check-ignore -- .claude/personal/project.md`

If the target is ignored, continue.

If the target is not ignored:

1. Warn that project workflow settings may appear in Git.
2. Ask whether to continue.
3. Do not modify `.gitignore` automatically.
4. Do not run `git add`, `git commit`, or `git push`.

The human may intentionally commit the file in another project, but this must be an explicit decision.

## File creation

If `.claude/personal/` does not exist, create only that exact directory under the confirmed project root.

Create `project.md` with these headings:

- `# Project development workflow`
- `## Project facts`
- `## Setup and services`
- `## Development and verification`
- `## Manual testing`
- `## Constraints and prohibited actions`
- `## Environment`
- `## Additional notes`

Include this introductory text:

`Managed through /dev-settings.`

`These instructions apply only to /develop.`

Populate only sections supported by human-provided information.

Do not invent commands, paths, ports, dependencies, services, credentials, or architecture facts.

Use `Write` or `Edit` for the exact settings file. These tools are intentionally not pre-approved in frontmatter; normal session permission rules apply.

## Show operation

For `show`:

1. Resolve the project root.
2. Read `project.md` if it exists.
3. Display its current contents.
4. Report `NO_PROJECT_SETTINGS` if it does not exist.
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

Never store secret values in `project.md`, even when `.claude/` is ignored by Git.

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

Record commands as instructions only. Do not execute setup, Docker, builds, tests, linters, migrations, browsers, or cleanup commands while running `/dev-settings`.

Do not invoke agents.

## Existing local override

If `.claude/personal/project.local.md` already exists, do not modify it.

Warn that the existing `/develop` precedence rules may allow that file to override `project.md`.

Recommend consolidating its non-secret contents into `project.md` and removing it manually when the human wants a single configuration source.

## Effect on workflow runs

A project instruction may explicitly skip individual tests, linters, formatters, type checkers, or all automated checks.

Future `/develop` runs must record each such omission as `SKIPPED_BY_PROJECT_POLICY`, including its policy source and residual risk. A skipped check is never reported as `PASS`.

Updated settings automatically apply to future `/develop` runs.

All run paths below are relative to the resolved `<project-root>`. Workflow state belongs only in `<project-root>/.claude/personal/runs/`, never at the repository top level or in the global user-level `~/.claude` directory.

An existing run may already contain a frozen copy at:

`.claude/personal/runs/<task-id>/project-context.md`

Do not silently rewrite active-run state.

To apply new settings to an existing paused run, tell the human to use:

`/dev-resume <task-id> apply the updated project settings`

The resume orchestrator must record the change, refresh the resolved project context, and invalidate any affected gates.

## Safety boundaries

Modify only:

`<confirmed-project-root>/.claude/personal/project.md`

Do not modify:

- source code
- tests
- dependency files
- lockfiles
- Git configuration
- `.gitignore`
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
