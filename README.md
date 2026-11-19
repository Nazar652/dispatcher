# dispatcher

A Claude Code plugin that adds a guided, multi-agent development workflow. The `/develop` command takes a task through an architect, a developer, a manual tester and reviewers. Every stage ends with a written report, and you approve the plan and the result.

## What's inside

| Command | What it does |
|---|---|
| `/develop <task>` | Starts the development workflow for a task |
| `/dev-status [task-id]` | Shows the state of a run without changing anything |
| `/dev-resume <task-id>` | Resumes an interrupted run from its last saved checkpoint |
| `/dev-cancel <task-id>` | Permanently cancels a run |
| `/dev-settings ...` | Per-project settings such as how to start, test or lint the project |

If a short name is taken by another command, use the full one, for example `/dispatcher:develop`.

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

For a private repository, git must work without a password prompt, for example through `gh auth login` or an SSH key.

To try the plugin without installing it, load it for a single session:

```
claude --plugin-dir /path/to/repo
```

## Requirements

- `python3` 3.9 or newer on `PATH`. The plugin's hooks run on it.
- Access to the Opus and Sonnet models. The architect and reviewers run on Opus, the other agents on Sonnet.
- Recommended: the Playwright plugin, which the manual tester uses for browser checks. Without it the tester falls back to the CLI and API. Install it with `claude plugin install playwright@claude-plugins-official`.

## In each project

Run state and reports are stored in `<project>/.claude/personal/`. Add this folder to the project's `.gitignore`:

```
.claude/personal/
```

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
skills/                              develop, dev-status, dev-resume, dev-cancel, dev-settings
agents/                              the seven specialist agents
hooks/hooks.json                     plugin hooks
scripts/                             Python scripts used by the hooks
```

Hooks:

- `guard_report_write.py` (PreToolUse on Write and Edit) lets the architect, manual tester, reviewers and researcher only create their own reports in `.claude/personal/runs/<task>/reports/<role>/`. It does not affect the main session, the `developer` agent or any other agent.
- `restore_develop_orchestrator.py` (SessionStart after compact or resume) reminds the main session of its orchestrator role. It only fires in a session that actually started `/develop`.
