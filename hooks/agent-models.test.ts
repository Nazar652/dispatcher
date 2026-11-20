import { expect, mock, test } from 'claude-code/testing'
import type { AgentSpawnInput, EngineInterface, On } from 'claude-code'
import { parseAgentSettings, readAgentSettings } from './agent-models'

const HOME = '/home/tester'
const PROJECT = '/work/app'
const GLOBAL_FILE = `${HOME}/.claude/personal/.dispatcher/settings.md`
const PROJECT_FILE = `${PROJECT}/.claude/personal/.dispatcher/settings.md`

// a session in PROJECT/src with the given settings files, recording the model each spawn ends with
function world(on: On, files: Record<string, string>): string[] {
  const spawnedModels: string[] = []
  mock.env(on, { HOME })
  on('session.cwd', () => ({ value: `${PROJECT}/src` }))
  on('fs.exists', (_, e) => ({ value: e.path === `${PROJECT}/.git` }))
  on('fs.read', (_, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error(`missing ${e.path}`)
    return { value: text }
  })
  on('agent.spawn', (_, e) => {
    spawnedModels.push(e.model ?? 'default')
    return { model: e.model ?? 'default', agentId: 'agent-1' }
  })
  return spawnedModels
}

function spawnInput(subagentType: string, model?: string): AgentSpawnInput {
  return {
    tool_use_id: 'call-1', prompt: 'x', description: 'x', subagentType, model,
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: false, fork: false,
  }
}

const settings = (lines: string) => `# Workflow\n\n## Agent models\n\n${lines}\n\n## Additional notes\n\n- developer: model=haiku\n`

test('parses only the Agent models section and valid models', () => {
  expect(parseAgentSettings(settings('- developer: model=claude-opus-5-1 effort=high\r\n- tester: model=gpt-9\n- architect: effort=max'))).toEqual({
    developer: { model: 'claude-opus-5-1' },
  })
})

test('parses context caps of at least 50000 as digits only, beside or without a model', () => {
  expect(parseAgentSettings(settings([
    '- developer: model=sonnet context=300000',
    '- researcher: context=50000',
    '- architect: context=10k',
    '- tester: context=49999',
    '- manual-tester: context=300,000',
    '- code-reviewer: model=opus context=0x4e20',
  ].join('\r\n')))).toEqual({
    developer: { model: 'sonnet', contextTokens: 300_000 },
    researcher: { contextTokens: 50_000 },
    'code-reviewer': { model: 'opus' },
  })
})

test('a role repeated in one file keeps the valid fields of every line', () => {
  expect(parseAgentSettings(settings('- developer: model=haiku\n- developer: context=60000'))).toEqual({
    developer: { model: 'haiku', contextTokens: 60_000 },
  })
})

test('reads both settings files, and skips the project file when the project is the home folder', async () => {
  const files: Record<string, string> = {
    [GLOBAL_FILE]: settings('- developer: context=100000'),
    [PROJECT_FILE]: settings('- developer: model=haiku'),
  }
  // the reader uses only these three engine calls
  const engine = {
    env: { get: async () => HOME },
    fs: {
      exists: async (path: string) => path === `${PROJECT}/.git` || path === `${HOME}/.git`,
      read: async (path: string) => files[path] ?? '',
    },
  } as unknown as EngineInterface

  expect(await readAgentSettings(engine, `${PROJECT}/src`)).toEqual({
    globalSettings: { developer: { contextTokens: 100_000 } },
    projectSettings: { developer: { model: 'haiku' } },
  })
  expect(await readAgentSettings(engine, HOME)).toEqual({
    globalSettings: { developer: { contextTokens: 100_000 } },
    projectSettings: {},
  })
})

test('a project model wins over the global one', async ($, on) => {
  const spawned = world(on, {
    [GLOBAL_FILE]: settings('- developer: model=sonnet\n- researcher: model=haiku'),
    [PROJECT_FILE]: settings('- developer: model=claude-opus-5-1'),
  })
  await $.agent.spawn(spawnInput('dispatcher:developer'))
  await $.agent.spawn(spawnInput('dispatcher:researcher'))
  expect(spawned).toEqual(['claude-opus-5-1', 'haiku'])
})

test('no settings, an explicit model, or another agent are left alone', async ($, on) => {
  const spawned = world(on, { [PROJECT_FILE]: settings('- developer: model=opus') })
  await $.agent.spawn(spawnInput('dispatcher:architect'))
  await $.agent.spawn(spawnInput('dispatcher:developer', 'haiku'))
  await $.agent.spawn(spawnInput('general-purpose'))
  expect(spawned).toEqual(['default', 'haiku', 'default'])
})

test('a context-only project line does not hide the global model', async ($, on) => {
  const spawned = world(on, {
    [GLOBAL_FILE]: settings('- developer: model=sonnet'),
    [PROJECT_FILE]: settings('- developer: context=300000'),
  })
  await $.agent.spawn(spawnInput('dispatcher:developer'))
  expect(spawned).toEqual(['sonnet'])
})
