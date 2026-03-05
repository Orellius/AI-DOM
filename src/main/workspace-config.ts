import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
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
}

const CONFIG_DIR = join(homedir(), '.vibeflow')
const CONFIG_FILE = join(CONFIG_DIR, 'workspace.json')

const DEFAULT_CONFIG: WorkspaceConfig = {
  projects: [],
  activeProjectPath: null,
}

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
    }))
  }

  addProject(absolutePath: string): ProjectEntry[] {
    // Validate: must exist, must be a directory
    const stat = statSync(absolutePath)
    if (!stat.isDirectory()) {
      throw new Error('Path is not a directory')
    }

    // Must have .git or package.json to qualify as a project
    const hasGit = existsSync(join(absolutePath, '.git'))
    const hasPkgJson = existsSync(join(absolutePath, 'package.json'))
    if (!hasGit && !hasPkgJson) {
      throw new Error('Directory must contain .git or package.json')
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
