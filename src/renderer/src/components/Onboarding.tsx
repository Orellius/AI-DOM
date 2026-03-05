import { useState, useEffect, useCallback, useRef } from 'react'
import { useAgentStore } from '../stores/agentStore'
import {
  Loader2, LogIn, Github, ArrowRight, ArrowLeft,
  CheckCircle2, Key, Cpu, Wifi, Eye, EyeOff, X,
  MessageSquare, Bell, Globe, Mail, Webhook,
  Server, Monitor, GitBranch, Check,
} from 'lucide-react'
import { scaled } from '../utils/scale'

// ═══════════════════════════════════════════════════
//  Types & Constants
// ═══════════════════════════════════════════════════

type OnboardingStep = 'welcome' | 'providers' | 'auth' | 'channels' | 'services' | 'github' | 'init' | 'done'
type ProviderId = 'anthropic' | 'openai' | 'google' | 'ollama'
type ChannelId = 'telegram' | 'discord' | 'slack' | 'email' | 'webhooks'
type ServiceId = 'mcp-servers' | 'browser-preview' | 'git-hooks'
type InitPhase = 'idle' | 'resolving' | 'connecting' | 'configuring' | 'verifying' | 'finalizing' | 'done'

const AUTH_CHECK_TIMEOUT_MS = 5000

const STEP_ORDER: OnboardingStep[] = ['welcome', 'providers', 'auth', 'channels', 'services', 'github', 'init']

interface StepMeta {
  number: string
  title: string
  description: string
}

const STEP_META: Record<OnboardingStep, StepMeta> = {
  welcome: { number: '01', title: 'VIBΣ', description: 'Multi-LLM agent orchestrator.\nConnect, configure, create.' },
  providers: { number: '02', title: 'Providers', description: 'Connect AI models\n— local or cloud.' },
  auth: { number: '03', title: 'Authentication', description: 'Verify credentials for\nyour selected providers.' },
  channels: { number: '04', title: 'Channels', description: 'Get notified when\ntasks complete.' },
  services: { number: '05', title: 'Services', description: 'Connect external tools\nto extend capabilities.' },
  github: { number: '06', title: 'Version Control', description: 'Connect GitHub for\npush, PR, and sync.' },
  init: { number: '07', title: 'Initialization', description: 'Verifying configuration\nand starting services.' },
  done: { number: '', title: '', description: '' },
}

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

interface ChannelInfo {
  id: ChannelId
  name: string
  description: string
  icon: typeof MessageSquare
  configLabel: string
  configPlaceholder: string
}

const CHANNELS: ChannelInfo[] = [
  { id: 'telegram', name: 'Telegram', description: 'Bot notifications', icon: MessageSquare, configLabel: 'Bot Token', configPlaceholder: '123456:ABC-DEF...' },
  { id: 'discord', name: 'Discord', description: 'Webhook alerts', icon: MessageSquare, configLabel: 'Webhook URL', configPlaceholder: 'https://discord.com/api/webhooks/...' },
  { id: 'slack', name: 'Slack', description: 'Channel messages', icon: Bell, configLabel: 'Webhook URL', configPlaceholder: 'https://hooks.slack.com/...' },
  { id: 'email', name: 'Email', description: 'Email digests', icon: Mail, configLabel: 'Email Address', configPlaceholder: 'you@example.com' },
  { id: 'webhooks', name: 'Webhooks', description: 'Custom HTTP', icon: Webhook, configLabel: 'Endpoint URL', configPlaceholder: 'https://your-server.com/hook' },
]

const COMING_SOON_CHANNELS = [
  'WhatsApp', 'Signal', 'iMessage', 'Matrix', 'IRC',
  'Google Chat', 'MS Teams', 'Mattermost', 'Nostr', 'LINE',
]

interface ServiceInfo {
  id: ServiceId
  name: string
  description: string
  icon: typeof Server
}

const SERVICES: ServiceInfo[] = [
  { id: 'mcp-servers', name: 'MCP Servers', description: 'Connect Model Context Protocol servers for extended tools', icon: Server },
  { id: 'browser-preview', name: 'Browser Preview', description: 'Auto-launch browser preview for web projects', icon: Monitor },
  { id: 'git-hooks', name: 'Git Hooks', description: 'Auto-snapshot before each task execution', icon: GitBranch },
]

