<script setup lang="ts">
defineProps<{
  title: string
  value: string
  subtitle: string
  icon: string
}>()
</script>

<template>
  <div class="rounded-xl p-5 bg-card border" style="border-color: var(--border-subtle);">
    <div class="flex items-center justify-between mb-3">
      <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">{{ title }}</span>
      <UIcon :name="icon" class="size-4" style="color: var(--text-tertiary);" />
    </div>
    <div class="text-3xl font-bold mb-1" style="color: var(--text-primary);">{{ value }}</div>
    <div class="text-[12px]" style="color: var(--text-tertiary);">{{ subtitle }}</div>
  </div>
</template>
