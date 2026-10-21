<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  // Hide visible title when the sidebar already shows it. Kept as sr-only for a11y.
  hideTitle?: boolean
}>()
</script>

<template>
  <h1 v-if="hideTitle && !$slots.leading && !$slots.trailing && !$slots.subtitle && !subtitle && !$slots.right" class="sr-only">
    {{ title }}
  </h1>
  <div
    v-else
    class="min-h-16 flex items-center gap-3 px-6 py-3 shrink-0 sticky top-0 z-100"
    style="border-bottom: 1px solid var(--border-subtle); background: var(--surface-base); backdrop-filter: blur(12px);"
  >
    <slot name="leading" />
    <div class="flex-1 min-w-0">
      <h1 class="text-page-title flex items-center gap-2.5">
        <span :class="{ 'sr-only': hideTitle }">{{ title }}</span>
        <slot name="trailing" />
      </h1>
      <div v-if="subtitle || $slots.subtitle" class="mt-0.5">
        <slot name="subtitle">
          <p class="text-[11px] font-mono text-meta truncate">{{ subtitle }}</p>
        </slot>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <slot name="right" />
    </div>
  </div>
</template>
