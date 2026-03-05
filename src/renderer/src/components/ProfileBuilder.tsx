import { useState, useEffect, useCallback } from 'react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

interface ProfileForm {
  name: string
  stack: string
  description: string
  conventions: string[]
  devCmd: string
  buildCmd: string
  testCmd: string
}

const EMPTY_FORM: ProfileForm = {
  name: '',
  stack: '',
  description: '',
  conventions: [],
  devCmd: '',
  buildCmd: '',
  testCmd: ''
}

function formToMarkdown(form: ProfileForm): string {
  const lines: string[] = [`# ${form.name || 'Project'}`, '']
  if (form.description) {
    lines.push(`## Description`, form.description, '')
  }
  if (form.stack) {
    lines.push(`## Stack`, form.stack, '')
  }
  if (form.conventions.length > 0) {
    lines.push('## Conventions')
    for (const rule of form.conventions) {
      lines.push(`- ${rule}`)
    }
    lines.push('')
  }
  if (form.devCmd || form.buildCmd || form.testCmd) {
    lines.push('## Dev Commands', '```bash')
    if (form.devCmd) lines.push(`${form.devCmd}        # dev`)
    if (form.buildCmd) lines.push(`${form.buildCmd}      # build`)
    if (form.testCmd) lines.push(`${form.testCmd}        # test`)
    lines.push('```', '')
  }
  return lines.join('\n')
}

