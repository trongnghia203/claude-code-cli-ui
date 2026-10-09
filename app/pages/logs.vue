<script setup lang="ts">
interface LogEntry {
  timestamp: number
  line: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'unknown'
  component: string
}

interface LogSource {
  id: string
  name: string
  path: string
  size: number
  mtime: number
  exists: boolean
}

type FilterValue = 'all' | 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'supervisor' | 'bg' | 'slash'

const logs = ref<LogEntry[]>([])
const paused = ref(false)
const autoScroll = ref(true)
const filter = ref<FilterValue>('all')
const search = ref('')
const searchInput = ref('')
const listRef = ref<HTMLElement>()
const connected = ref(false)
const sources = ref<LogSource[]>([])
const selectedSource = ref('daemon')
let es: EventSource | null = null

async function fetchSources() {
  try {
    sources.value = await $fetch<LogSource[]>('/api/logs/sources')
  } catch { /* ignore */ }
}

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'INFO', label: 'Info' },
  { value: 'WARN', label: 'Warn' },
  { value: 'ERROR', label: 'Error' },
  { value: 'DEBUG', label: 'Debug' },
  { value: 'supervisor', label: 'supervisor' },
  { value: 'bg', label: 'bg' },
  { value: 'slash', label: 'slash' },
]

const filtered = computed(() => {
  let list = logs.value
  if (filter.value !== 'all') {
    list = list.filter(e => e.level === filter.value || e.component === filter.value)
  }
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(e => e.line.toLowerCase().includes(q))
  }
  return list
})

function lineClass(entry: LogEntry) {
  if (entry.level === 'ERROR') return 'text-red-400'
  if (entry.level === 'WARN') return 'text-yellow-400'
  if (entry.level === 'DEBUG') return 'text-gray-500'
  if (entry.component === 'supervisor') return 'text-blue-400'
  if (entry.component === 'bg') return 'text-purple-400'
  if (entry.component === 'slash') return 'text-green-400'
  return ''
}

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}

function connect() {
  if (es) { es.close(); es = null }
  logs.value = []
  connected.value = false
  es = new EventSource(`/api/logs/stream?source=${selectedSource.value}`)
  es.onopen = () => { connected.value = true }
  es.onerror = () => { connected.value = false }
  es.onmessage = (e) => {
    if (paused.value) return
    try {
      const entry = JSON.parse(e.data) as LogEntry
      logs.value = logs.value.length >= 500
        ? [...logs.value.slice(-499), entry]
        : [...logs.value, entry]
    } catch { /* malformed */ }
  }
}

watch(selectedSource, () => connect())

let searchDebounce: ReturnType<typeof setTimeout>
function onSearchInput() {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => { search.value = searchInput.value }, 100)
}

