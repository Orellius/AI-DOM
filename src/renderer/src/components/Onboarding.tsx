import { useState, useEffect } from 'react'
import { useAgentStore } from '../stores/agentStore'
import { Loader2, AlertTriangle, Download, LogIn, Github, ArrowRight, CheckCircle2 } from 'lucide-react'
import { scaled } from '../utils/scale'

type OnboardingStep = 'checking' | 'not-installed' | 'claude-auth' | 'github-auth' | 'done'

export function Onboarding(): JSX.Element | null {
  const isAuthenticated = useAgentStore((s) => s.isAuthenticated)
  const authInstalled = useAgentStore((s) => s.authInstalled)
  const github = useAgentStore((s) => s.github)
  const setGitHub = useAgentStore((s) => s.setGitHub)
  const [step, setStep] = useState<OnboardingStep>('checking')

  // Derive step from auth state
  useEffect(() => {
    if (isAuthenticated === null && authInstalled === null) {
      setStep('checking')
    } else if (authInstalled === false) {
      setStep('not-installed')
    } else if (isAuthenticated !== true) {
      setStep('claude-auth')
    } else {
      // Claude is authenticated — check if we've completed onboarding before
      const completed = localStorage.getItem('vibeflow:onboarding-complete')
      if (completed === 'true') {
        setStep('done')
      } else {
        // Show GitHub step
        setStep('github-auth')
        // Auto-check GitHub status
        window.api.checkGitHub().then((result) => {
          setGitHub({ authenticated: result.authenticated, username: result.username, remote: result.remote })
        })
      }
    }
  }, [isAuthenticated, authInstalled, setGitHub])

  if (step === 'done') return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--color-base)' }}
    >
      <div
        className="w-[440px] rounded-xl p-8 animate-fade-in"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 0 80px -20px rgba(0, 232, 157, 0.06)',
        }}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <StepDot active={step === 'checking' || step === 'not-installed' || step === 'claude-auth'} completed={step === 'github-auth'} label="1" />
          <div style={{ width: '32px', height: '1px', background: 'var(--color-border)' }} />
          <StepDot active={step === 'github-auth'} completed={false} label="2" />
        </div>

        {step === 'checking' && <CheckingState />}
        {step === 'not-installed' && <NotInstalledState />}
        {step === 'claude-auth' && <ClaudeAuthState />}
        {step === 'github-auth' && (
          <GitHubAuthState
            github={github}
            onConnect={() => {
              window.api.githubLogin()
              // Poll for auth completion
              const interval = setInterval(() => {
                window.api.checkGitHub().then((result) => {
                  setGitHub({ authenticated: result.authenticated, username: result.username, remote: result.remote })
                  if (result.authenticated) clearInterval(interval)
                })
              }, 3000)
              setTimeout(() => clearInterval(interval), 120_000)
            }}
            onSkip={() => {
              localStorage.setItem('vibeflow:onboarding-complete', 'true')
              setStep('done')
            }}
            onContinue={() => {
              localStorage.setItem('vibeflow:onboarding-complete', 'true')
              setStep('done')
            }}
          />
        )}
      </div>
    </div>
  )
}

function StepDot({ active, completed, label }: { active: boolean; completed: boolean; label: string }): JSX.Element {
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: '28px',
        height: '28px',
        border: `1px solid ${completed ? 'var(--color-accent)' : active ? 'var(--color-accent-dim)' : 'var(--color-border)'}`,
        background: completed ? 'rgba(0, 232, 157, 0.1)' : active ? 'rgba(0, 232, 157, 0.04)' : 'transparent',
      }}
    >
      {completed ? (
        <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: active ? 'var(--color-accent)' : 'var(--color-text-dim)' }}>
          {label}
        </span>
      )}
    </div>
  )
}

function CheckingState(): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: scaled(20), fontWeight: 600, color: 'var(--color-text)' }}>
        Checking Claude CLI
      </h2>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-text-dim)' }}>
        Verifying installation
      </p>
    </div>
  )
}

function NotInstalledState(): JSX.Element {
  const handleInstall = (): void => {
    window.open('https://docs.anthropic.com/en/docs/claude-code/overview', '_blank')
  }

  const handleRetry = (): void => {
    useAgentStore.setState({ isAuthenticated: null, authInstalled: null })
    window.api.checkAuth().then((result) => {
      useAgentStore.getState().handleEvent({
        type: 'auth:status',
        installed: result.installed,
        authenticated: result.authenticated
      })
    })
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <AlertTriangle className="h-6 w-6" style={{ color: 'var(--color-amber)' }} />
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: scaled(20), fontWeight: 600, color: 'var(--color-text)' }}>
        Claude CLI Not Found
      </h2>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-text-dim)' }}>
        Install the Claude CLI to continue.
      </p>
      <button onClick={handleInstall} className="btn btn-accent">
        <Download size={14} />
        Get Claude CLI
      </button>
      <button
        onClick={handleRetry}
        className="transition-colors"
        style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text)'}
        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
      >
        Check again
      </button>
    </div>
  )
}

function ClaudeAuthState(): JSX.Element {
  const [loggingIn, setLoggingIn] = useState(false)

  const handleLogin = async (): Promise<void> => {
    setLoggingIn(true)
    const result = await window.api.startLogin()
    if (result.success) {
      const auth = await window.api.checkAuth()
      useAgentStore.getState().handleEvent({
        type: 'auth:status',
        installed: auth.installed,
        authenticated: auth.authenticated
      })
    }
    setLoggingIn(false)
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {loggingIn ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: scaled(20), fontWeight: 600, color: 'var(--color-text)' }}>
            Authorizing...
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-text-dim)' }}>
            Complete login in your browser.
          </p>
        </>
      ) : (
        <>
          <LogIn className="h-6 w-6" style={{ color: 'var(--color-text-muted)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: scaled(20), fontWeight: 600, color: 'var(--color-text)' }}>
            Sign In to Claude
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-text-dim)' }}>
            Authenticate with your Claude account.
          </p>
          <button onClick={handleLogin} className="btn btn-accent" style={{ padding: '8px 20px' }}>
            <LogIn size={14} />
            Continue with Claude
          </button>
        </>
      )}
    </div>
  )
}

function GitHubAuthState({
  github,
  onConnect,
  onSkip,
  onContinue
}: {
  github: { authenticated: boolean; username: string | null }
  onConnect: () => void
  onSkip: () => void
  onContinue: () => void
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Github className="h-6 w-6" style={{ color: github.authenticated ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: scaled(20), fontWeight: 600, color: 'var(--color-text)' }}>
        Connect GitHub
      </h2>

      {github.authenticated ? (
        <>
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-2.5"
            style={{
              background: 'rgba(0, 232, 157, 0.06)',
              border: '1px solid rgba(0, 232, 157, 0.15)',
            }}
          >
            <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-accent)' }}>
              {github.username || 'Connected'}
            </span>
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}>
            Push, pull, and manage repos directly from the app.
          </p>
          <button onClick={onContinue} className="btn btn-accent" style={{ padding: '8px 24px' }}>
            <ArrowRight size={14} />
            Get Started
          </button>
        </>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-text-dim)' }}>
            Link your GitHub account to enable push, pull, and repo management.
          </p>
          <button onClick={onConnect} className="btn btn-accent" style={{ padding: '8px 20px' }}>
            <Github size={14} />
            Connect with GitHub
          </button>
          <button
            onClick={onSkip}
            className="transition-colors"
            style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
          >
            Skip for now
          </button>
        </>
      )}
    </div>
  )
}
