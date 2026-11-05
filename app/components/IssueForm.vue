<script setup lang="ts">
import type { IssueInput, IssuePermissionMode, IssuePriority, IssueStatus } from '~/composables/useIssues'
import { ISSUE_PRIORITIES, ISSUE_PRIORITY_META, ISSUE_STATUS_META, ISSUE_STATUSES } from '~/composables/useIssues'

const props = defineProps<{ projectDir: string; projects?: { path: string; name: string }[]; agents: { slug: string; name: string }[]; busy?: boolean }>()
const emit = defineEmits<{
  save: [input: IssueInput, another: boolean]
  'agent-create': [prompt: string, another: boolean, draftAgent: string, projectDir: string]
  cancel: []
}>()

// The last used mode sticks, like Multica
const modeCookie = useCookie<'agent' | 'manual'>('issue-create-mode', { default: () => 'agent', maxAge: 60 * 60 * 24 * 365 })
const mode = computed({ get: () => modeCookie.value, set: (v) => { modeCookie.value = v } })

const draftAgentCookie = useCookie<string>('issue-draft-agent', { default: () => 'ops-engineer', maxAge: 60 * 60 * 24 * 365 })
const draftAgent = computed({
  get: () => props.agents.some(a => a.slug === draftAgentCookie.value) ? draftAgentCookie.value : (props.agents[0]?.slug ?? ''),
  set: (v) => { draftAgentCookie.value = v },
})
const request = ref('')
const hasSources = computed(() => /https?:\/\/\S+|\b(?!ISS-)[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/.test(request.value))
const title = ref('')
const description = ref('')
const status = ref<IssueStatus>('todo')
const priority = ref<IssuePriority>('none')
const assignee = ref('')
const permissionMode = ref<IssuePermissionMode>('acceptEdits')
const dir = ref(props.projectDir)
// The selected project first, then the others; a folder with no entry still shows by its last segment
const baseName = (d: string) => d.split('/').filter(Boolean).pop() || d
const projectChoices = computed(() => {
  const list = (props.projects ?? []).map(p => ({ path: p.path, name: p.name || baseName(p.path) }))
  if (dir.value && !list.some(p => p.path === dir.value)) list.unshift({ path: dir.value, name: baseName(dir.value) })
  return list
})
const ic = useIssueConfig()
const config = ic.config
const activeProperties = ic.activeProperties
const labelIds = ref<string[]>([])
const props_ = ref<Record<string, string | number | boolean>>({})
const toggleLabel = (id: string) => { labelIds.value = labelIds.value.includes(id) ? labelIds.value.filter(x => x !== id) : [...labelIds.value, id] }
const setProp = (id: string, v: string | number | boolean | null) => {
  const next = { ...props_.value }
  if (v === null) delete next[id]
  else next[id] = v
  props_.value = next
}
onMounted(() => { ic.load() })
const another = ref(false)

const willRun = computed(() => !!assignee.value && (status.value === 'todo' || status.value === 'in_progress'))
const canSubmit = computed(() => !props.busy && !!dir.value && (mode.value === 'agent' ? !!request.value.trim() : !!title.value.trim()))

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
  if (mode.value === 'agent') return emit('agent-create', request.value.trim(), another.value, draftAgent.value, dir.value)
  emit('save', {
    title: title.value.trim(),
    description: description.value,
    status: status.value,
    priority: priority.value,
    assignee: assignee.value || null,
    permissionMode: permissionMode.value,
    labels: labelIds.value,
    properties: props_.value,
    projectDir: dir.value,
  }, another.value)
}
</script>

<template>
  <form class="p-6 space-y-4 w-[600px] max-w-full" style="background: var(--surface-raised)" @submit.prevent="submit" @keydown.meta.enter.prevent="submit" @keydown.ctrl.enter.prevent="submit">
    <h3 class="text-page-title">{{ mode === 'agent' ? 'Create with agent' : 'New issue' }}</h3>

    <template v-if="mode === 'agent'">
      <textarea v-model="request" rows="6" autofocus :disabled="busy" class="w-full px-3 py-2 rounded-lg text-[14px]" style="background: var(--surface-base); border: 1px solid var(--border-subtle)"
        placeholder='Tell the agent what to do, e.g. "fix the session mismatch error, see SURI-249"' />
      <label class="field-group">
        <span class="field-label">Read sources with</span>
        <select v-model="draftAgent" class="field-select" :disabled="busy">
          <option v-for="a in agents" :key="a.slug" :value="a.slug">{{ a.name }}</option>
        </select>
      </label>
      <p class="text-[13px] leading-relaxed" :style="hasSources ? 'color: #3b82f6' : 'color: var(--text-secondary)'">
        <template v-if="hasSources">Link or ticket key found. The issue is filed now, then the agent reads it (read-only) and rewrites the text.</template>
        <template v-else>The agent writes the title and description. Add a link or Jira key and it reads them first.</template>
      </p>
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
        <div class="space-y-1 col-span-2"><span class="text-label">Labels</span>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="l in config.labels" :key="l.id" type="button" class="flex items-center gap-1.5 px-2 py-1 rounded-full text-[12px]"
              :style="{ background: 'var(--surface-base)', border: '1px solid ' + (labelIds.includes(l.id) ? l.color : 'var(--border-subtle)'), opacity: labelIds.includes(l.id) ? 1 : 0.65 }" @click="toggleLabel(l.id)">
              <span class="size-2 rounded-full" :style="{ background: l.color }" />{{ l.name }}
            </button>
            <NuxtLink v-if="!config.labels.length" to="/issues/settings?tab=labels" class="text-meta underline">No labels yet. Create some in issue settings.</NuxtLink>
          </div></div>
        <label v-for="p in activeProperties" :key="p.id" class="space-y-1"><span class="text-label">{{ p.name }}</span>
          <IssuePropertyField :property="p" :model-value="props_[p.id]" @update:model-value="setProp(p.id, $event)" /></label>
      </div>
      <p v-if="willRun" class="text-[12px]" style="color: #3b82f6">The agent starts working as soon as you create this issue.</p>
    </template>

    <label class="field-group">
      <span class="field-label">Project</span>
      <select v-model="dir" class="field-select" :disabled="busy" :title="dir">
        <option v-if="!dir" value="" disabled>Select a project</option>
        <option v-for="p in projectChoices" :key="p.path" :value="p.path">{{ p.name }}</option>
      </select>
      <span class="field-hint font-mono truncate" :title="dir">{{ dir }}</span>
    </label>

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
