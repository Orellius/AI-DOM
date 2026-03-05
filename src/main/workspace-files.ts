import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const VIBE_DIR = '.vibe'

const WORKSPACE_FILES = [
  'SOUL.md',
  'USER.md',
  'IDENTITY.md',
  'TOOLS.md',
  'AGENTS.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md',
] as const

export type WorkspaceFileName = (typeof WORKSPACE_FILES)[number]

// --- Template defaults ---

const TEMPLATES: Record<WorkspaceFileName, string> = {
  'SOUL.md': `# Soul

## Personality
<!-- How should AI agents communicate? Direct, educational, casual? -->

## Coding Philosophy
<!-- Principles: DRY, minimal complexity, homegrown-first? -->

## Quality Standards
<!-- What defines "done"? Tests required? Lint clean? -->
`,

  'USER.md': `# User

## Name
<!-- Your name or alias -->

## Preferences
<!-- Communication style, timezone, language -->

## Workflow
<!-- How you prefer to work: plan-first, iterative, etc. -->
`,

  'IDENTITY.md': `# Identity

## Project Name
<!-- The name of this project -->

## Purpose
<!-- What this project does, in one sentence -->

## Stack
<!-- Language, framework, runtime, key libraries -->

## Architecture
<!-- High-level architecture overview -->
`,

  'TOOLS.md': `# Tools

## Dev Commands
<!-- How to start the dev server -->

## Build Commands
<!-- How to build for production -->

## Test Commands
<!-- How to run tests -->

## Conventions
<!-- Code style, import patterns, naming rules -->

## Forbidden
<!-- Tools, libraries, or patterns that should never be used -->
`,

  'AGENTS.md': `# Agents

## Behavior Rules
<!-- How agents should operate in this project -->

## Routing
<!-- Which models for which tasks? -->

## Escalation
<!-- When should agents ask for help? -->
`,

  'HEARTBEAT.md': `# Heartbeat

## Current Focus
<!-- What are you currently working on? -->

## Blockers
<!-- Any blockers or open questions? -->

## Progress
<!-- Recent progress notes -->
`,

  'BOOTSTRAP.md': `# Bootstrap

## First Run
<!-- Steps to get this project running from scratch -->

## Prerequisites
<!-- Required tools, runtimes, environment setup -->

## Onboarding
<!-- What a new developer needs to know -->
`,
}

export class WorkspaceFilesManager {
  /** Scaffold .vibe/ into a project directory. Merges missing sections if files exist. */
  scaffoldWorkspaceFiles(projectPath: string): void {
    const vibeDir = join(projectPath, VIBE_DIR)
    if (!existsSync(vibeDir)) {
      mkdirSync(vibeDir, { recursive: true })
    }

    for (const fileName of WORKSPACE_FILES) {
      const filePath = join(vibeDir, fileName)
      if (existsSync(filePath)) {
        // Merge missing sections
        const existing = readFileSync(filePath, 'utf8')
        const template = TEMPLATES[fileName]
        const merged = this.mergeFile(existing, template)
        if (merged !== existing) {
          writeFileSync(filePath, merged, 'utf8')
        }
      } else {
        writeFileSync(filePath, TEMPLATES[fileName], 'utf8')
      }
    }
  }

