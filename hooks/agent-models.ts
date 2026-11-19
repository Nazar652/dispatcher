import type { EngineInterface, Register } from 'claude-code'

// Picks the model for each dispatcher specialist from the `## Agent models`
// section of the global and project settings files. Only this hook can set a
// full model id: the Agent tool's own `model` parameter accepts aliases only.

const AGENT_PREFIX = 'dispatcher:'
const SETTINGS_PATH = '.claude/personal/.dispatcher/settings.md'
const MODEL_PATTERN = /^(sonnet|opus|haiku|fable|claude-[a-z0-9][a-z0-9.-]*)$/i

export type AgentModels = Record<string, string>

export function parseAgentModels(settingsText: string): AgentModels {
  const models: AgentModels = {}
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
    if (model !== undefined && MODEL_PATTERN.test(model)) {
      models[role.toLowerCase()] = model
    }
  }
  return models
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
    const home = await $.env.get('HOME')
    const projectRoot = await findProjectRoot($, e.cwd ?? (await $.session.cwd()))
    const globalModels = home ? parseAgentModels(await readOrEmpty($, `${home}/${SETTINGS_PATH}`)) : {}
    const projectModels = projectRoot === home
      ? {}
      : parseAgentModels(await readOrEmpty($, `${projectRoot}/${SETTINGS_PATH}`))

    const model = projectModels[role] ?? globalModels[role]
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
