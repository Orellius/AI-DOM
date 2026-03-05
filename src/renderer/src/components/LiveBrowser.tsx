import { useState, useRef, useEffect } from 'react'
import { RotateCw, ArrowLeft, ArrowRight, ExternalLink, X } from 'lucide-react'
import { scaled } from '../utils/scale'
import { useAgentStore } from '../stores/agentStore'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        nodeintegration?: string
        contextIsolation?: string
      }
    }
  }
}

export function LiveBrowser(): JSX.Element {
  const previewUrl = useAgentStore((s) => s.previewUrl)
  const closePreview = useAgentStore((s) => s.closePreview)
  const webviewRef = useRef<any>(null)
  const [currentUrl, setCurrentUrl] = useState(previewUrl || '')
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  useEffect(() => {
    if (previewUrl) setCurrentUrl(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const handleNavigation = (): void => {
      setCurrentUrl(wv.getURL())
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }

    wv.addEventListener('did-navigate', handleNavigation)
    wv.addEventListener('did-navigate-in-page', handleNavigation)

    return () => {
      wv.removeEventListener('did-navigate', handleNavigation)
      wv.removeEventListener('did-navigate-in-page', handleNavigation)
    }
  }, [])

  const isValidUrl = (url: string): boolean =>
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)

  if (!previewUrl || !isValidUrl(previewUrl)) {
    return (
      <div style={{ padding: scaled(20), color: '#666', fontSize: scaled(13) }}>
        No preview available. Start a dev server to see a live preview.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0a0a' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: scaled(6),
        padding: `${scaled(6)} ${scaled(10)}`,
        background: '#141414', borderBottom: '1px solid #1e1e1e'
      }}>
        <button
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          style={{ opacity: canGoBack ? 1 : 0.3, background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: scaled(4) }}
        >
          <ArrowLeft size={14} />
        </button>
        <button
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          style={{ opacity: canGoForward ? 1 : 0.3, background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: scaled(4) }}
        >
          <ArrowRight size={14} />
        </button>
        <button
          onClick={() => webviewRef.current?.reload()}
          style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: scaled(4) }}
        >
          <RotateCw size={14} />
        </button>

        {/* URL bar */}
        <div style={{
          flex: 1, padding: `${scaled(4)} ${scaled(8)}`,
          background: '#0a0a0a', borderRadius: scaled(4),
          color: '#666', fontSize: scaled(11), fontFamily: 'monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {currentUrl}
        </div>

        <button
          onClick={() => window.open(currentUrl, '_blank')}
          style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: scaled(4) }}
          title="Open in external browser"
        >
          <ExternalLink size={14} />
        </button>
        <button
          onClick={closePreview}
          style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: scaled(4) }}
          title="Close preview"
        >
          <X size={14} />
        </button>
      </div>

      {/* Webview */}
      <webview
        ref={webviewRef}
        src={previewUrl}
        style={{ flex: 1, border: 'none' }}
        // @ts-ignore - webview is an Electron-specific element
        nodeintegration="false"
        contextIsolation="true"
      />
    </div>
  )
}
