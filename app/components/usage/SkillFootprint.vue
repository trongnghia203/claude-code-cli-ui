<script setup lang="ts">
import { useContextReport, type ContextRow } from '~/composables/useContextReport'

// Global (not session-scoped): what skills, agents, memory and MCP tools add to every turn.
const { report, loading, error, fetchReport } = useContextReport()

const COLORS: Record<string, string> = {
  'Custom agents': '#b1b9f9',
  'Memory files': '#d77757',
  'Skills': '#ffc107',
  'MCP tools': '#14b8a6',
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function groupName(row: ContextRow): string {
  return row.source.replace(/^Plugin \((.+)\)$/, '$1')
}

interface Group { name: string; count: number; tokens: number; rows: ContextRow[] }

function group(rows: ContextRow[]): Group[] {
  const map = new Map<string, Group>()
  for (const row of rows) {
    const key = groupName(row)
    const g = map.get(key) ?? { name: key, count: 0, tokens: 0, rows: [] }
    g.count++
    g.tokens += row.tokens
    g.rows.push(row)
    map.set(key, g)
  }
  return [...map.values()].sort((a, b) => b.tokens - a.tokens)
}

const sections = computed(() => {
  const r = report.value
  if (!r) return []
  return [
    { key: 'skills', title: 'Skills', unit: 'skills', groups: group(r.skills), color: COLORS.Skills },
    { key: 'agents', title: 'Custom agents', unit: 'agents', groups: group(r.agents), color: COLORS['Custom agents'] },
    { key: 'memory', title: 'Memory files', unit: 'files', groups: group(r.memory.map(m => ({ ...m, name: m.path || m.name }))), color: COLORS['Memory files'] },
    { key: 'mcp', title: 'MCP tools (deferred, loaded on demand)', unit: 'tools', groups: group(r.mcpTools), color: COLORS['MCP tools'] },
  ].filter(s => s.groups.length).map(s => ({ ...s, max: Math.max(1, ...s.groups.map(g => g.tokens)) }))
})

function pctOf(n: number, max: number): number {
  return max > 0 ? Math.max(2, Math.min(100, (n / max) * 100)) : 0
}

const expanded = ref<string | null>(null)
const toggle = (id: string) => { expanded.value = expanded.value === id ? null : id }

const totalPerTurn = computed(() => {
  const r = report.value
  if (!r) return 0
  const names = new Set(['Skills', 'Custom agents', 'Memory files'])
  return r.categories.filter(c => names.has(c.name)).reduce((n, c) => n + c.tokens, 0)
})

</script>

<template>
  <div class="rounded-xl border bg-card" style="border-color: var(--border-subtle);">
    <div class="flex items-center justify-between gap-2 px-5 py-4 border-b" style="border-color: var(--border-subtle);">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-puzzle" class="size-4" style="color: var(--text-tertiary);" />
        <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Skill Footprint</span>
        <span v-if="report" class="text-[11px]" style="color: var(--text-tertiary);">
          · ~{{ fmt(totalPerTurn) }} tok/turn (skills + agents + memory)
        </span>
      </div>
      <button
        class="px-2.5 py-1 rounded-lg text-[12px] border flex items-center gap-1.5 hover-bg transition-colors"
        style="border-color: var(--border-subtle); color: var(--text-secondary);"
        :disabled="loading"
        @click="fetchReport(true)"
      >
        <UIcon name="i-lucide-refresh-cw" class="size-3" :class="loading ? 'animate-spin' : ''" />
        Refresh
      </button>
    </div>

    <div v-if="loading && !report" class="flex items-center justify-center py-10 gap-2 text-[13px]" style="color: var(--text-tertiary);">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" />
      Running /context...
    </div>
    <div v-else-if="error && !report" class="p-5 text-[13px]" style="color: var(--error, #ef4444);">{{ error }}</div>

    <div v-else-if="report" class="p-5 space-y-6">
      <p class="text-[12px]" style="color: var(--text-tertiary);">
        Listing text added to the system prompt on every turn (cached input after the first turn). From a fresh <code>claude /context</code>.
      </p>
      <!-- Detail sections -->
      <div v-for="s in sections" :key="s.key">
        <div class="flex items-center gap-2 mb-1">
          <span class="size-2.5 rounded-[3px]" :style="{ background: s.color }" />
          <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">{{ s.title }}</span>
          <span class="text-[11px]" style="color: var(--text-tertiary);">
            · {{ s.groups.reduce((n, g) => n + g.count, 0) }} {{ s.unit }} · {{ fmt(s.groups.reduce((n, g) => n + g.tokens, 0)) }} tokens
          </span>
        </div>
        <div class="divide-y" style="divide-color: var(--border-subtle);">
          <div v-for="g in s.groups" :key="g.name">
            <div class="flex items-center gap-3 py-1.5 cursor-pointer hover-bg text-[13px]" @click="toggle(s.key + g.name)">
              <UIcon
                :name="expanded === s.key + g.name ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3.5 shrink-0"
                style="color: var(--text-tertiary);"
              />
              <span class="w-44 shrink-0 truncate" style="color: var(--text-primary);">{{ g.name }}</span>
              <div class="flex-1 h-2 rounded-full overflow-hidden min-w-12" style="background: var(--surface-raised);">
                <div class="h-full rounded-full" :style="{ width: pctOf(g.tokens, s.max) + '%', background: s.color }" />
              </div>
              <span class="w-20 text-right text-[12px]" style="color: var(--text-tertiary);">{{ g.count }} {{ g.count === 1 ? s.unit.replace(/s$/, '') : s.unit }}</span>
              <span class="w-20 text-right font-mono text-[12px]" style="color: var(--accent);">~{{ fmt(g.tokens) }}</span>
            </div>
            <div v-if="expanded === s.key + g.name" class="pb-2 pl-7 space-y-0.5">
              <div
                v-for="r in [...g.rows].sort((a, b) => b.tokens - a.tokens)"
                :key="r.name"
                class="flex items-center gap-3 text-[12px] pr-1"
                style="color: var(--text-secondary);"
              >
                <span class="w-56 shrink-0 truncate">{{ r.name }}</span>
                <div class="flex-1 h-1.5 rounded-full overflow-hidden min-w-12" style="background: var(--surface-raised);">
                  <div class="h-full rounded-full opacity-70" :style="{ width: pctOf(r.tokens, g.rows[0] ? Math.max(...g.rows.map(x => x.tokens)) : 1) + '%', background: s.color }" />
                </div>
                <span class="w-14 text-right font-mono shrink-0" style="color: var(--text-tertiary);">{{ fmt(r.tokens) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