  /** Smart merge: preserve user content, append missing ## sections from template. */
  private mergeFile(existing: string, template: string): string {
    const existingHeadings = new Set(
      existing.match(/^## .+$/gm)?.map((h) => h.trim()) || []
    )
    const templateSections = template.split(/(?=^## )/gm)
    const newSections = templateSections.filter((section) => {
      const heading = section.match(/^## .+$/m)?.[0]?.trim()
      return heading && !existingHeadings.has(heading)
    })
    if (newSections.length === 0) return existing
    return existing.trimEnd() + '\n\n' + newSections.join('\n')
  }

  /** Read all workspace files for a project. */
  readAll(projectPath: string): Record<string, string> {
    const vibeDir = join(projectPath, VIBE_DIR)
    const result: Record<string, string> = {}
    if (!existsSync(vibeDir)) return result

    for (const fileName of WORKSPACE_FILES) {
      const filePath = join(vibeDir, fileName)
      if (existsSync(filePath)) {
        result[fileName] = readFileSync(filePath, 'utf8')
      }
    }
    return result
  }

  /** Read a single workspace file. */
  readFile(projectPath: string, fileName: string): string | null {
    const filePath = join(projectPath, VIBE_DIR, fileName)
    if (!existsSync(filePath)) return null
    return readFileSync(filePath, 'utf8')
  }

  /** Write a single workspace file. */
  writeFile(projectPath: string, fileName: string, content: string): void {
    const vibeDir = join(projectPath, VIBE_DIR)
    if (!existsSync(vibeDir)) {
      mkdirSync(vibeDir, { recursive: true })
    }
    writeFileSync(join(vibeDir, fileName), content, 'utf8')
  }

  /** Check if .vibe/ exists for a project. */
  hasWorkspaceFiles(projectPath: string): boolean {
    return existsSync(join(projectPath, VIBE_DIR))
  }

  /** Assemble all workspace files into a single system prompt clause. */
  assembleSystemPrompt(projectPath: string): string {
    const files = this.readAll(projectPath)
    const entries = Object.entries(files).filter(([, content]) => {
      // Skip files that are just template comments with no real content
      const stripped = content.replace(/<!--[\s\S]*?-->/g, '').replace(/^#.*$/gm, '').trim()
      return stripped.length > 0
    })
    if (entries.length === 0) return ''

    const SECTION_MAP: Record<string, string> = {
      'SOUL.md': 'Soul',
      'USER.md': 'User',
      'IDENTITY.md': 'Identity',
      'TOOLS.md': 'Tools',
      'AGENTS.md': 'Agents',
      'HEARTBEAT.md': 'Heartbeat',
      'BOOTSTRAP.md': 'Bootstrap',
    }

    let prompt = 'WORKSPACE IDENTITY:\n'
    for (const [fileName, content] of entries) {
      const label = SECTION_MAP[fileName] || fileName.replace('.md', '')
      prompt += `\n## ${label}\n${content.trim()}\n`
    }
    return prompt
  }

  /** Seed .vibe/ from existing CLAUDE.md content. */
  seedFromClaudeMd(projectPath: string): void {
    const claudeMdPath = join(projectPath, 'CLAUDE.md')
    if (!existsSync(claudeMdPath)) return

    const content = readFileSync(claudeMdPath, 'utf8')
    const vibeDir = join(projectPath, VIBE_DIR)
    if (!existsSync(vibeDir)) {
      mkdirSync(vibeDir, { recursive: true })
    }

    // Parse CLAUDE.md for useful sections
    const nameMatch = content.match(/^#\s+(.+)/m)
    const stackMatch = content.match(/##\s*Stack\n([\s\S]*?)(?=\n##|\n$)/i)
    const descMatch = content.match(/##\s*Description\n([\s\S]*?)(?=\n##|\n$)/i)
    const devMatch = content.match(/##\s*Dev Commands?\n([\s\S]*?)(?=\n##|\n$)/i)
    const conventionsMatch = content.match(/##\s*Conventions?\n([\s\S]*?)(?=\n##|\n$)/i)

    // Seed IDENTITY.md
    let identity = '# Identity\n\n'
    if (nameMatch) identity += `## Project Name\n${nameMatch[1].trim()}\n\n`
    if (descMatch) identity += `## Purpose\n${descMatch[1].trim()}\n\n`
    if (stackMatch) identity += `## Stack\n${stackMatch[1].trim()}\n\n`
    if (identity.length > 15) {
      writeFileSync(join(vibeDir, 'IDENTITY.md'), identity, 'utf8')
    }

    // Seed TOOLS.md
    let tools = '# Tools\n\n'
    if (devMatch) tools += `## Dev Commands\n${devMatch[1].trim()}\n\n`
    if (conventionsMatch) tools += `## Conventions\n${conventionsMatch[1].trim()}\n\n`
    if (tools.length > 12) {
      writeFileSync(join(vibeDir, 'TOOLS.md'), tools, 'utf8')
    }

    // Write remaining files from templates (only if they don't exist)
    for (const fileName of WORKSPACE_FILES) {
      const filePath = join(vibeDir, fileName)
      if (!existsSync(filePath)) {
        writeFileSync(filePath, TEMPLATES[fileName], 'utf8')
      }
    }
  }

  /** Get the list of expected workspace file names. */
  static getFileNames(): readonly string[] {
    return WORKSPACE_FILES
  }
}
