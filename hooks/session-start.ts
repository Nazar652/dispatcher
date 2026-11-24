import type { EngineInterface, Register } from 'claude-code'
import { anchorPartCount, isSamePath, joinPath, pathStyle, splitPath } from './paths'

const RUNS = ['.claude', 'personal', '.dispatcher', 'runs']
const TERMINAL = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:status|final status)(?:\*\*)?\s*:\s*(?:\*\*|`)?(?:DONE|CANCELLED)\b/im

// Stop at the nearest project, including a non-Git project with saved runs.
async function runsDirectory($: EngineInterface, startDir: string): Promise<string | undefined> {
  if (pathStyle(startDir) === undefined) return
  const resolved = await $.fs.stat(startDir, { resolve: true }).catch(() => undefined)
  const directory = resolved?.realPath ?? startDir
  const style = pathStyle(directory)
  if (style === undefined) return
  const parts = splitPath(directory, style)
  for (let length = parts.length; length >= anchorPartCount(style); length--) {
    const parent = parts.slice(0, length)
    const runs = joinPath([...parent, ...RUNS], style)
    if (await $.fs.exists(runs)) return runs
    if (await $.fs.exists(joinPath([...parent, '.git'], style))) return
  }
}

type RegisteredRun = { workflow: 'dispatch' | 'analyze', state: string }

async function registeredRun($: EngineInterface, runPrefix: string, sessionId: string): Promise<RegisteredRun | undefined> {
  const marker = runPrefix + 'orchestrator-session.json'
  const stat = await $.fs.stat(marker)
  if (stat.kind !== 'file' || stat.size > 4096) return
  const record = JSON.parse((await $.fs.read(marker, { length: 4096 })).replace(/^\uFEFF/, ''))
  if (record?.version !== 1 || record.session_id !== sessionId || record.active !== true) return
  if (record.workflow !== 'dispatch' && record.workflow !== 'analyze') return

  const state = runPrefix + 'state.md'
  if (await $.fs.exists(state) && TERMINAL.test(await $.fs.read(state, { length: 8192 }))) return
  return { workflow: record.workflow, state }
}

export async function registeredRuns($: EngineInterface, cwd: string, sessionId: string): Promise<RegisteredRun[]> {
  const project = await $.session.root().catch(() => cwd)
  const starts = isSamePath(cwd, project) ? [cwd] : [cwd, project]
  const scanned: string[] = []
  const matches: RegisteredRun[] = []
  for (const start of starts) {
    const directory = await runsDirectory($, start).catch(() => undefined)
    if (!directory || scanned.some(path => isSamePath(path, directory))) continue
    scanned.push(directory)
    const entries = await $.fs.list(directory).catch(() => [])
    const separator = pathStyle(directory) === 'windows' ? '\\' : '/'
    for (const entry of entries) {
      if (entry.kind !== 'dir' && !entry.isLink) continue
      const run = await registeredRun($, directory + separator + entry.name + separator, sessionId).catch(() => undefined)
      if (run) matches.push(run)
    }
  }
  return matches
}

export function analysisReminder(runs: RegisteredRun[]): string | undefined {
  const states = runs.filter(run => run.workflow === 'analyze').map(run => run.state)
  if (!states.length) return
  if (states.length > 1) {
    return 'Multiple analysis runs match. Resolve the active run before continuing.\n' + states.join('\n')
  }
  return 'Restore ANALYSIS. Read the registered state and the Resume section of the analyze skill. Continue from the saved checkpoint.\n' + states[0]
}

export const register: Register = on => {
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.agent_id || e.agent_type || !e.session_id?.trim()) return result
    if (e.source !== 'resume' && e.source !== 'compact') return result

    // only dispatcher sessions get the header
    const runs = await registeredRuns($, e.cwd, e.session_id)
    if (!runs.length) return result

    const name = result.sessionTitle ?? e.session_title
    const title = name?.trim()
      ? 'Use this display name as a label: ' + JSON.stringify(name.replace(/[\r\n]+/g, ' '))
      : 'Use the current display name if available, otherwise label a short task description as a working title. Reuse the existing working title on resume.'
    const context = [`Begin your first visible reply with the session name and current Claude session ID ${JSON.stringify(e.session_id)} in one line. ${title} Show it once for this start, including when the first prompt is a workflow command.`]
    const reminder = analysisReminder(runs)
    if (reminder) context.push(reminder)
    return { ...result, additionalContext: [...(result.additionalContext ?? []), context.join('\n\n')] }
  })
}
