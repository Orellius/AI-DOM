import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { scaled } from '../utils/scale'

marked.setOptions({
  breaks: true,
  gfm: true,
})

export function MarkdownContent({ content }: { content: string }): JSX.Element {
  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content, { async: false }) as string
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'code', 'pre',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'hr',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'span', 'del', 'div',
      ],
      ALLOWED_ATTR: ['href', 'title', 'class'],
      FORBID_TAGS: ['img', 'video', 'audio', 'form', 'iframe', 'object', 'embed', 'script', 'style'],
    })
  }, [content])

  return (
    <div
      className="markdown-body"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: scaled(13),
        color: 'var(--color-text)',
        lineHeight: '1.6',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
