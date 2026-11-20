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

- `python3` 3.9 or newer on `PATH`, for one hook only: the reminder after `/compact` or `/resume`. The other hooks are TypeScript that Claude Code runs itself and need nothing installed. Without `python3` that reminder is not delivered; continue the run with `/dispatch-resume <task-id>`.
- Access to the Opus, Sonnet and Haiku models. By default the architect and the security and database reviewers run on Opus, the developer and code reviewer on Sonnet, and the manual tester and researcher on Haiku; see Settings to change this.
- Recommended: the Playwright plugin, which the manual tester uses for browser checks. Without it the tester falls back to the CLI and API. Install it with `claude plugin install playwright@claude-plugins-official`.

### Windows, Linux and WSL

- Windows: the report guard and the model settings read `C:\...` paths with either separator, and the global settings come from `HOME` or, when that is not a Windows path, `USERPROFILE`. Check that `python3 --version` works in the shell Claude Code uses for hooks. The Microsoft Store `python3` shortcut that only opens the Store does not count: turn it off under App execution aliases, or install Python so that `python3` runs it.
- Linux: minimal images often have no `python3`; install version 3.9 or newer for the reminder hook.
- WSL: install and run Claude Code inside WSL and it behaves as on Linux, with Linux paths and the WSL `python3`.
- Known limitation: the architect, manual tester, reviewers and researcher cannot write their reports when the project is reached through a symbolic link, a junction, a mapped network drive, a `subst` drive or a network path. Open the project by its real local path.
- If a specialist's report write fails with `Report write denied: ...`, the text names the check that refused it. Right after setup on a new platform, the architect's first report is a quick test that the guard accepts your paths.

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

The `## Agent models` section of either file sets the model, the reasoning effort and the context cap per agent, one line per role, with any of the fields:

```
## Agent models

- developer: model=claude-opus-5-1 effort=high
- researcher: model=haiku
- architect: effort=max
- developer: context=300000
```

- `model`: an alias (`sonnet`, `opus`, `haiku`, `fable`), which always means the latest version, or a full model ID such as `claude-opus-5-1` to pin a version.
- `effort`: `low`, `medium`, `high`, `xhigh` or `max`.
- `context`: the most active context, in tokens, that agents of the role may use: digits only, at least 50,000, default 500,000. The plugin's `context-usage.ts` hook measures each agent against it (held to the model's own window) and applies a change to running agents immediately; `/dispatch` and the agents stop at the limit on the next safe boundary. A value that is not a whole number of at least 50,000 is ignored.

Each field is resolved on its own: the project file first, then the global file, then the default. The default context cap is 500,000 tokens; the default model is the agent's own (`opus` for the architect and the security and database reviewers; `sonnet` for the developer and code reviewer; `haiku` for the manual tester and researcher) in its latest version; the default effort is whatever Claude Code picks for that agent. A running agent keeps its model and effort; a change applies the next time that agent is started fresh.

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
hooks/index.ts                       hooks module entry: registers agent-models, context-usage and report-guard
hooks/agent-models.ts                agent.spawn hook that applies per-agent models and reads the role settings (tests next to it)
hooks/context-usage.ts               tool.call hook that measures each dispatcher agent's context (tests next to it)
hooks/report-guard.ts                tool.call and tool.check hooks that limit specialists' writes to their own new reports (tests next to it)
hooks/paths.ts                       path helpers for POSIX and Windows paths, shared by the hooks (tests next to it)
scripts/                             the Python script of the post-compaction reminder hook
```

Hooks:

- `agent-models.ts` (`agent.spawn`) sets the model of each fresh `dispatcher:*` agent from the settings files, unless the orchestrator passed one explicitly.
- `context-usage.ts` (`tool.call`, `turn.complete`) measures the context of each `dispatcher:*` agent from the engine's own token count. It shows the agent itself a `dispatcher context usage` line after its tool results only from 80% of its limit; at the limit the line says it is reached. Each time such an agent's run ends, in the background, foreground or resumed, it also adds one line to the main conversation as a model-only reminder, so `/dispatch` records a measured number; it never changes the completion notification or the agent's report. The limit is the role's `context` setting (default 500,000), held to the model's window. It only reports and never blocks a tool.
- `report-guard.ts` (`tool.call` on Write and Edit, `tool.check` on Write) lets the architect, manual tester, reviewers and researcher only create their own new report in `.claude/personal/.dispatcher/runs/<task>/reports/<role>/`, in a run the orchestrator has initialized; any other Write or Edit by them is refused with `Report write denied: ...`. It allows a valid report without a permission prompt, but your own deny and ask rules still apply. If the check itself fails, the call is refused. It does not affect the main session, the `developer` agent or any other agent.
- `restore_dispatch_orchestrator.py` (SessionStart after compact or resume) reminds the main session of its orchestrator role. It only fires in a session that actually started `/dispatch`.
