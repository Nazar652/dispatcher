import { analysisReminder, registeredRuns } from './session-start'
import type { EngineInterface, On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const sessionId = 'chat-7'
const otherContext = 'Context from another plugin'
const active = { version: 1, workflow: 'analyze', session_id: sessionId, active: true }

function downstream(on: On) {
  on('classic.SessionStart', () => ({ additionalContext: [otherContext], watchPaths: ['/watch'] }))
}

type Fixture = { marker: string, state?: string }
function savedRuns(on: On, root: string, fixtures: Record<string, Fixture>) {
  const runs = root.replace(/\\/g, '/') + '/.claude/personal/.dispatcher/runs'
  const files = new Map<string, string>()
  for (const [task, saved] of Object.entries(fixtures)) {
    files.set(runs + '/' + task + '/orchestrator-session.json', saved.marker)
    if (saved.state !== undefined) files.set(runs + '/' + task + '/state.md', saved.state)
  }
  on('session.root', () => ({ value: root }))
  on('fs.list', ($, e) => ({
    value: e.path?.replace(/\\/g, '/') === runs
      ? Object.keys(fixtures).map(name => ({ name, kind: 'dir' as const, isLink: false, mtimeMs: 0, size: 0 }))
      : [],
  }))
  on('fs.exists', ($, e) => {
    const path = e.path.replace(/\\/g, '/')
    return { value: path === runs || files.has(path) }
  })
  on('fs.stat', ($, e) => {
    const content = files.get(e.path.replace(/\\/g, '/'))
    return { value: { kind: content === undefined ? 'dir' : 'file', size: content?.length ?? 0, mtimeMs: 0, isLink: false, realPath: e.path } }
  })
  on('fs.read', ($, e) => ({ value: files.get(e.path.replace(/\\/g, '/')) ?? '' }))
  downstream(on)
}

const root = '/work/app'
const guided = { ...active, workflow: 'dispatch' }
const fields = { session_id: sessionId, cwd: root + '/src' }

for (const source of ['startup', 'clear', 'fork'] as const) {
  test(source + ' adds no header even for a registered session and preserves downstream output', async ($, on) => {
    savedRuns(on, root, {
      analysis: { marker: JSON.stringify(active) },
      development: { marker: JSON.stringify(guided) },
    })
    const result = await $.classic.SessionStart({ ...fields, source, session_title: 'Аналіз даних' })
    expect(result.additionalContext).toEqual([otherContext])
    expect(result.watchPaths).toEqual(['/watch'])
  })
}

for (const source of ['resume', 'compact'] as const) {
  test(source + ' adds no header without an active registration for this session', async ($, on) => {
    savedRuns(on, root, {
      invalid: { marker: '{' },
      oversized: { marker: JSON.stringify(active).padEnd(4200) },
      foreign: { marker: JSON.stringify({ ...active, session_id: 'other' }) },
      inactive: { marker: JSON.stringify({ ...active, active: false }) },
      unknown: { marker: JSON.stringify({ ...active, workflow: 'other' }) },
      done: { marker: JSON.stringify(guided), state: '\uFEFF- **Status**: DONE' },
      cancelled: { marker: JSON.stringify(active), state: 'STATUS: CANCELLED' },
    })
    const result = await $.classic.SessionStart({ ...fields, source })
    expect(result.additionalContext).toEqual([otherContext])
    expect(result.watchPaths).toEqual(['/watch'])
  })

  test(source + ' adds only the header for a dispatch registration', async ($, on) => {
    savedRuns(on, root, { development: { marker: JSON.stringify(guided), state: 'STATUS: RUNNING' } })
    const result = await $.classic.SessionStart({ ...fields, source, session_title: 'Аналіз даних' })
    expect(result.additionalContext?.length).toBe(2)
    expect(result.additionalContext?.[0]).toBe(otherContext)
    expect(result.additionalContext?.[1]).toContain('Begin your first visible reply')
    expect(result.additionalContext?.[1]).toContain(sessionId)
    expect(result.additionalContext?.[1]).toContain('Аналіз даних')
    expect(result.additionalContext?.[1]).not.toContain('ANALYSIS')
    expect(result.watchPaths).toEqual(['/watch'])
    expect((await $.classic.SessionStart({ ...fields, source })).additionalContext?.[1]).toContain('working title')
  })

  test(source + ' adds the header and restores only analysis runs', async ($, on) => {
    savedRuns(on, root, {
      current: { marker: '\uFEFF' + JSON.stringify(active), state: 'STATUS: RUNNING' },
      development: { marker: JSON.stringify(guided) },
    })
    const result = await $.classic.SessionStart({ ...fields, source })
    expect(result.additionalContext?.length).toBe(2)
    const context = result.additionalContext?.[1] ?? ''
    expect(context).toContain('Begin your first visible reply')
    expect(context).toContain(sessionId)
    expect(context).toContain('Restore ANALYSIS')
    expect(context.replace(/\\/g, '/')).toContain('/current/state.md')
    expect(context).not.toContain('Multiple')
    expect(context).not.toContain('/development/state.md')
  })
}

test('finds the original project after a cwd change and reports competing registrations', async ($, on) => {
  savedRuns(on, '/original', {
    a: { marker: JSON.stringify(active) },
    b: { marker: JSON.stringify(active) },
  })
  const result = await $.classic.SessionStart({ source: 'compact', cwd: '/elsewhere', session_id: sessionId })
  const context = result.additionalContext?.[1] ?? ''
  expect(context).toContain('Multiple')
  expect(context).toContain('/a/state.md')
  expect(context).toContain('/b/state.md')
})

test('subagents and agent sessions get nothing', async ($, on) => {
  savedRuns(on, root, {
    analysis: { marker: JSON.stringify(active) },
    development: { marker: JSON.stringify(guided) },
  })
  for (const source of ['startup', 'resume', 'compact'] as const) {
    for (const agent of [{ agent_id: 'child' }, { agent_type: 'reviewer' }]) {
      const result = await $.classic.SessionStart({ ...fields, source, ...agent })
      expect(result.additionalContext).toEqual([otherContext])
      expect(result.watchPaths).toEqual(['/watch'])
    }
  }
})

test('analysis reminder ignores dispatch runs and names every competing analysis run', () => {
  const run = (workflow: 'dispatch' | 'analyze', state: string) => ({ workflow, state })
  expect(analysisReminder([])).toBeUndefined()
  expect(analysisReminder([run('dispatch', '/a/state.md')])).toBeUndefined()
  const single = analysisReminder([run('dispatch', '/a/state.md'), run('analyze', '/b/state.md')])
  expect(single).toContain('Restore ANALYSIS')
  expect(single).toContain('/b/state.md')
  expect(single).not.toContain('/a/state.md')
  const several = analysisReminder([run('analyze', '/b/state.md'), run('analyze', '/c/state.md')])
  expect(several).toContain('Multiple')
  expect(several).toContain('/b/state.md')
  expect(several).toContain('/c/state.md')
})

test('resolves mixed-separator Windows paths from a nested working directory', async () => {
  const project = 'C:\\Work Space\\проєкт'
  const runs = project + '\\.claude\\personal\\.dispatcher\\runs'
  const run = runs + '\\benchmark'
  const state = run + '\\state.md'
  const marker = run + '\\orchestrator-session.json'
  const directoriesListed: string[] = []
  // Host-independent filesystem, since the macOS engine resolves its own paths as POSIX.
  const engine = {
    session: { root: async () => 'c:/Work Space/проєкт' },
    fs: {
      stat: async (path: string) => path === marker ? { kind: 'file', size: 100 } : { realPath: path },
      exists: async (path: string) => [runs, state].includes(path),
      list: async (path: string) => {
        directoriesListed.push(path)
        return [{ name: 'benchmark', kind: 'dir' }]
      },
      read: async (path: string) => {
        if (path === marker) return JSON.stringify(active)
        if (path === state) return 'STATUS: RUNNING'
        throw new Error('Unknown path: ' + path)
      },
    },
  } as unknown as EngineInterface
  expect(analysisReminder(await registeredRuns(engine, project + '/src', sessionId))).toContain(state)
  expect(directoriesListed).toEqual([runs])
})
