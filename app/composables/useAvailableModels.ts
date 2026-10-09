import { MODEL_OPTIONS } from '~/utils/models'

export interface AgentModelOption {
  /** Alias written to the agent's `model` frontmatter, or undefined for "use the default" */
  value: string | undefined
  label: string
  desc: string
}

interface LiveModel {
  value: string
  label: string
  description: string
}

const DEFAULT_OPTION: AgentModelOption = {
  value: undefined,
  label: 'Default',
  desc: 'Uses whatever model is set in your Claude Code config.',
}

/**
 * Model choices for agents, from the models the installed Claude CLI offers (e.g. "Opus 5.5").
 * Agents take an alias (opus, sonnet, haiku, ...) or nothing, so pinned ids and the CLI's own
 * "default" entry are left out. Falls back to the static list when the CLI list is unavailable.
 */
export function useAvailableModels() {
  const live = useState<LiveModel[]>('available-models', () => [])
  const requested = useState('available-models-requested', () => false)

  async function load() {
    if (requested.value) return
    requested.value = true
    try {
      const res = await $fetch<{ models: LiveModel[] }>('/api/claude/models')
      live.value = res.models
    } catch {
      requested.value = false
    }
  }

  const options = computed<AgentModelOption[]>(() => {
    const aliases = live.value.filter(m => m.value !== 'default' && !m.value.startsWith('claude-'))
    if (!aliases.length) return MODEL_OPTIONS as AgentModelOption[]
    return [
      ...aliases.map(m => ({ value: m.value, label: m.label, desc: m.description })),
      DEFAULT_OPTION,
    ]
  })

  /** The options, plus the agent's current model when it is not one of them (e.g. a pinned id) */
  function optionsWith(current?: string): AgentModelOption[] {
    const base = options.value
    if (!current || current === 'inherit' || base.some(o => o.value === current)) return base
    return [{ value: current, label: current, desc: 'Set in the agent file' }, ...base]
  }

  /** Whether an option is the one the agent currently uses ("inherit" counts as the default) */
  function isSelected(opt: AgentModelOption, current?: string): boolean {
    if (opt.value === undefined) return !current || current === 'inherit'
    return opt.value === current
  }

  return { options, optionsWith, isSelected, load }
}
