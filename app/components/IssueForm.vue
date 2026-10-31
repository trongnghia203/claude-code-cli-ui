<script setup lang="ts">
import type { IssueInput, IssuePermissionMode, IssuePriority, IssueStatus } from '~/composables/useIssues'
import { ISSUE_PRIORITIES, ISSUE_PRIORITY_META, ISSUE_STATUS_META, ISSUE_STATUSES } from '~/composables/useIssues'

const props = defineProps<{ projectDir: string; agents: { slug: string; name: string }[]; busy?: boolean }>()
const emit = defineEmits<{
  save: [input: IssueInput, another: boolean]
  'agent-create': [prompt: string, another: boolean]
  cancel: []
}>()

// The last used mode sticks, like Multica
const modeCookie = useCookie<'agent' | 'manual'>('issue-create-mode', { default: () => 'agent', maxAge: 60 * 60 * 24 * 365 })
const mode = computed({ get: () => modeCookie.value, set: (v) => { modeCookie.value = v } })

const request = ref('')
const title = ref('')
const description = ref('')
const status = ref<IssueStatus>('todo')
const priority = ref<IssuePriority>('none')
const assignee = ref('')
const permissionMode = ref<IssuePermissionMode>('acceptEdits')
const labels = ref('')
const another = ref(false)

const willRun = computed(() => !!assignee.value && (status.value === 'todo' || status.value === 'in_progress'))
const canSubmit = computed(() => !props.busy && (mode.value === 'agent' ? !!request.value.trim() : !!title.value.trim()))

function toManual() {
  // Keep what was typed: a failed or unwanted agent request becomes the title
  if (!title.value.trim() && request.value.trim()) title.value = request.value.trim().split('\n')[0]!.slice(0, 200)
  if (!description.value.trim() && request.value.trim().includes('\n')) description.value = request.value.trim()
  mode.value = 'manual'
}
function toAgent() {
  if (!request.value.trim()) request.value = [title.value, description.value].filter(s => s.trim()).join('\n\n')
  mode.value = 'agent'
}

function submit() {
  if (!canSubmit.value) return
  if (mode.value === 'agent') return emit('agent-create', request.value.trim(), another.value)
  emit('save', {
    title: title.value.trim(),
    description: description.value,
    status: status.value,
    priority: priority.value,
    assignee: assignee.value || null,
    permissionMode: permissionMode.value,
    labels: labels.value.split(',').map(l => l.trim()).filter(Boolean),
    projectDir: props.projectDir,
  }, another.value)
}
</script>

<template>
  <form class="p-6 space-y-4 w-[600px] max-w-full" style="background: var(--surface-raised)" @submit.prevent="submit" @keydown.meta.enter.prevent="submit" @keydown.ctrl.enter.prevent="submit">
    <h3 class="text-page-title">{{ mode === 'agent' ? 'Create with agent' : 'New issue' }}</h3>

    <template v-if="mode === 'agent'">
      <textarea v-model="request" rows="6" autofocus :disabled="busy" class="w-full px-3 py-2 rounded-lg text-[14px]" style="background: var(--surface-base); border: 1px solid var(--border-subtle)"
        placeholder='Tell the agent what to do, e.g. "let code-reviewer fix the slow inbox loading in the web app"' />
      <p class="text-[12px] text-label">The agent writes the title and description, picks an agent if you name one, and starts working after creation.</p>
    </template>

    <template v-else>
      <input v-model="title" class="w-full px-3 py-2 rounded-lg text-[14px] font-medium" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" placeholder="Issue title" autofocus />
      <textarea v-model="description" rows="6" class="w-full px-3 py-2 rounded-lg text-[13px] font-mono" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" placeholder="Goal, background, requirements, acceptance criteria (markdown)" />
      <div class="grid grid-cols-2 gap-3 text-[12px]">
        <label class="space-y-1"><span class="text-label">Status</span>
          <select v-model="status" class="w-full px-2 py-1.5 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)">
            <option v-for="s in ISSUE_STATUSES" :key="s" :value="s">{{ ISSUE_STATUS_META[s].label }}</option>
          </select></label>
        <label class="space-y-1"><span class="text-label">Priority</span>
          <select v-model="priority" class="w-full px-2 py-1.5 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)">
            <option v-for="p in ISSUE_PRIORITIES" :key="p" :value="p">{{ ISSUE_PRIORITY_META[p].label }}</option>
          </select></label>
        <label class="space-y-1"><span class="text-label">Assignee</span>
          <select v-model="assignee" class="w-full px-2 py-1.5 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)">
            <option value="">Me (no agent run)</option>
            <option v-for="a in agents" :key="a.slug" :value="a.slug">{{ a.name }}</option>
          </select></label>
        <label class="space-y-1"><span class="text-label">Agent permissions</span>
          <select v-model="permissionMode" class="w-full px-2 py-1.5 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)">
            <option value="plan">Plan only (no edits)</option>
            <option value="default">Default (asks, edits blocked headless)</option>
            <option value="acceptEdits">Accept edits</option>
          </select></label>
        <label class="space-y-1 col-span-2"><span class="text-label">Labels (comma separated)</span>
          <input v-model="labels" class="w-full px-2 py-1.5 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" placeholder="bug, ui" /></label>
      </div>
      <p v-if="willRun" class="text-[12px]" style="color: #3b82f6">The agent starts working as soon as you create this issue.</p>
    </template>

    <p class="flex items-center gap-1.5 text-[11px] text-meta font-mono truncate"><UIcon name="i-lucide-folder" class="size-3.5 shrink-0" />{{ projectDir }}</p>

    <div class="flex items-center gap-3 pt-1" style="border-top: 1px solid var(--border-subtle)">
      <button type="button" class="flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-lg text-[12px] font-medium hover-bg" :disabled="busy"
        :title="mode === 'agent' ? 'Fill in the fields yourself' : 'Describe in one line and let the agent file it'" @click="mode === 'agent' ? toManual() : toAgent()">
        <UIcon name="i-lucide-arrow-left-right" class="size-3.5" /> {{ mode === 'agent' ? 'Switch to Manual' : 'Switch to Agent' }}
      </button>
      <div class="flex-1" />
      <label class="flex items-center gap-2 mt-3 text-[12px] text-label cursor-pointer">
        <span class="field-toggle scale-90"><input v-model="another" type="checkbox" /><span class="field-toggle__track"><span class="field-toggle__thumb" /></span></span>
        Create another
      </label>
      <UButton type="button" label="Cancel" variant="ghost" color="neutral" size="sm" class="mt-3" :disabled="busy" @click="emit('cancel')" />
      <UButton type="submit" size="sm" class="mt-3" :loading="busy" :disabled="!canSubmit"
        :label="busy ? 'Filing...' : mode === 'manual' && willRun ? 'Create and run' : 'Create'" />
    </div>
  </form>
</template>