function markdownToForm(md: string): ProfileForm {
  const form = { ...EMPTY_FORM, conventions: [] as string[] }
  const nameMatch = md.match(/^#\s+(.+)$/m)
  if (nameMatch) form.name = nameMatch[1]

  const descMatch = md.match(/## Description\n([\s\S]*?)(?=\n##|\n*$)/)
  if (descMatch) form.description = descMatch[1].trim()

  const stackMatch = md.match(/## Stack\n([\s\S]*?)(?=\n##|\n*$)/)
  if (stackMatch) form.stack = stackMatch[1].trim()

  const convMatch = md.match(/## Conventions\n([\s\S]*?)(?=\n##|\n*$)/)
  if (convMatch) {
    form.conventions = convMatch[1]
      .split('\n')
      .map((l) => l.replace(/^-\s*/, '').trim())
      .filter(Boolean)
  }

  const codeBlock = md.match(/```bash\n([\s\S]*?)```/)
  if (codeBlock) {
    const lines = codeBlock[1].split('\n')
    for (const line of lines) {
      const cmd = line.replace(/#.*$/, '').trim()
      if (!cmd) continue
      if (line.includes('# dev')) form.devCmd = cmd
      else if (line.includes('# build')) form.buildCmd = cmd
      else if (line.includes('# test')) form.testCmd = cmd
      else if (!form.devCmd) form.devCmd = cmd
    }
  }
  return form
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  mono
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}): JSX.Element {
  return (
    <div>
      <label
        className="mb-1 block"
        style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
        style={{ fontSize: scaled(13), fontFamily: mono ? 'var(--font-mono)' : undefined }}
      />
    </div>
  )
}

export function ProfileBuilder(): JSX.Element {
  const [mode, setMode] = useState<'form' | 'raw'>('form')
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
  const [rawContent, setRawContent] = useState('')
  const [newRule, setNewRule] = useState('')
  const [saving, setSaving] = useState(false)
  const claudeMd = useAgentStore((s) => s.claudeMd)
  const setClaudeMd = useAgentStore((s) => s.setClaudeMd)

  useEffect(() => {
    window.api.loadClaudeMd().then((content) => {
      setClaudeMd(content)
      setRawContent(content)
      if (content) setForm(markdownToForm(content))
    })
  }, [setClaudeMd])

  const updateField = useCallback(
    <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const addConvention = (): void => {
    const rule = newRule.trim()
    if (!rule) return
    setForm((prev) => ({ ...prev, conventions: [...prev.conventions, rule] }))
    setNewRule('')
  }

  const removeConvention = (idx: number): void => {
    setForm((prev) => ({
      ...prev,
      conventions: prev.conventions.filter((_, i) => i !== idx)
    }))
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const content = mode === 'form' ? formToMarkdown(form) : rawContent
      await window.api.saveClaudeMd(content)
      setClaudeMd(content)
      if (mode === 'form') setRawContent(content)
      else setForm(markdownToForm(content))
    } finally {
      setSaving(false)
    }
  }

  const switchMode = (newMode: 'form' | 'raw'): void => {
    if (newMode === 'raw' && mode === 'form') {
      setRawContent(formToMarkdown(form))
    } else if (newMode === 'form' && mode === 'raw') {
      setForm(markdownToForm(rawContent))
    }
    setMode(newMode)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with mode toggle */}
      <div className="mb-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
        <span className="label">Project Profile</span>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <button
            onClick={() => switchMode('form')}
            className="px-2.5 py-1 transition-colors"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(12),
              background: mode === 'form' ? 'var(--color-surface-raised)' : 'transparent',
              color: mode === 'form' ? 'var(--color-text)' : 'var(--color-text-dim)',
            }}
          >
            Form
          </button>
          <button
            onClick={() => switchMode('raw')}
            className="px-2.5 py-1 transition-colors"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(12),
              background: mode === 'raw' ? 'var(--color-surface-raised)' : 'transparent',
              color: mode === 'raw' ? 'var(--color-text)' : 'var(--color-text-dim)',
            }}
          >
            Raw
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {mode === 'form' ? (
          <div className="flex flex-col gap-3">
            <FormInput label="Project Name" value={form.name} onChange={(v) => updateField('name', v)} placeholder="My Project" />
            <FormInput label="Stack" value={form.stack} onChange={(v) => updateField('stack', v)} placeholder="React + TypeScript + Vite" />
            <div>
              <label
                className="mb-1 block"
                style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}
              >
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="What does this project do?"
                rows={2}
                className="input"
                style={{ fontSize: scaled(13), resize: 'none', minHeight: '48px' }}
              />
            </div>

            {/* Conventions */}
            <div>
              <label
                className="mb-1 block"
                style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}
              >
                Conventions
              </label>
              <div className="flex flex-col gap-1">
                {form.conventions.map((rule, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                    style={{ background: 'var(--color-surface-light)', border: '1px solid var(--color-border)' }}
                  >
                    <span className="flex-1" style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-muted)' }}>
                      {rule}
                    </span>
                    <button
                      onClick={() => removeConvention(i)}
                      className="shrink-0 transition-colors"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-red)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="text"
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addConvention())}
                  placeholder="Add rule..."
                  className="input flex-1"
                  style={{ fontSize: scaled(13) }}
                />
                <button onClick={addConvention} className="btn">
                  + Add
                </button>
              </div>
            </div>

            {/* Build commands */}
            <div className="flex flex-col gap-2">
              <span className="label">Build Commands</span>
              <FormInput label="Dev" value={form.devCmd} onChange={(v) => updateField('devCmd', v)} placeholder="pnpm dev" mono />
              <FormInput label="Build" value={form.buildCmd} onChange={(v) => updateField('buildCmd', v)} placeholder="pnpm build" mono />
              <FormInput label="Test" value={form.testCmd} onChange={(v) => updateField('testCmd', v)} placeholder="pnpm test" mono />
            </div>
          </div>
        ) : (
          <textarea
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            className="input h-full"
            style={{
              fontSize: scaled(13),
              fontFamily: 'var(--font-mono)',
              resize: 'none',
              lineHeight: '1.6',
              minHeight: '200px',
            }}
            placeholder="# Project Name&#10;&#10;## Stack&#10;..."
            spellCheck={false}
          />
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="btn btn-accent mt-3 w-full justify-center"
        style={{ padding: '8px 0' }}
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
    </div>
  )
}
