<script setup lang="ts">
import type { IssueRun } from '~/composables/useIssues'
import { ISSUE_RUN_META } from '~/composables/useIssues'

const props = defineProps<{
  issueId: string
  title: string
  runs: IssueRun[]
  agentName: (slug: string | null) => string
}>()

const open = ref(false)
const view = ref<'run' | 'cumulative'>('run')
const metric = ref<'cost' | 'tokens' | 'time'>('cost')
const expanded = ref<string | null>(null)

const PALETTE = ['#2563eb', '#60a5fa', '#93c5fd', '#1e3a8a', '#0ea5e9', '#6366f1']

// ── formatting ──
const money = (n?: number) => (n == null ? '-' : `$${n.toFixed(2)}`)
const compact = (n?: number) => {
  if (n == null) return '-'
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`
  return String(n)
}
const dur = (ms?: number) => {
  if (ms == null) return '-'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
const dayKey = (iso: string) => new Date(iso).toDateString()
const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
/** claude-sonnet-5-5 -> Sonnet 5.5 */
const modelLabel = (id: string) => {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id)
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : id
}

// ── per-run numbers ──
const tokensOf = (r: IssueRun) => (r.usage ? r.usage.input + r.usage.output + r.usage.cacheRead + r.usage.cacheWrite : undefined)
const modelsOf = (r: IssueRun) => (r.models ?? []).map(m => m.model)
const ordered = computed(() => [...props.runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt)))

const total = computed(() => {
  const t = { cost: 0, tokens: 0, output: 0, cacheRead: 0, time: 0 }
  for (const r of props.runs) {
    t.cost += r.costUsd ?? 0
    t.tokens += tokensOf(r) ?? 0
    t.output += r.usage?.output ?? 0
    t.cacheRead += r.usage?.cacheRead ?? 0
    t.time += r.durationMs ?? 0
  }
  return t
})
const cachePct = computed(() => (total.value.tokens ? Math.round((total.value.cacheRead / total.value.tokens) * 100) : 0))
const elapsed = computed(() => {
  const first = ordered.value[0]
  const last = ordered.value[ordered.value.length - 1]
  if (!first || !last) return ''
  return dur((last.finishedAt ? Date.parse(last.finishedAt) : Date.now()) - Date.parse(first.startedAt))
})

const valueOf = (r: IssueRun) => (metric.value === 'cost' ? r.costUsd ?? 0 : metric.value === 'tokens' ? tokensOf(r) ?? 0 : r.durationMs ?? 0)
const fmtMetric = (v: number) => (metric.value === 'cost' ? money(v) : metric.value === 'tokens' ? compact(v) : dur(v))

// ── sidebar sparkline ──
const spark = computed(() => {
  const vals = ordered.value.slice(-16).map(r => r.costUsd ?? 0)
  const max = Math.max(...vals, 0.0001)
  return vals.map(v => Math.max(6, Math.round((v / max) * 100)))
})
const recent = computed(() => [...props.runs].reverse())

// ── modal chart ──
const series = computed(() => {
  let acc = 0
  return ordered.value.map((r) => {
    const v = valueOf(r)
    acc += v
    return { run: r, value: view.value === 'cumulative' ? acc : v }
  })
})
const chartMax = computed(() => Math.max(...series.value.map(s => s.value), 0.0001))
const ticks = computed(() => [1, 0.75, 0.5, 0.25].map(f => fmtMetric(chartMax.value * f)))

// ── breakdowns ──
function share(items: { key: string; label: string; value: number }[]) {
  const sum = items.reduce((a, b) => a + b.value, 0)
  return items
    .filter(i => i.value > 0 || items.length === 1)
    .map((i, n) => ({ ...i, pct: sum ? Math.round((i.value / sum) * 100) : 0, color: PALETTE[n % PALETTE.length]! }))
    .sort((a, b) => b.value - a.value)
}
const byAgent = computed(() => {
  const m = new Map<string, number>()
  for (const r of props.runs) m.set(r.agent ?? '', (m.get(r.agent ?? '') ?? 0) + (r.costUsd ?? 0))
  return share([...m].map(([k, v]) => ({ key: k, label: props.agentName(k || null), value: v })))
})
const byModel = computed(() => {
  const m = new Map<string, number>()
  for (const r of props.runs) for (const mu of r.models ?? []) m.set(mu.model, (m.get(mu.model) ?? 0) + mu.costUsd)
  return share([...m].map(([k, v]) => ({ key: k, label: modelLabel(k), value: v })))
})

// ── table ──
const groups = computed(() => {
  const out: { key: string; label: string; runs: IssueRun[]; cost: number; tokens: number; time: number }[] = []
  for (const r of [...props.runs].reverse()) {
    const key = dayKey(r.startedAt)
    let g = out.find(x => x.key === key)
    if (!g) out.push(g = { key, label: dayLabel(r.startedAt), runs: [], cost: 0, tokens: 0, time: 0 })
    g.runs.push(r)
    g.cost += r.costUsd ?? 0
    g.tokens += tokensOf(r) ?? 0
    g.time += r.durationMs ?? 0
  }
  return out
})

/** Per-category cost. The CLI reports one cost per model, so split it by the standard price ratios (output 5x, cache write 1.25x, cache read 0.1x of input). */
function breakdown(r: IssueRun) {
  const rows = { input: { tokens: 0, cost: 0 }, output: { tokens: 0, cost: 0 }, cacheRead: { tokens: 0, cost: 0 }, cacheWrite: { tokens: 0, cost: 0 } }
  const W = { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }
  for (const m of r.models ?? []) {
    const weight = (Object.keys(W) as (keyof typeof W)[]).reduce((s, k) => s + m[k] * W[k], 0)
    for (const k of Object.keys(W) as (keyof typeof W)[]) {
      rows[k].tokens += m[k]
      rows[k].cost += weight ? (m.costUsd * m[k] * W[k]) / weight : 0
    }
  }
  const sum = r.costUsd ?? Object.values(rows).reduce((a, b) => a + b.cost, 0)
  return [
    { label: 'Input', color: '#2563eb', ...rows.input },
    { label: 'Output', color: '#3b82f6', ...rows.output },
    { label: 'Cache read', color: '#bfdbfe', ...rows.cacheRead },
    { label: 'Cache write', color: '#60a5fa', ...rows.cacheWrite },
  ].map(x => ({ ...x, pct: sum ? Math.round((x.cost / sum) * 100) : 0 }))
}
const cacheHit = (r: IssueRun) => {
  const t = tokensOf(r)
  return t && r.usage ? Math.round((r.usage.cacheRead / t) * 100) : 0
}
const toggleRow = (id: string) => { expanded.value = expanded.value === id ? null : id }
</script>

<template>
  <section class="space-y-2.5">
    <div class="flex items-center gap-2">
      <span class="font-semibold text-[13px]">Execution log</span>
      <span class="px-1.5 rounded text-[11px] text-meta" style="background: var(--surface-base)">{{ runs.length }}</span>
      <button v-if="runs.length" class="ml-auto p-1 rounded hover-bg text-meta" title="Expand" @click="open = true"><UIcon name="i-lucide-maximize-2" class="size-3.5 block" /></button>
    </div>
    <p v-if="!runs.length" class="text-meta">No runs yet.</p>
    <template v-else>
      <div class="grid grid-cols-3 gap-2">
        <div><div class="text-[15px] font-semibold tabular-nums">{{ money(total.cost) }}</div><div class="text-meta text-[11px]">Spent</div></div>
        <div><div class="text-[15px] font-semibold tabular-nums">{{ compact(total.tokens) }}</div><div class="text-meta text-[11px]">Tokens</div></div>
        <div><div class="text-[15px] font-semibold tabular-nums">{{ dur(total.time) }}</div><div class="text-meta text-[11px]">Agent time</div></div>
      </div>
      <div class="flex items-end gap-[3px] h-9">
        <div v-for="(h, n) in spark" :key="n" class="flex-1 rounded-sm" :style="{ height: h + '%', background: '#3b82f6', opacity: 0.35 + (n / Math.max(spark.length, 1)) * 0.65 }" />
      </div>
      <ul class="space-y-1 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
        <li v-for="r in recent" :key="r.id" class="flex items-center gap-2 cursor-pointer h-[28px] shrink-0" @click="open = true">
          <span class="issue-agent-dot"><UIcon name="i-lucide-cpu" class="size-3" /></span>
          <span class="truncate flex-1" :title="r.trigger">{{ r.trigger || 'Run' }}</span>
          <UIcon :name="ISSUE_RUN_META[r.status].icon" class="size-3.5 shrink-0" :class="{ 'animate-spin': r.status === 'running' }" :style="{ color: ISSUE_RUN_META[r.status].color }" />
          <span class="tabular-nums w-11 text-right">{{ money(r.costUsd) }}</span>
        </li>
      </ul>
    </template>

    <UModal v-model:open="open" :ui="{ content: 'w-[calc(100vw-4rem)] max-w-[1280px]' }">
      <template #content>
        <div class="max-h-[88vh] overflow-y-auto custom-scrollbar text-[13px]" style="background: var(--surface-raised)">
          <div class="p-6 pb-4 flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="text-[17px] font-semibold">Runs</h3>
              <p class="text-label truncate">{{ issueId }} &middot; {{ title }}</p>
            </div>
            <button class="p-1.5 rounded-lg hover-bg" @click="open = false"><UIcon name="i-lucide-x" class="size-4 block" /></button>
          </div>

          <div class="px-6 pb-5 flex flex-wrap gap-x-10 gap-y-3">
            <div><div class="stat-label">Spent</div><div class="text-[26px] font-semibold tabular-nums leading-tight">{{ money(total.cost) }}</div></div>
            <div><div class="stat-label">Tokens</div><div class="text-[15px] font-semibold tabular-nums mt-1.5">{{ compact(total.tokens) }} <span class="text-meta font-normal text-[11px]">&middot; {{ cachePct }}% from cache</span></div></div>
            <div><div class="stat-label">Output</div><div class="text-[15px] font-semibold tabular-nums mt-1.5">{{ compact(total.output) }}</div></div>
            <div><div class="stat-label">Agent time</div><div class="text-[15px] font-semibold tabular-nums mt-1.5">{{ dur(total.time) }} <span class="text-meta font-normal text-[11px]">&middot; {{ elapsed }} elapsed</span></div></div>
            <div><div class="stat-label">Runs</div><div class="text-[15px] font-semibold tabular-nums mt-1.5">{{ runs.length }}</div></div>
          </div>

          <div class="px-6 pb-4 flex flex-wrap items-center gap-3">
            <div class="seg"><button :class="{ on: view === 'run' }" @click="view = 'run'">Per run</button><button :class="{ on: view === 'cumulative' }" @click="view = 'cumulative'">Cumulative</button></div>
            <div class="seg"><button v-for="m in (['cost', 'tokens', 'time'] as const)" :key="m" :class="{ on: metric === m }" @click="metric = m">{{ m === 'time' ? 'Agent time' : m[0]!.toUpperCase() + m.slice(1) }}</button></div>
          </div>

          <div class="px-6 pb-5">
            <div class="flex gap-3">
              <div class="relative flex-1 h-44" style="border-bottom: 1px solid var(--border-subtle)">
                <div v-for="n in 4" :key="n" class="absolute left-0 right-0" :style="{ top: ((n - 1) * 25) + '%', borderTop: '1px solid var(--border-subtle)' }" />
                <div class="absolute inset-0 flex items-end gap-1.5 px-2">
                  <div v-for="s in series" :key="s.run.id" class="flex-1 min-w-[6px] max-w-[88px] mx-auto rounded-t cursor-pointer transition-opacity hover:opacity-80" :title="`${s.run.trigger || 'Run'} - ${fmtMetric(s.value)}`"
                    :style="{ height: Math.max(2, (s.value / chartMax) * 100) + '%', background: '#2563eb' }" @click="expanded = s.run.id" />
                </div>
              </div>
              <div class="flex flex-col justify-between text-[11px] text-meta tabular-nums text-right h-44 -mt-1.5"><span v-for="(t, n) in ticks" :key="n">{{ t }}</span><span>&nbsp;</span></div>
            </div>
          </div>

          <div class="px-6 py-4 grid md:grid-cols-2 gap-8" style="border-top: 1px solid var(--border-subtle)">
            <div v-for="blk in [{ title: 'By agent', rows: byAgent }, { title: 'By model', rows: byModel }]" :key="blk.title" class="space-y-2">
              <div class="stat-label">{{ blk.title }}</div>
              <div class="flex h-1.5 rounded-full overflow-hidden" style="background: var(--surface-base)">
                <div v-for="r in blk.rows" :key="r.key" :style="{ width: r.pct + '%', background: r.color }" />
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <span v-for="r in blk.rows" :key="r.key" class="flex items-center gap-1.5"><i class="size-2 rounded-full" :style="{ background: r.color }" />{{ r.label }} <span class="tabular-nums">{{ money(r.value) }}</span> <span class="text-meta">{{ r.pct }}%</span></span>
                <span v-if="!blk.rows.length" class="text-meta">No data</span>
              </div>
            </div>
          </div>

          <div style="border-top: 1px solid var(--border-subtle)">
            <div class="grid grid-cols-[52px_1fr_150px_100px_70px_80px_64px_22px] gap-3 px-6 py-2.5 text-[11px] text-meta">
              <span>Time</span><span>Trigger</span><span>Agent</span><span>Model</span><span>Duration</span><span class="text-right">Tokens</span><span class="text-right">Cost</span><span />
            </div>
            <template v-for="g in groups" :key="g.key">
              <div class="flex items-center px-6 py-1.5 text-[11px] font-semibold tracking-wide uppercase" style="background: var(--surface-base)">
                {{ g.label }}<span class="ml-auto normal-case font-normal text-meta">{{ g.runs.length }} {{ g.runs.length === 1 ? 'run' : 'runs' }} &middot; {{ dur(g.time) }} &middot; {{ compact(g.tokens) }} tokens &middot; {{ money(g.cost) }}</span>
              </div>
              <div v-for="r in g.runs" :key="r.id" style="border-bottom: 1px solid var(--border-subtle)">
                <button class="w-full grid grid-cols-[52px_1fr_150px_100px_70px_80px_64px_22px] gap-3 px-6 py-2.5 items-center text-left hover-bg" @click="toggleRow(r.id)">
                  <span class="text-meta tabular-nums text-[12px]">{{ clock(r.startedAt) }}</span>
                  <span class="truncate" :title="r.trigger">{{ r.trigger || 'Run' }}</span>
                  <span class="flex items-center gap-1.5 min-w-0"><span class="issue-agent-dot"><UIcon name="i-lucide-cpu" class="size-3" /></span><span class="truncate">{{ agentName(r.agent) }}</span></span>
                  <span class="truncate"><span v-if="modelsOf(r)[0]" class="px-1.5 py-0.5 rounded text-[11px]" style="background: var(--surface-base)">{{ modelLabel(modelsOf(r)[0]!) }}</span></span>
                  <span class="tabular-nums">{{ dur(r.durationMs) }}</span>
                  <span class="tabular-nums text-right">{{ compact(tokensOf(r)) }}</span>
                  <span class="tabular-nums text-right font-semibold">{{ money(r.costUsd) }}</span>
                  <UIcon name="i-lucide-chevron-right" class="size-4 text-meta transition-transform" :class="{ 'rotate-90': expanded === r.id }" />
                </button>
                <div v-if="expanded === r.id" class="px-6 pb-5 pt-1 grid md:grid-cols-[1fr_260px] gap-10">
                  <div v-if="r.usage" class="space-y-2">
                    <div class="stat-label">Cost breakdown</div>
                    <div class="flex h-1.5 rounded-full overflow-hidden" style="background: var(--surface-base)">
                      <div v-for="b in breakdown(r)" :key="b.label" :style="{ width: b.pct + '%', background: b.color }" />
                    </div>
                    <table class="w-full text-[12px]">
                      <tbody>
                        <tr v-for="b in breakdown(r)" :key="b.label">
                          <td class="py-0.5"><i class="inline-block size-2 rounded-full mr-1.5" :style="{ background: b.color }" />{{ b.label }}</td>
                          <td class="text-right tabular-nums text-meta">{{ compact(b.tokens) }}</td>
                          <td class="text-right tabular-nums w-16">{{ money(b.cost) }}</td>
                          <td class="text-right tabular-nums w-10 text-meta">{{ b.pct }}%</td>
                        </tr>
                        <tr class="font-semibold"><td class="pt-1">Total</td><td class="text-right tabular-nums pt-1">{{ compact(tokensOf(r)) }}</td><td class="text-right tabular-nums pt-1">{{ money(r.costUsd) }}</td><td /></tr>
                      </tbody>
                    </table>
                    <p class="text-[11px] text-meta">Split by standard price ratios. The total is the cost the CLI reported.</p>
                  </div>
                  <p v-else class="text-meta">No token data for this run.</p>
                  <dl class="grid grid-cols-[80px_1fr] gap-y-1.5 text-[12px] content-start">
                    <dt class="text-meta">Status</dt><dd class="flex items-center gap-1.5"><UIcon :name="ISSUE_RUN_META[r.status].icon" class="size-3.5" :style="{ color: ISSUE_RUN_META[r.status].color }" />{{ ISSUE_RUN_META[r.status].label }}</dd>
                    <template v-if="modelsOf(r).length"><dt class="text-meta">Model</dt><dd>{{ modelsOf(r).join(', ') }}</dd></template>
                    <template v-if="r.usage"><dt class="text-meta">Cache hit</dt><dd>{{ cacheHit(r) }}%</dd></template>
                    <dt class="text-meta">Time</dt><dd>{{ clock(r.startedAt) }}<template v-if="r.finishedAt">&ndash;{{ clock(r.finishedAt) }}</template></dd>
                    <template v-if="r.numTurns"><dt class="text-meta">Turns</dt><dd>{{ r.numTurns }}</dd></template>
                    <template v-if="r.error"><dt class="text-meta">Error</dt><dd style="color: #ef4444">{{ r.error }}</dd></template>
                  </dl>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>

<style scoped>
.stat-label { font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-tertiary); }
.seg { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--surface-base); border: 1px solid var(--border-subtle); }
.seg button { padding: 3px 10px; border-radius: 6px; font-size: 12px; color: var(--text-secondary, var(--text-tertiary)); }
.seg button.on { background: var(--surface-raised); color: var(--text-primary); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
.issue-agent-dot { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 9999px; flex-shrink: 0; background: var(--accent-muted); color: var(--accent); }
</style>
