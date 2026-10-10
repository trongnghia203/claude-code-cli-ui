export interface ContextCategory {
  name: string
  tokens: number
  pct: number
}

export interface ContextRow {
  name: string
  source: string
  path?: string
  tokens: number
}

export interface ContextReport {
  model: string
  usedTokens: number
  windowTokens: number
  usedPct: number
  categories: ContextCategory[]
  mcpTools: ContextRow[]
  agents: ContextRow[]
  memory: ContextRow[]
  skills: ContextRow[]
  cwd: string
  sessionId?: string
  generatedAt: number
}

export function useContextReport(opts: { sessionId?: MaybeRefOrGetter<string | null | undefined>; cwd?: MaybeRefOrGetter<string | null | undefined> } = {}) {
  const report = ref<ContextReport | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchReport(refresh = false) {
    loading.value = true
    error.value = null
    try {
      const query: Record<string, string> = {}
      if (refresh) query.refresh = '1'
      const sessionId = toValue(opts.sessionId)
      const cwd = toValue(opts.cwd)
      if (sessionId) query.sessionId = sessionId
      if (cwd) query.cwd = cwd
      report.value = await $fetch<ContextReport>('/api/usage/context', { query })
    } catch (e: any) {
      error.value = e?.data?.message || e?.message || 'Failed to load context report'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => fetchReport())
  watch(() => [toValue(opts.sessionId), toValue(opts.cwd)], () => fetchReport())

  return { report, loading, error, fetchReport }
}
