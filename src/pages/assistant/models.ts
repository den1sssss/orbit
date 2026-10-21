// Claude models offered in Settings, with per-model request tuning.

export type Effort = 'low' | 'medium' | 'high'

export interface ModelOption {
  id: string
  label: string
  /** One-line description shown in Settings. */
  description: string
  /** output_config.effort sent with chat requests. */
  effort: Effort
  /** Server-side refusal fallback (`fallbacks: "default"`) is available for this model. */
  fallbacks: boolean
}

/** Recommended default: the current Opus. */
export const DEFAULT_MODEL = 'claude-opus-5-5'

/** The value Orbit shipped as the default before this module existed. */
export const LEGACY_DEFAULT_MODEL = 'claude-sonnet-5-5'

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    description: 'Most capable: the best day plans and budget advice. Recommended.',
    effort: 'medium',
    fallbacks: true,
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    description: 'Fast and capable, about half the cost of Opus.',
    effort: 'low',
    fallbacks: true,
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    description: 'Fastest and cheapest. Good for quick summaries.',
    effort: 'medium',
    fallbacks: false,
  },
]

export function modelOption(id: string | undefined): ModelOption | undefined {
  return MODEL_OPTIONS.find((m) => m.id === id)
}

export function modelLabel(id: string | undefined): string {
  return modelOption(id)?.label ?? id ?? 'Claude'
}
