<script setup lang="ts">
// One popup for the whole app. Any `a.md-file[data-path]` (made by utils/linkify) opens it on click.
import { renderMarkdown } from '~/utils/markdown'
import { linkify } from '~/utils/linkify'

const open = ref(false)
const view = ref({ path: '', html: '', error: '', loading: false })

async function show(path: string) {
  view.value = { path, html: '', error: '', loading: true }
  open.value = true
  try {
    const r = await $fetch<{ path: string; content: string }>('/api/local-md', { query: { path } })
    view.value = { path: r.path, html: renderMarkdown(linkify(r.content)), error: '', loading: false }
  } catch (err: any) {
    view.value = { path, html: '', error: err?.data?.message || err?.statusMessage || 'Could not read file', loading: false }
  }
}

function onClick(e: MouseEvent) {
  const a = (e.target as HTMLElement | null)?.closest?.('a.md-file') as HTMLAnchorElement | null
  if (!a?.dataset.path) return
  e.preventDefault()
  show(a.dataset.path)
}
onMounted(() => document.addEventListener('click', onClick))
onBeforeUnmount(() => document.removeEventListener('click', onClick))
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'w-[95vw] max-w-[1400px]' }">
    <template #content>
      <div class="flex flex-col max-h-[85vh]">
        <div class="shrink-0 flex items-center gap-2 px-5 py-3" style="border-bottom: 1px solid var(--border-subtle)">
          <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-meta" />
          <span class="text-[12px] font-mono truncate flex-1" :title="view.path">{{ view.path }}</span>
          <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="() => { open = false }" />
        </div>
        <div class="min-h-0 overflow-y-auto custom-scrollbar px-5 py-4">
          <UIcon v-if="view.loading" name="i-lucide-loader-2" class="size-5 animate-spin text-meta" />
          <p v-else-if="view.error" class="text-[13px]" style="color: #ef4444">{{ view.error }}</p>
          <div v-else class="md-prose issue-prose" v-html="view.html" />
        </div>
      </div>
    </template>
  </UModal>
</template>
