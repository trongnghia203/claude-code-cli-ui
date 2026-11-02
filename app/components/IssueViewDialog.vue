<script setup lang="ts">
import type { IssueConfig } from '~/composables/useIssueConfig'
import type { DisplayOptions, IssueFilters, Layout } from '~/composables/useIssueView'
import { filterChips, filterCount } from '~/composables/useIssueView'

/** Save as view: name, filters and default display, prefilled from the page. Edits here never touch the page until the view is opened. */
const props = defineProps<{
  config: IssueConfig
  agents: { slug: string; name: string }[]
  projects: string[]
  showProject: boolean
  initial: { filters: IssueFilters; display: DisplayOptions; layout: Layout }
  existingNames: string[]
  busy?: boolean
}>()
const emit = defineEmits<{ create: [view: { name: string; layout: Layout; filters: IssueFilters; display: DisplayOptions }]; cancel: [] }>()

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const name = ref('')
const filters = ref<IssueFilters>(clone(props.initial.filters))
const display = ref<DisplayOptions>(clone(props.initial.display))
const layout = ref<Layout>(props.initial.layout)
const showDisplay = ref(true)

const agentName = (slug: string) => props.agents.find(a => a.slug === slug)?.name ?? slug
const chips = computed(() => filterChips(filters.value, props.config, agentName))
const taken = computed(() => !!name.value.trim() && props.existingNames.some(n => n.toLowerCase() === name.value.trim().toLowerCase()))
const valid = computed(() => !!name.value.trim() && !taken.value && !props.busy)

// "Board · Status · Due date · Earliest first"
const summary = computed(() => {
  const d = display.value
  const group = d.groupBy.startsWith('prop:') ? props.config.properties.find(p => p.id === d.groupBy.slice(5))?.name ?? 'Property'
    : d.groupBy[0]!.toUpperCase() + d.groupBy.slice(1)
  const order = d.orderBy.startsWith('prop:') ? props.config.properties.find(p => p.id === d.orderBy.slice(5))?.name ?? 'Property'
    : ({ priority: 'Priority', updatedAt: 'Updated', createdAt: 'Created', title: 'Title', number: 'Number' } as Record<string, string>)[d.orderBy] ?? d.orderBy
  return [layout.value === 'board' ? 'Board' : 'List', group, order, d.orderDir === 'asc' ? 'Ascending' : 'Descending'].join(' · ')
})

function submit() {
  if (!valid.value) return
  emit('create', { name: name.value.trim(), layout: layout.value, filters: filters.value, display: display.value })
}
const field = 'background: var(--surface-base); border: 1px solid var(--border-subtle)'
</script>

<template>
  <form class="w-[560px] max-w-full" style="background: var(--surface-raised)" @submit.prevent="submit">
    <div class="p-6 space-y-5">
      <div>
        <h3 class="text-page-title">Save as view</h3>
        <p class="text-[13px] text-label">Saved with the labels and properties of this {{ showProject ? 'workspace' : 'project' }}.</p>
      </div>
      <div class="grid grid-cols-[90px_1fr] gap-x-4 gap-y-4 items-start text-[13px]">
        <span class="text-label pt-2">Name</span>
        <div><input v-model="name" maxlength="40" autofocus placeholder="e.g. Needs review" class="w-full px-3 py-2 rounded-lg" :style="field" />
          <p v-if="taken" class="text-[11px] mt-1" style="color: #ef4444">A view with this name exists.</p></div>
        <span class="text-label pt-1.5">Filters</span>
        <div class="flex flex-wrap items-center gap-1.5">
          <span v-for="c in chips" :key="c.key" class="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[12px]" style="background: var(--accent-muted)">{{ c.text }}
            <button type="button" class="p-0.5 rounded-full hover-bg" title="Remove filter" @click="filters = c.without"><UIcon name="i-lucide-x" class="size-3 block" /></button></span>
          <IssueFilterMenu v-model="filters" add :config="config" :agents="agents" :projects="projects" :show-project="showProject" />
          <span v-if="!filterCount(filters)" class="text-[12px] text-meta">Shows every issue.</span>
        </div>
      </div>
      <div>
        <button type="button" class="flex items-center gap-2 text-[13px]" @click="showDisplay = !showDisplay">
          <UIcon :name="showDisplay ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" /><span class="font-medium">Default display</span><span class="text-[12px] text-meta">{{ summary }}</span>
        </button>
        <div v-if="showDisplay" class="mt-3 ml-5"><IssueDisplayForm v-model="display" v-model:layout="layout" :config="config" :show-project="showProject" /></div>
      </div>
    </div>
    <div class="px-6 py-3 flex items-center justify-end gap-2" style="border-top: 1px solid var(--border-subtle)">
      <UButton type="button" label="Cancel" variant="ghost" color="neutral" size="sm" @click="emit('cancel')" />
      <UButton type="submit" label="Create view" size="sm" :disabled="!valid" :loading="busy" />
    </div>
  </form>
</template>
