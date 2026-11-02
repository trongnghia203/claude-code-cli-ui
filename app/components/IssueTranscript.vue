<script setup lang="ts">
import { renderMarkdown } from '~/utils/markdown'
import { linkify } from '~/utils/linkify'

interface Item { kind: 'prompt' | 'text' | 'tool' | 'tool_result' | 'result'; text?: string; id?: string; name?: string; input?: any; isError?: boolean }

const props = defineProps<{ issueId: string; runId: string; live: boolean }>()
const items = ref<Item[]>([])
const loaded = ref(false)

async function load() {
  try { items.value = (await $fetch<{ items: Item[] }>(`/api/issues/${props.issueId}/runs/${props.runId}/transcript`)).items } catch { /* keep what we have */ }
  loaded.value = true
}
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { load(); if (props.live) timer = setInterval(load, 3000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

// What the agent was given: the issue text and the discussion at the time of the run
const context = computed(() => items.value.find(i => i.kind === 'prompt')?.text ?? '')
const tools = computed(() => items.value.filter(i => i.kind === 'tool'))
const detail = (i: any) => String(i?.command ?? i?.file_path ?? i?.path ?? i?.url ?? i?.pattern ?? i?.description ?? JSON.stringify(i ?? {})).slice(0, 300)
</script>

<template>
  <div class="mt-2 space-y-2 text-[12px]">
    <p v-if="loaded && !context" class="text-meta">No context saved for this run.</p>
    <div v-if="context" class="rounded-lg p-3 max-h-[420px] overflow-y-auto custom-scrollbar" style="background: var(--surface-base); border: 1px solid var(--border-subtle)">
      <div class="text-[11px] text-meta mb-1.5">Context the agent received</div>
      <div class="md-prose issue-prose" v-html="renderMarkdown(linkify(context))" />
    </div>
    <details v-if="tools.length" class="px-1">
      <summary class="cursor-pointer text-label">{{ tools.length }} tool {{ tools.length === 1 ? 'call' : 'calls' }}</summary>
      <ul class="mt-1.5 space-y-1 font-mono text-[11px] text-label">
        <li v-for="(t, n) in tools" :key="n" class="flex items-start gap-1.5"><UIcon name="i-lucide-wrench" class="size-3.5 mt-0.5 shrink-0" /><span class="break-all"><b>{{ t.name }}</b> {{ detail(t.input) }}</span></li>
      </ul>
    </details>
  </div>
</template>
