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

/** Bars (session %) move fast: past this age, refresh in the background after showing cached data. */
const BARS_STALE_MS = 5 * 60 * 1000

export function useUsageLimits() {
  const data = ref<UsageLimits | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** True while a silent background revalidation runs (cached data stays visible). */
  const refreshing = ref(false)

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

  async function revalidateIfStale() {
    if (!data.value || Date.now() - data.value.generatedAt < BARS_STALE_MS) return
    refreshing.value = true
    try {
      data.value = await $fetch<UsageLimits>('/api/usage/limits', { query: { refresh: '1' } })
    } catch {
      // keep showing cached data
    } finally {
      refreshing.value = false
    }
  }

  onMounted(async () => {
    await fetchLimits()
    await revalidateIfStale()
  })

  return { data, loading, error, refreshing, fetchLimits }
}
