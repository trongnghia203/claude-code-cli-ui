import { computeUsageCost, resolveModelPricingFuzzy } from './models'

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
  /** Estimated $ saved by cache reads (billed at 10% of the input rate) */
  cacheSavings: number
  /** Days with any usage, and the most expensive one (independent of chart granularity) */
  activeDays: number
  peakDay: { date: string; cost: number } | null
}

export type Granularity = 'hourly' | 'daily' | 'weekly' | 'monthly'
export type TimeRange = '24h' | '7d' | '30d' | '3m' | '6m' | '1y' | 'custom'

export interface StatsFilter {
  from: number
  to: number
  granularity: Granularity
  projectId?: string
}

interface Accumulator {
  byModel: Map<string, ModelStat>
  byDay: Map<string, DayStat>
  byProject: Map<string, ProjectStat>
  costByDate: Map<string, number>
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
}

export function getTimeBounds(range: TimeRange, from?: number, to?: number): { from: number; to: number } {
  const now = Date.now()
  if (range === 'custom' && from && to) return { from, to }
  const offsets: Record<TimeRange, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d':  7  * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '3m':  90 * 24 * 60 * 60 * 1000,
    '6m':  180 * 24 * 60 * 60 * 1000,
    '1y':  365 * 24 * 60 * 60 * 1000,
    custom: 30 * 24 * 60 * 60 * 1000,
  }
  return { from: now - offsets[range], to: now }
}

export function getTimeKey(timestamp: string, granularity: Granularity): string {
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return 'unknown'
  switch (granularity) {
    case 'hourly':
      return d.toISOString().slice(0, 13) + ':00:00Z'
    case 'weekly': {
      const day = d.getDay()
      const start = new Date(d)
      start.setDate(d.getDate() - day)
      return start.toISOString().slice(0, 10)
    }
    case 'monthly':
      return d.toISOString().slice(0, 7)
    case 'daily':
    default:
      return d.toISOString().slice(0, 10)
  }
}

export function createAccumulator(): Accumulator {
  return {
    byModel: new Map(),
    byDay: new Map(),
    byProject: new Map(),
    costByDate: new Map(),
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
  }
}

export function appendEntry(
  acc: Accumulator,
  entry: Record<string, unknown>,
  filter: StatsFilter,
  projectId: string,
  projectName: string
): void {
  if (entry.type !== 'assistant') return

  const msg = entry.message as Record<string, unknown> | undefined
  const usage = msg?.usage as Record<string, number> | undefined
  if (!usage) return

  const ts = (entry.timestamp as string) || ''
  const t = new Date(ts).getTime()
  if (isNaN(t) || t < filter.from || t > filter.to) return

  const model = (msg?.model as string) || 'unknown'
  const inputTokens    = usage.input_tokens ?? 0
  const outputTokens   = usage.output_tokens ?? 0
  const cacheCreation  = usage.cache_creation_input_tokens ?? 0
  const cacheRead      = usage.cache_read_input_tokens ?? 0
  const cost = computeUsageCost(
    { input_tokens: inputTokens, output_tokens: outputTokens, cache_creation_input_tokens: cacheCreation, cache_read_input_tokens: cacheRead },
    model
  )

  // byProject always covers every project, so the project list/dropdown stays complete while one is selected
  const proj = acc.byProject.get(projectId)
  if (proj) {
    proj.inputTokens += inputTokens
    proj.outputTokens += outputTokens
    proj.cost += cost
  } else {
    acc.byProject.set(projectId, { id: projectId, name: projectName, inputTokens, outputTokens, cost })
  }

  if (filter.projectId && filter.projectId !== projectId) return

  // totals
  acc.totalCost += cost
  acc.totalInputTokens += inputTokens
  acc.totalOutputTokens += outputTokens
  acc.totalCacheCreationTokens += cacheCreation
  acc.totalCacheReadTokens += cacheRead

  // byModel
  const existing = acc.byModel.get(model)
  if (existing) {
    existing.inputTokens += inputTokens
    existing.outputTokens += outputTokens
    existing.cacheCreationTokens += cacheCreation
    existing.cacheReadTokens += cacheRead
    existing.cost += cost
  } else {
    acc.byModel.set(model, { name: model, inputTokens, outputTokens, cacheCreationTokens: cacheCreation, cacheReadTokens: cacheRead, cost })
  }

  const dateKey = getTimeKey(ts, 'daily')
  acc.costByDate.set(dateKey, (acc.costByDate.get(dateKey) ?? 0) + cost)

  // byDay
  const timeKey = getTimeKey(ts, filter.granularity)
  const dayEntry = acc.byDay.get(timeKey)
  if (dayEntry) {
    dayEntry.inputTokens += inputTokens
    dayEntry.outputTokens += outputTokens
    dayEntry.cost += cost
    dayEntry[`${model}_cost`] = ((dayEntry[`${model}_cost`] as number) || 0) + cost
  } else {
    const d: DayStat = { date: timeKey, inputTokens, outputTokens, cost }
    d[`${model}_cost`] = cost
    acc.byDay.set(timeKey, d)
  }
}

export function finalizeStats(acc: Accumulator): UsageStats {
  const byModel = Array.from(acc.byModel.values()).sort((a, b) => b.cost - a.cost)
  const byDay   = Array.from(acc.byDay.values()).sort((a, b) => a.date.localeCompare(b.date))
  const byProject = Array.from(acc.byProject.values()).sort((a, b) => b.cost - a.cost)

  const cacheSavings = byModel.reduce(
    (n, m) => n + (m.cacheReadTokens / 1_000_000) * resolveModelPricingFuzzy(m.name).input * 0.9,
    0,
  )
  let peakDay: UsageStats['peakDay'] = null
  for (const [date, cost] of acc.costByDate) {
    if (!peakDay || cost > peakDay.cost) peakDay = { date, cost }
  }

  return {
    totalCost: acc.totalCost,
    totalInputTokens: acc.totalInputTokens,
    totalOutputTokens: acc.totalOutputTokens,
    totalCacheCreationTokens: acc.totalCacheCreationTokens,
    totalCacheReadTokens: acc.totalCacheReadTokens,
    byModel,
    byDay,
    byProject,
    cacheSavings,
    activeDays: acc.costByDate.size,
    peakDay,
  }
}
