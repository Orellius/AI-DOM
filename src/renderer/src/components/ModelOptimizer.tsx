import { useState, useEffect } from 'react'
import {
  MessageSquare,
  Code2,
  Search,
  BarChart3,
  Filter,
  CircleDot,
  Sliders,
  Check,
} from 'lucide-react'
import { scaled } from '../utils/scale'

// Mirror the main process types for the renderer
interface CategoryConfig {
  category: string
  label: string
  description: string
  icon: string
  defaultModel: string
  escalationModel: string
}

interface ModelInfo {
  id: string
  provider: string
  displayName: string
  costTier: 'cheap' | 'mid' | 'premium'
}

const ICON_MAP: Record<string, typeof MessageSquare> = {
  MessageSquare,
  Code2,
  Search,
  BarChart3,
  Filter,
  CircleDot,
}

const TIER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  cheap: { bg: 'rgba(0, 232, 157, 0.12)', text: 'var(--color-accent)', label: 'Cheap' },
  mid: { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', label: 'Mid' },
  premium: { bg: 'rgba(168, 85, 247, 0.12)', text: '#a855f7', label: 'Premium' },
}

function CostBadge({ tier }: { tier: string }): JSX.Element {
  const colors = TIER_COLORS[tier] || TIER_COLORS.mid
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5"
      style={{
        background: colors.bg,
        color: colors.text,
        fontFamily: 'var(--font-mono)',
        fontSize: scaled(11),
        fontWeight: 500,
      }}
    >
      {colors.label}
    </span>
  )
}

function ModelSelect({
  value,
  onChange,
  models,
  label,
}: {
  value: string
  onChange: (modelId: string) => void
  models: ModelInfo[]
  label: string
}): JSX.Element {
  const selected = models.find((m) => m.id === value)

  return (
    <div className="flex flex-col gap-1">
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(11),
          color: 'var(--color-text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-lg px-2.5 py-1.5 appearance-none cursor-pointer"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(13),
            outline: 'none',
          }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
        {selected && <CostBadge tier={selected.costTier} />}
      </div>
    </div>
  )
}

export function ModelOptimizer(): JSX.Element {
  const [categories, setCategories] = useState<CategoryConfig[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // Load routing table and available models from main process
    window.api.getOptimizerConfig().then((config) => {
      setCategories(config.categories)
      setModels(config.models)
    }).catch(() => {})
  }, [])

  const updateCategory = (category: string, field: 'defaultModel' | 'escalationModel', modelId: string): void => {
    setCategories((prev) =>
      prev.map((c) =>
        c.category === category ? { ...c, [field]: modelId } : c
      )
    )
    setHasChanges(true)
    setSaved(false)
  }

  const handleApply = (): void => {
    window.api.updateOptimizerConfig(categories).then(() => {
      setHasChanges(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }).catch(() => {})
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <Sliders size={18} style={{ color: 'var(--color-accent)' }} />
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: scaled(18),
                fontWeight: 600,
                color: 'var(--color-text)',
              }}
            >
              Model Optimizer
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: scaled(12),
                color: 'var(--color-text-dim)',
              }}
            >
              Route tasks to the right model by category
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Cost tier legend */}
          <div className="flex items-center gap-2">
            <CostBadge tier="cheap" />
            <CostBadge tier="mid" />
            <CostBadge tier="premium" />
          </div>

          <button
            onClick={handleApply}
            disabled={!hasChanges}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all"
            style={{
              background: hasChanges ? 'var(--color-accent)' : 'var(--color-surface-light)',
              color: hasChanges ? 'var(--color-base)' : 'var(--color-text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(13),
              fontWeight: 500,
              cursor: hasChanges ? 'pointer' : 'not-allowed',
              opacity: hasChanges ? 1 : 0.5,
            }}
          >
            {saved ? <Check size={14} /> : null}
            {saved ? 'Saved' : 'Apply'}
          </button>
        </div>
      </div>

      {/* Category grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {categories.map((cat) => {
            const Icon = ICON_MAP[cat.icon] || CircleDot
            return (
              <div
                key={cat.category}
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {/* Category header */}
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex items-center justify-center rounded-lg"
                    style={{
                      width: '32px',
                      height: '32px',
                      background: 'rgba(0, 232, 157, 0.06)',
                      border: '1px solid rgba(0, 232, 157, 0.1)',
                    }}
                  >
                    <Icon size={16} style={{ color: 'var(--color-accent)' }} />
                  </div>
                  <div>
                    <h3
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: scaled(15),
                        fontWeight: 600,
                        color: 'var(--color-text)',
                      }}
                    >
                      {cat.label}
                    </h3>
                    <p
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: scaled(11),
                        color: 'var(--color-text-dim)',
                        lineHeight: 1.4,
                      }}
                    >
                      {cat.description}
                    </p>
                  </div>
                </div>

                {/* Model selectors */}
                <div className="flex flex-col gap-2">
                  <ModelSelect
                    label="Default"
                    value={cat.defaultModel}
                    onChange={(id) => updateCategory(cat.category, 'defaultModel', id)}
                    models={models}
                  />
                  <ModelSelect
                    label="Escalation"
                    value={cat.escalationModel}
                    onChange={(id) => updateCategory(cat.category, 'escalationModel', id)}
                    models={models}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
