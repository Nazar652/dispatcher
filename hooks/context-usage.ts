import type { AgentInfo, EngineInterface, Register } from 'claude-code'
import { AGENT_PREFIX, readAgentSettings } from './agent-models'
import type { AgentSettingsFiles } from './agent-models'

// Reports how full each dispatcher specialist's context is, from the engine's
// own count (`tokenCount`) instead of a model's guess. The agent itself sees the
// line after its tool results once it is close to its limit, and the main
// session gets one line as a reminder row each time an agent's run ends. The
// limit is the role's `context` setting (or the default cap), held to the
// model's window. It never blocks or changes a tool call, a prompt or a turn.

const DEFAULT_CONTEXT_CAP_TOKENS = 500_000

type MeasuredAgent = Pick<AgentInfo, 'id' | 'type' | 'tokenCount' | 'contextWindowSize'>

export function resolveContextCap(role: string, settings: AgentSettingsFiles): number {
  return settings.projectSettings[role]?.contextTokens
    ?? settings.globalSettings[role]?.contextTokens
    ?? DEFAULT_CONTEXT_CAP_TOKENS
}

// a model window smaller than the cap is the limit that counts
export function contextLimit(agent: Pick<AgentInfo, 'contextWindowSize'>, cap: number): number {
  return Math.min(cap, agent.contextWindowSize ?? cap)
}

// 80% of the limit: from here the agent sees its own measurement
export function noticeThreshold(limit: number): number {
  return Math.floor((limit * 4) / 5)
}

export function describeContextUsage(agent: MeasuredAgent, cap: number): string {
  const limit = contextLimit(agent, cap)
  const windowClause = agent.contextWindowSize === undefined
    ? ''
    : `, model window ${agent.contextWindowSize}`
  const limitClause = agent.tokenCount >= limit
    ? ` The ${limit}-token context limit is reached: apply the Per-agent context budget protocol (stop at the next safe boundary, NEEDS_INPUT with REASON: CONTEXT_LIMIT).`
    : ''
  return `dispatcher context usage: agent ${agent.id} (${agent.type}) ${agent.tokenCount} of ${limit} tokens (per-agent cap ${cap}${windowClause}), MEASURED by the dispatcher plugin hook from the engine's count of its latest request.${limitClause}`
}

// a failing settings read must not hide the measurement, so it falls back to the default cap
async function readSettingsOrDefault($: EngineInterface): Promise<AgentSettingsFiles> {
  try {
    return await readAgentSettings($, await $.session.cwd())
  } catch {
    return { globalSettings: {}, projectSettings: {} }
  }
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const response = await next(e)
    // only a tool inside an agent is measured here; the main session hears of an agent when its run ends
    if (response.deny !== undefined || e.agentId === undefined) return response

    const agent = (await $.agent.list()).find(listed => listed.id === e.agentId)
    if (agent === undefined || !agent.type.startsWith(AGENT_PREFIX)) return response

    const cap = resolveContextCap(agent.type.slice(AGENT_PREFIX.length), await readSettingsOrDefault($))
    if (agent.tokenCount < noticeThreshold(contextLimit(agent, cap))) return response

    return { ...response, context: [...(response.context ?? []), describeContextUsage(agent, cap)] }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) await reportFinishedRun($, e.agentId)
    return next(e)
  }).catch(($, e, next) => next(e))
}

// a note for the main session that waits for its next request; it never touches the turn or the agent's report
export async function reportFinishedRun($: EngineInterface, agentId: string): Promise<void> {
  const agent = (await $.agent.list()).find(listed => listed.id === agentId)
  if (agent === undefined || !agent.type.startsWith(AGENT_PREFIX) || agent.tokenCount <= 0) return

  const cap = resolveContextCap(agent.type.slice(AGENT_PREFIX.length), await readSettingsOrDefault($))
  await $.session.append({
    message: { type: 'user', content: [{ type: 'text', text: describeContextUsage(agent, cap) }] },
  })
}
