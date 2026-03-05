import { existsSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { execFileSync } from 'child_process'

export interface ProjectProfile {
  name: string
  language: 'typescript' | 'javascript' | 'rust' | 'python' | 'go' | 'unknown'
  framework: string | null
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'cargo' | 'poetry' | 'pip' | null
  devCommand: string | null
  buildCommand: string | null
  testCommand: string | null
  hasGit: boolean
  branch: string | null
  entryFiles: string[]
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function fileExists(cwd: string, name: string): boolean {
  return existsSync(join(cwd, name))
}

function getGitBranch(cwd: string): string | null {
  try {
    const headPath = join(cwd, '.git', 'HEAD')
    const head = readFileSync(headPath, 'utf8').trim()
    return head.startsWith('ref: refs/heads/') ? head.slice(16) : head.slice(0, 8)
  } catch {
    return null
  }
}

function detectEntryFiles(cwd: string, candidates: string[]): string[] {
  return candidates.filter((f) => existsSync(join(cwd, f)))
}

function profileNodeProject(cwd: string, pkg: Record<string, unknown>): Partial<ProjectProfile> {
  const hasTs = fileExists(cwd, 'tsconfig.json')
  const language: ProjectProfile['language'] = hasTs ? 'typescript' : 'javascript'

  // Detect package manager from lockfiles
  let packageManager: ProjectProfile['packageManager'] = 'npm'
  if (fileExists(cwd, 'pnpm-lock.yaml')) packageManager = 'pnpm'
  else if (fileExists(cwd, 'yarn.lock')) packageManager = 'yarn'
  else if (fileExists(cwd, 'bun.lockb') || fileExists(cwd, 'bun.lock')) packageManager = 'bun'

  // Detect framework from dependencies
  const deps = { ...(pkg.dependencies as Record<string, string> || {}), ...(pkg.devDependencies as Record<string, string> || {}) }
  let framework: string | null = null
  if (deps['next']) framework = 'next'
  else if (deps['@tauri-apps/api']) framework = 'tauri'
  else if (deps['electron']) framework = 'electron'
  else if (deps['vite']) framework = 'vite'
  else if (deps['react']) framework = 'react'
  else if (deps['vue']) framework = 'vue'
  else if (deps['svelte']) framework = 'svelte'
  else if (deps['express']) framework = 'express'
  else if (deps['fastify']) framework = 'fastify'

  // Extract commands from scripts
  const scripts = pkg.scripts as Record<string, string> | undefined
  const pm = packageManager
  const devCommand = scripts?.dev ? `${pm} dev` : scripts?.start ? `${pm} start` : null
  const buildCommand = scripts?.build ? `${pm} build` : null
  const testCommand = scripts?.test ? `${pm} test` : null

  // Entry files
  const entryFiles = detectEntryFiles(cwd, [
    'src/main.ts', 'src/main.tsx', 'src/index.ts', 'src/index.tsx',
    'src/main/index.ts', 'src/App.tsx', 'app/page.tsx', 'pages/index.tsx',
    'index.ts', 'index.js', 'server.ts', 'server.js',
  ])

  return { language, packageManager, framework, devCommand, buildCommand, testCommand, entryFiles }
}

function profileRustProject(cwd: string): Partial<ProjectProfile> {
  const cargoToml = readFileSync(join(cwd, 'Cargo.toml'), 'utf8')
  const nameMatch = cargoToml.match(/name\s*=\s*"([^"]+)"/)

  let framework: string | null = null
  if (cargoToml.includes('tauri')) framework = 'tauri'
  else if (cargoToml.includes('actix')) framework = 'actix'
  else if (cargoToml.includes('axum')) framework = 'axum'
  else if (cargoToml.includes('rocket')) framework = 'rocket'

  return {
    language: 'rust',
    packageManager: 'cargo',
    framework,
    devCommand: 'cargo run',
    buildCommand: 'cargo build --release',
    testCommand: 'cargo test',
    entryFiles: detectEntryFiles(cwd, ['src/main.rs', 'src/lib.rs']),
    name: nameMatch?.[1] || undefined,
  }
}

function profilePythonProject(cwd: string): Partial<ProjectProfile> {
  const hasPoetry = fileExists(cwd, 'pyproject.toml')
  const packageManager: ProjectProfile['packageManager'] = hasPoetry ? 'poetry' : 'pip'

  let framework: string | null = null
  let devCommand: string | null = null

  // Read pyproject.toml or requirements.txt for framework detection
  const content = hasPoetry
    ? readFileSync(join(cwd, 'pyproject.toml'), 'utf8')
    : fileExists(cwd, 'requirements.txt')
      ? readFileSync(join(cwd, 'requirements.txt'), 'utf8')
      : ''

  if (content.includes('fastapi')) {
    framework = 'fastapi'
    devCommand = hasPoetry ? 'poetry run uvicorn app.main:app --reload' : 'uvicorn app.main:app --reload'
  } else if (content.includes('django')) {
    framework = 'django'
    devCommand = hasPoetry ? 'poetry run python manage.py runserver' : 'python manage.py runserver'
  } else if (content.includes('flask')) {
    framework = 'flask'
    devCommand = hasPoetry ? 'poetry run flask run' : 'flask run'
  }

  return {
    language: 'python',
    packageManager,
    framework,
    devCommand,
    buildCommand: null,
    testCommand: hasPoetry ? 'poetry run pytest' : 'pytest',
    entryFiles: detectEntryFiles(cwd, ['app/main.py', 'main.py', 'manage.py', 'app.py', 'server.py']),
  }
}

function profileGoProject(cwd: string): Partial<ProjectProfile> {
  let name = basename(cwd)
  try {
    const goMod = readFileSync(join(cwd, 'go.mod'), 'utf8')
    const modMatch = goMod.match(/module\s+(\S+)/)
    if (modMatch) name = modMatch[1].split('/').pop() || name
  } catch { /* use dir name */ }

  return {
    language: 'go',
    packageManager: null,
    framework: null,
    devCommand: 'go run .',
    buildCommand: 'go build',
    testCommand: 'go test ./...',
    entryFiles: detectEntryFiles(cwd, ['main.go', 'cmd/main.go']),
    name,
  }
}

export function profileProject(cwd: string): ProjectProfile {
  const name = basename(cwd)
  const hasGit = fileExists(cwd, '.git')
  const branch = hasGit ? getGitBranch(cwd) : null

  const base: ProjectProfile = {
    name,
    language: 'unknown',
    framework: null,
    packageManager: null,
    devCommand: null,
    buildCommand: null,
    testCommand: null,
    hasGit,
    branch,
    entryFiles: [],
  }

  // Detect language by file markers (priority order)
  if (fileExists(cwd, 'Cargo.toml')) {
    return { ...base, ...profileRustProject(cwd) }
  }

  if (fileExists(cwd, 'go.mod')) {
    return { ...base, ...profileGoProject(cwd) }
  }

  if (fileExists(cwd, 'pyproject.toml') || fileExists(cwd, 'requirements.txt')) {
    return { ...base, ...profilePythonProject(cwd) }
  }

  if (fileExists(cwd, 'package.json')) {
    const pkg = readJsonSafe(join(cwd, 'package.json'))
    if (pkg) {
      return { ...base, ...profileNodeProject(cwd, pkg), name: (pkg.name as string) || name }
    }
  }

  return base
}

export function profileToSystemPromptClause(profile: ProjectProfile): string {
  if (profile.language === 'unknown') return ''

  const parts: string[] = [
    `PROJECT CONTEXT: This is a ${profile.language}${profile.framework ? `/${profile.framework}` : ''} project`,
  ]

  if (profile.packageManager) {
    parts[0] += ` using ${profile.packageManager}`
  }
  parts[0] += '.'

  const commands: string[] = []
  if (profile.devCommand) commands.push(`Dev: \`${profile.devCommand}\``)
  if (profile.buildCommand) commands.push(`Build: \`${profile.buildCommand}\``)
  if (profile.testCommand) commands.push(`Test: \`${profile.testCommand}\``)
  if (commands.length > 0) parts.push(commands.join(', ') + '.')

  if (profile.branch) parts.push(`Branch: ${profile.branch}.`)

  if (profile.entryFiles.length > 0) {
    parts.push(`Entry files: ${profile.entryFiles.join(', ')}.`)
  }

  return parts.join(' ')
}
