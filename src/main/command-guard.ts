import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'

interface PendingCommand {
  id: string
  command: string
  reason: string
  timestamp: number
  resolve: (approved: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

// Dangerous command patterns — matched against dev server commands and other user input
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Filesystem destruction
  { pattern: /rm\s+-rf\s+[/~]/, reason: 'Recursive deletion of system/home directory' },
  { pattern: /rm\s+-rf\s+\.\s*$/, reason: 'Recursive deletion of current directory' },
  { pattern: /chmod\s+-R\s+(?:000|777)\s+\//, reason: 'Recursive permission change on system path' },
  { pattern: /chown\s+-R\s+.*\s+\/(?:usr|bin|etc|var|System|Library)/, reason: 'Recursive ownership change on system directory' },

  // Disk/partition destruction
  { pattern: /\b(?:mkfs|fdisk)\b/, reason: 'Disk formatting command detected' },
  { pattern: /\bdd\s+.*(?:of=\/dev|if=\/dev\/zero)/, reason: 'Low-level disk write (dd)' },

  // Fork bombs
  { pattern: /:\(\)\s*\{/, reason: 'Fork bomb detected' },

  // Remote code execution via piping
  { pattern: /(?:curl|wget)\s+.*\|\s*(?:sh|bash|zsh|dash)/, reason: 'Remote script piping to shell' },
  { pattern: /(?:curl|wget)\s+.*-[oO]\s+.*&&.*(?:chmod|sh|bash|\.\/|source)/, reason: 'Download-and-execute pattern' },

  // Base64 decode to execution
  { pattern: /base64\s+(?:-d|--decode)\s*\|\s*(?:sh|bash|eval)/, reason: 'Base64-decoded command execution' },
  { pattern: /echo\s+.*\|\s*base64\s+(?:-d|--decode)\s*\|\s*(?:sh|bash)/, reason: 'Encoded command execution' },

  // Reverse shells
  { pattern: /bash\s+-i\s+>&\s*\/dev\/tcp/, reason: 'Reverse shell detected' },
  { pattern: /\bnc\s+.*-e\s+/, reason: 'Netcat reverse shell' },

  // SSH key exfiltration
  { pattern: /(?:cat|curl|scp|rsync)\s+.*\.ssh\/(?:id_rsa|id_ed25519|authorized_keys)/, reason: 'SSH key access/exfiltration' },

  // Destructive Python/Node one-liners
  { pattern: /python[23]?\s+-c\s+.*(?:exec|eval)\s*\(.*(?:requests|urllib|urlopen)/, reason: 'Python remote code execution' },
  { pattern: /node\s+-e\s+.*(?:exec|spawn|require\s*\(\s*['"]child_process)/, reason: 'Node.js arbitrary command execution' },

  // System integrity
  { pattern: /\bkill\s+.*(?:init|launchd|WindowServer|loginwindow)\b/, reason: 'Killing critical system process' },
  { pattern: /\bcsrutil\s+disable\b/, reason: 'Disabling System Integrity Protection' },
]

const APPROVAL_TIMEOUT_MS = 30_000

export class CommandGuard extends EventEmitter {
  private pending = new Map<string, PendingCommand>()

  check(command: string): { dangerous: boolean; reason: string } {
    for (const { pattern, reason } of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return { dangerous: true, reason }
      }
    }
    return { dangerous: false, reason: '' }
  }

  requestApproval(command: string, reason: string): Promise<boolean> {
    const id = randomUUID()
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.emit('command:rejected', { id, command, reason: 'Timed out (30s)' })
        resolve(false)
      }, APPROVAL_TIMEOUT_MS)

      const entry: PendingCommand = { id, command, reason, timestamp: Date.now(), resolve, timer }
      this.pending.set(id, entry)

      this.emit('command:pending', { id, command, reason, timestamp: entry.timestamp })
    })
  }

  approve(id: string): void {
    const entry = this.pending.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(id)
    entry.resolve(true)
    this.emit('command:approved', { id, command: entry.command })
  }

  reject(id: string): void {
    const entry = this.pending.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(id)
    entry.resolve(false)
    this.emit('command:rejected', { id, command: entry.command, reason: 'Rejected by user' })
  }

  destroy(): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.resolve(false)
    }
    this.pending.clear()
  }
}
