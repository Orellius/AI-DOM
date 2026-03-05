import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Converts a gitignore-style glob pattern to a RegExp.
 * Supports: *, **, ?, directory/ trailing slash, ! negation (handled externally).
 */
function globToRegex(pattern: string): RegExp {
  let negated = false
  let p = pattern

  if (p.startsWith('!')) {
    negated = true
    p = p.slice(1)
  }

  // Remove leading slash (anchors to root, but we always match from root)
  if (p.startsWith('/')) p = p.slice(1)

  // Trailing slash means directory — match the dir and anything inside it
  const isDir = p.endsWith('/')
  if (isDir) p = p.slice(0, -1)

  // Escape regex special chars except our glob tokens
  let regex = ''
  let i = 0
  while (i < p.length) {
    const ch = p[i]
    if (ch === '*') {
      if (p[i + 1] === '*') {
        // ** — match anything including path separators
        if (p[i + 2] === '/') {
          regex += '(?:.*/)?'
          i += 3
        } else {
          regex += '.*'
          i += 2
        }
      } else {
        // * — match anything except /
        regex += '[^/]*'
        i++
      }
    } else if (ch === '?') {
      regex += '[^/]'
      i++
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      regex += '\\' + ch
      i++
    } else {
      regex += ch
      i++
    }
  }

  if (isDir) {
    // Match the directory itself and anything inside
    regex += '(?:/.*)?'
  }

  return new RegExp('^' + regex + '$')
}

interface ParsedPattern {
  regex: RegExp
  negated: boolean
}

export class ContextFilter {
  private patterns: ParsedPattern[]
  private rawPatterns: string[]

  private constructor(rawPatterns: string[]) {
    this.rawPatterns = rawPatterns
    this.patterns = rawPatterns.map((p) => {
      const negated = p.startsWith('!')
      return { regex: globToRegex(p), negated }
    })
  }

  /**
   * Load .vibeflowignore from cwd. Returns empty filter if file doesn't exist.
   */
  static load(cwd: string): ContextFilter {
    const filePath = join(cwd, '.vibeflowignore')
    if (!existsSync(filePath)) return new ContextFilter([])

    try {
      const content = readFileSync(filePath, 'utf8')
      const lines = content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
      return new ContextFilter(lines)
    } catch {
      return new ContextFilter([])
    }
  }

  /**
   * Check if a relative path should be excluded.
   * Later patterns override earlier ones (gitignore semantics).
   */
  isExcluded(relativePath: string): boolean {
    // Normalize: strip leading ./
    let path = relativePath
    if (path.startsWith('./')) path = path.slice(2)

    let excluded = false
    for (const pattern of this.patterns) {
      if (pattern.regex.test(path)) {
        excluded = !pattern.negated
      }
    }
    return excluded
  }

  /**
   * Generate system prompt clause instructing the agent to avoid excluded paths.
   */
  toSystemPromptClause(): string {
    if (this.rawPatterns.length === 0) return ''

    const activePatterns = this.rawPatterns.filter((p) => !p.startsWith('!'))
    if (activePatterns.length === 0) return ''

    return (
      'CONTEXT EXCLUSION: Do NOT read, edit, or reference these paths: ' +
      activePatterns.join(', ') +
      '. These are excluded by the project\'s .vibeflowignore file. Treat them as if they don\'t exist.'
    )
  }

  /** Get raw patterns for UI display. */
  getPatterns(): string[] {
    return [...this.rawPatterns]
  }

  /** Whether any patterns are loaded. */
  hasPatterns(): boolean {
    return this.rawPatterns.length > 0
  }
}
