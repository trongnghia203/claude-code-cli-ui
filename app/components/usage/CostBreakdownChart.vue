<script setup lang="ts">
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import type { ModelStat } from '~/composables/useUsageStats'

ChartJS.register(ArcElement, Tooltip, Legend)

function fmtCost(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(n < 10 ? 2 : 0)}`
}


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

const totalCost = computed(() => pieItems.value.reduce((s, m) => s + m.cost, 0))

function fmtPct(cost: number): string {
  const p = totalCost.value ? (cost / totalCost.value) * 100 : 0
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
}

const centerTotal = {
  id: 'centerTotal',
  afterDraw(chart: any) {
    const { ctx, chartArea } = chart
    if (!chartArea) return
    const total = chart.data.datasets[0].data.reduce((a: number, b: number) => a + b, 0)
    const x = (chartArea.left + chartArea.right) / 2
    const y = (chartArea.top + chartArea.bottom) / 2
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#888'
    ctx.font = '600 18px sans-serif'
    ctx.fillText(fmtCost(total), x, y - 6)
    ctx.font = '11px sans-serif'
    ctx.fillText('total', x, y + 12)
    ctx.restore()
  },
}

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
      <Doughnut v-if="models.length" :data="chartData" :options="options" :plugins="[centerTotal]" />
      <div v-else class="flex items-center justify-center h-full text-sm" style="color: var(--text-tertiary);">No data</div>
    </div>
    <div class="flex flex-col justify-center gap-2 text-[12px] shrink-0 min-w-[190px]">
      <div v-for="(item, i) in pieItems" :key="item.name" class="flex items-center gap-2 w-full">
        <span class="size-2.5 rounded-full shrink-0" :style="{ background: COLORS[i % COLORS.length] }" />
        <span class="truncate max-w-[110px]" style="color: var(--text-secondary);">{{ item.name.replace('claude-', '') }}</span>
        <span class="ml-auto pl-3 font-mono text-[11px] tabular-nums whitespace-nowrap" style="color: var(--text-tertiary);">{{ fmtCost(item.cost) }} · {{ fmtPct(item.cost) }}</span>
      </div>
    </div>
  </div>
</template>
