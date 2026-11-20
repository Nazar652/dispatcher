import { expect, test } from 'claude-code/testing'
import type { AgentInfo, EngineInterface, On } from 'claude-code'
import { reportWriteDenial } from './report-guard'

type Entry = { kind: 'file' | 'dir' | 'other', realPath?: string, isLink?: boolean, isUnresolvable?: boolean }

type Layout = { name: string, root: string, separator: string }

const LAYOUTS: Layout[] = [
  { name: 'posix', root: '/work/app', separator: '/' },
  { name: 'windows', root: 'C:\\work\\app', separator: '\\' },
]

const RUN_ROOT = ['.claude', 'personal', '.dispatcher', 'runs']
const AGENT_ID = 'agent-1'

const at = (layout: Layout, ...parts: string[]) => [layout.root, ...parts].join(layout.separator)

const cwdOf = (layout: Layout) => at(layout, 'src')

const reportOf = (layout: Layout, role = 'architect', fileName = 'a1.md', task = 't1') =>
  at(layout, ...RUN_ROOT, task, 'reports', role, fileName)

// the project's src folder and an initialized run t1 whose state.md exists; no reports folder yet
function initializedRun(layout: Layout): Record<string, Entry> {
  const entries: Record<string, Entry> = { [cwdOf(layout)]: { kind: 'dir' } }
  for (let depth = 1; depth <= RUN_ROOT.length + 1; depth += 1) {
    entries[at(layout, ...[...RUN_ROOT, 't1'].slice(0, depth))] = { kind: 'dir' }
  }
  entries[at(layout, ...RUN_ROOT, 't1', 'state.md')] = { kind: 'file' }
  return entries
}

function statOf(entry: Entry, isResolved: boolean) {
  const stat = { kind: entry.kind, size: 0, mtimeMs: 0, isLink: entry.isLink ?? false }
  return isResolved && !entry.isUnresolvable ? { ...stat, realPath: entry.realPath ?? '' } : stat
}

// stat answers from the entries, an absent path rejects, and `realPath` is the entry's own path unless it says otherwise
function lookup(entries: Record<string, Entry>, path: string, isResolved: boolean) {
  const entry = entries[path]
  if (entry === undefined) throw new Error(`ENOENT ${path}`)
  return statOf({ ...entry, realPath: entry.realPath ?? path }, isResolved)
}

function fakeEngine(entries: Record<string, Entry>): EngineInterface {
  return {
    fs: { stat: async (path: string, options?: { resolve: boolean }) => lookup(entries, path, options?.resolve === true) },
  } as unknown as EngineInterface
}

function denialOf(layout: Layout, entries: Record<string, Entry>, filePath: unknown, role = 'architect', cwd = cwdOf(layout)) {
  return reportWriteDenial(fakeEngine(entries), role, cwd, filePath)
}

