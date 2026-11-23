import { restoreAnalysis } from './session-start'
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

for (const source of ['startup', 'clear', 'fork'] as const) {
  test(source + ' adds the current identity and preserves downstream output', async ($, on) => {
    downstream(on)
    const event = { source, session_id: sessionId }
    const result = await $.classic.SessionStart({ ...event, session_title: 'Аналіз даних' })
    expect(result.additionalContext?.length).toBe(2)
    expect(result.additionalContext?.[0]).toBe(otherContext)
    expect(result.additionalContext?.[1]).toContain(sessionId)
    expect(result.additionalContext?.[1]).toContain('Аналіз даних')
    expect(result.watchPaths).toEqual(['/watch'])
    expect((await $.classic.SessionStart(event)).additionalContext?.[1]).toContain('working title')
  })
}

const root = '/work/app'
test('restores only analysis runs on resume and compact', async ($, on) => {
  savedRuns(on, root, {
    current: { marker: '\uFEFF' + JSON.stringify(active), state: 'STATUS: RUNNING' },
    guided: { marker: JSON.stringify({ ...active, workflow: 'dispatch' }) },
    invalid: { marker: '{' },
    oversized: { marker: JSON.stringify(active).padEnd(4200) },
    foreign: { marker: JSON.stringify({ ...active, session_id: 'other' }) },
    inactive: { marker: JSON.stringify({ ...active, active: false }) },
    done: { marker: JSON.stringify(active), state: '\uFEFF- **Status**: DONE' },
    cancelled: { marker: JSON.stringify(active), state: 'STATUS: CANCELLED' },
  })
  const fields = { session_id: sessionId, cwd: root + '/src' }
  const compact = await $.classic.SessionStart({ ...fields, source: 'compact' })
  expect(compact.additionalContext?.length).toBe(2)
  const role = compact.additionalContext?.[1] ?? ''
  expect(role).toContain('ANALYSIS')
  expect(role.replace(/\\/g, '/')).toContain('/current/state.md')
  expect(role).not.toContain('Multiple')
  const resume = await $.classic.SessionStart({ ...fields, source: 'resume' })
  expect(resume.additionalContext?.length).toBe(2)
  expect(resume.additionalContext?.[1]).toContain(sessionId)
  expect(resume.additionalContext?.[1]).toContain(role)
})

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

test('subagents get no header and guided restoration stays with the Python hook', async ($, on) => {
  savedRuns(on, '/app', { guided: { marker: JSON.stringify({ ...active, workflow: 'dispatch' }) } })
  const fields = { session_id: sessionId, cwd: '/app' }
  for (const source of ['startup', 'resume', 'compact'] as const) {
    const result = await $.classic.SessionStart({ ...fields, source, agent_id: 'child' })
    expect(result.additionalContext).toEqual([otherContext])
  }
  expect((await $.classic.SessionStart({ ...fields, source: 'compact' })).additionalContext).toEqual([otherContext])
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
  expect(await restoreAnalysis(engine, project + '/src', sessionId)).toContain(state)
  expect(directoriesListed).toEqual([runs])
})
