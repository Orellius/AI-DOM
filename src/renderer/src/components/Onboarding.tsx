import { useState, useEffect } from 'react'
import { useAgentStore } from '../stores/agentStore'
import {
  Loader2, AlertTriangle, Download, LogIn, Github, ArrowRight, ArrowLeft,
  CheckCircle2, Key, Cpu, Wifi, X, Eye, EyeOff,
} from 'lucide-react'
import { scaled } from '../utils/scale'

type OnboardingStep = 'welcome' | 'providers' | 'auth' | 'github-auth' | 'optimizer-setup' | 'done'
type ProviderId = 'anthropic' | 'openai' | 'google' | 'ollama'

const AUTH_CHECK_TIMEOUT_MS = 5000

interface ProviderCardInfo {
  id: ProviderId
  name: string
  description: string
  accentColor: string
  accentBg: string
  authType: 'oauth' | 'api-key' | 'local'
}

const PROVIDERS: ProviderCardInfo[] = [
  { id: 'anthropic', name: 'Anthropic', description: 'Claude models — coding, research, analysis', accentColor: '#d97757', accentBg: 'rgba(217, 119, 87, 0.08)', authType: 'oauth' },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o, o3 — general purpose, classification', accentColor: '#10a37f', accentBg: 'rgba(16, 163, 127, 0.08)', authType: 'api-key' },
  { id: 'google', name: 'Google', description: 'Gemini — large context, multimodal', accentColor: '#4285f4', accentBg: 'rgba(66, 133, 244, 0.08)', authType: 'api-key' },
  { id: 'ollama', name: 'Ollama', description: 'Local models — private, no API key needed', accentColor: '#f97316', accentBg: 'rgba(249, 115, 22, 0.08)', authType: 'local' },
]