for (const layout of LAYOUTS) {
  test(`${layout.name}: a new report in an initialized run is allowed, with or without its folders yet`, async () => {
    const entries = initializedRun(layout)
    expect(await denialOf(layout, entries, reportOf(layout))).toBeUndefined()

    entries[at(layout, ...RUN_ROOT, 't1', 'reports')] = { kind: 'dir' }
    expect(await denialOf(layout, entries, reportOf(layout))).toBeUndefined()

    entries[at(layout, ...RUN_ROOT, 't1', 'reports', 'architect')] = { kind: 'dir' }
    expect(await denialOf(layout, entries, reportOf(layout))).toBeUndefined()
  })

  test(`${layout.name}: every guarded role may write its own folder only`, async () => {
    const entries = initializedRun(layout)
    for (const role of ['architect', 'manual-tester', 'code-reviewer', 'security-reviewer', 'database-reviewer', 'researcher']) {
      expect(await denialOf(layout, entries, reportOf(layout, role), role)).toBeUndefined()
    }
    expect(await denialOf(layout, entries, reportOf(layout, 'code-reviewer'), 'architect')).toBe(
      "Write is limited to this project's runs/<task>/reports/<role> directory.",
    )
  })

  test(`${layout.name}: a report may be written from a deeper working folder or one reached through a link`, async () => {
    const entries = initializedRun(layout)
    entries[at(layout, 'src', 'deep')] = { kind: 'dir' }
    expect(await denialOf(layout, entries, reportOf(layout), 'architect', at(layout, 'src', 'deep'))).toBeUndefined()

    entries[at(layout, 'shortcut')] = { kind: 'dir', realPath: cwdOf(layout), isLink: true }
    expect(await denialOf(layout, entries, reportOf(layout), 'architect', at(layout, 'shortcut'))).toBeUndefined()
  })

  test(`${layout.name}: an existing file or a link, even a dangling one, is write-once`, async () => {
    const entries = initializedRun(layout)
    const writeOnce = 'Reports are write-once; request a new report filename.'

    entries[reportOf(layout)] = { kind: 'file' }
    expect(await denialOf(layout, entries, reportOf(layout))).toBe(writeOnce)

    entries[reportOf(layout)] = { kind: 'other', isLink: true, isUnresolvable: true }
    expect(await denialOf(layout, entries, reportOf(layout))).toBe(writeOnce)
  })

  test(`${layout.name}: a relative path, a path of another style, a network path and a non-string are not absolute`, async () => {
    const entries = initializedRun(layout)
    const notAbsolute = 'Report path and runtime cwd must be absolute.'
    const otherStylePath = layout.name === 'posix' ? 'C:\\work\\app\\a1.md' : '/work/app/a1.md'

    for (const filePath of ['a1.md', './a1.md', otherStylePath, '//work/app/a1.md', '\\\\server\\share\\a1.md', 'D:a1.md', '', undefined, 7]) {
      expect(await denialOf(layout, entries, filePath)).toBe(notAbsolute)
    }
    expect(await denialOf(layout, entries, reportOf(layout), 'architect', 'src')).toBe(notAbsolute)
  })

  test(`${layout.name}: a parent part or a colon in a name is refused`, async () => {
    const entries = initializedRun(layout)
    const traversal = 'Traversal and alternate data streams are not permitted.'

    expect(await denialOf(layout, entries, at(layout, 'src', '..', ...RUN_ROOT, 't1', 'reports', 'architect', 'a1.md'))).toBe(traversal)
    expect(await denialOf(layout, entries, `${reportOf(layout)}:stream`)).toBe(traversal)
    expect(await denialOf(layout, entries, reportOf(layout, 'architect', 'a1.md', 't1:x'))).toBe(traversal)
  })

  test(`${layout.name}: a path outside the run layout or the role folder is refused`, async () => {
    const entries = initializedRun(layout)
    const limited = "Write is limited to this project's runs/<task>/reports/<role> directory."

    expect(await denialOf(layout, entries, at(layout, 'notes.md'))).toBe(limited)
    expect(await denialOf(layout, entries, at(layout, ...RUN_ROOT, 't1', 'reports', 'a1.md'))).toBe(limited)
    expect(await denialOf(layout, entries, at(layout, ...RUN_ROOT, 't1', 'reports', 'architect', 'sub', 'a1.md'))).toBe(limited)
    expect(await denialOf(layout, entries, at(layout, ...RUN_ROOT, 't1', 'notes', 'architect', 'a1.md'))).toBe(limited)
    expect(await denialOf(layout, entries, at(layout, ...RUN_ROOT, 'a1.md'))).toBe(limited)
    expect(await denialOf(layout, entries, reportOf(layout, 'Architect'))).toBe(limited)
    expect(await denialOf(layout, entries, `${layout.root}2${layout.separator}${RUN_ROOT.join(layout.separator)}${layout.separator}t1${layout.separator}reports${layout.separator}architect${layout.separator}a1.md`)).toBe(limited)
  })

  test(`${layout.name}: only a plain dispatch-id markdown filename is accepted`, async () => {
    const entries = initializedRun(layout)
    for (const fileName of ['a1.txt', 'a1', '.md', '-a1.md', '_a1.md', 'a 1.md', 'a1.md ', 'a1.MD', 'a.b.md', 'a1.md\n']) {
      expect(await denialOf(layout, entries, reportOf(layout, 'architect', fileName))).toBe('Use a plain dispatch-id.md report filename.')
    }
    expect(await denialOf(layout, entries, reportOf(layout, 'architect', 'D1_a-2.md'))).toBeUndefined()
  })

  test(`${layout.name}: a run without a state.md file is not initialized`, async () => {
    const entries = initializedRun(layout)
    const notInitialized = 'The orchestrator must initialize this run first.'
    const stateFile = at(layout, ...RUN_ROOT, 't1', 'state.md')

    delete entries[stateFile]
    expect(await denialOf(layout, entries, reportOf(layout))).toBe(notInitialized)

    entries[stateFile] = { kind: 'dir' }
    expect(await denialOf(layout, entries, reportOf(layout))).toBe(notInitialized)
  })

  test(`${layout.name}: a folder that redirects, or a link that leads nowhere, is refused`, async () => {
    const redirects = 'Report directories must not redirect through links.'
    const folders = [
      at(layout, '.claude'),
      at(layout, '.claude', 'personal', '.dispatcher'),
      at(layout, ...RUN_ROOT, 't1'),
      at(layout, ...RUN_ROOT, 't1', 'reports'),
      at(layout, ...RUN_ROOT, 't1', 'reports', 'architect'),
    ]
    for (const folder of folders) {
      const redirected = initializedRun(layout)
      redirected[at(layout, ...RUN_ROOT, 't1', 'reports')] ??= { kind: 'dir' }
      redirected[at(layout, ...RUN_ROOT, 't1', 'reports', 'architect')] ??= { kind: 'dir' }
      redirected[folder] = { kind: 'dir', isLink: true, realPath: at(layout, 'elsewhere') }
      expect(await denialOf(layout, redirected, reportOf(layout))).toBe(redirects)

      const dangling = initializedRun(layout)
      dangling[folder] = { kind: 'other', isLink: true, isUnresolvable: true }
      expect(await denialOf(layout, dangling, reportOf(layout))).toBe(redirects)
    }
  })

  test(`${layout.name}: a working folder that cannot be resolved is refused`, async () => {
    const entries = initializedRun(layout)
    const unresolved = 'Runtime cwd cannot be resolved.'

    expect(await denialOf(layout, entries, reportOf(layout), 'architect', at(layout, 'missing'))).toBe(unresolved)

    entries[cwdOf(layout)] = { kind: 'dir', isUnresolvable: true }
    expect(await denialOf(layout, entries, reportOf(layout))).toBe(unresolved)

    entries[cwdOf(layout)] = { kind: 'dir', realPath: '\\\\?\\C:\\work\\app\\src' }
    expect(await denialOf(layout, entries, reportOf(layout))).toBe(unresolved)
  })
}

