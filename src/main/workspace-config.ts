import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import { execFileSync } from 'child_process'

interface WorkspaceProject {
  name: string
  path: string
}

interface WorkspaceConfig {
  projects: WorkspaceProject[]
  activeProjectPath: string | null
}

export interface ProjectEntry {
  name: string
  path: string
  branch: string
  isInitialized: boolean
}

const CONFIG_DIR = join(homedir(), '.vibeflow')
const CONFIG_FILE = join(CONFIG_DIR, 'workspace.json')

const DEFAULT_CONFIG: WorkspaceConfig = {
  projects: [],
  activeProjectPath: null,
}

/** Directories that are never standalone projects. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next',
  '.cache', 'target', '__pycache__', '.venv', 'venv',
])

export class WorkspaceConfigManager {
  private config: WorkspaceConfig

  constructor() {
    this.config = this.load()
  }

  private load(): WorkspaceConfig {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true })
      if (!existsSync(CONFIG_FILE)) {
        this.saveToDisk(DEFAULT_CONFIG)
        return { ...DEFAULT_CONFIG, projects: [] }
      }
      const raw = readFileSync(CONFIG_FILE, 'utf8')
      const parsed = JSON.parse(raw) as WorkspaceConfig
      // Validate structure
      if (!Array.isArray(parsed.projects)) return { ...DEFAULT_CONFIG, projects: [] }
      // Filter out projects whose directories no longer exist
      parsed.projects = parsed.projects.filter((p) => {
        try {
          return statSync(p.path).isDirectory()
        } catch {
          return false
        }
      })
      return parsed
    } catch {
      return { ...DEFAULT_CONFIG, projects: [] }
    }
  }

  private saveToDisk(config: WorkspaceConfig): void {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true })
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
    } catch (err) {
      console.error('[VIBE:WorkspaceConfig] Failed to save:', err)
    }
  }

  private save(): void {
    this.saveToDisk(this.config)
  }

  private getBranch(projectPath: string): string {
    try {
      return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: projectPath,
        stdio: 'pipe',
      }).toString().trim() || 'unknown'
    } catch {
      return 'unknown'
    }
  }

  getProjects(): ProjectEntry[] {
    return this.config.projects.map((p) => ({
      name: p.name,
      path: p.path,
      branch: this.getBranch(p.path),
      isInitialized: existsSync(join(p.path, '.git')) || existsSync(join(p.path, 'package.json')),
    }))
  }

  addProject(absolutePath: string): ProjectEntry[] {
    // Validate: must exist, must be a directory
    const stat = statSync(absolutePath)
    if (!stat.isDirectory()) {
      throw new Error('Path is not a directory')
    }

    // Don't add duplicates
    const normalized = absolutePath.replace(/\/+$/, '')
    if (this.config.projects.some((p) => p.path === normalized)) {
      return this.getProjects()
    }

    const name = normalized.split('/').pop() || normalized
    this.config.projects.push({ name, path: normalized })
    this.save()
    return this.getProjects()
  }

  removeProject(absolutePath: string): void {
    const normalized = absolutePath.replace(/\/+$/, '')
    this.config.projects = this.config.projects.filter((p) => p.path !== normalized)
    // Clear active if it was the removed project
    if (this.config.activeProjectPath === normalized) {
      this.config.activeProjectPath = null
    }
    this.save()
  }

  setActiveProject(absolutePath: string | null): void {
    this.config.activeProjectPath = absolutePath ? absolutePath.replace(/\/+$/, '') : null
    this.save()
  }

  /**
   * Check if a directory has its own .git — the only reliable signal
   * that it's an independent project (not a subpackage or build artifact).
   */
  private static hasOwnGit(dirPath: string): boolean {
    return existsSync(join(dirPath, '.git'))
  }

  /**
   * Scan immediate children of a directory for independent projects.
   * Only matches directories with their own .git (not just package.json).
   * Skips hidden dirs, node_modules, and common build/output directories.
   */
  private scanDirectChildren(parentPath: string): string[] {
    try {
      const entries = readdirSync(parentPath, { withFileTypes: true })
      const results: string[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.')) continue
        if (SKIP_DIRS.has(entry.name)) continue
        const childPath = join(parentPath, entry.name)
        if (WorkspaceConfigManager.hasOwnGit(childPath)) {
          results.push(childPath)
        }
      }
      return results
    } catch {
      return []
    }
  }

  /**
   * Smart add: detect if a folder is a single project or an umbrella
   * containing independent sub-projects (each with their own .git).
   *
   * - Folder has .git and NO children with .git → single project, add it.
   * - Folder has children with .git → umbrella, add each child instead.
   * - Folder has nothing → add as uninitialized project.
   */
  addProjectSmart(absolutePath: string): ProjectEntry[] {
    const stat = statSync(absolutePath)
    if (!stat.isDirectory()) {
      throw new Error('Path is not a directory')
    }

    const normalized = absolutePath.replace(/\/+$/, '')
    const subProjects = this.scanDirectChildren(normalized)

    if (subProjects.length > 0) {
      // Umbrella directory — add each child project
      for (const sp of subProjects) {
        this.addProject(sp)
      }
      return this.getProjects()
    }

    // Single project or uninitialized folder — add directly
    return this.addProject(normalized)
  }

  /**
   * Auto-detect projects from the cwd on first launch.
   * Only runs when the workspace list is completely empty.
   *
   * Detection strategy:
   * 1. Check if cwd is inside an umbrella (parent has sibling projects with .git)
   * 2. If cwd itself is an umbrella (has children with .git), add those
   * 3. Otherwise, add cwd as a single project
   */
  autoDetectFromCwd(cwd: string): void {
    if (this.config.projects.length > 0) return

    const normalized = cwd.replace(/\/+$/, '')

    // Strategy 1: Check parent — is cwd one project inside an umbrella?
    const parentDir = join(normalized, '..')
    const siblings = this.scanDirectChildren(parentDir)
    if (siblings.length > 1) {
      // Parent has multiple projects — cwd is inside an umbrella
      for (const sp of siblings) {
        const name = basename(sp)
        this.config.projects.push({ name, path: sp })
      }
      this.save()
      return
    }

    // Strategy 2: Is cwd itself an umbrella?
    const subProjects = this.scanDirectChildren(normalized)
    if (subProjects.length > 0) {
      for (const sp of subProjects) {
        const name = basename(sp)
        this.config.projects.push({ name, path: sp })
      }
      this.save()
      return
    }

    // Strategy 3: cwd is a standalone project
    if (WorkspaceConfigManager.hasOwnGit(normalized)) {
      this.config.projects.push({ name: basename(normalized), path: normalized })
      this.save()
    }
  }

  getActiveProjectPath(): string | null {
    const active = this.config.activeProjectPath
    if (!active) return null
    // Verify it still exists and is in the project list
    const exists = this.config.projects.some((p) => p.path === active)
    if (!exists) {
      this.config.activeProjectPath = null
      this.save()
      return null
    }
    return active
  }
}
