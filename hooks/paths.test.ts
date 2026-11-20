import { expect, test } from 'claude-code/testing'
import {
  anchorPartCount, isSamePart, isSamePath, joinPath, pathStyle, splitPath, startsWithParts,
} from './paths'

test('a drive path is windows, a single-slash path is posix, anything else has no style', () => {
  expect(pathStyle('C:\\work\\app')).toBe('windows')
  expect(pathStyle('c:/work/app')).toBe('windows')
  expect(pathStyle('C:\\')).toBe('windows')
  expect(pathStyle('/work/app')).toBe('posix')
  expect(pathStyle('/')).toBe('posix')

  expect(pathStyle('//server/share')).toBeUndefined()
  expect(pathStyle('\\\\server\\share')).toBeUndefined()
  expect(pathStyle('\\\\?\\C:\\work')).toBeUndefined()
  expect(pathStyle('D:work')).toBeUndefined()
  expect(pathStyle('C:')).toBeUndefined()
  expect(pathStyle('work/app')).toBeUndefined()
  expect(pathStyle('')).toBeUndefined()
  expect(pathStyle(undefined)).toBeUndefined()
  expect(pathStyle(42)).toBeUndefined()
})

test('only a windows path has an anchor part', () => {
  expect(anchorPartCount('windows')).toBe(1)
  expect(anchorPartCount('posix')).toBe(0)
})

test('a posix path splits on slashes only and keeps a backslash inside a name', () => {
  expect(splitPath('/work/app/src', 'posix')).toEqual(['work', 'app', 'src'])
  expect(splitPath('/work//app/./src/', 'posix')).toEqual(['work', 'app', 'src'])
  expect(splitPath('/work/a\\b/c', 'posix')).toEqual(['work', 'a\\b', 'c'])
  expect(splitPath('/', 'posix')).toEqual([])
})

test('a windows path splits on both separators with the drive first', () => {
  expect(splitPath('C:\\work\\app', 'windows')).toEqual(['C:', 'work', 'app'])
  expect(splitPath('C:/work/app', 'windows')).toEqual(['C:', 'work', 'app'])
  expect(splitPath('C:\\work/app\\\\src\\.\\', 'windows')).toEqual(['C:', 'work', 'app', 'src'])
  expect(splitPath('C:\\', 'windows')).toEqual(['C:'])
})

test('a path joins back with its own separator, and a lone drive keeps its separator', () => {
  expect(joinPath(['work', 'app'], 'posix')).toBe('/work/app')
  expect(joinPath([], 'posix')).toBe('/')
  expect(joinPath(['C:', 'work', 'app'], 'windows')).toBe('C:\\work\\app')
  expect(joinPath(['C:'], 'windows')).toBe('C:\\')
})

test('parts compare exactly on posix and without case on windows', () => {
  expect(isSamePart('App', 'app', 'posix')).toBe(false)
  expect(isSamePart('app', 'app', 'posix')).toBe(true)
  expect(isSamePart('App', 'app', 'windows')).toBe(true)
  expect(isSamePart('App', 'apps', 'windows')).toBe(false)
})

test('a prefix matches whole parts, never a name prefix', () => {
  expect(startsWithParts(['C:', 'work', 'app', 'src'], ['c:', 'WORK', 'app'], 'windows')).toBe(true)
  expect(startsWithParts(['work', 'app', 'src'], ['work', 'App'], 'posix')).toBe(false)
  expect(startsWithParts(['work', 'app2'], ['work', 'app'], 'posix')).toBe(false)
  expect(startsWithParts(['work'], ['work', 'app'], 'posix')).toBe(false)
  expect(startsWithParts(['work'], [], 'posix')).toBe(true)
})

test('two paths are the same place by spelling when style and parts agree', () => {
  expect(isSamePath('/work/app', '/work/app/')).toBe(true)
  expect(isSamePath('/work/app', '/work/App')).toBe(false)
  expect(isSamePath('/work/app', '/work/app/src')).toBe(false)
  expect(isSamePath('C:\\Users\\tester', 'c:/users/TESTER/')).toBe(true)
  expect(isSamePath('C:\\Users\\tester', 'C:\\Users')).toBe(false)
  expect(isSamePath('C:\\work', '/work')).toBe(false)
  expect(isSamePath('//work', '//work')).toBe(false)
  expect(isSamePath('work', 'work')).toBe(false)
})
