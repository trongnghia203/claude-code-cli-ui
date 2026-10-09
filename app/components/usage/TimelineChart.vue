<script setup lang="ts">
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import type { DayStat } from '~/composables/useUsageStats'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const props = defineProps<{
  data: DayStat[]
  modelNames: string[]
}>()

const COLORS = ['#D1C6C6', '#AC9F9F', '#877A7A', '#615757', '#3C3636', '#7C9BB5', '#6B8F71']

const chartData = computed(() => {
  const labels = props.data.map(d => {
    const date = new Date(d.date)
    return isNaN(date.getTime()) ? d.date : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })

  const topModels = props.modelNames.slice(0, 6)
  const hasOthers = props.modelNames.length > 6

  const datasets = topModels.map((model, i) => ({
    label: model.replace('claude-', ''),
    data: props.data.map(d => Number(d[`${model}_cost`] ?? 0)),
    backgroundColor: COLORS[i % COLORS.length],
    borderRadius: 2,
    borderSkipped: false,
  }))

  if (hasOthers) {
    datasets.push({
      label: 'Others',
      data: props.data.map(d => {
        const topSum = topModels.reduce((s, m) => s + Number(d[`${m}_cost`] ?? 0), 0)
        return Math.max(0, Number(d.cost) - topSum)
      }),
      backgroundColor: '#555555',
      borderRadius: 2,
      borderSkipped: false,
    })
  }

  return { labels, datasets }
})

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => ` ${ctx.dataset.label}: $${ctx.parsed.y.toFixed(4)}`,
      },
    },
  },
  scales: {
    x: {
      stacked: true,
      grid: { display: false },
      ticks: { color: '#888', font: { size: 11 }, maxRotation: 45 },
    },
    y: {
      stacked: true,
      grid: { color: 'rgba(128,128,128,0.1)' },
      ticks: {
        color: '#888',
        font: { size: 11 },
        callback: (v: number) => `$${v}`,
      },
    },
  },
}
</script>

<template>
  <div class="h-full w-full">
    <Bar v-if="data.length" :data="chartData" :options="options" />
    <div v-else class="flex items-center justify-center h-full" style="color: var(--text-tertiary);">
      No data for this period
    </div>
  </div>
</template>
