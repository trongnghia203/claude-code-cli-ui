<script setup lang="ts">
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import type { ModelStat } from '~/composables/useUsageStats'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps<{ models: ModelStat[] }>()

const COLORS = ['#D1C6C6', '#AC9F9F', '#877A7A', '#615757', '#3C3636', '#555']
const MAX_SLICES = 5

const pieItems = computed(() => {
  const sorted = [...props.models].sort((a, b) => b.cost - a.cost)
  if (sorted.length <= MAX_SLICES) return sorted.map(m => ({ name: m.name, cost: m.cost }))
  const top = sorted.slice(0, MAX_SLICES).map(m => ({ name: m.name, cost: m.cost }))
  const othersCost = sorted.slice(MAX_SLICES).reduce((s, m) => s + m.cost, 0)
  if (othersCost > 0) top.push({ name: 'Others', cost: othersCost })
  return top
})

const chartData = computed(() => ({
  labels: pieItems.value.map(m => m.name.replace('claude-', '')),
  datasets: [{
    data: pieItems.value.map(m => m.cost),
    backgroundColor: COLORS,
    borderWidth: 0,
    hoverOffset: 4,
  }],
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => ` $${ctx.parsed.toFixed(4)}`,
      },
    },
  },
}
</script>

<template>
  <div class="flex gap-4 h-full">
    <div class="flex-1 min-w-0">
      <Doughnut v-if="models.length" :data="chartData" :options="options" />
      <div v-else class="flex items-center justify-center h-full text-sm" style="color: var(--text-tertiary);">No data</div>
    </div>
    <div class="flex flex-col justify-center gap-2 text-[12px] shrink-0">
      <div v-for="(item, i) in pieItems" :key="item.name" class="flex items-center gap-2">
        <span class="size-2.5 rounded-full shrink-0" :style="{ background: COLORS[i % COLORS.length] }" />
        <span class="truncate max-w-[140px]" style="color: var(--text-secondary);">{{ item.name.replace('claude-', '') }}</span>
      </div>
    </div>
  </div>
</template>
