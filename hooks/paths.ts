// Path helpers that need no engine call and no Node `path`, shared by the report
// guard and the settings reader. A POSIX path is separated by `/` only and
// compared exactly; a Windows drive path accepts both separators and is compared
// without regard to case. Network, device and drive-relative spellings have no style.

export type PathStyle = 'posix' | 'windows'

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/

// the style of an absolute local path, or undefined for anything else (relative, `//`, `\\server`, `D:x`)
export function pathStyle(path: unknown): PathStyle | undefined {
  if (typeof path !== 'string') return undefined
  if (WINDOWS_DRIVE_PATH.test(path)) return 'windows'
  if (path.startsWith('/') && !path.startsWith('//')) return 'posix'
  return undefined
}

// the number of leading parts that are the anchor: the drive of a Windows path
export function anchorPartCount(style: PathStyle): number {
  return style === 'windows' ? 1 : 0
}

// the parts of a path, the drive first for a Windows path; empty and `.` parts are dropped
export function splitPath(path: string, style: PathStyle): string[] {
  const separators = style === 'windows' ? /[\\/]+/ : /\/+/
  return path.split(separators).filter(part => part !== '' && part !== '.')
}

export function joinPath(parts: string[], style: PathStyle): string {
  if (style === 'posix') return `/${parts.join('/')}`
  // a lone drive keeps its separator: `C:` alone is the drive's own current directory
  return parts.length === 1 ? `${parts[0]}\\` : parts.join('\\')
}

export function isSamePart(first: string, second: string, style: PathStyle): boolean {
  return style === 'windows' ? first.toLowerCase() === second.toLowerCase() : first === second
}

export function startsWithParts(parts: string[], prefix: string[], style: PathStyle): boolean {
  return parts.length >= prefix.length && prefix.every((part, index) => isSamePart(parts[index]!, part, style))
}

// two paths of the same style that name the same place by spelling alone
export function isSamePath(first: string, second: string): boolean {
  const style = pathStyle(first)
  if (style === undefined || pathStyle(second) !== style) return false
  const firstParts = splitPath(first, style)
  const secondParts = splitPath(second, style)
  return firstParts.length === secondParts.length && startsWithParts(firstParts, secondParts, style)
}