export function Onboarding(): JSX.Element | null {
  const isAuthenticated = useAgentStore((s) => s.isAuthenticated)
  const authInstalled = useAgentStore((s) => s.authInstalled)
  const github = useAgentStore((s) => s.github)
  const setGitHub = useAgentStore((s) => s.setGitHub)

  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [selectedProviders, setSelectedProviders] = useState<Set<ProviderId>>(new Set())
  const [providerStatus, setProviderStatus] = useState<Record<ProviderId, 'idle' | 'testing' | 'connected' | 'error'>>({
    anthropic: 'idle', openai: 'idle', google: 'idle', ollama: 'idle',
  })
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ openai: '', google: '' })
  const [authProviderIndex, setAuthProviderIndex] = useState(0)
  const [checkTimeout, setCheckTimeout] = useState(false)


  // Auto-detect Ollama on providers step
  useEffect(() => {
    if (step === 'providers') {
      window.api.detectOllamaModels?.().then((models) => {
        if (models && models.length > 0) {
          setProviderStatus((prev) => ({ ...prev, ollama: 'connected' }))
          setSelectedProviders((prev) => new Set([...prev, 'ollama']))
        }
      }).catch(() => {})
    }
  }, [step])

  // Check Claude CLI auth on mount
  useEffect(() => {
    window.api.checkAuth().then((result) => {
      useAgentStore.getState().handleEvent({
        type: 'auth:status',
        installed: result.installed,
        authenticated: result.authenticated,
      })
      if (result.authenticated) {
        setProviderStatus((prev) => ({ ...prev, anthropic: 'connected' }))
        setSelectedProviders((prev) => new Set([...prev, 'anthropic']))
      }
    }).catch(() => {
      setCheckTimeout(true)
    })

    // Timeout fallback
    const timer = setTimeout(() => {
      const state = useAgentStore.getState()
      if (state.isAuthenticated === null) setCheckTimeout(true)
    }, AUTH_CHECK_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])

  if (step === 'done') return null

  // Check if onboarding was previously completed
  const alreadyDone = localStorage.getItem('vibeflow:onboarding-complete') === 'true'
  if (alreadyDone) return null

  const toggleProvider = (id: ProviderId): void => {
    setSelectedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedProvidersArray = PROVIDERS.filter((p) => selectedProviders.has(p.id))
  const currentAuthProvider = selectedProvidersArray[authProviderIndex]
  const allAuthDone = selectedProvidersArray.every((p) => providerStatus[p.id] === 'connected' || p.authType === 'local')

  const finishOnboarding = (): void => {
    localStorage.setItem('vibeflow:onboarding-complete', 'true')
    setStep('done')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--color-base)', paddingTop: '44px' }}
    >
      <div
        className="w-[520px] rounded-xl p-8 animate-fade-in"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 0 80px -20px rgba(0, 232, 157, 0.06)',
        }}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {['welcome', 'providers', 'auth', 'github-auth', 'optimizer-setup'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div style={{ width: '16px', height: '1px', background: 'var(--color-border)' }} />}
              <StepDot
                active={step === s}
                completed={
                  (s === 'welcome' && step !== 'welcome') ||
                  (s === 'providers' && ['auth', 'github-auth', 'optimizer-setup'].includes(step)) ||
                  (s === 'auth' && ['github-auth', 'optimizer-setup'].includes(step)) ||
                  (s === 'github-auth' && step === 'optimizer-setup')
                }
                label={String(i + 1)}
              />
            </div>
          ))}
        </div>

        {/* Step content */}
        {step === 'welcome' && (
          <WelcomeStep onContinue={() => setStep('providers')} />
        )}

        {step === 'providers' && (
          <ProviderSelectionStep
            selected={selectedProviders}
            providerStatus={providerStatus}
            onToggle={toggleProvider}
            onContinue={() => {
              if (selectedProviders.size === 0) {
                finishOnboarding()
              } else {
                setAuthProviderIndex(0)
                setStep('auth')
              }
            }}
          />
        )}

        {step === 'auth' && currentAuthProvider && (
          <AuthStep
            provider={currentAuthProvider}
            status={providerStatus[currentAuthProvider.id]}
            apiKey={apiKeys[currentAuthProvider.id] || ''}
            onApiKeyChange={(key) => setApiKeys((prev) => ({ ...prev, [currentAuthProvider.id]: key }))}
            onTest={async () => {
              setProviderStatus((prev) => ({ ...prev, [currentAuthProvider.id]: 'testing' }))
              try {
                if (currentAuthProvider.authType === 'oauth') {
                  // Anthropic OAuth via Claude CLI
                  const loginResult = await window.api.startLogin()
                  if (loginResult.success) {
                    const auth = await window.api.checkAuth()
                    if (auth.authenticated) {
                      setProviderStatus((prev) => ({ ...prev, anthropic: 'connected' }))
                      useAgentStore.getState().handleEvent({ type: 'auth:status', installed: true, authenticated: true })
                      // Mark Anthropic as connected in ProviderManager so models appear in optimizer
                      await window.api.testProviderConnection('anthropic')
                    } else {
                      setProviderStatus((prev) => ({ ...prev, anthropic: 'error' }))
                    }
                  } else {
                    setProviderStatus((prev) => ({ ...prev, anthropic: 'error' }))
                  }
                } else if (currentAuthProvider.authType === 'api-key') {
                  const key = apiKeys[currentAuthProvider.id]
                  if (!key) {
                    setProviderStatus((prev) => ({ ...prev, [currentAuthProvider.id]: 'error' }))
                    return
                  }
                  const result = await window.api.testProviderConnection(currentAuthProvider.id, key)
                  setProviderStatus((prev) => ({
                    ...prev,
                    [currentAuthProvider.id]: result.connected ? 'connected' : 'error',
                  }))
                  if (result.connected) {
                    await window.api.setProviderApiKey(currentAuthProvider.id, key)
                  }
                } else {
                  // Local (Ollama) — test endpoint
                  const result = await window.api.testProviderConnection(currentAuthProvider.id)
                  setProviderStatus((prev) => ({
                    ...prev,
                    [currentAuthProvider.id]: result.connected ? 'connected' : 'error',
                  }))
                }
              } catch {
                setProviderStatus((prev) => ({ ...prev, [currentAuthProvider.id]: 'error' }))
              }
            }}
            onNext={() => {
              if (authProviderIndex < selectedProvidersArray.length - 1) {
                setAuthProviderIndex(authProviderIndex + 1)
              } else {
                setStep('github-auth')
                window.api.checkGitHub().then((result) => {
                  setGitHub({ authenticated: result.authenticated, username: result.username, remote: result.remote })
                }).catch(() => {})
              }
            }}
            index={authProviderIndex}
            total={selectedProvidersArray.length}
          />
        )}

        {step === 'github-auth' && (
          <GitHubAuthStep
            github={github}
            onConnect={() => {
              window.api.githubLogin()
              const interval = setInterval(() => {
                window.api.checkGitHub().then((result) => {
                  setGitHub({ authenticated: result.authenticated, username: result.username, remote: result.remote })
                  if (result.authenticated) clearInterval(interval)
                }).catch(() => {})
              }, 3000)
              setTimeout(() => clearInterval(interval), 120_000)
            }}
            onSkip={() => setStep('optimizer-setup')}
            onContinue={() => setStep('optimizer-setup')}
          />
        )}

        {step === 'optimizer-setup' && (
          <OptimizerSetupStep onFinish={finishOnboarding} />
        )}

        {/* Navigation bar — back + cancel */}
        {step !== 'welcome' && (
          <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
            <button
              onClick={() => {
                const stepOrder: OnboardingStep[] = ['welcome', 'providers', 'auth', 'github-auth', 'optimizer-setup']
                const currentIndex = stepOrder.indexOf(step)
                if (currentIndex > 0) {
                  setStep(stepOrder[currentIndex - 1])
                }
              }}
              className="flex items-center gap-1.5 transition-colors"
              style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <button
              onClick={finishOnboarding}
              className="flex items-center gap-1.5 transition-colors"
              style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Sub-components ---

function StepDot({ active, completed, label }: { active: boolean; completed: boolean; label: string }): JSX.Element {
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: '24px',
        height: '24px',
        border: `1px solid ${completed ? 'var(--color-accent)' : active ? 'var(--color-accent-dim)' : 'var(--color-border)'}`,
        background: completed ? 'rgba(0, 232, 157, 0.1)' : active ? 'rgba(0, 232, 157, 0.04)' : 'transparent',
      }}
    >
      {completed ? (
        <CheckCircle2 size={12} style={{ color: 'var(--color-accent)' }} />
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: active ? 'var(--color-accent)' : 'var(--color-text-dim)' }}>
          {label}
        </span>
      )}
    </div>
  )
}

