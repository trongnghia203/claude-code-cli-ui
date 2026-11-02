<script setup lang="ts">
import type { IssueProperty } from '~/composables/useIssueConfig'

/** One custom property input. Emits the new value, or null to clear it. `compact` is the borderless look of the issue sidebar. */
const props = defineProps<{ property: IssueProperty; modelValue: string | number | boolean | undefined; compact?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | number | boolean | null] }>()

const cls = computed(() => (props.compact ? 'prop-select' : 'w-full px-2 py-1.5 rounded-lg'))
const style = computed(() => (props.compact ? undefined : 'background: var(--surface-base); border: 1px solid var(--border-subtle)'))
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
  <DatePicker v-else-if="property.type === 'date'" :compact="compact" :model-value="typeof modelValue === 'string' ? modelValue : undefined" @update:model-value="emit('update:modelValue', $event)" />
  <input v-else :type="property.type === 'number' ? 'number' : property.type === 'url' ? 'url' : 'text'"
    :value="modelValue ?? ''" :class="cls" :style="style" :placeholder="property.type === 'url' ? 'https://' : ''" @change="onInput" />
</template>
