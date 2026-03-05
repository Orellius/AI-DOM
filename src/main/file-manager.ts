import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, renameSync, existsSync, unlinkSync, rmSync } from 'fs'
import { join, resolve, relative, extname, basename, dirname } from 'path'
import { execFileSync } from 'child_process'

export interface FileEntry {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  size: number
  modifiedAt: number
}

export interface FileContent {
  path: string
  relativePath: string
  content: string
  size: number
  language: string
}

export class FileManager {
  private projectRoot: string | null = null

  // Always skip these directories
  private static SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.DS_Store',
    '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache', 'target', '.cache'
  ])

  private static MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

  private static BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.webp', '.svg',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
    '.exe', '.dll', '.so', '.dylib', '.o', '.a',
    '.pyc', '.pyo', '.class', '.wasm'
  ])

  private static LANGUAGE_MAP: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact',
    '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
    '.html': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.md': 'markdown', '.mdx': 'mdx', '.txt': 'plaintext',
    '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    '.sql': 'sql', '.graphql': 'graphql', '.gql': 'graphql',
    '.xml': 'xml', '.svg': 'svg',
    '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
    '.swift': 'swift', '.kt': 'kotlin', '.rb': 'ruby', '.php': 'php',
    '.lua': 'lua', '.r': 'r', '.R': 'r',
    '.env': 'dotenv', '.gitignore': 'gitignore', '.dockerignore': 'dockerignore',
    'Dockerfile': 'dockerfile', 'Makefile': 'makefile'
  }

  setRoot(root: string): void {
    this.projectRoot = resolve(root)
  }

  listDirectory(relativePath: string): FileEntry[] {
    const absPath = this.validatePath(relativePath)
    const entries = readdirSync(absPath, { withFileTypes: true })
    const result: FileEntry[] = []

    for (const entry of entries) {
      if (FileManager.SKIP_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.gitignore' && entry.name !== '.vibe') continue

      const fullPath = join(absPath, entry.name)
      try {
        const stat = statSync(fullPath)
        result.push({
          name: entry.name,
          path: fullPath,
          relativePath: relative(this.projectRoot!, fullPath),
          isDirectory: entry.isDirectory(),
          size: entry.isDirectory() ? 0 : stat.size,
          modifiedAt: stat.mtimeMs
        })
      } catch {
        // Skip files we can't stat (permissions, broken symlinks)
      }
    }

    // Sort: directories first, then alphabetical
    return result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  readFile(relativePath: string): FileContent {
    const absPath = this.validatePath(relativePath)
    const stat = statSync(absPath)

    if (stat.size > FileManager.MAX_FILE_SIZE) {
      throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum is 2MB.`)
    }

    const ext = extname(absPath).toLowerCase()
    if (FileManager.BINARY_EXTENSIONS.has(ext)) {
      return {
        path: absPath,
        relativePath,
        content: `[Binary file: ${basename(absPath)} (${(stat.size / 1024).toFixed(1)}KB)]`,
        size: stat.size,
        language: this.inferLanguage(absPath)
      }
    }

    const content = readFileSync(absPath, 'utf-8')
    return {
      path: absPath,
      relativePath,
      content,
      size: stat.size,
      language: this.inferLanguage(absPath)
    }
  }

  writeFile(relativePath: string, content: string): void {
    const absPath = this.validatePath(relativePath)
    writeFileSync(absPath, content, 'utf-8')
  }

  deleteFile(relativePath: string): void {
    const absPath = this.validatePath(relativePath)
    // Move to trash on macOS using execFileSync (safe, no shell injection)
    try {
      execFileSync('osascript', ['-e', `tell application "Finder" to delete POSIX file "${absPath}"`], { stdio: 'ignore' })
    } catch {
      // Fallback: direct delete
      const stat = statSync(absPath)
      if (stat.isDirectory()) {
        rmSync(absPath, { recursive: true })
      } else {
        unlinkSync(absPath)
      }
    }
  }

  renameFile(oldRelative: string, newName: string): void {
    const oldAbs = this.validatePath(oldRelative)
    const dir = dirname(oldAbs)
    const newAbs = join(dir, newName)
    // Validate new path is still within root
    if (!newAbs.startsWith(this.projectRoot!)) {
      throw new Error('Path traversal detected')
    }
    renameSync(oldAbs, newAbs)
  }

  createFile(relativePath: string, content?: string): void {
    const absPath = this.validatePath(relativePath, true)
    if (existsSync(absPath)) {
      throw new Error('File already exists')
    }
    const dir = dirname(absPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(absPath, content || '', 'utf-8')
  }

  createDirectory(relativePath: string): void {
    const absPath = this.validatePath(relativePath, true)
    if (existsSync(absPath)) {
      throw new Error('Directory already exists')
    }
    mkdirSync(absPath, { recursive: true })
  }

  private validatePath(relativePath: string, allowNew = false): string {
    if (!this.projectRoot) throw new Error('No project root set')

    // Block path traversal
    if (relativePath.includes('..')) throw new Error('Path traversal not allowed')

    const absPath = resolve(this.projectRoot, relativePath)
    if (!absPath.startsWith(this.projectRoot)) {
      throw new Error('Path traversal detected')
    }

    if (!allowNew && !existsSync(absPath)) {
      throw new Error('Path does not exist')
    }

    return absPath
  }

  private inferLanguage(filename: string): string {
    const ext = extname(filename).toLowerCase()
    const base = basename(filename)
    return FileManager.LANGUAGE_MAP[ext] || FileManager.LANGUAGE_MAP[base] || 'plaintext'
  }
}
