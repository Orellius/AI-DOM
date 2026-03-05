import { Play, GitCommit, GitBranch, TestTube2, Undo2, Square } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

export function QuickActions(): JSX.Element {
  const runQuickAction = useAgentStore((s) => s.runQuickAction)
  const snapshots = useAgentStore((s) => s.snapshots)
  const devServer = useAgentStore((s) => s.devServer)
  const setDevServer = useAgentStore((s) => s.setDevServer)
  const mode = useAgentStore((s) => s.mode)
  const gitStatus = useAgentStore((s) => s.gitStatus)
  const openGitModal = useAgentStore((s) => s.openGitModal)

  const handleRun = (): void => {
    if (devServer.running) {
      window.api.stopDevServer()
      setDevServer({ running: false })
    } else {
      runQuickAction('run')
    }
  }

  const canUndo = snapshots.length > 0

  return (
    <div className="flex items-center gap-3">
      {/* Spacer matching the > / ~ prompt width in CommandBar */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(16),
          fontWeight: 600,
          visibility: 'hidden',
        }}
      >
        {mode === 'chat' ? '~' : '>'}
      </span>
      <div className="flex items-center gap-1.5">
      <button
        onClick={handleRun}
        className={devServer.running ? 'btn btn-danger' : 'btn btn-accent'}
      >
        {devServer.running ? <Square size={10} /> : <Play size={10} />}
        {devServer.running ? 'Stop' : 'Run'}
      </button>

      <button onClick={() => openGitModal('commit')} className="btn" style={{ position: 'relative' }}>
        <GitCommit size={10} />
        Commit
        {gitStatus.uncommittedCount > 0 && (
          <span className="quick-action-badge" style={{ background: 'var(--color-amber)' }} />
        )}
      </button>

      <button onClick={() => openGitModal('push')} className="btn" style={{ position: 'relative' }}>
        <GitBranch size={10} />
        Push
        {gitStatus.unpushedCount > 0 && (
          <span className="quick-action-badge" style={{ background: 'var(--color-cyan)' }} />
        )}
      </button>

      <button onClick={() => runQuickAction('test')} className="btn">
        <TestTube2 size={10} />
        Test
      </button>

      <button
        onClick={() => canUndo && runQuickAction('undo')}
        disabled={!canUndo}
        className="btn"
      >
        <Undo2 size={10} />
        Undo
      </button>
      </div>
    </div>
  )
}
