import { useEffect, useRef } from 'react'
import { Pencil, Trash2, Copy } from 'lucide-react'
import { scaled } from '../utils/scale'

export interface ContextMenuAction {
  label: string
  icon: typeof Pencil
  color?: string
  onClick: () => void
}

interface Props {
  x: number
  y: number
  actions: ContextMenuAction[]
  onClose: () => void
}

export function MessageContextMenu({ x, y, actions, onClose }: Props): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside or ESC
  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Clamp position so menu stays within viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width - 8
    const maxY = window.innerHeight - rect.height - 8
    if (x > maxX) menuRef.current.style.left = `${maxX}px`
    if (y > maxY) menuRef.current.style.top = `${maxY}px`
  }, [x, y])

  return (
    <div
      ref={menuRef}
      className="msg-context-menu animate-fade-in"
      style={{ left: x, top: y }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          className="msg-context-menu-item"
          onClick={() => {
            action.onClick()
            onClose()
          }}
        >
          <action.icon size={13} style={{ color: action.color || 'var(--color-text-muted)', flexShrink: 0 }} />
          <span style={{ color: action.color || 'var(--color-text)' }}>{action.label}</span>
        </button>
      ))}
    </div>
  )
}

// Pre-built action factories
export function buildMessageActions(opts: {
  isUser: boolean
  content: string
  messageId: string
  onEdit: () => void
  onDelete: () => void
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = []

  if (opts.isUser) {
    actions.push({
      label: 'Edit & Reprompt',
      icon: Pencil,
      color: 'var(--color-cyan)',
      onClick: opts.onEdit,
    })
  }

  actions.push({
    label: 'Copy',
    icon: Copy,
    onClick: () => navigator.clipboard.writeText(opts.content),
  })

  actions.push({
    label: 'Delete',
    icon: Trash2,
    color: 'var(--color-red)',
    onClick: opts.onDelete,
  })

  return actions
}
