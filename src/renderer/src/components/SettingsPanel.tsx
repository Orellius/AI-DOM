import { useEffect, useState } from 'react'
import { useAgentStore } from '../stores/agentStore'
import type { Settings } from '../stores/agentStore'
import { scaled } from '../utils/scale'

const CONCURRENCY_OPTIONS = [1, 2, 3, 4, 5]
const MAX_TURNS_OPTIONS = [5, 10, 15, 25]
const MODEL_OPTIONS: Array<{ value: Settings['model']; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' }
]

const SCALE_OPTIONS = [
  { value: 0.85, label: '85%' },
  { value: 1, label: '100%' },
  { value: 1.1, label: '110%' },
  { value: 1.2, label: '120%' },
  { value: 1.35, label: '135%' }
]

function SectionHeader({ title }: { title: string }): JSX.Element {
  return (
    <p
      className="label mb-2"
      style={{ fontSize: scaled(11), letterSpacing: '0.2em', color: 'var(--color-accent-dim)' }}
    >
      {title}
    </p>
  )
}

function StatusDot({ active }: { active: boolean }): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: active ? 'var(--color-accent)' : 'var(--color-red)',
        flexShrink: 0
      }}
    />
  )
}

function InfoRow({ label, value, dot }: { label: string; value: string; dot?: boolean }): JSX.Element {
  return (
    <div
      className="flex items-center justify-between py-1.5"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <span className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
        {dot !== undefined && <StatusDot active={dot} />}
        {value}
      </span>
    </div>
  )
}

