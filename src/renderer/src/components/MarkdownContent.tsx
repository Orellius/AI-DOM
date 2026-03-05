import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { scaled } from '../utils/scale'

marked.setOptions({
  breaks: true,
  gfm: true,
})

interface MarkdownContentProps {
  content: string
  /** Enable richer rendering for full documents (larger text, images, details/summary) */
  fullDocument?: boolean
}

export function MarkdownContent({ content, fullDocument }: MarkdownContentProps): JSX.Element {
  // Content is always sanitized via DOMPurify before rendering
  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content, { async: false }) as string
    const allowedTags = [
      'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'del', 'div',
    ]
    const allowedAttr = ['href', 'title', 'class']
    if (fullDocument) {
      allowedTags.push('img', 'details', 'summary', 'input')
      allowedAttr.push('src', 'alt', 'width', 'height', 'type', 'checked', 'disabled')
    }
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttr,
      FORBID_TAGS: fullDocument
        ? ['video', 'audio', 'form', 'iframe', 'object', 'embed', 'script', 'style']
        : ['img', 'video', 'audio', 'form', 'iframe', 'object', 'embed', 'script', 'style'],
    })
  }, [content, fullDocument])

  return (
    <div
      className="markdown-body"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: fullDocument ? scaled(14) : scaled(13),
        color: 'var(--color-text)',
        lineHeight: fullDocument ? '1.7' : '1.6',
        ...(fullDocument ? { padding: '8px 4px' } : {}),
      }}
      // Safe: content is sanitized by DOMPurify above
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