test('windows: either separator and any drive or folder case reach the same report folder', async () => {
  const layout = LAYOUTS[1]!
  const entries = initializedRun(layout)

  expect(await denialOf(layout, entries, 'C:/work/app/.claude/personal/.dispatcher/runs/t1/reports/architect/a1.md')).toBeUndefined()
  expect(await denialOf(layout, entries, 'c:\\WORK\\app\\.CLAUDE\\personal\\.dispatcher\\RUNS\\t1\\reports\\architect\\a1.md')).toBeUndefined()
  expect(await denialOf(layout, entries, 'C:\\work\\app\\.claude\\personal\\.dispatcher\\runs\\t1\\\\reports\\.\\architect\\a1.md')).toBeUndefined()
})

test('windows: the role folder name and the reports folder name are compared exactly', async () => {
  const layout = LAYOUTS[1]!
  const limited = "Write is limited to this project's runs/<task>/reports/<role> directory."

  expect(await denialOf(layout, initializedRun(layout), 'C:\\work\\app\\.claude\\personal\\.dispatcher\\runs\\t1\\reports\\ARCHITECT\\a1.md')).toBe(limited)
  expect(await denialOf(layout, initializedRun(layout), 'C:\\work\\app\\.claude\\personal\\.dispatcher\\runs\\t1\\Reports\\architect\\a1.md')).toBe(limited)
})

