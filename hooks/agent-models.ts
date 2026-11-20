import type { EngineInterface, Register } from 'claude-code'
import { anchorPartCount, isSamePath, joinPath, pathStyle, splitPath } from './paths'

// Reads the `## Agent models` section of the global and project settings files:
// each role line holds a model, an effort and a context cap. This hook applies
// the model to every fresh dispatcher specialist; only a hook can set a full
// model id, as the Agent tool's own `model` parameter accepts aliases only.
// The context cap is applied by context-usage.ts, which reads it from here.

export const AGENT_PREFIX = 'dispatcher:'
const SETTINGS_PARTS = ['.claude', 'personal', '.dispatcher', 'settings.md']
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
  const home = await findHome($, startDir)
  const projectRoot = await findProjectRoot($, startDir)
  const globalSettings = home === undefined ? {} : await readSettingsFile($, home)
  const projectSettings = home !== undefined && isSamePath(projectRoot, home) ? {} : await readSettingsFile($, projectRoot)
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

// the home folder is HOME, or USERPROFILE where HOME is unset or in another path style (MSYS `/c/Users/tester` beside `C:\Users\tester`)
async function findHome($: EngineInterface, startDir: string): Promise<string | undefined> {
  const startStyle = pathStyle(startDir)
  if (startStyle === undefined) return undefined

  const candidates = [await $.env.get('HOME'), await $.env.get('USERPROFILE')]
  return candidates.find(candidate => pathStyle(candidate) === startStyle)
}

async function readSettingsFile($: EngineInterface, rootDirectory: string): Promise<Record<string, AgentSettings>> {
  const style = pathStyle(rootDirectory)
  if (style === undefined) return {}

  return parseAgentSettings(await readOrEmpty($, joinPath([...splitPath(rootDirectory, style), ...SETTINGS_PARTS], style)))
}

// the nearest directory holding `.git` (a folder, or a file in a worktree), as /dispatch resolves it
async function findProjectRoot($: EngineInterface, startDir: string): Promise<string> {
  const style = pathStyle(startDir)
  if (style === undefined) return startDir

  const parts = splitPath(startDir, style)
  for (let length = parts.length; length >= anchorPartCount(style); length -= 1) {
    const ancestorParts = parts.slice(0, length)
    if (await $.fs.exists(joinPath([...ancestorParts, '.git'], style))) return joinPath(ancestorParts, style)
  }
  return startDir
}
