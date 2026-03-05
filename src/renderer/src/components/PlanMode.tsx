import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Check, RotateCcw, Edit3, Eye, Eraser, Loader2 } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'
import { MarkdownContent } from './MarkdownContent'

export function PlanMode(): JSX.Element {
  const planMessages = useAgentStore((s) => s.planMessages)
  const planCurrentDraft = useAgentStore((s) => s.planCurrentDraft)
  const planStreaming = useAgentStore((s) => s.planStreaming)
  const submitPlan = useAgentStore((s) => s.submitPlan)
  const acceptPlan = useAgentStore((s) => s.acceptPlan)
  const clearPlan = useAgentStore((s) => s.clearPlan)
  const setPlanCurrentDraft = useAgentStore((s) => s.setPlanCurrentDraft)

  const [input, setInput] = useState('')
  const [editingDraft, setEditingDraft] = useState(false)
  const [draftEditContent, setDraftEditContent] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [planMessages, planStreaming])

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(() => {
    const text = input.trim()
    if (!text || planStreaming) return
    setInput('')
    submitPlan(text)
  }, [input, planStreaming, submitPlan])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleEditToggle = useCallback(() => {
    if (editingDraft) {
      // Save edits back to draft
      setPlanCurrentDraft(draftEditContent)
      setEditingDraft(false)
    } else {
      setDraftEditContent(planCurrentDraft || '')
      setEditingDraft(true)
    }
  }, [editingDraft, planCurrentDraft, draftEditContent, setPlanCurrentDraft])

  const lastAssistantContent = planCurrentDraft
    || [...planMessages].reverse().find(m => m.role === 'assistant')?.content

  return (
    <div className="panel h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-1 w-1 rounded-full"
            style={{
              background: planStreaming ? 'var(--color-accent)' : 'var(--color-text-dim)',
              boxShadow: planStreaming ? '0 0 6px var(--color-accent)' : 'none'
            }}
          />
          <span className="label">Plan</span>
          {planMessages.length > 0 && (
            <span
              style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text-dim)' }}
            >
              {planMessages.filter(m => m.role === 'assistant').length} drafts
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {lastAssistantContent && (
            <>
              <button
                onClick={handleEditToggle}
                className="btn"
                style={{ fontSize: scaled(10), padding: '2px 6px', gap: '3px' }}
              >
                {editingDraft ? <Eye size={10} /> : <Edit3 size={10} />}
                {editingDraft ? 'Preview' : 'Edit'}
              </button>
              <button
                onClick={acceptPlan}
                className="btn btn-accent"
                style={{ fontSize: scaled(10), padding: '2px 8px', gap: '3px' }}
              >
                <Check size={10} />
                Accept
              </button>
            </>
          )}
          {planMessages.length > 0 && (
            <button
              onClick={clearPlan}
              className="btn"
              style={{ fontSize: scaled(10), padding: '2px 6px', gap: '3px' }}
            >
              <Eraser size={10} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Plan content area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
        {planMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(0, 232, 157, 0.06)',
                border: '1px solid rgba(0, 232, 157, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Edit3 size={16} style={{ color: 'var(--color-accent)' }} />
            </div>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: scaled(13),
                color: 'var(--color-text-dim)',
                textAlign: 'center',
                lineHeight: '1.6',
              }}
            >
              Describe what you want to plan.
              <br />
              Claude will create a structured implementation plan.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {planMessages.map((msg, i) => (
              <div key={i}>
                {/* Role label */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: scaled(11),
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: msg.role === 'user' ? 'var(--color-cyan)' : 'var(--color-accent-dim)',
                    }}
                  >
                    {msg.role === 'user' ? 'You' : 'Plan'}
                  </span>
                  {planStreaming && i === planMessages.length - 1 && msg.role === 'assistant' && (
                    <Loader2 size={11} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
                  )}
                </div>

                {/* Content */}
                <div
                  className="rounded-lg px-3 py-2.5"
                  style={{
                    background: msg.role === 'user' ? 'rgba(0, 212, 255, 0.04)' : 'var(--color-surface)',
                    borderLeft: msg.role === 'user'
                      ? '2px solid var(--color-cyan)'
                      : '2px solid var(--color-accent-dim)',
                  }}
                >
                  {msg.role === 'user' ? (
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: scaled(13),
                        color: 'var(--color-text)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: '1.6',
                      }}
                    >
                      {msg.content}
                    </div>
                  ) : editingDraft && i === planMessages.length - 1 ? (
                    <textarea
                      value={draftEditContent}
                      onChange={(e) => setDraftEditContent(e.target.value)}
                      className="w-full resize-none outline-none"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: scaled(12),
                        lineHeight: 1.6,
                        color: 'var(--color-text)',
                        background: 'transparent',
                        border: 'none',
                        minHeight: '200px',
                      }}
                      spellCheck={false}
                    />
                  ) : (
                    <MarkdownContent content={msg.content} fullDocument />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        className="shrink-0 px-4 py-3"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <div
          className="flex items-end gap-2 rounded-lg"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            padding: '8px 10px',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What do you want to plan?"
            rows={2}
            className="flex-1 resize-none outline-none"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(13),
              color: 'var(--color-text)',
              background: 'transparent',
              border: 'none',
              lineHeight: '1.5',
            }}
            disabled={planStreaming}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || planStreaming}
            className="shrink-0 flex items-center justify-center rounded-md transition-colors"
            style={{
              width: '28px',
              height: '28px',
              background: input.trim() && !planStreaming ? 'var(--color-accent)' : 'var(--color-surface-light)',
              border: 'none',
              cursor: input.trim() && !planStreaming ? 'pointer' : 'not-allowed',
              color: input.trim() && !planStreaming ? 'var(--color-base)' : 'var(--color-text-dim)',
            }}
          >
            {planStreaming ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(10),
              color: 'var(--color-text-dim)',
            }}
          >
            {planStreaming ? 'Generating plan...' : 'Cmd+Enter to send'}
          </span>
          {lastAssistantContent && !planStreaming && (
            <button
              onClick={() => submitPlan('Revise the plan. Make it more detailed.')}
              className="flex items-center gap-1"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: scaled(10),
                color: 'var(--color-text-dim)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-accent)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
            >
              <RotateCcw size={9} />
              Revise
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