function WelcomeStep({ onContinue }: { onContinue: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div
        className="h-1.5 w-1.5 rounded-full animate-breathe"
        style={{ background: 'var(--color-accent)' }}
      />
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: scaled(28),
          fontWeight: 700,
          letterSpacing: '0.15em',
          color: 'var(--color-text)',
        }}
      >
        VIBΣ
      </h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-text-dim)', maxWidth: '340px' }}>
        Multi-LLM agent orchestrator. Connect your AI providers and start building.
      </p>
      <button onClick={onContinue} className="btn btn-accent" style={{ padding: '10px 28px' }}>
        <ArrowRight size={14} />
        Get Started
      </button>
    </div>
  )
}

function ProviderSelectionStep({
  selected,
  providerStatus,
  onToggle,
  onContinue,
}: {
  selected: Set<ProviderId>
  providerStatus: Record<ProviderId, string>
  onToggle: (id: ProviderId) => void
  onContinue: () => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: scaled(20), fontWeight: 600, color: 'var(--color-text)' }}>
          Connect Providers
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)', marginTop: '4px' }}>
          Select which AI providers you want to use
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {PROVIDERS.map((provider) => {
          const isSelected = selected.has(provider.id)
          const isConnected = providerStatus[provider.id] === 'connected'
          return (
            <button
              key={provider.id}
              onClick={() => onToggle(provider.id)}
              className="text-left rounded-xl p-3.5 transition-all"
              style={{
                background: isSelected ? provider.accentBg : 'var(--color-surface-light)',
                border: `1px solid ${isSelected ? provider.accentColor + '40' : 'var(--color-border)'}`,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: scaled(15),
                    fontWeight: 600,
                    color: isSelected ? provider.accentColor : 'var(--color-text)',
                  }}
                >
                  {provider.name}
                </span>
                {isConnected && (
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{
                      background: 'rgba(0, 232, 157, 0.12)',
                      color: 'var(--color-accent)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: scaled(10),
                    }}
                  >
                    Detected
                  </span>
                )}
                {isSelected && !isConnected && (
                  <CheckCircle2 size={14} style={{ color: provider.accentColor }} />
                )}
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text-dim)', lineHeight: 1.4 }}>
                {provider.description}
              </p>
            </button>
          )
        })}
      </div>

      <button onClick={onContinue} className="btn btn-accent w-full" style={{ padding: '10px' }}>
        <ArrowRight size={14} />
        {selected.size === 0 ? 'Skip All' : `Continue with ${selected.size} provider${selected.size > 1 ? 's' : ''}`}
      </button>
    </div>
  )
}

