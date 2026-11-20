import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, EngineInterface, On } from 'claude-code'
import { contextLimit, describeContextUsage, noticeThreshold, reportFinishedRun, resolveContextCap } from './context-usage'

const AGENT_ID = 'agent-1'
const DEFAULT_CAP = 500_000

function listedAgent(type: string, tokenCount: number, contextWindowSize?: number): AgentInfo {
  // the hook reads only these four fields of the engine's agent row
  return { id: AGENT_ID, type, tokenCount, contextWindowSize } as AgentInfo
}

// a session whose agent list holds the given agents and whose tools answer with `answer`; returns how often a tool ran
function world(
  on: On,
  agents: AgentInfo[] | (() => AgentInfo[]),
  answer: object = { result: 'file text' },
): { toolRuns: number } {
  const counts = { toolRuns: 0 }
  on('agent.list', () => ({ value: typeof agents === 'function' ? agents() : agents }))
  on('tool.call', () => {
    counts.toolRuns += 1
    return answer as never
  })
  return counts
}

const readInAgent = { tool: 'Read', file_path: '/work/app/a.txt', agentId: AGENT_ID } as const

const completedAgentCall = {
  tool: 'Agent', description: 'x', prompt: 'x', subagent_type: 'dispatcher:developer',
} as const

const completedAnswer = { result: { status: 'completed', agentId: AGENT_ID } }

test('describes tokens, cap and window, and the cap sentence only from the cap', () => {
  const below = describeContextUsage(listedAgent('dispatcher:developer', 499_999, 1_000_000), DEFAULT_CAP)
  expect(below).toBe(
    "dispatcher context usage: agent agent-1 (dispatcher:developer) 499999 of 500000 tokens (per-agent cap 500000, model window 1000000), MEASURED by the dispatcher plugin hook from the engine's count of its latest request.",
  )

  const atCap = describeContextUsage(listedAgent('dispatcher:developer', 500_000, 1_000_000), DEFAULT_CAP)
  expect(atCap).toContain('500000 of 500000 tokens')
  expect(atCap).toContain('context limit is reached')
  expect(atCap).toContain('REASON: CONTEXT_LIMIT')
})

test('leaves out the window when the engine does not know it', () => {
  expect(describeContextUsage(listedAgent('dispatcher:developer', 1_000), DEFAULT_CAP)).not.toContain('model window')
})

test('an agent below 400000 tokens sees no line', async ($, on) => {
  world(on, [listedAgent('dispatcher:developer', 399_999)])
  expect(await $.tool.call(readInAgent)).toEqual({ result: 'file text' })
})

test('an agent from 400000 tokens sees one line and keeps its result and context', async ($, on) => {
  world(on, [listedAgent('dispatcher:developer', 400_000)], { result: 'file text', context: ['earlier note'] })
  const response = await $.tool.call(readInAgent)
  expect(response.result).toBe('file text')
  expect(response.context).toEqual([
    'earlier note',
    describeContextUsage(listedAgent('dispatcher:developer', 400_000), DEFAULT_CAP),
  ])
  expect(response.context?.[1]).not.toContain('context limit is reached')
})

test('at 500000 tokens the line says the cap is reached', async ($, on) => {
  world(on, [listedAgent('dispatcher:developer', 500_000)])
  const response = await $.tool.call(readInAgent)
  expect(response.context).toHaveLength(1)
  expect(response.context?.[0]).toContain('context limit is reached')
})

test('other agents, unknown agents and main-session tools get no line', async ($, on) => {
  world(on, [listedAgent('general-purpose', 900_000)])
  expect(await $.tool.call(readInAgent)).toEqual({ result: 'file text' })
  expect(await $.tool.call({ ...readInAgent, agentId: 'unknown-agent' })).toEqual({ result: 'file text' })
  expect(await $.tool.call({ tool: 'Read', file_path: '/work/app/a.txt' })).toEqual({ result: 'file text' })
})

test('the Agent result of a dispatcher agent gets no added context', async ($, on) => {
  world(on, [listedAgent('dispatcher:developer', 120_000)], completedAnswer)
  expect(await $.tool.call(completedAgentCall)).toEqual(completedAnswer)
})

test('a denied call stays denied', async ($, on) => {
  world(on, [listedAgent('dispatcher:developer', 450_000)], { deny: 'not allowed' })
  expect(await $.tool.call(readInAgent)).toEqual({ deny: 'not allowed' })
})

test('a failing agent list passes the result through and runs the tool once', async ($, on) => {
  const counts = world(on, () => {
    throw new Error('list unavailable')
  })
  expect(await $.tool.call(readInAgent)).toEqual({ result: 'file text' })
  expect(counts.toolRuns).toBe(1)
})

const HOME = '/home/tester'
const PROJECT = '/work/app'
const GLOBAL_FILE = `${HOME}/.claude/personal/.dispatcher/settings.md`
const PROJECT_FILE = `${PROJECT}/.claude/personal/.dispatcher/settings.md`

