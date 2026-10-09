export type TimeRange = '24h' | '7d' | '30d' | '3m' | '6m' | '1y'
export type Granularity = 'hourly' | 'daily' | 'weekly' | 'monthly'

export interface ModelStat {
  name: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  cost: number
}

export interface DayStat {
  date: string
  inputTokens: number
  outputTokens: number
  cost: number
  [key: string]: number | string
}

export interface ProjectStat {
  id: string
  name: string
  inputTokens: number
  outputTokens: number
  cost: number
}

export interface UsageStats {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  byModel: ModelStat[]
  byDay: DayStat[]
  byProject: ProjectStat[]
}

export function useUsageStats() {
  const stats = ref<UsageStats | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const timeRange = ref<TimeRange>('30d')
  const selectedProjectId = ref<string | null>(null)

  const granularity = computed<Granularity>(() => {
    switch (timeRange.value) {
      case '24h': return 'hourly'
      case '7d':  return 'daily'
      case '30d': return 'daily'
      case '3m':  return 'weekly'
      case '6m':  return 'weekly'
      case '1y':  return 'monthly'
    }
  })

  async function fetchStats() {
    loading.value = true
    error.value = null
    try {
      const params: Record<string, string> = {
        range: timeRange.value,
        granularity: granularity.value,
      }
      if (selectedProjectId.value) params.projectId = selectedProjectId.value
      const qs = new URLSearchParams(params).toString()
      const data = await $fetch<UsageStats>(`/api/usage/stats?${qs}`)
      stats.value = data
    } catch (e: any) {
      error.value = e?.message || 'Failed to load usage stats'
    } finally {
      loading.value = false
    }
  }

  watch([timeRange, selectedProjectId], fetchStats, { immediate: true })

  function formatCost(n: number): string {
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
    return `$${n.toFixed(2)}`
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
    if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  function shortModelName(model: string): string {
    return model.replace('claude-', '').replace(/-(\d)/g, ' $1')
  }

  return {
    stats, loading, error,
    timeRange, selectedProjectId, granularity,
    fetchStats, formatCost, formatTokens, shortModelName,
  }
}
