# dispatcher

A Claude Code plugin that adds a guided, multi-agent development workflow. The `/dispatch` command takes a task through an architect, a developer, a manual tester and reviewers. Every stage ends with a written report, and you approve the plan and the result.

## What's inside

| Command | What it does |
|---|---|
| `/dispatch <task>` | Starts the development workflow for a task |
| `/dispatch-status [task-id]` | Shows the state of a run without changing anything |
| `/dispatch-resume <task-id>` | Resumes an interrupted run from its last saved checkpoint |
| `/dispatch-cancel <task-id>` | Permanently cancels a run |
| `/dispatch-settings ...` | Settings for the current project, such as how to start, test or lint it, and agent models |
| `/dispatch-global-settings ...` | Settings for every project on this machine |

If a short name is taken by another command, use the full one, for example `/dispatcher:dispatch`.

The agents are `architect`, `developer`, `manual-tester`, `code-reviewer`, `security-reviewer`, `database-reviewer` and `researcher`, all prefixed with `dispatcher:`.

## Installation

From a git repository:

```
claude plugin marketplace add Nazar652/dispatcher
claude plugin install dispatcher@dispatcher
```

From a local folder, without git:

```
claude plugin marketplace add /path/to/repo
claude plugin install dispatcher@dispatcher
```

You can run the same commands inside a session as `/plugin marketplace add ...` and `/plugin install ...`. Start a new session afterwards so the plugin loads.

Installing with the CLI keeps the plugin on that machine only. Uploading it through Settings → Customize → Plugins → Add in the Claude app saves it to your claude.ai account instead, and it then syncs to every device signed in with that account.

To try the plugin without installing it, load it for a single session:

```
claude --plugin-dir /path/to/repo
```

## Requirements

- `python3` 3.9 or newer on `PATH`. The plugin's hooks run on it.
- Access to the Opus, Sonnet and Haiku models. By default the architect runs on Opus, the developer and all reviewers on Sonnet, and the manual tester and researcher on Haiku; see Settings to change this.
- Recommended: the Playwright plugin, which the manual tester uses for browser checks. Without it the tester falls back to the CLI and API. Install it with `claude plugin install playwright@claude-plugins-official`.

## Settings

Settings are plain Markdown files with two levels:

| Level | File | Command |
|---|---|---|
| Global, every project on this machine | `~/.claude/personal/.dispatcher/settings.md` | `/dispatch-global-settings` |
| Project | `<project>/.claude/personal/.dispatcher/settings.md` | `/dispatch-settings` |

On any topic covered by both, the project setting always wins. An instruction you give in the current conversation wins over both.

Both commands take `show`, `set`, `remove`, `replace` and `clear`, or free text, which works like `set`:

```
/dispatch-global-settings set use haiku for the researcher
/dispatch-settings set the backend runs with docker compose up
/dispatch-settings show
```

### Agent models

The `## Agent models` section of either file sets the model and the reasoning effort per agent, one line per role, with one or both fields:

```
## Agent models

- developer: model=claude-opus-5-1 effort=high
- researcher: model=haiku
- architect: effort=max
```

- `model`: an alias (`sonnet`, `opus`, `haiku`, `fable`), which always means the latest version, or a full model ID such as `claude-opus-5-1` to pin a version.
- `effort`: `low`, `medium`, `high`, `xhigh` or `max`.

Each field is resolved on its own: the project file first, then the global file, then the default. The default model is the agent's own (`opus` for the architect; `sonnet` for the developer and the code, security and database reviewers; `haiku` for the manual tester and researcher) in its latest version; the default effort is whatever Claude Code picks for that agent. A running agent keeps its model and effort; a change applies the next time that agent is started fresh.

The model is applied by the plugin's `agent.spawn` hook (`hooks/agent-models.ts`), because the Agent tool itself only accepts aliases. `/dispatch` passes the effort when it starts each agent. Setting effort needs Claude Code 2.1.292 or newer.

### In each project

Run state, reports and project settings live in `<project>/.claude/personal/.dispatcher/`. Add this folder to the project's `.gitignore`:

```
.claude/personal/
```

Older versions used `.claude/personal/project.md` and `.claude/personal/runs/`. `/dispatch` no longer reads them, and `/dispatch-settings` offers to copy them to the new location.

## Updating

The maintainer edits the files, bumps `version` in `.claude-plugin/plugin.json` and pushes. Everyone else refreshes the catalog, then updates the installed plugin and restarts Claude Code:

```
claude plugin marketplace update dispatcher
claude plugin update dispatcher@dispatcher
```

Auto-update is off by default for private marketplaces.

## Layout

The repository root is the plugin. Claude Code only installs plugins from a marketplace, so `marketplace.json` is a one-entry marketplace that points at the root.

```
.claude-plugin/plugin.json           plugin manifest
.claude-plugin/marketplace.json      one-entry marketplace (dispatcher)
skills/                              dispatch, dispatch-status, dispatch-resume, dispatch-cancel,
                                     dispatch-settings, dispatch-global-settings
agents/                              the seven specialist agents
hooks/hooks.json                     plugin hooks
hooks/agent-models.ts                agent.spawn hook that applies per-agent models (tests next to it)
scripts/                             Python scripts used by the hooks
```

Hooks:

- `agent-models.ts` (`agent.spawn`) sets the model of each fresh `dispatcher:*` agent from the settings files, unless the orchestrator passed one explicitly.
- `guard_report_write.py` (PreToolUse on Write and Edit) lets the architect, manual tester, reviewers and researcher only create their own reports in `.claude/personal/.dispatcher/runs/<task>/reports/<role>/`. It does not affect the main session, the `developer` agent or any other agent.
- `restore_dispatch_orchestrator.py` (SessionStart after compact or resume) reminds the main session of its orchestrator role. It only fires in a session that actually started `/dispatch`.
