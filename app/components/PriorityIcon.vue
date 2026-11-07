<script setup lang="ts">
import type { IssuePriority } from '~/composables/useIssues'
import { ISSUE_PRIORITY_META } from '~/composables/useIssues'

// Signal bars: bar count shows rank, so it reads without color. Urgent is a filled square with "!".
const props = defineProps<{ priority: IssuePriority }>()
const meta = computed(() => ISSUE_PRIORITY_META[props.priority])
const active = computed(() => ({ low: 1, medium: 2, high: 3 } as Record<string, number>)[props.priority] ?? 0)
const BARS = [{ x: 1.5, y: 9, h: 5 }, { x: 6.5, y: 5.5, h: 8.5 }, { x: 11.5, y: 2, h: 12 }]
</script>

<template>
  <svg viewBox="0 0 16 16" class="shrink-0" role="img" :aria-label="meta.label">
    <title>{{ meta.label }}</title>
    <template v-if="priority === 'urgent'">
      <rect x="1" y="1" width="14" height="14" rx="3" :fill="meta.color" />
      <rect x="7" y="3.5" width="2" height="6" rx="1" fill="#fff" />
      <rect x="7" y="11" width="2" height="2" rx="1" fill="#fff" />
    </template>
    <template v-else-if="priority === 'none'">
      <rect v-for="(b, n) in BARS" :key="n" :x="b.x" y="7.25" width="3" height="1.5" rx="0.75" :fill="meta.color" opacity="0.7" />
    </template>
    <template v-else>
      <rect v-for="(b, n) in BARS" :key="n" :x="b.x" :y="b.y" width="3" :height="b.h" rx="1"
        :fill="n < active ? meta.color : 'currentColor'" :opacity="n < active ? 1 : 0.25" />
    </template>
  </svg>
</template>
