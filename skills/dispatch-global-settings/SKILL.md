---
name: dispatch-global-settings
description: Creates, displays, and updates machine-wide settings for the /dispatch multi-agent workflow, including per-agent models. They apply to every project on this machine unless a project's own /dispatch-settings override them.
argument-hint: "[show|set|remove|replace|clear] [instructions]"
disable-model-invocation: true
allowed-tools: Read Glob Grep
---

# Global development workflow settings

Manage machine-wide instructions for `/dispatch`.

Invocation:

`/dispatch-global-settings $ARGUMENTS`

Store settings only in:

`~/.claude/personal/.dispatcher/settings.md`

Resolve `~` to the current user's absolute home directory and display the absolute target path before writing.

These settings apply to every project on this machine. Project settings managed by `/dispatch-settings` always override them on any topic covered by both, including agent models. Never read, create, or modify a project settings file from this skill.

## Shared rules

Apply these sections of the sibling `../dispatch-settings/SKILL.md` as written, with the global file above as the only target:

- Supported usage (operations `show`, `set`, `remove`, `replace`, `clear`, and free-form text as `set`);
- File creation, except that the title heading is `# Global development workflow`, the introductory text is `Managed through /dispatch-global-settings.` and `These instructions apply to /dispatch in every project on this machine unless the project overrides them.`, and only `~/.claude/personal/.dispatcher/` may be created;
- Agent models;
- Set, Remove, Replace, and Clear operations;
- Secret handling;
- Scope of stored information;
- Result report.

Skip these sections, which apply only to a project: Resolve the project root, Git-ignore check, Legacy files, and Effect on workflow runs.

## Differences from project settings

- Store only facts and preferences that hold for every project: personal working preferences, default agent models, general constraints. When an instruction names a specific repository, service, port, or command of one project, suggest `/dispatch-settings` in that project instead and do not save it globally without confirmation.
- `show` displays the global file, or reports `NO_GLOBAL_SETTINGS`, and the effective model per agent role from the global file or the agent's built-in default. It does not inspect projects.
- Updated global settings apply to future `/dispatch` runs in every project. An existing paused run keeps its frozen `project-context.md` until it is resumed with `/dispatch-resume <task-id> apply the updated settings`.

## Safety boundaries

Modify only `~/.claude/personal/.dispatcher/settings.md`.

Do not modify project files, project settings, workflow run state, other files under `~/.claude`, `CLAUDE.md`, skills, or agent definitions. Do not stage, commit, push, publish, deploy, run project commands, invoke agents, or invoke another skill automatically.