test('windows: a drive-relative folder or a device path is refused, and so is a project on another drive', async () => {
  const layout = LAYOUTS[1]!
  const entries = initializedRun(layout)

  expect(await denialOf(layout, entries, 'C:work\\app\\a1.md')).toBe('Report path and runtime cwd must be absolute.')
  expect(await denialOf(layout, entries, '\\\\?\\C:\\work\\app\\.claude\\personal\\.dispatcher\\runs\\t1\\reports\\architect\\a1.md')).toBe(
    'Report path and runtime cwd must be absolute.',
  )
  expect(await denialOf(layout, entries, 'D:\\work\\app\\.claude\\personal\\.dispatcher\\runs\\t1\\reports\\architect\\a1.md')).toBe(
    "Write is limited to this project's runs/<task>/reports/<role> directory.",
  )
})

test('posix: a backslash is a name character and the path is compared exactly', async () => {
  const layout = LAYOUTS[0]!
  const entries = initializedRun(layout)

  expect(await denialOf(layout, entries, '/work/app/.claude/personal/.dispatcher/runs/t1/reports/architect/a\\1.md')).toBe(
    'Use a plain dispatch-id.md report filename.',
  )
  expect(await denialOf(layout, entries, '/WORK/app/.claude/personal/.dispatcher/runs/t1/reports/architect/a1.md')).toBe(
    "Write is limited to this project's runs/<task>/reports/<role> directory.",
  )
  expect(await denialOf(layout, entries, '/work/app/.claude/personal/.dispatcher/runs//t1/./reports/architect/a1.md')).toBeUndefined()
})

type ListedAgent = Pick<AgentInfo, 'id' | 'type' | 'cwd' | 'tokenCount'>

const POSIX = LAYOUTS[0]!

const listedAgent = (id: string, type: string): ListedAgent => ({ id, type, cwd: cwdOf(POSIX), tokenCount: 0 })

// the hooks run through the engine: a session with the agents and file system given and, beneath the guard, a core
// that denies every check (so a guard's allow must stand on its own) and a tool that answers `written`; the engine
// reads a drive path on this machine as relative before a stat hook sees it, so only posix paths go through here;
// a missing path is a stat hook that throws, which the engine then treats as an absent file
function session(
  on: On,
  entries: Record<string, Entry>,
  agents: () => ListedAgent[],
  onStat: (path: string) => void = () => {},
) {
  on('agent.list', () => ({ value: agents() as AgentInfo[] }))
  on('fs.stat', ($, e) => {
    onStat(e.path)
    return { value: lookup(entries, e.path, e.resolve) as never }
  })
  on('tool.check', () => ({ decision: 'deny', reason: 'core verdict' }))
  on('tool.run', () => ({ result: 'written' }))
}

const architectOnly = () => [listedAgent(AGENT_ID, 'dispatcher:architect')]

test("a specialist's new report is written without the core's approval", async ($, on) => {
  session(on, initializedRun(POSIX), architectOnly)

  const response = await $.tool.call({ tool: 'Write', file_path: reportOf(POSIX), content: 'x', agentId: AGENT_ID })
  expect(response.result).toBe('written')
  expect(response.isError).toBeUndefined()
})