function SelectRow({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string | number
  options: Array<{ value: string | number; label: string }>
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
        style={{
          width: 'auto',
          padding: '3px 8px',
          cursor: 'pointer',
          background: 'var(--color-surface-light)',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function SettingsPanel(): JSX.Element {
  const settings = useAgentStore((s) => s.settings)
  const setSetting = useAgentStore((s) => s.setSetting)
  const uiScale = useAgentStore((s) => s.uiScale)
  const setUIScale = useAgentStore((s) => s.setUIScale)
  const claudeConnectivity = useAgentStore((s) => s.claudeConnectivity)
  const setClaudeConnectivity = useAgentStore((s) => s.setClaudeConnectivity)
  const github = useAgentStore((s) => s.github)
  const setGitHub = useAgentStore((s) => s.setGitHub)
  const voiceConfig = useAgentStore((s) => s.voiceConfig)
  const fetchVoiceConfig = useAgentStore((s) => s.fetchVoiceConfig)
  const updateVoiceConfig = useAgentStore((s) => s.updateVoiceConfig)
  const voiceAutoMode = useAgentStore((s) => s.voiceAutoMode)
  const setVoiceAutoMode = useAgentStore((s) => s.setVoiceAutoMode)
  const whisperModelProgress = useAgentStore((s) => s.whisperModelProgress)
  const downloadWhisperModel = useAgentStore((s) => s.downloadWhisperModel)
  const [groqKeyInput, setGroqKeyInput] = useState('')

  // Check Claude CLI connectivity on mount + every 30s
  useEffect(() => {
    const check = (): void => {
      window.api.checkConnectivity().then((result) => {
        setClaudeConnectivity({ connected: result.connected, version: result.version })
      }).catch(() => {})
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [setClaudeConnectivity])

  // Fetch voice config on mount
  useEffect(() => {
    fetchVoiceConfig()
  }, [fetchVoiceConfig])

  // Check GitHub on mount
  useEffect(() => {
    window.api.checkGitHub().then((result) => {
      setGitHub({ authenticated: result.authenticated, username: result.username, remote: result.remote })
    }).catch(() => {})
  }, [setGitHub])

  const handleSelectDir = async (): Promise<void> => {
    const dir = await window.api.selectDirectory()
    if (dir) setSetting('cwd', dir)
  }

  const handleGitHubLogin = (): void => {
    window.api.githubLogin()
    // Re-check after a delay to pick up auth
    setTimeout(() => {
      window.api.checkGitHub().then((result) => {
        setGitHub({ authenticated: result.authenticated, username: result.username, remote: result.remote })
      }).catch(() => {})
    }, 15_000)
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto">
      {/* DISPLAY */}
      <div>
        <SectionHeader title="Display" />
        <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-muted)' }}>
            UI Scale
          </span>
          <div className="flex gap-1">
            {SCALE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setUIScale(opt.value)}
                className={uiScale === opt.value ? 'chip chip-active' : 'chip'}
                style={{ fontSize: scaled(11), padding: '4px 8px' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI CONNECTION */}
      <div>
        <SectionHeader title="AI Connection" />
        <InfoRow
          label="Claude CLI"
          value={claudeConnectivity.connected ? (claudeConnectivity.version || 'Connected') : 'Not found'}
          dot={claudeConnectivity.connected}
        />
        <SelectRow
          label="Model"
          value={settings.model}
          options={MODEL_OPTIONS}
          onChange={(v) => setSetting('model', v as Settings['model'])}
        />
        <div className="mt-2">
          <button
            onClick={() => {
              window.api.checkConnectivity().then((result) => {
                setClaudeConnectivity({ connected: result.connected, version: result.version })
              }).catch(() => {})
            }}
            className="btn"
            style={{ fontSize: scaled(12) }}
          >
            Check Connection
          </button>
        </div>
      </div>

      {/* GITHUB */}
      <div>
        <SectionHeader title="GitHub" />
        <InfoRow
          label="Status"
          value={github.authenticated ? 'Authenticated' : 'Not connected'}
          dot={github.authenticated}
        />
        {github.username && (
          <InfoRow label="User" value={github.username} />
        )}
        {github.remote && (
          <InfoRow label="Remote" value={github.remote.replace(/^https?:\/\//, '').replace(/\.git$/, '')} />
        )}
        {!github.authenticated && (
          <div className="mt-2">
            <button onClick={handleGitHubLogin} className="btn btn-accent" style={{ fontSize: scaled(12) }}>
              Connect GitHub
            </button>
          </div>
        )}
      </div>

      {/* AGENT */}
      <div>
        <SectionHeader title="Agent" />
        <SelectRow
          label="Concurrency"
          value={settings.concurrency}
          options={CONCURRENCY_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
          onChange={(v) => setSetting('concurrency', Number(v))}
        />
        <SelectRow
          label="Max turns / task"
          value={settings.maxTurns}
          options={MAX_TURNS_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
          onChange={(v) => setSetting('maxTurns', Number(v))}
        />
        <div className="mt-2">
          <p className="label mb-1.5" style={{ fontSize: scaled(11) }}>Working Directory</p>
          <div className="flex items-center gap-2">
            <div
              className="min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: scaled(12),
                color: 'var(--color-text-muted)',
                background: 'var(--color-base)',
                border: '1px solid var(--color-border)',
              }}
            >
              {settings.cwd || '(default)'}
            </div>
            <button onClick={handleSelectDir} className="btn" style={{ fontSize: scaled(12) }}>
              Change
            </button>
          </div>
        </div>
      </div>

      {/* VOICE INPUT */}
      <div>
        <SectionHeader title="Voice Input" />

        {/* Provider */}
        <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-muted)' }}>
            Provider
          </span>
          <div className="flex gap-1">
            {(['auto', 'local', 'groq', 'sidecar'] as const).map((p) => (
              <button
                key={p}
                onClick={() => updateVoiceConfig({ provider: p })}
                className={voiceConfig?.provider === p ? 'chip chip-active' : 'chip'}
                style={{ fontSize: scaled(11), padding: '4px 8px' }}
              >
                {p === 'auto' ? 'Auto' : p === 'local' ? 'Local' : p === 'groq' ? 'Cloud' : 'Sidecar'}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-listen mode */}
        <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-muted)' }}>
              Auto-listen
            </span>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(10), color: 'var(--color-text-dim)', marginTop: '2px' }}>
              Mic stays open, auto-records on speech
            </p>
          </div>
          <button
            onClick={() => setVoiceAutoMode(!voiceAutoMode)}
            className={voiceAutoMode ? 'chip chip-active' : 'chip'}
            style={{ fontSize: scaled(11), padding: '4px 8px' }}
          >
            {voiceAutoMode ? 'On' : 'Off'}
          </button>
        </div>

        {/* Auto-translate */}
        <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-muted)' }}>
              Auto-translate to English
            </span>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(10), color: 'var(--color-text-dim)', marginTop: '2px' }}>
              Non-English transcriptions auto-translated
            </p>
          </div>
          <button
            onClick={() => updateVoiceConfig({ autoTranslate: !(voiceConfig?.autoTranslate ?? true) })}
            className={(voiceConfig?.autoTranslate ?? true) ? 'chip chip-active' : 'chip'}
            style={{ fontSize: scaled(11), padding: '4px 8px' }}
          >
            {(voiceConfig?.autoTranslate ?? true) ? 'On' : 'Off'}
          </button>
        </div>

        {/* Language */}
        <SelectRow
          label="Language"
          value={voiceConfig?.preferredLanguage || 'auto'}
          options={[
            { value: 'auto', label: 'Auto-detect' },
            { value: 'en', label: 'English' },
            { value: 'he', label: 'Hebrew' },
            { value: 'es', label: 'Spanish' },
            { value: 'fr', label: 'French' },
            { value: 'de', label: 'German' },
            { value: 'ar', label: 'Arabic' },
            { value: 'ja', label: 'Japanese' },
            { value: 'zh', label: 'Chinese' },
            { value: 'ko', label: 'Korean' },
            { value: 'ru', label: 'Russian' },
            { value: 'pt', label: 'Portuguese' },
            { value: 'it', label: 'Italian' },
            { value: 'hi', label: 'Hindi' },
          ]}
          onChange={(v) => updateVoiceConfig({ preferredLanguage: v === 'auto' ? null : v })}
        />

        {/* Groq API Key */}
        <div className="mt-2">
          <p className="label mb-1.5" style={{ fontSize: scaled(11) }}>Groq API Key</p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={groqKeyInput || voiceConfig?.groqApiKey || ''}
              onChange={(e) => setGroqKeyInput(e.target.value)}
              placeholder="gsk_..."
              className="input"
              style={{ fontSize: scaled(12), padding: '5px 10px', flex: 1 }}
            />
            <button
              onClick={() => {
                if (groqKeyInput) {
                  updateVoiceConfig({ groqApiKey: groqKeyInput })
                  setGroqKeyInput('')
                }
              }}
              className="btn"
              style={{ fontSize: scaled(12) }}
              disabled={!groqKeyInput}
            >
              Save
            </button>
          </div>
        </div>

        {/* Local Model */}
        <div className="mt-2">
          <p className="label mb-1.5" style={{ fontSize: scaled(11) }}>Local Whisper Model</p>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1.5"
              style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12) }}
            >
              <StatusDot active={voiceConfig?.modelDownloaded ?? false} />
              <span style={{ color: 'var(--color-text-muted)' }}>
                {voiceConfig?.modelDownloaded ? 'Downloaded' : 'Not downloaded'}
              </span>
            </span>
            {!voiceConfig?.modelDownloaded && whisperModelProgress === null && (
              <button
                onClick={() => downloadWhisperModel()}
                className="btn btn-accent"
                style={{ fontSize: scaled(12) }}
              >
                Download
              </button>
            )}
          </div>
          {whisperModelProgress !== null && (
            <div className="mt-1.5">
              <div
                style={{
                  height: '4px',
                  borderRadius: '2px',
                  background: 'var(--color-surface-light)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${whisperModelProgress}%`,
                    background: 'var(--color-accent)',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text-muted)' }}>
                {whisperModelProgress}%
              </span>
            </div>
          )}
          {voiceConfig && !voiceConfig.localAvailable && voiceConfig.provider === 'local' && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text-dim)', marginTop: '4px' }}>
              whisper-cpp binary not found. Install it or use Cloud (Groq) provider instead.
            </p>
          )}
          {voiceConfig && !voiceConfig.localAvailable && voiceConfig.provider !== 'local' && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text-dim)', marginTop: '4px' }}>
              Local engine requires whisper-cpp. Cloud (Groq) is recommended.
            </p>
          )}
        </div>

        {/* Sidecar Status */}
        <div className="mt-2">
          <p className="label mb-1.5" style={{ fontSize: scaled(11) }}>Rust Sidecar (vibe-audio)</p>
          <span
            className="flex items-center gap-1.5"
            style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12) }}
          >
            <StatusDot active={voiceConfig?.sidecarAvailable ?? false} />
            <span style={{ color: 'var(--color-text-muted)' }}>
              {voiceConfig?.sidecarAvailable ? 'Available' : 'Not installed'}
            </span>
          </span>
          {!voiceConfig?.sidecarAvailable && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(10), color: 'var(--color-text-dim)', marginTop: '4px' }}>
              Build with: pnpm build:sidecar (requires Rust toolchain)
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
