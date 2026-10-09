<script setup lang="ts">
import { renderMarkdownWithHighlighting } from '~/utils/markdown'
import { diffLines, collapseUnchanged } from '~/utils/lineDiff'

const props = withDefaults(defineProps<{
  modelValue: string
  agentName?: string
  agentDescription?: string
  placeholder?: string
  /** Saved text to diff against. When provided, a Diff tab is shown. */
  original?: string
  /** Mode the editor opens in (read-first pages pass 'preview') */
  defaultMode?: 'edit' | 'preview'
}>(), {
  defaultMode: 'edit',
  agentName: '',
  agentDescription: '',
  placeholder: 'Write instructions...',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const mode = ref<'edit' | 'preview' | 'diff'>(props.defaultMode)
const modes = computed(() => (props.original !== undefined ? (['edit', 'preview', 'diff'] as const) : (['edit', 'preview'] as const)))
// Fall back if the Diff tab disappears (e.g. another editor reuses this component)
watch(modes, (list) => {
  if (!list.includes(mode.value as never)) mode.value = 'edit'
})

const diffRows = computed(() => {
  if (props.original === undefined || mode.value !== 'diff') return []
  return collapseUnchanged(diffLines(props.original, props.modelValue))
})
const diffStats = computed(() => {
  if (props.original === undefined) return { add: 0, del: 0 }
  let add = 0
  let del = 0
  for (const l of diffLines(props.original, props.modelValue)) {
    if (l.type === 'add') add++
    else if (l.type === 'del') del++
  }
  return { add, del }
})
const isImproving = ref(false)
const improveError = ref<string | null>(null)
const suggestion = ref<string | null>(null)

// Async rendering for syntax highlighting
const renderedHtml = ref('')

watchEffect(async () => {
  if (!props.modelValue.trim()) {
    renderedHtml.value = ''
    return
  }
  renderedHtml.value = await renderMarkdownWithHighlighting(props.modelValue)
})

const wordCount = computed(() => {
  const text = props.modelValue.trim()
  return text ? text.split(/\s+/).length : 0
})

// NOTE: The spec defines per-suggestion diff UI (original vs suggested).
// This initial implementation shows the full improved text as accept/dismiss.
// Per-suggestion granularity is deferred to a follow-up iteration.

async function improveInstructions() {
  isImproving.value = true
  improveError.value = null
  suggestion.value = null

  try {
    const response = await $fetch<{ suggestions: unknown[]; improvedInstructions: string }>('/api/agents/improve-instructions', {
      method: 'POST',
      body: {
        name: props.agentName,
        description: props.agentDescription,
        currentInstructions: props.modelValue,
      },
      timeout: 120000,
    })
    suggestion.value = response.improvedInstructions
  } catch (e: unknown) {
    improveError.value = e instanceof Error ? e.message : 'Failed to improve instructions'
  } finally {
    isImproving.value = false
  }
}

function acceptSuggestion() {
  if (suggestion.value) {
    emit('update:modelValue', suggestion.value)
    suggestion.value = null
  }
}

function dismissSuggestion() {
  suggestion.value = null
}
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <div class="shrink-0 flex items-center justify-between px-4 py-2 border-b" style="border-color: var(--border-subtle);">
      <div class="flex items-center gap-2">
        <div class="flex rounded-lg overflow-hidden" style="border: 1px solid var(--border-subtle);">
          <button
            v-for="m in modes"
            :key="m"
            class="px-2.5 py-1 text-[11px] font-medium capitalize transition-all"
            :style="{
              background: mode === m ? 'var(--accent-muted)' : 'transparent',
              color: mode === m ? 'var(--accent)' : 'var(--text-disabled)',
            }"
            @click="mode = m"
          >
            {{ m }}
            <span v-if="m === 'diff' && (diffStats.add || diffStats.del)" class="ml-1 font-mono">
              <span style="color: #22c55e;">+{{ diffStats.add }}</span>
              <span style="color: #ef4444;"> -{{ diffStats.del }}</span>
            </span>
          </button>
        </div>
        <span class="text-[11px] font-mono" style="color: var(--text-disabled);">{{ wordCount }} words</span>
      </div>
      <button
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
        :style="{
          background: isImproving ? 'var(--accent-muted)' : 'var(--surface-raised)',
          border: '1px solid ' + (isImproving ? 'rgba(229, 169, 62, 0.2)' : 'var(--border-subtle)'),
          color: isImproving ? 'var(--accent)' : 'var(--text-secondary)',
        }"
        :disabled="isImproving"
        @click="improveInstructions"
      >
        <UIcon :name="isImproving ? 'i-lucide-loader-2' : 'i-lucide-wand-2'" class="size-3" :class="{ 'animate-spin': isImproving }" />
        {{ isImproving ? 'Improving...' : 'Improve with Claude' }}
      </button>
    </div>

    <div
      v-if="suggestion"
      class="shrink-0 mx-4 mt-3 rounded-xl p-3 space-y-2"
      style="background: var(--accent-muted); border: 1px solid rgba(229, 169, 62, 0.15);"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sparkles" class="size-3.5" style="color: var(--accent);" />
        <span class="text-[12px] font-medium" style="color: var(--text-primary);">Suggested improvement</span>
      </div>
      <pre class="text-[12px] leading-relaxed whitespace-pre-wrap max-h-[150px] overflow-y-auto" style="color: var(--text-secondary); font-family: var(--font-mono);">{{ suggestion }}</pre>
      <div class="flex gap-2">
        <button class="px-3 py-1 rounded-lg text-[11px] font-medium transition-all" style="background: var(--accent); color: white;" @click="acceptSuggestion">Accept</button>
        <button class="px-3 py-1 rounded-lg text-[11px] font-medium transition-all hover-bg" style="color: var(--text-tertiary);" @click="dismissSuggestion">Dismiss</button>
      </div>
    </div>

    <div v-if="improveError" class="shrink-0 mx-4 mt-2 text-[11px] rounded-lg px-3 py-2" style="background: rgba(248, 113, 113, 0.06); color: var(--error);">{{ improveError }}</div>

    <!-- Edit mode -->
    <textarea
      v-if="mode === 'edit'"
      :value="modelValue"
      class="flex-1 min-h-0 w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none p-4"
      style="color: var(--text-primary); font-family: var(--font-mono);"
      :placeholder="placeholder"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />

    <!-- Diff mode -->
    <div v-else-if="mode === 'diff'" class="flex-1 min-h-0 overflow-auto py-2">
      <p v-if="!diffStats.add && !diffStats.del" class="p-4 text-[13px]" style="color: var(--text-disabled);">No changes since last save.</p>
      <div v-else class="font-mono text-[12px] leading-[1.6] min-w-fit">
        <template v-for="(row, i) in diffRows" :key="i">
          <div
            v-if="row.collapsed"
            class="px-4 py-0.5 text-[11px] select-none"
            style="color: var(--text-disabled); background: var(--surface-raised);"
          >
            ... {{ row.collapsed }} unchanged line{{ row.collapsed > 1 ? 's' : '' }}
          </div>
          <div
            v-else
            class="flex"
            :style="{
              background: row.type === 'add' ? 'rgba(34,197,94,0.12)' : row.type === 'del' ? 'rgba(239,68,68,0.12)' : 'transparent',
            }"
          >
            <span class="w-10 shrink-0 text-right pr-2 select-none" style="color: var(--text-disabled);">{{ row.oldNo ?? '' }}</span>
            <span class="w-10 shrink-0 text-right pr-2 select-none" style="color: var(--text-disabled);">{{ row.newNo ?? '' }}</span>
            <span
              class="w-4 shrink-0 select-none"
              :style="{ color: row.type === 'add' ? '#22c55e' : row.type === 'del' ? '#ef4444' : 'var(--text-disabled)' }"
            >{{ row.type === 'add' ? '+' : row.type === 'del' ? '-' : '' }}</span>
            <span class="whitespace-pre pr-4" style="color: var(--text-primary);">
              <template v-if="row.segments">
                <span
                  v-for="(seg, k) in row.segments"
                  :key="k"
                  class="rounded-[2px]"
                  :style="seg.changed ? { background: row.type === 'add' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)' } : undefined"
                >{{ seg.text }}</span>
              </template>
              <template v-else>{{ row.text }}</template>
            </span>
          </div>
        </template>
      </div>
    </div>

    <!-- Preview mode -->
    <div
      v-else
      class="flex-1 min-h-0 overflow-y-auto p-4 instruction-preview"
      style="color: var(--text-primary); font-family: var(--font-sans);"
    >
      <div
        v-if="renderedHtml"
        class="text-[13px] leading-[1.7]"
        v-html="renderedHtml"
      />
      <p v-else-if="!modelValue.trim()" class="text-[13px]" style="color: var(--text-disabled);">Nothing to preview yet.</p>
      <div v-else class="flex items-center justify-center h-20">
        <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" style="color: var(--text-tertiary);" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.instruction-preview {
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}
.instruction-preview :deep(h1) { font-size: 1.4em; font-weight: 700; margin: 0.8em 0 0.4em; color: var(--text-primary); font-family: var(--font-display); }
.instruction-preview :deep(h2) { font-size: 1.2em; font-weight: 600; margin: 0.7em 0 0.3em; color: var(--text-primary); font-family: var(--font-display); }
.instruction-preview :deep(h3) { font-size: 1.05em; font-weight: 600; margin: 0.6em 0 0.3em; color: var(--text-primary); }
.instruction-preview :deep(p) { margin: 0.5em 0; }
.instruction-preview :deep(ul), .instruction-preview :deep(ol) { padding-left: 1.5em; margin: 0.5em 0; }
.instruction-preview :deep(li) { margin: 0.25em 0; }
.instruction-preview :deep(code) { font-family: var(--font-mono); font-size: 0.9em; background: var(--badge-subtle-bg); padding: 0.15em 0.4em; border-radius: 4px; }
.instruction-preview :deep(pre) { background: var(--surface-base); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.75em 1em; overflow-x: auto; margin: 0.6em 0; }
.instruction-preview :deep(pre code) { background: none; padding: 0; font-size: 0.85em; }
.instruction-preview :deep(strong) { color: var(--text-primary); font-weight: 600; }
.instruction-preview :deep(blockquote) { border-left: 2px solid var(--accent); padding-left: 0.75em; margin: 0.5em 0; color: var(--text-secondary); }
.instruction-preview :deep(hr) { border: none; border-top: 1px solid var(--border-subtle); margin: 1em 0; }
.instruction-preview :deep(a) { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.instruction-preview :deep(table) { width: 100%; border-collapse: collapse; font-size: 0.9em; margin: 0.6em 0; }
.instruction-preview :deep(th), .instruction-preview :deep(td) { border: 1px solid var(--border-subtle); padding: 0.4em 0.6em; text-align: left; }
.instruction-preview :deep(th) { background: var(--surface-raised); font-weight: 600; }

/* Shiki styles */
.instruction-preview :deep(.shiki-wrapper) {
  position: relative;
  margin: 1rem 0;
  border-radius: 0.5rem;
  overflow: hidden;
  max-width: 100%;
  border: 1px solid var(--border-subtle);
}

.instruction-preview :deep(.shiki-wrapper[data-lang]:not([data-lang=''])::before) {
  content: attr(data-lang);
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  font-size: 0.65rem;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: rgba(205, 214, 244, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  pointer-events: none;
  z-index: 1;
}

.instruction-preview :deep(.shiki-wrapper pre) {
  margin: 0;
  padding: 1rem;
  border-radius: 0;
  border: none;
  overflow-x: auto;
  background: #1e1e2e !important; /* tokyo-night */
  white-space: pre-wrap;
  word-break: break-all;
}

.instruction-preview :deep(.shiki-wrapper pre code) {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.875em;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: break-word;
}

.instruction-preview :deep(.shiki-wrapper pre code span) {
  background: none !important;
  border: none !important;
  padding: 0 !important;
}
</style>