const INIT_PHASES: InitPhase[] = ['resolving', 'connecting', 'configuring', 'verifying', 'finalizing']

// ═══════════════════════════════════════════════════
//  Sub-components
// ═══════════════════════════════════════════════════

function ProgressDots({ current, total }: { current: number; total: number }): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const isCompleted = i < current
        const isCurrent = i === current
        return (
          <div key={i} className="flex items-center gap-1.5">
            {i > 0 && i === current && (
              <div
                style={{
                  width: '16px',
                  height: '2px',
                  background: 'var(--color-accent)',
                  borderRadius: '1px',
                }}
              />
            )}
            {i > 0 && i !== current && (
              <div style={{ width: '4px' }} />
            )}
            <div
              style={{
                width: isCurrent ? '10px' : '6px',
                height: isCurrent ? '10px' : '6px',
                borderRadius: '50%',
                background: isCompleted
                  ? 'var(--color-accent)'
                  : isCurrent
                    ? 'var(--color-accent)'
                    : 'var(--color-border-light)',
                opacity: isCompleted ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

function ChannelCard({
  channel,
  selected,
  configValue,
  onToggle,
  onConfigChange,
}: {
  channel: ChannelInfo
  selected: boolean
  configValue: string
  onToggle: () => void
  onConfigChange: (val: string) => void
}): JSX.Element {
  const Icon = channel.icon
  return (
    <div
      className="rounded-lg transition-all cursor-pointer"
      style={{
        border: `1px solid ${selected ? 'rgba(0, 232, 157, 0.25)' : 'var(--color-border)'}`,
        background: selected ? 'rgba(0, 232, 157, 0.04)' : 'var(--color-surface-light)',
        padding: '12px',
      }}
    >
      <div className="flex items-center gap-2.5 mb-1" onClick={onToggle}>
        <Icon size={14} style={{ color: selected ? 'var(--color-accent)' : 'var(--color-text-dim)', flexShrink: 0 }} />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: scaled(14),
            fontWeight: 600,
            color: selected ? 'var(--color-accent)' : 'var(--color-text)',
            flex: 1,
          }}
        >
          {channel.name}
        </span>
        <div
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            border: `1.5px solid ${selected ? 'var(--color-accent)' : 'var(--color-border-light)'}`,
            background: selected ? 'rgba(0, 232, 157, 0.15)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {selected && <Check size={10} style={{ color: 'var(--color-accent)' }} />}
        </div>
      </div>
      <p
        onClick={onToggle}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(11),
          color: 'var(--color-text-dim)',
          marginBottom: selected ? '8px' : 0,
        }}
      >
        {channel.description}
      </p>
      {selected && (
        <input
          type="text"
          placeholder={channel.configPlaceholder}
          value={configValue}
          onChange={(e) => onConfigChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded-md px-2.5 py-1.5 mt-1 no-drag"
          style={{
            background: 'var(--color-base)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(11),
            outline: 'none',
          }}
        />
      )}
    </div>
  )
}

function ServiceCard({
  service,
  enabled,
  onToggle,
}: {
  service: ServiceInfo
  enabled: boolean
  onToggle: () => void
}): JSX.Element {
  const Icon = service.icon
  return (
    <div
      className="flex items-center gap-3 rounded-lg p-3.5 transition-all cursor-pointer"
      style={{
        border: `1px solid ${enabled ? 'rgba(0, 232, 157, 0.2)' : 'var(--color-border)'}`,
        background: enabled ? 'rgba(0, 232, 157, 0.03)' : 'var(--color-surface-light)',
      }}
      onClick={onToggle}
    >
      <Icon size={16} style={{ color: enabled ? 'var(--color-accent)' : 'var(--color-text-dim)', flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: scaled(14),
            fontWeight: 600,
            color: enabled ? 'var(--color-text)' : 'var(--color-text)',
          }}
        >
          {service.name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(11),
            color: 'var(--color-text-dim)',
            marginTop: '2px',
          }}
        >
          {service.description}
        </div>
      </div>
      {/* Toggle switch */}
      <div
        style={{
          width: '36px',
          height: '20px',
          borderRadius: '10px',
          background: enabled ? 'rgba(0, 232, 157, 0.3)' : 'var(--color-border)',
          position: 'relative',
          transition: 'background 0.2s ease',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: enabled ? 'var(--color-accent)' : 'var(--color-text-dim)',
            position: 'absolute',
            top: '2px',
            left: enabled ? '18px' : '2px',
            transition: 'left 0.2s ease, background 0.2s ease',
          }}
        />
      </div>
    </div>
  )
}

