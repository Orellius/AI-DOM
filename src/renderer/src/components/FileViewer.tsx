import { useState, useCallback } from 'react'
import { X, Edit3, Save, XCircle } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'
import { MarkdownContent } from './MarkdownContent'

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof',
  'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw', 'class',
  'extends', 'super', 'this', 'import', 'export', 'default', 'from', 'as',
  'async', 'await', 'yield', 'static', 'get', 'set', 'true', 'false', 'null',
  'undefined', 'void', 'type', 'interface', 'enum', 'implements', 'abstract',
  'private', 'protected', 'public', 'readonly', 'declare', 'module', 'namespace',
  'def', 'self', 'None', 'True', 'False', 'lambda', 'with', 'pass', 'raise',
  'except', 'elif', 'and', 'or', 'not', 'is', 'fn', 'pub', 'mut', 'impl',
  'struct', 'trait', 'use', 'mod', 'crate', 'where', 'match', 'loop',
])

function highlightLine(line: string): JSX.Element[] {
  const parts: JSX.Element[] = []
  let i = 0
  let key = 0

  while (i < line.length) {
    // Comments: // to end of line
    if (line[i] === '/' && line[i + 1] === '/') {
      parts.push(<span key={key++} style={{ color: 'rgba(255, 255, 255, 0.3)' }}>{line.slice(i)}</span>)
      return parts
    }

    // Block comment start: /* ... (within single line)
    if (line[i] === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2)
      if (end !== -1) {
        parts.push(<span key={key++} style={{ color: 'rgba(255, 255, 255, 0.3)' }}>{line.slice(i, end + 2)}</span>)
        i = end + 2
        continue
      }
      parts.push(<span key={key++} style={{ color: 'rgba(255, 255, 255, 0.3)' }}>{line.slice(i)}</span>)
      return parts
    }

    // Strings
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i]
      let j = i + 1
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++ // skip escaped char
        j++
      }
      j++ // include closing quote
      parts.push(<span key={key++} style={{ color: '#50fa7b' }}>{line.slice(i, j)}</span>)
      i = j
      continue
    }

    // Numbers
    if (/\d/.test(line[i]) && (i === 0 || /[\s,([{=+\-*/<>!&|^~%:;]/.test(line[i - 1]))) {
      let j = i
      while (j < line.length && /[\d.xXa-fA-F_]/.test(line[j])) j++
      parts.push(<span key={key++} style={{ color: '#f8a145' }}>{line.slice(i, j)}</span>)
      i = j
      continue
    }

    // Words (potential keywords)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++
      const word = line.slice(i, j)
      if (KEYWORDS.has(word)) {
        parts.push(<span key={key++} style={{ color: 'var(--color-accent)' }}>{word}</span>)
      } else {
        parts.push(<span key={key++}>{word}</span>)
      }
      i = j
      continue
    }

    // Default char
    parts.push(<span key={key++}>{line[i]}</span>)
    i++
  }

  return parts
}

export function FileViewer(): JSX.Element | null {
  const selectedFile = useAgentStore(s => s.selectedFile)
  const fileViewerOpen = useAgentStore(s => s.fileViewerOpen)
  const closeFileViewer = useAgentStore(s => s.closeFileViewer)
  const saveFile = useAgentStore(s => s.saveFile)

  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  if (!fileViewerOpen || !selectedFile) return null

  const lines = selectedFile.content.split('\n')
  const pathParts = selectedFile.relativePath.split('/')
  const isMarkdown = /\.(md|mdx)$/i.test(selectedFile.relativePath)

  const handleEdit = useCallback(() => {
    setEditContent(selectedFile!.content)
    setEditing(true)
  }, [selectedFile])

  const handleSave = useCallback(() => {
    saveFile(selectedFile!.relativePath, editContent)
    setEditing(false)
  }, [selectedFile, editContent, saveFile])

  const handleDiscard = useCallback(() => {
    setEditing(false)
    setEditContent('')
  }, [])

  const handleClose = useCallback(() => {
    setEditing(false)
    setEditContent('')
    closeFileViewer()
  }, [closeFileViewer])

  return (
    <div
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'var(--color-bg, #0a0a0f)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center">
              {i > 0 && (
                <span style={{ color: 'var(--color-text-dim)', margin: '0 2px', fontSize: scaled(11) }}>/</span>
              )}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: scaled(11),
                  color: i === pathParts.length - 1 ? 'var(--color-accent)' : 'var(--color-text-dim)',
                }}
              >
                {part}
              </span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                className="flex items-center gap-1 rounded transition-colors"
                style={{
                  padding: '3px 8px',
                  fontSize: scaled(10),
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-accent)',
                  background: 'rgba(0, 232, 157, 0.1)',
                  border: '1px solid rgba(0, 232, 157, 0.2)',
                  cursor: 'pointer',
                }}
              >
                <Save size={11} />
                Save
              </button>
              <button
                onClick={handleDiscard}
                className="flex items-center gap-1 rounded transition-colors"
                style={{
                  padding: '3px 8px',
                  fontSize: scaled(10),
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-dim)',
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  cursor: 'pointer',
                }}
              >
                <XCircle size={11} />
                Discard
              </button>
            </>
          ) : (
            <button
              onClick={handleEdit}
              className="flex items-center gap-1 rounded transition-colors"
              style={{
                padding: '3px 8px',
                fontSize: scaled(10),
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-dim)',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-accent)'
                e.currentTarget.style.borderColor = 'rgba(0, 232, 157, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-dim)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)'
              }}
            >
              <Edit3 size={11} />
              Edit
            </button>
          )}
          <button
            onClick={handleClose}
            className="flex items-center justify-center rounded transition-colors"
            style={{
              width: '22px',
              height: '22px',
              color: 'var(--color-text-dim)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text)'
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-dim)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {editing ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="flex-1 w-full resize-none outline-none"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(12),
            lineHeight: 1.6,
            color: 'var(--color-text)',
            background: 'transparent',
            padding: '8px 12px',
            border: 'none',
            tabSize: 2,
          }}
          spellCheck={false}
        />
      ) : (
        <div className="flex-1 overflow-auto" style={{ padding: '8px 0' }}>
          {isMarkdown ? (
            <div style={{ padding: '8px 16px' }}>
              <MarkdownContent content={selectedFile.content} fullDocument />
            </div>
          ) : (
            <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: scaled(12), lineHeight: 1.6 }}>
              {lines.map((line, i) => (
                <div key={i} className="flex" style={{ minHeight: '1.6em' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '48px',
                      textAlign: 'right',
                      paddingRight: '12px',
                      color: 'rgba(255, 255, 255, 0.2)',
                      userSelect: 'none',
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ color: 'var(--color-text)', paddingRight: '12px' }}>
                    {highlightLine(line)}
                  </span>
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