function AuthStep({
  provider,
  status,
  apiKey,
  onApiKeyChange,
  onTest,
  onNext,
  index,
  total,
}: {
  provider: ProviderCardInfo
  status: string
  apiKey: string
  onApiKeyChange: (key: string) => void
  onTest: () => void
  onNext: () => void
  index: number
  total: number
}): JSX.Element {
  const [showKey, setShowKey] = useState(false)
  const isConnected = status === 'connected'
  const isTesting = status === 'testing'

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text-dim)', marginBottom: '4px' }}>
          {index + 1} of {total}
        </p>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: scaled(20), fontWeight: 600, color: provider.accentColor }}>
          Connect {provider.name}
        </h2>
      </div>

      {provider.authType === 'oauth' && (
        <div className="flex flex-col items-center gap-4">
          {isConnected ? (
            <div className="flex items-center gap-2 rounded-lg px-4 py-2.5" style={{ background: 'rgba(0, 232, 157, 0.06)', border: '1px solid rgba(0, 232, 157, 0.15)' }}>
              <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-accent)' }}>Connected</span>
            </div>
          ) : (
            <>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}>
                Sign in with your Claude account via browser
              </p>
              <button onClick={onTest} disabled={isTesting} className="btn btn-accent" style={{ padding: '8px 20px' }}>
                {isTesting ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                {isTesting ? 'Authorizing...' : 'Sign in with Claude'}
              </button>
            </>
          )}
          {status === 'error' && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: '#ef4444' }}>Authentication failed. Try again.</p>
          )}
        </div>
      )}

      {provider.authType === 'api-key' && (
        <div className="flex flex-col gap-3">
          {isConnected ? (
            <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 justify-center" style={{ background: 'rgba(0, 232, 157, 0.06)', border: '1px solid rgba(0, 232, 157, 0.15)' }}>
              <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-accent)' }}>Connected</span>
            </div>
          ) : (
            <>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder={`${provider.name} API Key`}
                  value={apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 pr-10"
                  style={{
                    background: 'var(--color-base)',
                    border: `1px solid ${status === 'error' ? '#ef4444' : 'var(--color-border)'}`,
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: scaled(13),
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--color-text-dim)' }}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button onClick={onTest} disabled={isTesting || !apiKey} className="btn btn-accent w-full" style={{ padding: '8px' }}>
                {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
            </>
          )}
          {status === 'error' && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: '#ef4444' }}>Invalid API key. Check and try again.</p>
          )}
        </div>
      )}

      {provider.authType === 'local' && (
        <div className="flex flex-col items-center gap-3">
          {isConnected ? (
            <div className="flex items-center gap-2 rounded-lg px-4 py-2.5" style={{ background: 'rgba(0, 232, 157, 0.06)', border: '1px solid rgba(0, 232, 157, 0.15)' }}>
              <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-accent)' }}>Detected</span>
            </div>
          ) : (
            <>
              <Cpu size={20} style={{ color: 'var(--color-text-dim)' }} />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)', textAlign: 'center' }}>
                Make sure Ollama is running locally
              </p>
              <button onClick={onTest} disabled={isTesting} className="btn btn-accent" style={{ padding: '8px 20px' }}>
                {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                {isTesting ? 'Detecting...' : 'Detect Ollama'}
              </button>
            </>
          )}
          {status === 'error' && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: '#ef4444' }}>Could not connect. Is Ollama running?</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-end pt-2">
        <button onClick={onNext} className="btn btn-accent" style={{ padding: '6px 16px' }}>
          <ArrowRight size={14} />
          {index < total - 1 ? 'Next' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function GitHubAuthStep({
  github,
  onConnect,
  onSkip,
  onContinue,
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
          <div className="flex items-center gap-2 rounded-lg px-4 py-2.5" style={{ background: 'rgba(0, 232, 157, 0.06)', border: '1px solid rgba(0, 232, 157, 0.15)' }}>
            <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-accent)' }}>
              {github.username || 'Connected'}
            </span>
          </div>
          <button onClick={onContinue} className="btn btn-accent" style={{ padding: '8px 24px' }}>
            <ArrowRight size={14} />
            Continue
          </button>
        </>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}>
            Optional. Enables push, pull, and repo management.
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

function OptimizerSetupStep({ onFinish }: { onFinish: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: scaled(20), fontWeight: 600, color: 'var(--color-text)' }}>
        You're All Set
      </h2>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)', maxWidth: '360px' }}>
        Tasks will automatically route to the best model based on type. You can customize routing in the Optimizer tab.
      </p>
      <div className="grid grid-cols-3 gap-2 w-full">
        {[
          { label: 'Coding', model: 'Claude Sonnet' },
          { label: 'Research', model: 'Claude Sonnet' },
          { label: 'Classification', model: 'GPT-4o Mini' },
        ].map((cat) => (
          <div
            key={cat.label}
            className="rounded-lg p-2.5 text-center"
            style={{ background: 'var(--color-surface-light)', border: '1px solid var(--color-border)' }}
          >
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text)', fontWeight: 500 }}>
              {cat.label}
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(10), color: 'var(--color-text-dim)' }}>
              {cat.model}
            </p>
          </div>
        ))}
      </div>
      <button onClick={onFinish} className="btn btn-accent w-full" style={{ padding: '10px' }}>
        <ArrowRight size={14} />
        Start Using VIBΣ
      </button>
    </div>
  )
}
