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

async function analysisStatePath($: EngineInterface, runPrefix: string, sessionId: string): Promise<string | undefined> {
  const marker = runPrefix + 'orchestrator-session.json'
  const stat = await $.fs.stat(marker)
  if (stat.kind !== 'file' || stat.size > 4096) return
  const record = JSON.parse((await $.fs.read(marker, { length: 4096 })).replace(/^\uFEFF/, ''))
  if (record?.version !== 1 || record.session_id !== sessionId || record.active !== true) return
  if (record.workflow !== 'analyze') return

  const state = runPrefix + 'state.md'
  if (await $.fs.exists(state) && TERMINAL.test(await $.fs.read(state, { length: 8192 }))) return
  return state
}

export async function restoreAnalysis($: EngineInterface, cwd: string, sessionId: string): Promise<string | undefined> {
  const project = await $.session.root().catch(() => cwd)
  const starts = isSamePath(cwd, project) ? [cwd] : [cwd, project]
  const scanned: string[] = []
  const matches: string[] = []
  for (const start of starts) {
    const directory = await runsDirectory($, start).catch(() => undefined)
    if (!directory || scanned.some(path => isSamePath(path, directory))) continue
    scanned.push(directory)
    const entries = await $.fs.list(directory).catch(() => [])
    const separator = pathStyle(directory) === 'windows' ? '\\' : '/'
    for (const entry of entries) {
      if (entry.kind !== 'dir' && !entry.isLink) continue
      const state = await analysisStatePath($, directory + separator + entry.name + separator, sessionId).catch(() => undefined)
      if (state) matches.push(state)
    }
  }

  if (!matches.length) return
  if (matches.length > 1) {
    return 'Multiple analysis runs match. Resolve the active run before continuing.\n' + matches.join('\n')
  }
  return 'Restore ANALYSIS. Read the registered state and the Resume section of the analyze skill. Continue from the saved checkpoint.\n' + matches[0]
}

export const register: Register = on => {
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.agent_id || !e.session_id?.trim()) return result

    const context = []
    if (e.source !== 'compact') {
      const name = result.sessionTitle ?? e.session_title
      const title = name?.trim()
        ? 'Use this display name as a label: ' + JSON.stringify(name.replace(/[\r\n]+/g, ' '))
        : 'Use the current display name if available, otherwise label a short task description as a working title. Reuse the existing working title on resume.'
      context.push(`Begin your first visible reply with the session name and current Claude session ID ${JSON.stringify(e.session_id)} in one line. ${title} Show it once for this start, including when the first prompt is a workflow command.`)
    }
    if ((e.source === 'compact' || e.source === 'resume') && !e.agent_type) {
      const reminder = await restoreAnalysis($, e.cwd, e.session_id)
      if (reminder) context.push(reminder)
    }
    return context.length ? { ...result, additionalContext: [...(result.additionalContext ?? []), context.join('\n\n')] } : result
  })
}
