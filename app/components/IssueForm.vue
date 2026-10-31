<script setup lang="ts">
import type { IssueInput, IssuePermissionMode, IssuePriority, IssueStatus } from '~/composables/useIssues'
import { ISSUE_PRIORITIES, ISSUE_PRIORITY_META, ISSUE_STATUS_META, ISSUE_STATUSES } from '~/composables/useIssues'

const props = defineProps<{ projectDir: string; agents: { slug: string; name: string }[] }>()
const emit = defineEmits<{ save: [IssueInput]; cancel: [] }>()

const title = ref('')
const description = ref('')
const status = ref<IssueStatus>('todo')
const priority = ref<IssuePriority>('none')
const assignee = ref('')
const permissionMode = ref<IssuePermissionMode>('acceptEdits')
const labels = ref('')

const willRun = computed(() => !!assignee.value && (status.value === 'todo' || status.value === 'in_progress'))

function submit() {
  if (!title.value.trim()) return
  emit('save', {
    title: title.value.trim(),
    description: description.value,
    status: status.value,
    priority: priority.value,
    assignee: assignee.value || null,
    permissionMode: permissionMode.value,
    labels: labels.value.split(',').map(l => l.trim()).filter(Boolean),
    projectDir: props.projectDir,
  })
}
</script>

<template>
  <form class="p-6 space-y-4 w-[560px] max-w-full" style="background: var(--surface-raised)" @submit.prevent="submit">
    <h3 class="text-page-title">New issue</h3>
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
    <p class="text-[11px] text-meta font-mono truncate">{{ projectDir }}</p>
    <p v-if="willRun" class="text-[12px]" style="color: #3b82f6">The agent starts working as soon as you create this issue.</p>
    <div class="flex justify-end gap-2">
      <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="emit('cancel')" />
      <UButton type="submit" :label="willRun ? 'Create and run' : 'Create'" size="sm" :disabled="!title.trim()" />
    </div>
  </form>
</template>
