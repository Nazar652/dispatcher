import { expect, mock, test } from 'claude-code/testing'
import type { AgentSpawnInput, On } from 'claude-code'
import { parseAgentModels } from './agent-models'

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
  expect(parseAgentModels(settings('- developer: model=claude-opus-5-1 effort=high\r\n- tester: model=gpt-9\n- architect: effort=max'))).toEqual({
    developer: 'claude-opus-5-1',
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
