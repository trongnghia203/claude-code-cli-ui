<script setup lang="ts">
import type { IssueProperty } from '~/composables/useIssueConfig'

/** One custom property input. Emits the new value, or null to clear it. `compact` is the borderless look of the issue sidebar. */
const props = defineProps<{ property: IssueProperty; modelValue: string | number | boolean | undefined; compact?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | number | boolean | null] }>()

const cls = computed(() => (props.compact ? 'prop-select' : 'w-full px-2 py-1.5 rounded-lg'))
const style = computed(() => (props.compact ? undefined : 'background: var(--surface-base); border: 1px solid var(--border-subtle)'))
// A native date input shows today's date while empty, which reads as a real value. Show a placeholder until one is chosen.
const picking = ref(false)
const dateEl = ref<HTMLInputElement | null>(null)
const showDate = computed(() => props.modelValue !== undefined && props.modelValue !== '' || picking.value)
async function startPick() {
  picking.value = true
  await nextTick()
  dateEl.value?.focus()
  try { dateEl.value?.showPicker?.() } catch { /* needs a user gesture in some browsers */ }
}
const onInput = (e: Event) => {
  const v = (e.target as HTMLInputElement).value
  emit('update:modelValue', v === '' ? null : props.property.type === 'number' ? Number(v) : v)
}
</script>

<template>
  <input v-if="property.type === 'checkbox'" type="checkbox" :checked="modelValue === true" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
  <select v-else-if="property.type === 'select'" :value="modelValue ?? ''" :class="cls" :style="style" @change="onInput">
    <option value="">-</option>
    <option v-for="o in property.options" :key="o.id" :value="o.id">{{ o.name }}</option>
  </select>
  <span v-else-if="property.type === 'date'" class="flex items-center gap-1 min-w-0">
    <input v-if="showDate" ref="dateEl" type="date" :value="modelValue ?? ''" :class="cls" :style="style" @change="onInput" @blur="picking = false" />
    <button v-else type="button" :class="cls" class="text-left text-meta" :style="style" @click="startPick">Set date</button>
    <button v-if="modelValue" type="button" class="p-1 rounded hover-bg shrink-0" title="Clear" @click="emit('update:modelValue', null)"><UIcon name="i-lucide-x" class="size-3 block text-meta" /></button>
  </span>
  <input v-else :type="property.type === 'number' ? 'number' : property.type === 'url' ? 'url' : 'text'"
    :value="modelValue ?? ''" :class="cls" :style="style" :placeholder="property.type === 'url' ? 'https://' : ''" @change="onInput" />
</template>
