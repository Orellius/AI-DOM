import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Eraser, Terminal, Wrench, ChevronRight } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import type { ChatMessage } from '../stores/agentStore'
import { scaled } from '../utils/scale'
import { ThinkingIndicator } from './ThinkingIndicator'
import { ModeSwitchBanner } from './ModeSwitchBanner'
import { MarkdownContent } from './MarkdownContent'
import { AtomicConfirmOverlay } from './AtomicConfirmButton'
import { MessageContextMenu, buildMessageActions } from './MessageContextMenu'
import type { ContextMenuAction } from './MessageContextMenu'
import { PlanDetectionBanner, detectPlan } from './PlanDetectionBanner'

function ToolCallCard({ name, input }: { name: string; input: string }): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="mt-2 rounded-lg overflow-hidden"
      style={{
        background: 'var(--color-surface-light)',
        border: '1px solid var(--color-border)',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 w-full text-left"
        style={{
          background: 'var(--color-surface)',
          borderBottom: expanded ? '1px solid var(--color-border)' : 'none',
          cursor: 'pointer',
          border: 'none',
        }}
      >
        <ChevronRight
          size={11}
          style={{
            color: 'var(--color-text-dim)',
            transition: 'transform 0.15s ease',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
        <Wrench size={11} style={{ color: 'var(--color-accent-dim)', flexShrink: 0 }} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(12),
            color: 'var(--color-accent)',
            fontWeight: 500,
          }}
        >
          {name}
        </span>
      </button>
      {expanded && (
        <pre
          className="px-2.5 py-2 overflow-x-auto"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(11),
            color: 'var(--color-text-muted)',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '120px',
            overflowY: 'auto',
          }}
        >
          {input}
        </pre>
      )}
    </div>
  )
}

/** Strip "★ Insight" blocks that leak from system prompt formatting */
function cleanAssistantContent(text: string): string {
  // Remove backtick-delimited insight headers/footers and content between them
  return text
    .replace(/`[★*]\s*Insight\s*[─—\-]+`\s*/g, '')
    .replace(/`[─—\-]{10,}`\s*/g, '')
    .trim()
}

