import { useEffect, useState, useRef, useCallback } from 'react'
import { GitCommit, GitBranch, X, Loader2, Check, AlertCircle, Sparkles } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

const GENERATING_MESSAGES = [
  'Reading your diff like a novel...',
  'Translating code to human...',
  'Crafting the perfect one-liner...',
  'Consulting the commit message gods...',
  'Distilling chaos into clarity...',
  'Channeling inner Linus Torvalds...',
  'Avoiding "fix stuff" as a message...',
  'Making your future self proud...',
  'Almost done, pinky promise...',
]

interface FileChange {
  path: string
  type: 'created' | 'modified' | 'deleted'
}

interface UnpushedCommit {
  hash: string
  message: string
}

type ResultState = { type: 'success' | 'error'; message: string } | null

export function GitModal(): JSX.Element | null {
  const gitModal = useAgentStore((s) => s.gitModal)
  const closeGitModal = useAgentStore((s) => s.closeGitModal)
  const refreshGitStatus = useAgentStore((s) => s.refreshGitStatus)
  const currentBranch = useAgentStore((s) => s.gitStatus.currentBranch)

  if (!gitModal) return null

  return (
    <div
      className="git-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeGitModal()
      }}
    >
      {gitModal === 'commit' ? (
        <CommitModal
          onClose={closeGitModal}
          onDone={() => { refreshGitStatus(); closeGitModal() }}
        />
      ) : (
        <PushModal
          onClose={closeGitModal}
          onDone={() => { refreshGitStatus(); closeGitModal() }}
          currentBranch={currentBranch}
        />
      )}
    </div>
  )
}

function CommitModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }): JSX.Element {
  const [files, setFiles] = useState<FileChange[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [funnyIdx, setFunnyIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ResultState>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.api.getFileChanges().then((changes) => {
      setFiles(changes)
      setLoading(false)
      // Auto-generate commit message with AI if there are changes
      if (changes.length > 0) {
        setGenerating(true)
        window.api.generateCommitMessage().then((msg) => {
          if (msg) setMessage(msg)
        }).catch(() => { /* user can type manually */ })
          .finally(() => setGenerating(false))
      }
    }).catch(() => setLoading(false))
  }, [])

  // Rotate funny messages while AI generates
  useEffect(() => {
    if (!generating) return
    const interval = setInterval(() => {
      setFunnyIdx((i) => (i + 1) % GENERATING_MESSAGES.length)
    }, 2500)
    return () => clearInterval(interval)
  }, [generating])

  useEffect(() => {
    if (!loading && !generating) textareaRef.current?.focus()
  }, [loading, generating])

  useKeyClose(onClose)

  const handleCommit = async (): Promise<void> => {
    if (!message.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await window.api.commitWithMessage(message.trim())
      setResult({ type: res.success ? 'success' : 'error', message: res.output })
      if (res.success) setTimeout(onDone, 1200)
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  const dotColor = (type: FileChange['type']): string => {
    if (type === 'created') return 'var(--color-accent)'
    if (type === 'deleted') return 'var(--color-red)'
    return 'var(--color-amber)'
  }

  return (
    <div className="git-modal-content" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitCommit size={16} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), fontWeight: 600, color: 'var(--color-text)' }}>
            Commit Changes
          </span>
        </div>
        <button onClick={onClose} className="git-modal-close-btn">
          <X size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : files.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>
          No uncommitted changes
        </p>
      ) : (
        <>
          <div className="git-modal-file-list">
            {files.map((f) => (
              <div key={f.path} className="git-modal-file-row">
                <div className="git-modal-dot" style={{ background: dotColor(f.type) }} />
                <span className="git-modal-file-path">{f.path}</span>
              </div>
            ))}
          </div>

          <div className="mt-3" style={{ position: 'relative' }}>
            {generating ? (
              <div
                className="input"
                style={{
                  minHeight: '82px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  cursor: 'wait',
                  borderColor: 'rgba(0, 232, 157, 0.15)',
                }}
              >
                <Loader2
                  size={20}
                  className="animate-spin"
                  style={{ color: 'var(--color-accent)' }}
                />
                <span
                  key={funnyIdx}
                  className="animate-fade-in"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: scaled(12),
                    color: 'var(--color-text-muted)',
                    textAlign: 'center',
                    letterSpacing: '0.02em',
                  }}
                >
                  {GENERATING_MESSAGES[funnyIdx]}
                </span>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Commit message..."
                className="input"
                rows={3}
                style={{ resize: 'none', fontSize: scaled(13) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) handleCommit()
                }}
              />
            )}
          </div>

          {result && <ResultBanner result={result} />}

          <div className="flex items-center justify-end gap-2 mt-3">
            <button onClick={onClose} className="btn" style={{ fontSize: scaled(12) }}>Cancel</button>
            <button
              onClick={handleCommit}
              disabled={!message.trim() || submitting}
              className="btn btn-accent"
              style={{ fontSize: scaled(12) }}
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <GitCommit size={12} />}
              Commit
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function PushModal({ onClose, onDone, currentBranch }: {
  onClose: () => void
  onDone: () => void
  currentBranch: string | null
}): JSX.Element {
  const [commits, setCommits] = useState<UnpushedCommit[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState(currentBranch || '')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ResultState>(null)

  useEffect(() => {
    Promise.all([
      window.api.getUnpushedCommits(),
      window.api.getLocalBranches(),
    ]).then(([unpushed, localBranches]) => {
      setCommits(unpushed)
      setBranches(localBranches)
      if (currentBranch && localBranches.includes(currentBranch)) {
        setSelectedBranch(currentBranch)
      } else if (localBranches.length > 0) {
        setSelectedBranch(localBranches[0])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [currentBranch])

  useKeyClose(onClose)

  const handlePush = async (): Promise<void> => {
    if (!selectedBranch || submitting) return
    setSubmitting(true)
    try {
      const res = await window.api.pushToBranch(selectedBranch)
      setResult({ type: res.success ? 'success' : 'error', message: res.output })
      if (res.success) setTimeout(onDone, 1200)
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="git-modal-content" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitBranch size={16} style={{ color: 'var(--color-cyan)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), fontWeight: 600, color: 'var(--color-text)' }}>
            Push to Remote
          </span>
        </div>
        <button onClick={onClose} className="git-modal-close-btn">
          <X size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : (
        <>
          {commits.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>
              No unpushed commits
            </p>
          ) : (
            <div className="git-modal-file-list">
              {commits.map((c) => (
                <div key={c.hash} className="git-modal-file-row">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-cyan)', flexShrink: 0 }}>
                    {c.hash}
                  </span>
                  <span className="git-modal-file-path">{c.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3">
            <label className="label" style={{ display: 'block', marginBottom: '6px' }}>Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="input"
              style={{ fontSize: scaled(13) }}
            >
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {result && <ResultBanner result={result} />}

          <div className="flex items-center justify-end gap-2 mt-3">
            <button onClick={onClose} className="btn" style={{ fontSize: scaled(12) }}>Cancel</button>
            <button
              onClick={handlePush}
              disabled={!selectedBranch || submitting}
              className="btn btn-accent"
              style={{ fontSize: scaled(12) }}
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <GitBranch size={12} />}
              Push
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ResultBanner({ result }: { result: NonNullable<ResultState> }): JSX.Element {
  const isSuccess = result.type === 'success'
  return (
    <div
      className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2"
      style={{
        background: isSuccess ? 'rgba(0, 232, 157, 0.06)' : 'rgba(255, 64, 96, 0.06)',
        border: `1px solid ${isSuccess ? 'rgba(0, 232, 157, 0.2)' : 'rgba(255, 64, 96, 0.2)'}`,
      }}
    >
      {isSuccess ? (
        <Check size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
      ) : (
        <AlertCircle size={14} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
      )}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: scaled(12),
        color: isSuccess ? 'var(--color-accent)' : 'var(--color-red)',
        wordBreak: 'break-word',
      }}>
        {result.message}
      </span>
    </div>
  )
}

function useKeyClose(onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const handler = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onCloseRef.current()
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
}