const agentModels = (lines: string) => `# Workflow\n\n## Agent models\n\n${lines}\n`

// a session in PROJECT whose settings files hold the given text; `failure` makes every file check throw
function settingsWorld(on: On, files: Record<string, string>, failure?: Error): void {
  mock.env(on, { HOME })
  on('session.cwd', () => ({ value: PROJECT }))
  on('fs.exists', ($, e) => {
    if (failure) throw failure
    return { value: e.path === `${PROJECT}/.git` }
  })
  on('fs.read', ($, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error(`missing ${e.path}`)
    return { value: text }
  })
}

test('resolves the role cap from the project, then the global file, then the default', () => {
  const settings = {
    globalSettings: { developer: { contextTokens: 200_000 }, researcher: { contextTokens: 150_000 } },
    projectSettings: { developer: { contextTokens: 300_000 }, architect: { model: 'opus' } },
  }
  expect(resolveContextCap('developer', settings)).toBe(300_000)
  expect(resolveContextCap('researcher', settings)).toBe(150_000)
  expect(resolveContextCap('architect', settings)).toBe(500_000)
  expect(resolveContextCap('tester', { globalSettings: {}, projectSettings: {} })).toBe(500_000)
})

test('the limit is the smaller of the cap and the model window, and the notice starts at 80% of it', () => {
  expect(contextLimit({ contextWindowSize: 200_000 }, 500_000)).toBe(200_000)
  expect(contextLimit({ contextWindowSize: 1_000_000 }, 300_000)).toBe(300_000)
  expect(contextLimit({}, 300_000)).toBe(300_000)
  expect(noticeThreshold(300_000)).toBe(240_000)
  expect(noticeThreshold(500_000)).toBe(400_000)
  expect(noticeThreshold(50_001)).toBe(40_000)
})

test('the line states the limit in force and the cap behind it', () => {
  const line = describeContextUsage(listedAgent('dispatcher:developer', 150_000, 200_000), 500_000)
  expect(line).toContain('150000 of 200000 tokens (per-agent cap 500000, model window 200000)')
})

test('a role cap from the project settings moves the in-agent notice to 80% of it', async ($, on) => {
  settingsWorld(on, { [PROJECT_FILE]: agentModels('- developer: model=sonnet context=300000') })
  let tokenCount = 239_999
  world(on, () => [listedAgent('dispatcher:developer', tokenCount)])

  expect(await $.tool.call(readInAgent)).toEqual({ result: 'file text' })

  tokenCount = 240_000
  const atThreshold = await $.tool.call(readInAgent)
  expect(atThreshold.context).toEqual([describeContextUsage(listedAgent('dispatcher:developer', 240_000), 300_000)])
  expect(atThreshold.context?.[0]).toContain('240000 of 300000 tokens (per-agent cap 300000)')

  tokenCount = 300_000
  expect((await $.tool.call(readInAgent)).context?.[0]).toContain('context limit is reached')
})

test('a project cap beats the global one, and an invalid project value falls back to the global one', async ($, on) => {
  settingsWorld(on, {
    [GLOBAL_FILE]: agentModels('- developer: context=200000\n- researcher: context=150000'),
    [PROJECT_FILE]: agentModels('- developer: context=300000\n- researcher: context=lots'),
  })
  let type = 'dispatcher:developer'
  world(on, () => [listedAgent(type, 450_000)])

  expect((await $.tool.call(readInAgent)).context?.[0]).toContain('450000 of 300000 tokens')

  type = 'dispatcher:researcher'
  expect((await $.tool.call(readInAgent)).context?.[0]).toContain('450000 of 150000 tokens')

  type = 'dispatcher:architect'
  expect((await $.tool.call(readInAgent)).context?.[0]).toContain('450000 of 500000 tokens')
})

test('a model window below the cap becomes the limit', async ($, on) => {
  settingsWorld(on, {})
  let tokenCount = 159_999
  world(on, () => [listedAgent('dispatcher:developer', tokenCount, 200_000)])

  expect(await $.tool.call(readInAgent)).toEqual({ result: 'file text' })

  tokenCount = 160_000
  expect((await $.tool.call(readInAgent)).context?.[0]).toContain('160000 of 200000 tokens')

  tokenCount = 200_000
  expect((await $.tool.call(readInAgent)).context?.[0]).toContain('200000-token context limit is reached')
})

test('unreadable settings still deliver the measurement with the default cap', async ($, on) => {
  settingsWorld(on, {}, new Error('disk unavailable'))
  const counts = world(on, [listedAgent('dispatcher:developer', 450_000)])
  const response = await $.tool.call(readInAgent)
  expect(response.context?.[0]).toContain('450000 of 500000 tokens')
  expect(counts.toolRuns).toBe(1)
})

