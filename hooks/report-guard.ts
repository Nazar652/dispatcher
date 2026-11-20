import type { EngineInterface, FsStat, Register } from 'claude-code'
import { AGENT_PREFIX } from './agent-models'
import { anchorPartCount, isSamePath, joinPath, pathStyle, splitPath, startsWithParts } from './paths'

// Lets the report-only specialists (architect, manual tester, reviewers, researcher)
// create only their own new report, in an initialized /dispatch run, and nothing
// else. A refusal comes at `tool.call`, so it holds in every permission mode; the
// prompt-free allow comes at `tool.check`, where the user's deny and ask rules and
// plan mode still outrank it. Both run the same check. The engine skips a hook
// that throws, so each `.catch` refuses a subagent's call instead of letting it by.
// The main session and every other agent pass through untouched.

const GUARDED_ROLES = new Set([
  'architect', 'manual-tester', 'code-reviewer', 'security-reviewer', 'database-reviewer', 'researcher',
])
const RUN_ROOT_PARTS = ['.claude', 'personal', '.dispatcher', 'runs']
const REPORT_FILENAME = /^[A-Za-z0-9][A-Za-z0-9_-]*\.md$/

const DENIAL_PREFIX = 'Report write denied: '
const CHECK_FAILED_REASON = 'the report-write check failed.'
const ALLOW_REASON = 'New role-owned report in an initialized development run.'

type GuardedAgent = { role: string, cwd: string }

// the reason a specialist's Write of `filePath` is refused, or undefined when it may create that report
export async function reportWriteDenial(
  $: EngineInterface,
  role: string,
  cwd: string,
  filePath: unknown,
): Promise<string | undefined> {
  const style = pathStyle(cwd)
  if (style === undefined || typeof filePath !== 'string' || pathStyle(filePath) !== style) {
    return 'Report path and runtime cwd must be absolute.'
  }

  const targetParts = splitPath(filePath, style)
  if (targetParts.slice(anchorPartCount(style)).some(part => part === '..' || part.includes(':'))) {
    return 'Traversal and alternate data streams are not permitted.'
  }

  // a stat that rejects means the path is not there
  if (await statOrUndefined($, filePath) !== undefined) return 'Reports are write-once; request a new report filename.'

  const resolvedCwd = (await statOrUndefined($, cwd, { resolve: true }))?.realPath
  if (resolvedCwd === undefined || pathStyle(resolvedCwd) !== style) return 'Runtime cwd cannot be resolved.'

  const cwdParts = splitPath(resolvedCwd, style)
  for (let length = cwdParts.length; length >= anchorPartCount(style); length -= 1) {
    const rootParts = cwdParts.slice(0, length)
    const runRootParts = [...rootParts, ...RUN_ROOT_PARTS]
    if (!startsWithParts(targetParts, runRootParts, style)) continue

    const [task, reportsFolder, roleFolder, fileName, ...extraParts] = targetParts.slice(runRootParts.length)
    if (task === undefined || fileName === undefined || extraParts.length > 0) continue
    if (reportsFolder !== 'reports' || roleFolder !== role) continue
    if (!REPORT_FILENAME.test(fileName)) return 'Use a plain dispatch-id.md report filename.'

    const runParts = [...runRootParts, task]
    const state = await statOrUndefined($, joinPath([...runParts, 'state.md'], style))
    if (state?.kind !== 'file') return 'The orchestrator must initialize this run first.'

    // every folder down to the role folder must resolve to itself; one not created yet is fine
    const folderParts = [...runParts, 'reports', role]
    for (let depth = rootParts.length + 1; depth <= folderParts.length; depth += 1) {
      const folder = joinPath(folderParts.slice(0, depth), style)
      const resolvedFolder = await statOrUndefined($, folder, { resolve: true })
      if (resolvedFolder === undefined) continue
      if (resolvedFolder.realPath === undefined || !isSamePath(resolvedFolder.realPath, folder)) {
        return 'Report directories must not redirect through links.'
      }
    }
    return undefined
  }
  return "Write is limited to this project's runs/<task>/reports/<role> directory."
}

export const register: Register = on => {
  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const agent = await findGuardedAgent($, e.agentId)
    if (agent === undefined) return next(e)
    if (e.tool === 'Edit') return { deny: `${DENIAL_PREFIX}Only a configured specialist's Write call is permitted.` }

    const denial = await reportWriteDenial($, agent.role, agent.cwd, e.file_path)
    return denial === undefined ? next(e) : { deny: `${DENIAL_PREFIX}${denial}` }
  }).catch(($, e, next) => next.called ? next(e) : { deny: `${DENIAL_PREFIX}${CHECK_FAILED_REASON}` })

  on('tool.check', { tool: 'Write' }, async ($, e, next) => {
    const agent = await findGuardedAgent($, e.agentId)
    if (agent === undefined) return next(e)

    const denial = await reportWriteDenial($, agent.role, agent.cwd, filePathOf(e.input))
    return denial === undefined
      ? { decision: 'allow', reason: ALLOW_REASON }
      : { decision: 'deny', reason: `${DENIAL_PREFIX}${denial}` }
  }).catch(($, e, next) => next.called ? next(e) : { decision: 'deny', reason: `${DENIAL_PREFIX}${CHECK_FAILED_REASON}` })
}

// a plain `dispatcher:architect` or an un-prefixed `architect` are both guarded
function guardedRole(agentType: string): string | undefined {
  const role = agentType.startsWith(AGENT_PREFIX) ? agentType.slice(AGENT_PREFIX.length) : agentType
  return GUARDED_ROLES.has(role) ? role : undefined
}

// the main loop, an agent the engine does not list and an agent of any other type are not guarded
async function findGuardedAgent($: EngineInterface, agentId: string | undefined): Promise<GuardedAgent | undefined> {
  if (agentId === undefined) return undefined

  const agent = (await $.agent.list()).find(listed => listed.id === agentId)
  if (agent === undefined) return undefined

  const role = guardedRole(agent.type)
  return role === undefined ? undefined : { role, cwd: agent.cwd }
}

function filePathOf(toolInput: unknown): unknown {
  return typeof toolInput === 'object' && toolInput !== null && 'file_path' in toolInput ? toolInput.file_path : undefined
}

async function statOrUndefined($: EngineInterface, path: string, options?: { resolve: boolean }): Promise<FsStat | undefined> {
  try {
    return await $.fs.stat(path, options)
  } catch {
    return undefined
  }
}
