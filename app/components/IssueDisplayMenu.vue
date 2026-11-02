<script setup lang="ts">
import type { IssueConfig } from '~/composables/useIssueConfig'
import type { Column, DisplayOptions } from '~/composables/useIssueView'
import { BUILT_IN_CARD_FIELDS, groupableProps } from '~/composables/useIssueView'

const display = defineModel<DisplayOptions>({ required: true })
const props = defineProps<{ config: IssueConfig; columns: Column[]; showProject: boolean }>()

const active = computed(() => props.config.properties.filter(p => !p.archived))
const groupOptions = computed(() => [
  { value: 'status', label: 'Status' }, { value: 'priority', label: 'Priority' }, { value: 'assignee', label: 'Assignee' },
  { value: 'label', label: 'Label' }, ...(props.showProject ? [{ value: 'project', label: 'Project' }] : []),
  ...groupableProps(props.config).map(p => ({ value: `prop:${p.id}`, label: p.name })),
])
const orderOptions = computed(() => [
  { value: 'priority', label: 'Priority' }, { value: 'updatedAt', label: 'Updated' }, { value: 'createdAt', label: 'Created' },
  { value: 'title', label: 'Title' }, { value: 'number', label: 'Number' },
  ...active.value.map(p => ({ value: `prop:${p.id}`, label: p.name })),
])
const cardFields = computed(() => [...BUILT_IN_CARD_FIELDS.filter(f => f.key !== 'project' || props.showProject), ...active.value.map(p => ({ key: `prop:${p.id}`, label: p.name }))])

const set = (patch: Partial<DisplayOptions>) => { display.value = { ...display.value, ...patch } }
const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
const chip = (on: boolean) => on ? 'background: var(--accent-muted); color: var(--text-primary); border: 1px solid var(--border-subtle)' : 'color: var(--text-tertiary); border: 1px solid var(--border-subtle)'
const sel = 'px-2 py-1.5 rounded-lg text-[12px]'
const selStyle = 'background: var(--surface-base); border: 1px solid var(--border-subtle)'
</script>

<template>
  <UPopover :content="{ align: 'end' }">
    <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)"><UIcon name="i-lucide-sliders-horizontal" class="size-3.5" /> Display</button>
    <template #content>
      <div class="w-[320px] max-h-[560px] overflow-y-auto custom-scrollbar p-4 space-y-4 text-[12px]" style="background: var(--surface-raised)">
        <div class="flex items-center justify-between gap-3"><span class="text-label">Grouping</span>
          <select :value="display.groupBy" :class="sel" :style="selStyle" @change="set({ groupBy: ($event.target as HTMLSelectElement).value, hiddenColumns: [] })"><option v-for="o in groupOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select></div>
        <div class="space-y-1.5"><span class="text-label">Columns</span>
          <div class="flex flex-wrap gap-1.5"><button v-for="c in columns" :key="c.key" class="flex items-center gap-1.5 px-2 py-1 rounded-md" :style="chip(!display.hiddenColumns.includes(c.key))" @click="set({ hiddenColumns: toggleIn(display.hiddenColumns, c.key) })">
            <span v-if="c.color" class="size-2 rounded-full" :style="{ background: c.color }" />{{ c.label }}</button></div></div>
        <div class="space-y-1.5"><span class="text-label">Ordering</span>
          <div class="flex gap-2"><select :value="display.orderBy" class="flex-1" :class="sel" :style="selStyle" @change="set({ orderBy: ($event.target as HTMLSelectElement).value })"><option v-for="o in orderOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select>
            <button class="px-2.5 py-1.5 rounded-lg whitespace-nowrap" :style="selStyle" @click="set({ orderDir: display.orderDir === 'asc' ? 'desc' : 'asc' })">{{ display.orderDir === 'asc' ? 'Ascending' : 'Descending' }}</button></div></div>
        <label class="flex items-center justify-between"><span class="text-label">Show sub-issues</span><USwitch :model-value="display.showSubIssues" size="sm" @update:model-value="set({ showSubIssues: $event })" /></label>
        <div class="space-y-1.5"><span class="text-label">Card properties</span>
          <div class="flex flex-wrap gap-1.5"><button v-for="f in cardFields" :key="f.key" class="px-2 py-1 rounded-md" :style="chip(display.card.includes(f.key))" @click="set({ card: toggleIn(display.card, f.key) })">{{ f.label }}</button></div></div>
        <button class="text-meta underline" @click="display = { ...display, groupBy: 'status', hiddenColumns: [], orderBy: 'priority', orderDir: 'asc', showSubIssues: true, card: ['id', 'priority', 'assignee', 'labels', 'comments'] }">Reset display</button>
      </div>
    </template>
  </UPopover>
</template>