// a session whose agent list holds the given agents; returns every row appended to a conversation and how often a turn ended at the bottom
function turnWorld(
  on: On,
  agents: AgentInfo[] | (() => AgentInfo[]),
  appendOutcome: 'stored' | 'denied' | 'throws' = 'stored',
): { appended: { agentId?: string, content: unknown[] }[], turnsEnded: number } {
  const record = { appended: [] as { agentId?: string, content: unknown[] }[], turnsEnded: 0 }
  on('agent.list', () => ({ value: typeof agents === 'function' ? agents() : agents }))
  on('session.append', ($, e, next) => {
    if (appendOutcome === 'throws') throw new Error('append unavailable')
    if (appendOutcome === 'denied') return { deny: 'refused' }
    record.appended.push({ agentId: e.agentId, content: e.message.content })
    return next(e)
  })
  on('turn.complete', ($, e) => {
    record.turnsEnded += 1
    return { text: e.answer }
  })
  return record
}

const endOfRun = (agentId?: string) => ({
  answer: 'report', durationMs: 5, isAborted: false, turnId: 'turn-1', reason: 'answer', agentId,
}) as const

test('the end of a dispatcher agent run appends one measurement to the main conversation', async ($, on) => {
  const row = listedAgent('dispatcher:researcher', 14_000)
  const record = turnWorld(on, [row])
  const response = await $.turn.complete(endOfRun(AGENT_ID))
  expect(response.text).toBe('report')
  expect(record.turnsEnded).toBe(1)
  expect(record.appended).toEqual([{
    agentId: undefined,
    content: [{ type: 'text', text: describeContextUsage(row, DEFAULT_CAP) }],
  }])
})

test('the end-of-run measurement uses the role cap from the settings', async ($, on) => {
  settingsWorld(on, { [PROJECT_FILE]: agentModels('- researcher: context=300000') })
  const record = turnWorld(on, [listedAgent('dispatcher:researcher', 100_000)])
  await $.turn.complete(endOfRun(AGENT_ID))
  expect(JSON.stringify(record.appended)).toContain('100000 of 300000 tokens (per-agent cap 300000)')
})

test('the end of a main-loop turn, another agent type, an unknown agent or an empty reading appends nothing', async ($, on) => {
  const record = turnWorld(on, [
    listedAgent('dispatcher:researcher', 14_000),
    { ...listedAgent('general-purpose', 14_000), id: 'agent-2' } as AgentInfo,
    { ...listedAgent('dispatcher:architect', 0), id: 'agent-3' } as AgentInfo,
  ])
  await $.turn.complete(endOfRun())
  await $.turn.complete(endOfRun('agent-2'))
  await $.turn.complete(endOfRun('agent-3'))
  await $.turn.complete(endOfRun('unknown-agent'))
  expect(record.appended).toEqual([])
  expect(record.turnsEnded).toBe(4)
})

test('a failing agent list still ends the turn once, unchanged', async ($, on) => {
  const failingList = turnWorld(on, () => {
    throw new Error('list unavailable')
  })
  const response = await $.turn.complete(endOfRun(AGENT_ID))
  expect(response.text).toBe('report')
  expect(failingList.turnsEnded).toBe(1)
})

test('a refused append still ends the turn once, unchanged', async ($, on) => {
  const record = turnWorld(on, [listedAgent('dispatcher:researcher', 14_000)], 'denied')
  expect((await $.turn.complete(endOfRun(AGENT_ID))).text).toBe('report')
  expect(record.turnsEnded).toBe(1)
})

test('a failing append still ends the turn once, unchanged', async ($, on) => {
  const record = turnWorld(on, [listedAgent('dispatcher:researcher', 14_000)], 'throws')
  expect((await $.turn.complete(endOfRun(AGENT_ID))).text).toBe('report')
  expect(record.turnsEnded).toBe(1)
})

test('reportFinishedRun appends the line of a listed dispatcher agent and nothing for an unlisted one', async () => {
  const row = listedAgent('dispatcher:developer', 90_000)
  const appended: unknown[] = []
  // the function uses only these engine calls; the unreadable settings fall back to the default cap
  const engine = {
    agent: { list: async () => [row] },
    session: {
      cwd: async () => { throw new Error('no session folder') },
      append: async (args: unknown) => { appended.push(args) },
    },
  } as unknown as EngineInterface

  await reportFinishedRun(engine, 'unlisted-agent')
  expect(appended).toEqual([])

  await reportFinishedRun(engine, AGENT_ID)
  expect(appended).toEqual([{
    message: { type: 'user', content: [{ type: 'text', text: describeContextUsage(row, DEFAULT_CAP) }] },
  }])
})

test('a task notification prompt reaches the engine unchanged, as no hook rewrites prompts', async ($, on) => {
  const reached: { text: string, context?: readonly string[] }[] = []
  world(on, [listedAgent('dispatcher:researcher', 14_000)])
  on('prompt.submit', ($, e) => {
    reached.push({ text: e.text, context: e.context })
    return { text: e.text, context: e.context, origin: e.origin }
  })
  await $.prompt.submit({ text: '<task-notification>done</task-notification>', origin: { kind: 'task-notification' }, wait: false })
  expect(reached).toEqual([{ text: '<task-notification>done</task-notification>', context: undefined }])
})