function PhaseTab({ phase, current, completed }: { phase: InitPhase; current: InitPhase; completed: boolean }): JSX.Element {
  const isActive = phase === current
  const label = phase.charAt(0).toUpperCase() + phase.slice(1)
  return (
    <div
      className="flex items-center gap-1.5"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: scaled(11),
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: isActive ? 'var(--color-accent)' : completed ? 'var(--color-text-muted)' : 'var(--color-text-dim)',
        paddingBottom: '6px',
        borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
        transition: 'all 0.2s ease',
      }}
    >
      {completed && <CheckCircle2 size={10} style={{ color: 'var(--color-accent)' }} />}
      {label}
    </div>
  )
}

function TerminalLine({ line, index }: { line: string; index: number }): JSX.Element {
  const isSuccess = line.includes('\u2713')
  const isError = line.includes('\u2717')
  const isAction = line.startsWith('\u2192')
  const isCommand = line.startsWith('$')
  const isEmpty = line.trim() === ''

  let color = 'var(--color-text-muted)'
  if (isSuccess) color = 'var(--color-accent)'
  if (isError) color = '#ef4444'
  if (isAction) color = 'var(--color-cyan)'
  if (isCommand) color = 'var(--color-text)'
  if (isEmpty) color = 'transparent'

  return (
    <div
      className="animate-slide-in-left"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: scaled(12),
        color,
        lineHeight: 1.6,
        animationDelay: `${index * 50}ms`,
        opacity: 0,
        whiteSpace: 'pre',
      }}
    >
      {line || '\u00A0'}
    </div>
  )
}

// ═══════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════

