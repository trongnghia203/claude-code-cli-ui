export interface LimitBar {
  label: string
  pct: number
  resets: string
}

export interface TopItem {
  name: string
  pct: string
}

export interface UsagePeriod {
  label: string
  requests: number
  sessions: number
  insights: { pct: string; text: string }[]
  tops: { kind: string; items: TopItem[] }[]
}

export interface UsageLimits {
  plan: string
  limits: LimitBar[]
  note: string
  periods: UsagePeriod[]
  raw: string
  generatedAt: number
}

export function useUsageLimits() {
  const data = ref<UsageLimits | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLimits(refresh = false) {
    loading.value = true
    error.value = null
    try {
      data.value = await $fetch<UsageLimits>('/api/usage/limits', { query: refresh ? { refresh: '1' } : {} })
    } catch (e: any) {
      error.value = e?.data?.message || e?.message || 'Failed to load usage limits'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => fetchLimits())

  return { data, loading, error, fetchLimits }
}