function onScroll() {
  if (!listRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = listRef.value
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 32
}

watch(filtered, () => {
  if (!autoScroll.value) return
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
})

onMounted(() => { fetchSources(); connect() })
onUnmounted(() => { es?.close(); es = null })
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div
      class="flex items-center gap-3 px-5 py-3 border-b shrink-0 flex-wrap"
      style="border-color: var(--border-subtle); background: var(--surface-base);"
    >
      <div class="flex items-center gap-2 mr-1">
        <h1 class="text-[15px] font-semibold" style="color: var(--text-primary);">Logs</h1>
        <span
          class="size-2 rounded-full shrink-0"
          :style="connected ? 'background: #22c55e;' : 'background: #ef4444;'"
          :title="connected ? 'Connected' : 'Disconnected'"
        />
      </div>

      <!-- Source selector -->
      <select
        v-model="selectedSource"
        class="px-2.5 py-1 rounded-lg text-[12px] border outline-none cursor-pointer"
        style="background: var(--surface-raised); border-color: var(--border-subtle); color: var(--text-primary);"
      >
        <option v-for="s in sources" :key="s.id" :value="s.id" :disabled="!s.exists">
          {{ s.name }}{{ !s.exists ? ' (not found)' : '' }}
        </option>
        <option v-if="!sources.length" value="daemon">Claude Daemon</option>
      </select>

      <!-- Filter -->
      <select
        v-model="filter"
        class="px-2.5 py-1 rounded-lg text-[12px] border outline-none cursor-pointer"
        style="background: var(--surface-raised); border-color: var(--border-subtle); color: var(--text-primary);"
      >
        <option v-for="f in FILTERS" :key="f.value" :value="f.value">{{ f.label }}</option>
      </select>

      <!-- Search -->
      <div class="relative">
        <UIcon name="i-lucide-search" class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5" style="color: var(--text-tertiary);" />
        <input
          v-model="searchInput"
          type="text"
          placeholder="Search..."
          class="pl-7 pr-3 py-1 rounded-lg text-[12px] border outline-none w-44"
          style="background: var(--surface-raised); border-color: var(--border-subtle); color: var(--text-primary);"
          @input="onSearchInput"
        />
      </div>

      <div class="flex items-center gap-1.5 ml-auto">
        <!-- Pause / Resume -->
        <button
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] border hover-bg transition-colors"
          :style="paused
            ? 'border-color: var(--accent); color: var(--accent);'
            : 'border-color: var(--border-subtle); color: var(--text-secondary);'"
          @click="paused = !paused"
        >
          <UIcon :name="paused ? 'i-lucide-play' : 'i-lucide-pause'" class="size-3.5" />
          {{ paused ? 'Resume' : 'Pause' }}
        </button>

        <!-- Auto-scroll toggle -->
        <button
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] border hover-bg transition-colors"
          :style="autoScroll
            ? 'border-color: var(--accent); color: var(--accent);'
            : 'border-color: var(--border-subtle); color: var(--text-secondary);'"
          @click="autoScroll = !autoScroll"
        >
          <UIcon name="i-lucide-arrow-down-to-line" class="size-3.5" />
          Auto
        </button>

        <!-- Clear -->
        <button
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] border hover-bg transition-colors"
          style="border-color: var(--border-subtle); color: var(--text-secondary);"
          @click="logs = []"
        >
          <UIcon name="i-lucide-trash-2" class="size-3.5" />
          Clear
        </button>
      </div>
    </div>

    <!-- Log lines -->
    <div
      ref="listRef"
      class="flex-1 overflow-y-auto font-mono text-[12px] leading-5 px-4 py-3 space-y-px"
      style="background: var(--surface-base);"
      @scroll="onScroll"
    >
      <div v-if="filtered.length === 0" class="py-10 text-center text-[12px]" style="color: var(--text-tertiary);">
        {{ logs.length === 0 ? 'Waiting for log data…' : 'No lines match filter' }}
      </div>
      <div
        v-for="(entry, i) in filtered"
        :key="i"
        class="flex gap-3 whitespace-pre-wrap break-all"
      >
        <span class="shrink-0 tabular-nums" style="color: var(--text-tertiary);">{{ formatTime(entry.timestamp) }}</span>
        <span
          class="shrink-0 w-[72px] truncate text-right"
          :class="lineClass(entry)"
        >{{ entry.component }}</span>
        <span :class="lineClass(entry)" class="flex-1 min-w-0">{{ entry.line.replace(/^\[[^\]]+\]\s+\[[^\]]+\]\s+/, '') }}</span>
      </div>
    </div>

    <!-- Footer count -->
    <div
      class="px-5 py-1.5 border-t text-[11px] shrink-0 flex items-center gap-3"
      style="border-color: var(--border-subtle); color: var(--text-tertiary); background: var(--surface-base);"
    >
      <span>{{ filtered.length }} / {{ logs.length }} lines</span>
      <span v-if="paused" class="text-yellow-400">Paused</span>
    </div>
  </div>
</template>