test("a specialist's misplaced Write and every Edit are denied with the reason", async ($, on) => {
  session(on, initializedRun(POSIX), architectOnly)

  const misplaced = await $.tool.call({ tool: 'Write', file_path: at(POSIX, 'notes.md'), content: 'x', agentId: AGENT_ID })
  expect(misplaced.deny).toBe("Report write denied: Write is limited to this project's runs/<task>/reports/<role> directory.")

  const edited = await $.tool.call({
    tool: 'Edit', file_path: reportOf(POSIX), old_string: 'a', new_string: 'b', agentId: AGENT_ID,
  })
  expect(edited.deny).toBe("Report write denied: Only a configured specialist's Write call is permitted.")
})

test('an un-prefixed specialist type is guarded as well', async ($, on) => {
  session(on, initializedRun(POSIX), () => [listedAgent(AGENT_ID, 'architect')])

  const response = await $.tool.call({ tool: 'Write', file_path: at(POSIX, 'notes.md'), content: 'x', agentId: AGENT_ID })
  expect(response.deny).toContain('Report write denied: ')
})

test('the main session, other agents, teammates and unlisted agents are left to the core verdict', async ($, on) => {
  session(on, initializedRun(POSIX), () => [
    listedAgent('developer-1', 'dispatcher:developer'),
    listedAgent('explorer-1', 'general-purpose'),
    listedAgent('teammate-1', 'teammate'),
  ])
  const outside = at(POSIX, 'notes.md')

  for (const agentId of [undefined, 'developer-1', 'explorer-1', 'teammate-1', 'unlisted-1']) {
    const written = await $.tool.call({ tool: 'Write', file_path: outside, content: 'x', agentId })
    expect(written.deny).toBeUndefined()
    expect(written.text).toBe('core verdict')

    const edited = await $.tool.call({ tool: 'Edit', file_path: outside, old_string: 'a', new_string: 'b', agentId })
    expect(edited.deny).toBeUndefined()
    expect(edited.text).toBe('core verdict')
  }
})

test('the check denies a report that stopped being valid after the call was allowed', async ($, on) => {
  const entries = initializedRun(POSIX)
  let reportStats = 0
  // the call hook looks at the report first and the check looks again, by when the report exists
  session(on, entries, architectOnly, path => {
    if (path === reportOf(POSIX)) reportStats += 1
    if (reportStats === 2) entries[reportOf(POSIX)] = { kind: 'file' }
  })

  const response = await $.tool.call({ tool: 'Write', file_path: reportOf(POSIX), content: 'x', agentId: AGENT_ID })
  expect(response.isError).toBe(true)
  expect(response.text).toContain('Report write denied: Reports are write-once; request a new report filename.')
})

test('a guard that fails refuses a subagent call and leaves the main session alone', async ($, on) => {
  let isListFailing = true
  session(on, initializedRun(POSIX), () => {
    if (isListFailing) throw new Error('engine failure')
    return architectOnly()
  })

  const failedCall = await $.tool.call({ tool: 'Write', file_path: reportOf(POSIX), content: 'x', agentId: AGENT_ID })
  expect(failedCall.isError).toBe(true)
  expect(failedCall.text).toContain('Report write denied: the report-write check failed.')

  const mainSession = await $.tool.call({ tool: 'Write', file_path: reportOf(POSIX), content: 'x' })
  expect(mainSession.deny).toBeUndefined()
  expect(mainSession.text).toBe('core verdict')
})

test('a guard that fails at the check refuses the call, too', async ($, on) => {
  let isListFailing = false
  // the list works for the call hook, then fails once the call hook has looked at the report
  session(on, initializedRun(POSIX), () => {
    if (isListFailing) throw new Error('engine failure')
    return architectOnly()
  }, path => {
    if (path === reportOf(POSIX)) isListFailing = true
  })

  const response = await $.tool.call({ tool: 'Write', file_path: reportOf(POSIX), content: 'x', agentId: AGENT_ID })
  expect(response.isError).toBe(true)
  expect(response.text).toContain('Report write denied: the report-write check failed.')
})