function MessageBubble({ msg, onContextMenu }: {
  msg: ChatMessage
  onContextMenu: (e: React.MouseEvent, msgId: string) => void
}): JSX.Element {
  const isUser = msg.role === 'user'
  const displayContent = isUser ? msg.content : cleanAssistantContent(msg.content)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(msg.content)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const editAndReprompt = useAgentStore((s) => s.editAndReprompt)

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus()
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length)
    }
  }, [editing])

  const handleEditSubmit = (): void => {
    const trimmed = editText.trim()
    if (!trimmed || trimmed === msg.content) {
      setEditing(false)
      return
    }
    editAndReprompt(msg.id, trimmed)
    setEditing(false)
  }

  // Expose edit trigger via a data attribute the parent can call
  const handleRightClick = (e: React.MouseEvent): void => {
    if (msg.isStreaming) return
    onContextMenu(e, msg.id)
  }

  // The parent ChatPanel calls this via ref pattern, but simpler: use a global
  // We attach startEdit to the bubble so the context menu can trigger it
  ;(MessageBubble as { startEditMap?: Map<string, () => void> }).startEditMap?.set(msg.id, () => {
    setEditText(msg.content)
    setEditing(true)
  })

  return (
    <div
      className="animate-slide-up"
      style={{ marginBottom: '12px' }}
      onContextMenu={handleRightClick}
    >
      {/* Role label */}
      <div className="flex items-center gap-1.5 mb-1">
        {!isUser && <Terminal size={11} style={{ color: 'var(--color-accent-dim)' }} />}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(11),
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isUser ? 'var(--color-cyan)' : 'var(--color-accent-dim)',
          }}
        >
          {isUser ? 'You' : 'Claude'}
        </span>
        {msg.isStreaming && (
          <div
            className="animate-breathe"
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'var(--color-accent)',
              boxShadow: '0 0 6px var(--color-accent)',
            }}
          />
        )}
      </div>

      {/* Content */}
      <div
        className="rounded-lg px-3 py-2.5"
        style={{
          background: isUser ? 'rgba(0, 212, 255, 0.04)' : 'var(--color-surface)',
          borderLeft: isUser ? '2px solid var(--color-cyan)' : '2px solid var(--color-accent-dim)',
        }}
      >
        {/* Tool calls — rendered first (they execute before the response) */}
        {msg.toolCalls.length > 0 && (
          <div style={{ marginBottom: displayContent ? '8px' : 0 }}>
            {msg.toolCalls.map((tc, i) => (
              <ToolCallCard key={`${msg.id}-tool-${i}`} name={tc.name} input={tc.input} />
            ))}
          </div>
        )}

        {/* Message text */}
        {editing ? (
          <div>
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="input"
              rows={3}
              style={{ resize: 'vertical', fontSize: scaled(13), minHeight: '60px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) handleEditSubmit()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={() => setEditing(false)}
                className="btn"
                style={{ fontSize: scaled(11), padding: '2px 8px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSubmit}
                disabled={!editText.trim()}
                className="btn btn-accent"
                style={{ fontSize: scaled(11), padding: '2px 8px' }}
              >
                Reprompt
              </button>
            </div>
          </div>
        ) : msg.isStreaming && !msg.content ? (
          <ThinkingIndicator />
        ) : isUser ? (
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
        ) : (
          <MarkdownContent content={displayContent} />
        )}
      </div>
    </div>
  )
}

// Shared map for triggering edit mode from context menu
if (!(MessageBubble as { startEditMap?: Map<string, () => void> }).startEditMap) {
  ;(MessageBubble as { startEditMap?: Map<string, () => void> }).startEditMap = new Map()
}

export function ChatPanel(): JSX.Element {
  const chatMessages = useAgentStore((s) => s.chatMessages)
  const chatStreaming = useAgentStore((s) => s.chatStreaming)
  const clearChat = useAgentStore((s) => s.clearChat)
  const deleteMessage = useAgentStore((s) => s.deleteMessage)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msgId: string; actions: ContextMenuAction[] } | null>(null)

  // Detect plan-like content in the last assistant message
  const lastPlanContent = useMemo(() => {
    if (chatStreaming) return null
    const lastAssistant = [...chatMessages].reverse().find(m => m.role === 'assistant' && !m.isStreaming)
    if (lastAssistant && lastAssistant.content.length > 100 && detectPlan(lastAssistant.content)) {
      return lastAssistant.content
    }
    return null
  }, [chatMessages, chatStreaming])

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages, chatStreaming])

  const handleContextMenu = useCallback((e: React.MouseEvent, msgId: string) => {
    e.preventDefault()
    const msg = chatMessages.find((m) => m.id === msgId)
    if (!msg) return

    const actions = buildMessageActions({
      isUser: msg.role === 'user',
      content: msg.content,
      messageId: msgId,
      onEdit: () => {
        const editMap = (MessageBubble as { startEditMap?: Map<string, () => void> }).startEditMap
        editMap?.get(msgId)?.()
      },
      onDelete: () => deleteMessage(msgId),
    })
    setCtxMenu({ x: e.clientX, y: e.clientY, msgId, actions })
  }, [chatMessages, deleteMessage])

  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  return (
    <div className="panel h-full flex flex-col overflow-hidden">
      {/* Mode switch banner */}
      <ModeSwitchBanner />
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <span className="label">Chat</span>
        {chatMessages.length > 0 && (
          <button
            onClick={clearChat}
            className="btn"
            style={{ fontSize: scaled(11), padding: '2px 8px', gap: '4px' }}
          >
            <Eraser size={11} />
            Clear
          </button>
        )}
      </div>

      {/* Dangerous command overlay */}
      <AtomicConfirmOverlay />

      {/* Plan detection banner */}
      {lastPlanContent && <PlanDetectionBanner planContent={lastPlanContent} />}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 pr-1">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Terminal size={24} style={{ color: 'var(--color-text-dim)' }} />
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: scaled(13),
                color: 'var(--color-text-dim)',
                textAlign: 'center',
                lineHeight: '1.6',
              }}
            >
              Direct conversation with Claude.
              <br />
              Full tool access. Multi-turn.
            </p>
          </div>
        ) : (
          chatMessages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} onContextMenu={handleContextMenu} />
          ))
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <MessageContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          actions={ctxMenu.actions}
          onClose={closeCtxMenu}
        />
      )}
    </div>
  )
}