export function Onboarding(): JSX.Element | null {
  const isAuthenticated = useAgentStore((s) => s.isAuthenticated)
  const authInstalled = useAgentStore((s) => s.authInstalled)
  const github = useAgentStore((s) => s.github)
  const setGitHub = useAgentStore((s) => s.setGitHub)

  // Existing state
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [selectedProviders, setSelectedProviders] = useState<Set<ProviderId>>(new Set())
  const [providerStatus, setProviderStatus] = useState<Record<ProviderId, 'idle' | 'testing' | 'connected' | 'error'>>({
    anthropic: 'idle', openai: 'idle', google: 'idle', ollama: 'idle',
  })
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ openai: '', google: '' })
  const [authProviderIndex, setAuthProviderIndex] = useState(0)
  const [checkTimeout, setCheckTimeout] = useState(false)

  // New state
  const [selectedChannels, setSelectedChannels] = useState<Set<ChannelId>>(new Set())
  const [channelConfigs, setChannelConfigs] = useState<Record<string, string>>({})
  const [enabledServices, setEnabledServices] = useState<Set<ServiceId>>(new Set())
  const [initPhase, setInitPhase] = useState<InitPhase>('idle')
  const [initOutput, setInitOutput] = useState<string[]>([])
  const [initProgress, setInitProgress] = useState(0)
  const terminalRef = useRef<HTMLDivElement>(null)

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

    const timer = setTimeout(() => {
      const state = useAgentStore.getState()
      if (state.isAuthenticated === null) setCheckTimeout(true)
    }, AUTH_CHECK_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])

  // Check GitHub when entering github step
  useEffect(() => {
    if (step === 'github') {
      window.api.checkGitHub().then((result) => {
        setGitHub({ authenticated: result.authenticated, username: result.username, remote: result.remote })
      }).catch(() => {})
    }
  }, [step, setGitHub])

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [initOutput])

  if (step === 'done') return null

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

  const toggleChannel = (id: ChannelId): void => {
    setSelectedChannels((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleService = (id: ServiceId): void => {
    setEnabledServices((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedProvidersArray = PROVIDERS.filter((p) => selectedProviders.has(p.id))
  const currentAuthProvider = selectedProvidersArray[authProviderIndex]

  const currentStepIndex = STEP_ORDER.indexOf(step)

  const goNext = (): void => {
    if (step === 'providers') {
      if (selectedProviders.size === 0) {
        setStep('channels')
      } else {
        setAuthProviderIndex(0)
        setStep('auth')
      }
    } else if (step === 'init') {
      finishOnboarding()
    } else {
      const nextIndex = currentStepIndex + 1
      if (nextIndex < STEP_ORDER.length) {
        setStep(STEP_ORDER[nextIndex])
      }
    }
  }

  const goBack = (): void => {
    if (step === 'channels' && selectedProviders.size === 0) {
      setStep('providers')
    } else if (step === 'init') {
      setInitPhase('idle')
      setInitOutput([])
      setInitProgress(0)
      setStep('github')
    } else {
      const prevIndex = currentStepIndex - 1
      if (prevIndex >= 0) {
        setStep(STEP_ORDER[prevIndex])
      }
    }
  }

  const finishOnboarding = (): void => {
    // Save channel configs
    if (selectedChannels.size > 0) {
      localStorage.setItem('vibeflow:channels', JSON.stringify({
        selected: [...selectedChannels],
        configs: channelConfigs,
      }))
    }
    // Save service configs
    if (enabledServices.size > 0) {
      localStorage.setItem('vibeflow:services', JSON.stringify([...enabledServices]))
    }
    localStorage.setItem('vibeflow:onboarding-complete', 'true')
    setStep('done')
  }

  // Auth handlers (preserved from original)
  const handleAuthTest = async (): Promise<void> => {
    if (!currentAuthProvider) return
    setProviderStatus((prev) => ({ ...prev, [currentAuthProvider.id]: 'testing' }))
    try {
      if (currentAuthProvider.authType === 'oauth') {
        const loginResult = await window.api.startLogin()
        if (loginResult.success) {
          const auth = await window.api.checkAuth()
          if (auth.authenticated) {
            setProviderStatus((prev) => ({ ...prev, anthropic: 'connected' }))
            useAgentStore.getState().handleEvent({ type: 'auth:status', installed: true, authenticated: true })
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
        const result = await window.api.testProviderConnection(currentAuthProvider.id)
        setProviderStatus((prev) => ({
          ...prev,
          [currentAuthProvider.id]: result.connected ? 'connected' : 'error',
        }))
      }
    } catch {
      setProviderStatus((prev) => ({ ...prev, [currentAuthProvider.id]: 'error' }))
    }
  }

  const handleAuthNext = (): void => {
    if (authProviderIndex < selectedProvidersArray.length - 1) {
      setAuthProviderIndex(authProviderIndex + 1)
    } else {
      setStep('channels')
    }
  }

  const handleGitHubConnect = (): void => {
    window.api.githubLogin()
    const interval = setInterval(() => {
      window.api.checkGitHub().then((result) => {
        setGitHub({ authenticated: result.authenticated, username: result.username, remote: result.remote })
        if (result.authenticated) clearInterval(interval)
      }).catch(() => {})
    }, 3000)
    setTimeout(() => clearInterval(interval), 120_000)
  }

  // Initialization pipeline
  const runInitialization = async (): Promise<void> => {
    setInitOutput([])
    setInitProgress(0)

    const addLine = (line: string): void => {
      setInitOutput((prev) => [...prev, line])
    }

    const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

    // Phase: Resolving
    setInitPhase('resolving')
    addLine('$ vibe init --verify')
    addLine('')
    await delay(300)

    const providerNames = selectedProvidersArray.map((p) => {
      const status = providerStatus[p.id] === 'connected' ? 'connected' : 'pending'
      return `${p.id} (${status})`
    })
    addLine(`Providers : ${providerNames.length > 0 ? providerNames.join(', ') : 'none'}`)
    await delay(100)

    const channelNames = [...selectedChannels]
    addLine(`Channels  : ${channelNames.length > 0 ? channelNames.join(', ') : 'none'}`)
    await delay(100)

    const serviceNames = [...enabledServices]
    addLine(`Services  : ${serviceNames.length > 0 ? serviceNames.join(', ') : 'none'}`)
    addLine('')
    setInitProgress(15)
    await delay(400)

    // Phase: Connecting
    setInitPhase('connecting')
    if (selectedProvidersArray.length > 0) {
      addLine('\u2192 Verifying provider connections...')
      await delay(200)

      for (const provider of selectedProvidersArray) {
        try {
          if (providerStatus[provider.id] === 'connected') {
            if (provider.id === 'ollama') {
              const models = await window.api.detectOllamaModels?.()
              addLine(`\u2713 Ollama: ${models?.length || 0} models detected`)
            } else {
              addLine(`\u2713 ${provider.name}: authenticated`)
            }
          } else {
            const result = await window.api.testProviderConnection(provider.id)
            if (result.connected) {
              addLine(`\u2713 ${provider.name}: connected`)
            } else {
              addLine(`\u2717 ${provider.name}: not connected (skipping)`)
            }
          }
        } catch {
          addLine(`\u2717 ${provider.name}: connection failed (skipping)`)
        }
        await delay(150)
      }
    }
    setInitProgress(40)
    await delay(300)

    // Phase: Configuring
    setInitPhase('configuring')
    if (selectedChannels.size > 0) {
      addLine('\u2192 Testing notification channels...')
      await delay(200)
      for (const channelId of selectedChannels) {
        const config = channelConfigs[channelId]
        if (config && config.trim()) {
          addLine(`\u2713 ${channelId}: token configured`)
        } else {
          addLine(`\u2717 ${channelId}: no config provided (skipping)`)
        }
        await delay(100)
      }
    }
    setInitProgress(60)
    await delay(300)

    // Phase: Verifying
    setInitPhase('verifying')
    if (enabledServices.size > 0) {
      addLine('\u2192 Configuring services...')
      await delay(200)
      for (const serviceId of enabledServices) {
        const service = SERVICES.find((s) => s.id === serviceId)
        addLine(`\u2713 ${service?.name || serviceId}: enabled`)
        await delay(100)
      }
    }
    setInitProgress(80)
    await delay(300)

    // Phase: Finalizing
    setInitPhase('finalizing')
    addLine('\u2192 Finalizing...')
    await delay(200)

    // Check connectivity
    try {
      const conn = await window.api.checkConnectivity()
      if (conn.connected) {
        addLine(`\u2713 Claude CLI: ${conn.version || 'connected'}`)
      } else {
        addLine('\u2717 Claude CLI: not connected')
      }
    } catch {
      addLine('\u2717 Claude CLI: check failed')
    }
    await delay(150)

    addLine('\u2713 Configuration saved')
    await delay(100)
    addLine('\u2713 Ready to use')
    setInitProgress(100)
    await delay(200)
    setInitPhase('done')
  }

  // Get button label and handler
  const getButtonConfig = (): { label: string; onClick: () => void; disabled?: boolean } => {
    switch (step) {
      case 'welcome':
        return { label: 'Get Started', onClick: goNext }
      case 'providers':
        return {
          label: selectedProviders.size === 0 ? 'Skip' : `Continue with ${selectedProviders.size} provider${selectedProviders.size > 1 ? 's' : ''}`,
          onClick: goNext,
        }
      case 'auth':
        return { label: authProviderIndex < selectedProvidersArray.length - 1 ? 'Next' : 'Continue', onClick: handleAuthNext }
      case 'channels':
        return { label: 'Continue', onClick: goNext }
      case 'services':
        return { label: 'Continue', onClick: goNext }
      case 'github':
        return { label: github.authenticated ? 'Continue' : 'Skip for now', onClick: goNext }
      case 'init':
        if (initPhase === 'idle') return { label: 'Initialize', onClick: runInitialization }
        if (initPhase === 'done') return { label: 'Finalize', onClick: finishOnboarding }
        return { label: 'Initializing...', onClick: () => {}, disabled: true }
      default:
        return { label: 'Continue', onClick: goNext }
    }
  }

  const buttonConfig = getButtonConfig()

  // ─── Render ────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--color-base)' }}
    >
      {/* Draggable titlebar */}
      <div
        className="draggable flex items-center justify-end px-4 flex-shrink-0"
        style={{ height: '44px' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: scaled(13),
            fontWeight: 600,
            letterSpacing: '0.15em',
            color: 'var(--color-text-dim)',
          }}
        >
          VIBΣ
        </span>
      </div>

      {/* Main split panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel — 40% */}
        <div
          className="flex flex-col justify-center px-12"
          style={{ width: '40%', position: 'relative' }}
        >
          {/* Large ghosted step number */}
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '120px',
              fontWeight: 800,
              color: 'rgba(255, 255, 255, 0.04)',
              lineHeight: 1,
              position: 'absolute',
              top: '50%',
              left: '48px',
              transform: 'translateY(-70%)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {STEP_META[step].number}
          </div>

          {/* Step title */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h1
              key={step}
              className="animate-slide-in-left"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: scaled(32),
                fontWeight: 700,
                color: 'var(--color-text)',
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              {STEP_META[step].title}
            </h1>
            <p
              key={`desc-${step}`}
              className="animate-slide-in-left"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: scaled(14),
                color: 'var(--color-text-dim)',
                marginTop: '12px',
                lineHeight: 1.5,
                whiteSpace: 'pre-line',
                animationDelay: '0.05s',
                opacity: 0,
              }}
            >
              {STEP_META[step].description}
            </p>

            {/* Progress dots */}
            <div style={{ marginTop: '32px' }}>
              <ProgressDots current={currentStepIndex} total={STEP_ORDER.length} />
            </div>
          </div>
        </div>

        {/* Right panel — 60% */}
        <div
          className="flex-1 flex flex-col px-10 py-8 overflow-y-auto"
          style={{
            borderLeft: '1px solid var(--color-border)',
          }}
        >
          <div className="flex-1 flex flex-col justify-center max-w-[520px]">
            {/* Step-specific content */}

            {step === 'welcome' && (
              <div className="flex flex-col items-center gap-6 text-center animate-fade-in">
                <div
                  className="h-2 w-2 rounded-full animate-breathe"
                  style={{ background: 'var(--color-accent)' }}
                />
                <div className="grid grid-cols-1 gap-3 w-full" style={{ maxWidth: '380px' }}>
                  {[
                    { title: 'Multi-Model', desc: 'Route tasks to the best AI for the job — Claude, GPT, Gemini, or local models.' },
                    { title: 'Task Orchestration', desc: 'Decompose complex work into parallel sub-tasks with dependency scheduling.' },
                    { title: 'Workspace Identity', desc: 'Per-project .vibe/ files — personality, rules, tools, and context injected into every AI call.' },
                    { title: 'Git Snapshots', desc: 'Automatic checkpoints before every task. One-click revert if something breaks.' },
                  ].map((feat) => (
                    <div
                      key={feat.title}
                      className="rounded-lg p-4 text-left"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: scaled(15),
                          fontWeight: 600,
                          color: 'var(--color-text)',
                          marginBottom: '4px',
                        }}
                      >
                        {feat.title}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: scaled(12),
                          color: 'var(--color-text-dim)',
                          lineHeight: 1.5,
                        }}
                      >
                        {feat.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 'providers' && (
              <div className="flex flex-col gap-3 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  {PROVIDERS.map((provider) => {
                    const isSelected = selectedProviders.has(provider.id)
                    const isConnected = providerStatus[provider.id] === 'connected'
                    return (
                      <button
                        key={provider.id}
                        onClick={() => toggleProvider(provider.id)}
                        className="text-left rounded-xl p-4 transition-all"
                        style={{
                          background: isSelected ? provider.accentBg : 'var(--color-surface)',
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
              </div>
            )}

            {step === 'auth' && currentAuthProvider && (
              <AuthPanel
                provider={currentAuthProvider}
                status={providerStatus[currentAuthProvider.id]}
                apiKey={apiKeys[currentAuthProvider.id] || ''}
                onApiKeyChange={(key) => setApiKeys((prev) => ({ ...prev, [currentAuthProvider.id]: key }))}
                onTest={handleAuthTest}
                index={authProviderIndex}
                total={selectedProvidersArray.length}
              />
            )}

            {step === 'channels' && (
              <div className="flex flex-col gap-4 animate-fade-in">
                <div className="grid grid-cols-3 gap-2.5">
                  {CHANNELS.map((ch) => (
                    <ChannelCard
                      key={ch.id}
                      channel={ch}
                      selected={selectedChannels.has(ch.id)}
                      configValue={channelConfigs[ch.id] || ''}
                      onToggle={() => toggleChannel(ch.id)}
                      onConfigChange={(val) => setChannelConfigs((prev) => ({ ...prev, [ch.id]: val }))}
                    />
                  ))}
                </div>
                {/* Coming soon */}
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: scaled(11),
                      color: 'var(--color-text-dim)',
                      marginBottom: '8px',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Coming Soon
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COMING_SOON_CHANNELS.map((name) => (
                      <span
                        key={name}
                        className="rounded-md px-2 py-1"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: scaled(10),
                          color: 'var(--color-text-dim)',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          opacity: 0.4,
                        }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Status text */}
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text-dim)' }}>
                  {selectedChannels.size > 0
                    ? `${selectedChannels.size} channel${selectedChannels.size > 1 ? 's' : ''} selected`
                    : 'No channels selected. You can add later from Settings.'}
                </p>
              </div>
            )}

            {step === 'services' && (
              <div className="flex flex-col gap-3 animate-fade-in">
                {SERVICES.map((svc) => (
                  <ServiceCard
                    key={svc.id}
                    service={svc}
                    enabled={enabledServices.has(svc.id)}
                    onToggle={() => toggleService(svc.id)}
                  />
                ))}
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text-dim)', marginTop: '8px' }}>
                  {enabledServices.size > 0
                    ? `${enabledServices.size} service${enabledServices.size > 1 ? 's' : ''} enabled`
                    : 'No external services selected. Core features work without them.'}
                </p>
              </div>
            )}

            {step === 'github' && (
              <div className="flex flex-col items-center gap-5 text-center animate-fade-in">
                <Github
                  className="h-8 w-8"
                  style={{ color: github.authenticated ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                />
                {github.authenticated ? (
                  <div
                    className="flex items-center gap-2 rounded-lg px-4 py-2.5"
                    style={{
                      background: 'rgba(0, 232, 157, 0.06)',
                      border: '1px solid rgba(0, 232, 157, 0.15)',
                    }}
                  >
                    <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-accent)' }}>
                      Connected as @{github.username || 'user'}
                    </span>
                  </div>
                ) : (
                  <>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)', maxWidth: '340px' }}>
                      Optional. Enables push, pull, and repo management.
                    </p>
                    <button onClick={handleGitHubConnect} className="btn btn-accent" style={{ padding: '10px 24px' }}>
                      <Github size={14} />
                      Connect with GitHub
                    </button>
                  </>
                )}
              </div>
            )}

            {step === 'init' && (
              <div className="flex flex-col gap-4 animate-fade-in">
                {/* Phase tabs */}
                <div className="flex items-center gap-4 overflow-x-auto">
                  {INIT_PHASES.map((phase) => {
                    const phaseIndex = INIT_PHASES.indexOf(phase)
                    const currentPhaseIndex = initPhase === 'idle' ? -1 : initPhase === 'done' ? INIT_PHASES.length : INIT_PHASES.indexOf(initPhase)
                    return (
                      <PhaseTab
                        key={phase}
                        phase={phase}
                        current={initPhase}
                        completed={phaseIndex < currentPhaseIndex}
                      />
                    )
                  })}
                  {/* Progress % */}
                  {initPhase !== 'idle' && (
                    <span
                      className="ml-auto"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: scaled(12),
                        fontWeight: 600,
                        color: initPhase === 'done' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                      }}
                    >
                      {initProgress}%
                    </span>
                  )}
                </div>

                {/* Terminal */}
                <div
                  ref={terminalRef}
                  className="rounded-lg overflow-y-auto"
                  style={{
                    background: 'var(--color-base)',
                    border: '1px solid var(--color-border)',
                    padding: '16px',
                    minHeight: '260px',
                    maxHeight: '360px',
                  }}
                >
                  {initPhase === 'idle' ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3" style={{ minHeight: '220px' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: scaled(13),
                          color: 'var(--color-text-dim)',
                          textAlign: 'center',
                        }}
                      >
                        Press Initialize to verify your configuration.
                      </div>
                    </div>
                  ) : (
                    <>
                      {initOutput.map((line, i) => (
                        <TerminalLine key={i} line={line} index={i} />
                      ))}
                      {initPhase !== 'done' && (
                        <span className="animate-terminal-blink" style={{ color: 'var(--color-accent)' }}>_</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <div
        className="flex items-center justify-between px-10 flex-shrink-0"
        style={{
          height: '64px',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <div>
          {step !== 'welcome' && (
            <button
              onClick={goBack}
              className="btn flex items-center gap-1.5"
              style={{ padding: '8px 16px' }}
            >
              <ArrowLeft size={14} />
              Back
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Cancel / X */}
          <button
            onClick={finishOnboarding}
            className="flex items-center gap-1.5 transition-colors"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(13),
              color: 'var(--color-text-dim)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
          >
            <X size={14} />
          </button>

          {/* Main action button */}
          <button
            onClick={buttonConfig.onClick}
            disabled={buttonConfig.disabled}
            className="btn btn-accent flex items-center gap-1.5"
            style={{
              padding: '8px 20px',
              fontWeight: 500,
            }}
          >
            {step === 'init' && initPhase !== 'idle' && initPhase !== 'done' && (
              <Loader2 size={14} className="animate-spin" />
            )}
            {buttonConfig.label}
            {step !== 'init' && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════
//  Auth Panel (inline sub-component)
// ═══════════════════════════════════════════════════

function AuthPanel({
  provider,
  status,
  apiKey,
  onApiKeyChange,
  onTest,
  index,
  total,
}: {
  provider: ProviderCardInfo
  status: string
  apiKey: string
  onApiKeyChange: (key: string) => void
  onTest: () => void
  index: number
  total: number
}): JSX.Element {
  const [showKey, setShowKey] = useState(false)
  const isConnected = status === 'connected'
  const isTesting = status === 'testing'

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Progress indicator */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(11),
          color: 'var(--color-text-dim)',
          letterSpacing: '0.06em',
        }}
      >
        {index + 1} of {total}
      </div>

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: scaled(22),
          fontWeight: 600,
          color: provider.accentColor,
          margin: 0,
        }}
      >
        Connect {provider.name}
      </h2>

      {provider.authType === 'oauth' && (
        <div className="flex flex-col gap-4">
          {isConnected ? (
            <div
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 w-fit"
              style={{ background: 'rgba(0, 232, 157, 0.06)', border: '1px solid rgba(0, 232, 157, 0.15)' }}
            >
              <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-accent)' }}>Connected</span>
            </div>
          ) : (
            <>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}>
                Sign in with your Claude account via browser
              </p>
              <button onClick={onTest} disabled={isTesting} className="btn btn-accent w-fit" style={{ padding: '8px 20px' }}>
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
            <div
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 w-fit"
              style={{ background: 'rgba(0, 232, 157, 0.06)', border: '1px solid rgba(0, 232, 157, 0.15)' }}
            >
              <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-accent)' }}>Connected</span>
            </div>
          ) : (
            <>
              <div className="relative" style={{ maxWidth: '400px' }}>
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
              <button onClick={onTest} disabled={isTesting || !apiKey} className="btn btn-accent w-fit" style={{ padding: '8px 20px' }}>
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
        <div className="flex flex-col gap-3">
          {isConnected ? (
            <div
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 w-fit"
              style={{ background: 'rgba(0, 232, 157, 0.06)', border: '1px solid rgba(0, 232, 157, 0.15)' }}
            >
              <CheckCircle2 size={14} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-accent)' }}>Detected</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Cpu size={16} style={{ color: 'var(--color-text-dim)' }} />
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}>
                  Make sure Ollama is running locally
                </p>
              </div>
              <button onClick={onTest} disabled={isTesting} className="btn btn-accent w-fit" style={{ padding: '8px 20px' }}>
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
    </div>
  )
}
