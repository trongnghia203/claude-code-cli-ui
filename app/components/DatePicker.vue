<script setup lang="ts">
import { ymd } from '~/composables/useIssueView'

/** A date as YYYY-MM-DD. A calendar in a popover instead of the browser's small native picker. */
const props = defineProps<{ modelValue: string | undefined | null; placeholder?: string; clearable?: boolean; compact?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const open = ref(false)
const parse = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null)
const selected = computed(() => parse(props.modelValue))
const today = ymd(new Date())

// The month on screen: the selected date's, else this month
const shown = ref(new Date())
watch(open, (o) => { if (o) { const d = selected.value ?? new Date(); shown.value = new Date(d.getFullYear(), d.getMonth(), 1) } })
const title = computed(() => shown.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))
const move = (n: number) => { shown.value = new Date(shown.value.getFullYear(), shown.value.getMonth() + n, 1) }

// Monday-first, always 6 rows so the popover does not jump
const days = computed(() => {
  const first = new Date(shown.value.getFullYear(), shown.value.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return { key: ymd(d), n: d.getDate(), out: d.getMonth() !== first.getMonth(), weekend: d.getDay() === 0 || d.getDay() === 6 }
  })
})
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function pick(key: string) { emit('update:modelValue', key); open.value = false }
const label = computed(() => selected.value?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))
</script>

<template>
  <span class="inline-flex items-center gap-1 min-w-0">
    <UPopover v-model:open="open">
      <button type="button" class="flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] hover-bg text-left" :class="compact ? '' : 'w-full'" :style="compact ? undefined : 'background: var(--surface-base); border: 1px solid var(--border-subtle)'">
        <UIcon name="i-lucide-calendar" class="size-3.5 shrink-0 text-meta" />
        <span :class="label ? '' : 'text-meta'">{{ label ?? placeholder ?? 'Set date' }}</span>
      </button>
      <template #content>
        <div class="w-[264px] p-3 select-none" style="background: var(--surface-raised)">
          <div class="flex items-center justify-between mb-2">
            <button type="button" class="p-1.5 rounded-md hover-bg" title="Previous month" @click="move(-1)"><UIcon name="i-lucide-chevron-left" class="size-4 block" /></button>
            <span class="text-[13px] font-semibold">{{ title }}</span>
            <button type="button" class="p-1.5 rounded-md hover-bg" title="Next month" @click="move(1)"><UIcon name="i-lucide-chevron-right" class="size-4 block" /></button>
          </div>
          <div class="grid grid-cols-7 text-center text-[11px] text-meta mb-1"><span v-for="w in WEEK" :key="w" class="py-1">{{ w }}</span></div>
          <div class="grid grid-cols-7 gap-y-0.5">
            <button v-for="d in days" :key="d.key" type="button" class="h-8 rounded-md text-[13px] hover-bg"
              :style="{
                background: modelValue === d.key ? 'var(--accent)' : undefined,
                color: modelValue === d.key ? 'white' : d.out ? 'var(--text-tertiary)' : 'var(--text-primary)',
                opacity: d.out && modelValue !== d.key ? 0.55 : 1,
                outline: d.key === today && modelValue !== d.key ? '1px solid var(--accent)' : 'none',
                outlineOffset: '-2px',
                fontWeight: d.key === today || modelValue === d.key ? 600 : 400,
              }" @click="pick(d.key)">{{ d.n }}</button>
          </div>
          <div class="flex items-center justify-between mt-2 pt-2" style="border-top: 1px solid var(--border-subtle)">
            <button type="button" class="px-2 py-1 rounded-md text-[12px] hover-bg" @click="pick(today)">Today</button>
            <button v-if="clearable !== false && modelValue" type="button" class="px-2 py-1 rounded-md text-[12px] text-label hover-bg" @click="() => { emit('update:modelValue', null); open = false }">Clear</button>
          </div>
        </div>
      </template>
    </UPopover>
    <button v-if="clearable !== false && modelValue" type="button" class="p-1 rounded hover-bg shrink-0" title="Clear" @click="emit('update:modelValue', null)"><UIcon name="i-lucide-x" class="size-3 block text-meta" /></button>
  </span>
</template>
