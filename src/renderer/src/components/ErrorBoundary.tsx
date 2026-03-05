import { Component, type ReactNode } from 'react'
import { scaled } from '../utils/scale'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message }
  }

  componentDidCatch(error: Error): void {
    console.error('[VIBE:ErrorBoundary]', error)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="h-screen flex items-center justify-center"
          style={{ background: 'var(--color-base)' }}
        >
          <div
            className="rounded-xl p-8 text-center max-w-md"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid rgba(255, 64, 96, 0.2)',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: scaled(20),
                fontWeight: 600,
                color: 'var(--color-red)',
                marginBottom: '12px',
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: scaled(13),
                color: 'var(--color-text-muted)',
                marginBottom: '16px',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn btn-accent"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
