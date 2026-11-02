<script setup lang="ts">
import type { IssueConfig } from '~/composables/useIssueConfig'
import type { DateOp, IssueFilters } from '~/composables/useIssueView'
import { DATE_OP_LABEL, dateProps, filterCount } from '~/composables/useIssueView'
import { ISSUE_PRIORITIES, ISSUE_PRIORITY_META, ISSUE_STATUSES, ISSUE_STATUS_META } from '~/composables/useIssues'

const filters = defineModel<IssueFilters>({ required: true })
const props = defineProps<{ config: IssueConfig; agents: { slug: string; name: string }[]; projects: string[]; showProject: boolean; add?: boolean }>()

const open = ref(false)
const field = ref<string | null>(null)
watch(open, (o) => { if (!o) field.value = null })

interface Field { key: string; label: string; icon: string }
const fields = computed<Field[]>(() => [
  { key: 'status', label: 'Status', icon: 'i-lucide-circle-dot' },
  { key: 'priority', label: 'Priority', icon: 'i-lucide-signal' },
  { key: 'date', label: 'Date', icon: 'i-lucide-calendar' },
  { key: 'assignee', label: 'Assignee', icon: 'i-lucide-user' },
  ...(props.showProject ? [{ key: 'project', label: 'Project', icon: 'i-lucide-folder' }] : []),
  { key: 'label', label: 'Label', icon: 'i-lucide-tag' },
  ...props.config.properties.filter(p => !p.archived && ['select', 'checkbox', 'text'].includes(p.type)).map(p => ({ key: `prop:${p.id}`, label: p.name, icon: 'i-lucide-list-plus' })),
])
const fieldLabel = computed(() => fields.value.find(f => f.key === field.value)?.label ?? '')

