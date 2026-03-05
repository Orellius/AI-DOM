import { useEffect, useRef, useState } from 'react'
import { Play, Square, Terminal } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

const LOCALHOST_PATTERN = /https?:\/\/localhost[:\d/\w.-]*/g

function parseLine(line: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  let last = 0
  let match: RegExpExecArray | null
  const re = new RegExp(LOCALHOST_PATTERN.source, 'g')
  while ((match = re.exec(line)) !== null) {
    if (match.index > last) parts.push(line.slice(last, match.index))
    const url = match[0]
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{ color: 'var(--color-cyan)', textDecoration: 'underline' }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
      >
        {url}
      </a>
    )
    last = match.index + url.length
  }
  if (last < line.length) parts.push(line.slice(last))
  return parts
}

export function DevServerPanel(): JSX.Element {
  const devServer = useAgentStore((s) => s.devServer)
  const setDevServer = useAgentStore((s) => s.setDevServer)
  const addDevServerOutput = useAgentStore((s) => s.addDevServerOutput)

  const [command, setCommand] = useState(devServer.command ?? '')
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cleanup = window.api.onDevServerOutput((line: string) => {
      addDevServerOutput(line)
    })
    return cleanup
  }, [addDevServerOutput])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [devServer.output])

  const handleStart = async () => {
    const cmd = command.trim() || 'pnpm dev'
    setDevServer({ running: true, command: cmd })
    await window.api.startDevServer(cmd)
  }

  const handleStop = async () => {
    await window.api.stopDevServer()
    setDevServer({ running: false })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
        <Terminal size={12} style={{ color: 'var(--color-text-dim)' }} />
        <span className="label">Dev Server</span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="pnpm dev"
          disabled={devServer.running}
          className="input flex-1"
          style={{ fontSize: scaled(13), padding: '5px 8px', opacity: devServer.running ? 0.4 : 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !devServer.running) handleStart()
          }}
        />
        {devServer.running ? (
          <button onClick={handleStop} className="btn btn-danger">
            <Square size={10} />
            Stop
          </button>
        ) : (
          <button onClick={handleStart} className="btn btn-accent">
            <Play size={10} />
            Start
          </button>
        )}
      </div>

      {devServer.url && (
        <div className="mb-2 flex items-center gap-2 rounded px-2 py-1.5" style={{ background: 'var(--color-surface-light)', border: '1px solid var(--color-border)' }}>
          <span className="label" style={{ fontSize: scaled(11) }}>URL</span>
          <a
            href={devServer.url}
            target="_blank"
            rel="noreferrer"
            style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-cyan)', textDecoration: 'underline' }}
          >
            {devServer.url}
          </a>
        </div>
      )}

      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto rounded-lg p-2"
        style={{
          background: 'var(--color-base)',
          border: '1px solid var(--color-border)',
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(13),
          lineHeight: '1.5',
          color: 'var(--color-text-muted)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {devServer.output.length === 0 ? (
          <span style={{ color: 'var(--color-text-dim)' }}>No output yet...</span>
        ) : (
          devServer.output.map((line, i) => (
            <div key={i}>{parseLine(line)}</div>
          ))
        )}
      </div>
    </div>
  )
}
