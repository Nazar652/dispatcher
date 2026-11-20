import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

const HOME = '/home/tester'
const PROJECT = '/work/app'
const AGENT_ID = 'agent-1'

test('the single entry activates both the model and the context usage hooks', async ($, on) => {
  const spawnedModels: string[] = []
  const appendedRows: unknown[] = []
  mock.env(on, { HOME })
  on('session.cwd', () => ({ value: PROJECT }))
  on('fs.exists', ($, e) => ({ value: e.path === `${PROJECT}/.git` }))
  on('fs.read', ($, e) => {
    if (e.path !== `${PROJECT}/.claude/personal/.dispatcher/settings.md`) throw new Error(`missing ${e.path}`)
    return { value: '## Agent models\n\n- developer: model=haiku context=300000\n' }
  })
  on('agent.spawn', ($, e) => {
    spawnedModels.push(e.model ?? 'default')
    return { model: e.model ?? 'default', agentId: AGENT_ID }
  })
  on('agent.list', () => ({
    value: [{ id: AGENT_ID, type: 'dispatcher:developer', tokenCount: 120_000 } as AgentInfo],
  }))
  on('session.append', ($, e, next) => {
    appendedRows.push(e.message.content)
    return next(e)
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.agent.spawn({
    tool_use_id: 'call-1', prompt: 'x', description: 'x', subagentType: 'dispatcher:developer',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: false, fork: false,
  })
  await $.turn.complete({
    answer: 'report', durationMs: 5, isAborted: false, turnId: 'turn-1', reason: 'answer', agentId: AGENT_ID,
  })

  expect(spawnedModels).toEqual(['haiku'])
  expect(JSON.stringify(appendedRows)).toContain('dispatcher context usage: agent agent-1')
  expect(JSON.stringify(appendedRows)).toContain('120000 of 300000 tokens')
})