interface Opt { value: string; label: string; color?: string }
const options = computed<Opt[]>(() => {
  const f = field.value
  if (f === 'status') return ISSUE_STATUSES.map(s => ({ value: s, label: ISSUE_STATUS_META[s].label, color: ISSUE_STATUS_META[s].color }))
  if (f === 'priority') return ISSUE_PRIORITIES.map(p => ({ value: p, label: ISSUE_PRIORITY_META[p].label, color: ISSUE_PRIORITY_META[p].color }))
  if (f === 'assignee') return [{ value: '', label: 'Unassigned' }, ...props.agents.map(a => ({ value: a.slug, label: a.name }))]
  if (f === 'project') return props.projects.map(d => ({ value: d, label: d.split('/').filter(Boolean).pop() ?? d }))
  if (f === 'label') return [...props.config.labels.map(l => ({ value: l.id, label: l.name, color: l.color })), { value: '', label: 'No label' }]
  if (f?.startsWith('prop:')) {
    const def = props.config.properties.find(p => p.id === f.slice(5))
    if (def?.type === 'select') return [...def.options.map(o => ({ value: o.id, label: o.name })), { value: '', label: `No ${def.name}` }]
    if (def?.type === 'checkbox') return [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
  }
  return []
})
const isText = computed(() => !!field.value?.startsWith('prop:') && props.config.properties.find(p => p.id === field.value!.slice(5))?.type === 'text')

function listFor(key: string): string[] {
  if (key.startsWith('prop:')) return filters.value.props?.[key.slice(5)] ?? []
  return ((filters.value as any)[key] as string[] | undefined) ?? []
}
function setList(key: string, list: string[]) {
  const next: IssueFilters = { ...filters.value }
  if (key.startsWith('prop:')) {
    const p = { ...(next.props ?? {}) }
    if (list.length) p[key.slice(5)] = list
    else delete p[key.slice(5)]
    next.props = Object.keys(p).length ? p : undefined
  } else (next as any)[key] = list.length ? list : undefined
  filters.value = next
}
const toggle = (value: string) => { const l = listFor(field.value!); setList(field.value!, l.includes(value) ? l.filter(x => x !== value) : [...l, value]) }

// Date: pick the field, then one rule
const dateFields = computed(() => [{ key: 'createdAt', label: 'Created' }, { key: 'updatedAt', label: 'Updated' }, ...dateProps(props.config).map(p => ({ key: p.id, label: p.name }))])
const dateField = computed(() => filters.value.date?.field ?? dateFields.value[dateFields.value.length - 1]!.key)
const setDate = (fieldKey: string, op: DateOp | null) => { filters.value = { ...filters.value, date: op ? { field: fieldKey, op } : undefined } }

const count = computed(() => filterCount(filters.value))
const usedIn = (key: string) => (key === 'date' ? (filters.value.date ? 1 : 0) : listFor(key).length)
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'end' }">
    <button v-if="add" type="button" class="flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] text-label hover-bg" style="border: 1px dashed var(--border-subtle)"><UIcon name="i-lucide-plus" class="size-3.5" /> Add filter</button>
    <button v-else class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
      <UIcon name="i-lucide-list-filter" class="size-3.5" /> Filter
      <span v-if="count" class="px-1.5 rounded-full text-[10px]" style="background: var(--accent); color: white">{{ count }}</span>
    </button>
    <template #content>
      <div class="w-[260px] max-h-[420px] overflow-y-auto custom-scrollbar p-1 text-[13px]" style="background: var(--surface-raised)">
        <template v-if="!field">
          <button v-for="f in fields" :key="f.key" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover-bg" @click="field = f.key">
            <UIcon :name="f.icon" class="size-4 text-meta" /><span class="flex-1">{{ f.label }}</span>
            <span v-if="usedIn(f.key)" class="text-[10px] px-1.5 rounded-full" style="background: var(--accent-muted)">{{ usedIn(f.key) }}</span>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 text-meta" />
          </button>
        </template>
        <template v-else>
          <button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover-bg font-medium" @click="field = null"><UIcon name="i-lucide-chevron-left" class="size-4" />{{ fieldLabel }}</button>
          <!-- Date -->
          <div v-if="field === 'date'" class="p-1.5 space-y-2">
            <select :value="dateField" class="w-full px-2 py-1.5 rounded-lg text-[12px]" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" @change="setDate(($event.target as HTMLSelectElement).value, filters.date?.op ?? null)">
              <option v-for="d in dateFields" :key="d.key" :value="d.key">{{ d.label }}</option>
            </select>
            <button v-for="(label, op) in DATE_OP_LABEL" :key="op" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover-bg" @click="setDate(dateField, filters.date?.op === op ? null : op as DateOp)">
              <UIcon :name="filters.date?.op === op ? 'i-lucide-circle-dot' : 'i-lucide-circle'" class="size-3.5" />{{ label }}
            </button>
          </div>
          <!-- Text property -->
          <div v-else-if="isText" class="p-1.5">
            <input :value="listFor(field)[0] ?? ''" placeholder="Contains..." class="w-full px-2 py-1.5 rounded-lg text-[12px]" style="background: var(--surface-base); border: 1px solid var(--border-subtle)"
              @input="setList(field!, ($event.target as HTMLInputElement).value ? [($event.target as HTMLInputElement).value] : [])" />
          </div>
          <!-- Pick values -->
          <template v-else>
            <p v-if="!options.length" class="px-2.5 py-3 text-meta text-[12px]">Nothing to pick yet.</p>
            <button v-for="o in options" :key="o.value" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover-bg" @click="toggle(o.value)">
              <UIcon :name="listFor(field).includes(o.value) ? 'i-lucide-square-check' : 'i-lucide-square'" class="size-4" />
              <span v-if="o.color" class="size-2 rounded-full shrink-0" :style="{ background: o.color }" />
              <span class="truncate">{{ o.label }}</span>
            </button>
          </template>
        </template>
        <div v-if="count" class="p-1 pt-1.5 mt-1" style="border-top: 1px solid var(--border-subtle)"><button class="w-full px-2.5 py-1.5 rounded-md text-left text-[12px] hover-bg text-label" @click="filters = {}">Clear all filters</button></div>
      </div>
    </template>
  </UPopover>
</template>
