import type { EngineInterface, Register } from 'claude-code'

// Reads the `## Agent models` section of the global and project settings files:
// each role line holds a model, an effort and a context cap. This hook applies
// the model to every fresh dispatcher specialist; only a hook can set a full
// model id, as the Agent tool's own `model` parameter accepts aliases only.
// The context cap is applied by context-usage.ts, which reads it from here.

export const AGENT_PREFIX = 'dispatcher:'
const SETTINGS_PATH = '.claude/personal/.dispatcher/settings.md'
const MODEL_PATTERN = /^(sonnet|opus|haiku|fable|claude-[a-z0-9][a-z0-9.-]*)$/i

const MINIMUM_CONTEXT_TOKENS = 50_000

export type AgentSettings = { model?: string, contextTokens?: number }

export type AgentSettingsFiles = {
  globalSettings: Record<string, AgentSettings>
  projectSettings: Record<string, AgentSettings>
}

export function parseAgentSettings(settingsText: string): Record<string, AgentSettings> {
  const settings: Record<string, AgentSettings> = {}
  let isInSection = false
  for (const rawLine of settingsText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('#')) {
      isInSection = /^##\s+agent models\s*$/i.test(line)
      continue
    }
    const [, role, values] = (isInSection && /^[-*]\s*([a-z-]+)\s*:\s*(.+)$/i.exec(line)) || []
    if (role === undefined || values === undefined) continue
    const [, model] = /(?:^|\s)model\s*=\s*(\S+)/i.exec(values) ?? []
    const [, context] = /(?:^|\s)context\s*=\s*(\S+)/i.exec(values) ?? []
    const fields: AgentSettings = {}
    if (model !== undefined && MODEL_PATTERN.test(model)) fields.model = model
    // digits only: no units, signs or separators
    if (context !== undefined && /^\d+$/.test(context) && Number(context) >= MINIMUM_CONTEXT_TOKENS) {
      fields.contextTokens = Number(context)
    }
    // a role repeated in one file keeps the valid fields of each of its lines
    if (Object.keys(fields).length > 0) settings[role.toLowerCase()] = { ...settings[role.toLowerCase()], ...fields }
  }
  return settings
}

// the settings of both files for the project containing `startDir`, as /dispatch resolves them
export async function readAgentSettings($: EngineInterface, startDir: string): Promise<AgentSettingsFiles> {
  const home = await $.env.get('HOME')
  const projectRoot = await findProjectRoot($, startDir)
  const globalSettings = home ? parseAgentSettings(await readOrEmpty($, `${home}/${SETTINGS_PATH}`)) : {}
  const projectSettings = projectRoot === home
    ? {}
    : parseAgentSettings(await readOrEmpty($, `${projectRoot}/${SETTINGS_PATH}`))
  return { globalSettings, projectSettings }
}

export const register: Register = on => {
  on('agent.spawn', async ($, e, next) => {
    const isFreshDispatcherAgent =
      e.subagentType.startsWith(AGENT_PREFIX) &&
      e.resume === undefined && !e.fork && e.isTeammate === undefined &&
      e.workflow === undefined
    // a model the orchestrator passed explicitly (the user asked for it) wins
    if (!isFreshDispatcherAgent || e.model !== undefined) return next(e)

    const role = e.subagentType.slice(AGENT_PREFIX.length)
    const { globalSettings, projectSettings } = await readAgentSettings($, e.cwd ?? (await $.session.cwd()))

    const model = projectSettings[role]?.model ?? globalSettings[role]?.model
    return next(model === undefined ? e : { ...e, model })
  }).catch(($, e, next) => next(e))
}

async function readOrEmpty($: EngineInterface, path: string): Promise<string> {
  try {
    const text = await $.fs.read(path)
    return typeof text === 'string' ? text : ''
  } catch {
    return ''
  }
}

// the nearest directory holding `.git` (a folder, or a file in a worktree), as /dispatch resolves it
async function findProjectRoot($: EngineInterface, startDir: string): Promise<string> {
  let dir = startDir.replace(/\/+$/, '') || '/'
  while (true) {
    if (await $.fs.exists(`${dir}/.git`)) return dir
    const parent = dir.slice(0, dir.lastIndexOf('/')) || '/'
    if (parent === dir) return startDir
    dir = parent
  }
}
