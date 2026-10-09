<script setup lang="ts">
import type { ScheduleInput, ScheduleItem, ScheduleSpec } from '~/composables/useSchedules'

const props = defineProps<{ job?: ScheduleItem; defaultDir?: string }>()
const emit = defineEmits<{ save: [input: ScheduleInput]; cancel: [] }>()

const { agents, fetchAll: fetchAgents } = useAgents()
const { options: modelOptions, load: loadModels } = useAvailableModels()
onMounted(() => {
  fetchAgents()
  loadModels()
})

const form = reactive({
  name: props.job?.name ?? '',
  agent: props.job?.agent ?? '',
  prompt: props.job?.prompt ?? '',
  workingDir: props.job?.workingDir ?? props.defaultDir ?? '',
  model: props.job?.model ?? '',
  permissionMode: props.job?.permissionMode ?? ('plan' as ScheduleInput['permissionMode']),
  allowedTools: (props.job?.allowedTools ?? []).join('\n'),
  disallowedTools: (props.job?.disallowedTools ?? []).join('\n'),
  maxBudgetUsd: props.job?.maxBudgetUsd ?? 1,
  timeoutMinutes: props.job?.timeoutMinutes ?? 30,
  enabled: props.job?.enabled ?? true,
  kind: (props.job?.schedule.kind ?? 'weekdays') as ScheduleSpec['kind'],
  time: props.job?.schedule.time ?? '09:00',
  weekday: props.job?.schedule.weekday ?? 1,
  everyMinutes: props.job?.schedule.everyMinutes ?? 60,
})

const kinds: { value: ScheduleSpec['kind']; label: string }[] = [
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'interval', label: 'Every N minutes' },
]
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const modes: { value: ScheduleInput['permissionMode']; label: string; hint: string }[] = [
  { value: 'plan', label: 'Plan (read-only)', hint: 'Claude can read and plan but changes nothing. Safest.' },
  { value: 'default', label: 'Only the allowed tools', hint: 'Nobody is there to approve prompts, so anything not in the allowed list is denied.' },
  { value: 'acceptEdits', label: 'Accept file edits', hint: 'Edits files in the project folder without asking. Use with care.' },
]
const modeHint = computed(() => modes.find(m => m.value === form.permissionMode)?.hint)

const selectedAgent = computed(() => agents.value.find(a => a.slug === form.agent))
function fillFromAgent() {
  const tools = selectedAgent.value?.frontmatter.tools as string[] | undefined
  if (tools?.length) form.allowedTools = tools.join('\n')
}

const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)
const error = ref('')

function submit() {
  error.value = ''
  if (!form.name.trim()) return (error.value = 'Give the schedule a name')
  if (!form.prompt.trim()) return (error.value = 'The prompt is empty')
  if (!form.workingDir.trim()) return (error.value = 'Pick a project folder')
  emit('save', {
    name: form.name.trim(),
    enabled: form.enabled,
    agent: form.agent || null,
    prompt: form.prompt,
    workingDir: form.workingDir.trim(),
    model: form.model || null,
    permissionMode: form.permissionMode,
    allowedTools: lines(form.allowedTools),
    disallowedTools: lines(form.disallowedTools),
    maxBudgetUsd: Number(form.maxBudgetUsd) || 1,
    timeoutMinutes: Number(form.timeoutMinutes) || 30,
    schedule: {
      kind: form.kind,
      ...(form.kind === 'interval' ? { everyMinutes: Number(form.everyMinutes) || 60 } : { time: form.time }),
      ...(form.kind === 'weekly' ? { weekday: Number(form.weekday) } : {}),
    },
  })
}
</script>

<template>
  <form class="p-6 space-y-4 bg-overlay w-[560px] max-w-full max-h-[calc(100dvh-4rem)] flex flex-col" @submit.prevent="submit">
    <h3 class="text-page-title shrink-0">{{ job ? 'Edit schedule' : 'New schedule' }}</h3>

    <div class="space-y-4 overflow-y-auto -mx-6 px-6 py-1.5 flex-1 min-h-0 custom-scrollbar">
      <div class="field-group">
        <label class="field-label" data-required>Name</label>
        <input v-model="form.name" class="field-input" placeholder="GC Lead Jira triage" />
      </div>

      <div class="field-group">
        <label class="field-label">Agent <span class="font-normal text-meta">(optional)</span></label>
        <select v-model="form.agent" class="field-select">
          <option value="">No agent, plain prompt</option>
          <option v-for="a in agents" :key="a.slug" :value="a.slug">{{ a.frontmatter.name }}</option>
        </select>
        <span class="field-hint">Runs the whole session as this agent, with its instructions and tool list.</span>
      </div>

      <div class="field-group">
        <label class="field-label" data-required>Prompt</label>
        <textarea v-model="form.prompt" rows="4" class="field-textarea" placeholder="What should Claude do on each run?" />
      </div>

      <div class="field-group">
        <label class="field-label" data-required>Project folder</label>
        <input v-model="form.workingDir" class="field-input font-mono" placeholder="/Users/you/project" />
        <span class="field-hint">Claude runs in this folder, so it reads that project's CLAUDE.md and settings.</span>
      </div>

      <div class="field-group">
        <label class="field-label">When</label>
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="form.kind" class="field-select w-auto">
            <option v-for="k in kinds" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select>
          <select v-if="form.kind === 'weekly'" v-model.number="form.weekday" class="field-select w-auto">
            <option v-for="(d, i) in weekdays" :key="d" :value="i">{{ d }}</option>
          </select>
          <input v-if="form.kind === 'interval'" v-model.number="form.everyMinutes" type="number" min="1" class="field-input w-24" />
          <span v-if="form.kind === 'interval'" class="text-[12px] text-label">minutes</span>
          <input v-else v-model="form.time" type="time" class="field-input w-32" />
          <span v-if="form.kind === 'hourly'" class="text-[12px] text-label">(minute of the hour is used)</span>
        </div>
      </div>

      <div class="field-group">
        <label class="field-label">Permissions</label>
        <select v-model="form.permissionMode" class="field-select">
          <option v-for="m in modes" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
        <span class="field-hint">{{ modeHint }}</span>
      </div>

      <div class="field-group">
        <div class="flex items-center justify-between">
          <label class="field-label">Allowed tools <span class="font-normal text-meta">(one per line)</span></label>
          <button v-if="selectedAgent?.frontmatter.tools?.length" type="button" class="text-[11px] hover:underline" style="color: var(--accent)" @click="fillFromAgent">
            Fill from agent
          </button>
        </div>
        <textarea v-model="form.allowedTools" rows="4" class="field-textarea font-mono text-[12px]" placeholder="Read&#10;Write(~/notes/*.md)&#10;mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql" />
        <span class="field-hint">Approved without asking. A path in brackets limits where Write or Edit may act.</span>
      </div>

      <div class="field-group">
        <label class="field-label">Denied tools <span class="font-normal text-meta">(one per line)</span></label>
        <textarea v-model="form.disallowedTools" rows="3" class="field-textarea font-mono text-[12px]" placeholder="mcp__claude_ai_Atlassian__transitionJiraIssue" />
        <span class="field-hint">Always blocked, even if the agent asks for them.</span>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="field-group">
          <label class="field-label">Model</label>
          <select v-model="form.model" class="field-select">
            <option value="">Default</option>
            <option v-for="m in modelOptions.filter(o => o.value)" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label">Budget (USD)</label>
          <input v-model.number="form.maxBudgetUsd" type="number" min="0.1" step="0.5" class="field-input" />
        </div>
        <div class="field-group">
          <label class="field-label">Timeout (min)</label>
          <input v-model.number="form.timeoutMinutes" type="number" min="1" class="field-input" />
        </div>
      </div>

      <label class="flex items-center gap-3">
        <span class="field-toggle">
          <input v-model="form.enabled" type="checkbox" />
          <span class="field-toggle__track"><span class="field-toggle__thumb" /></span>
        </span>
        <span class="text-[13px]">Enabled (runs on schedule)</span>
      </label>
    </div>

    <p v-if="error" class="text-[12px] shrink-0" style="color: var(--error)">{{ error }}</p>
    <div class="flex justify-end gap-2 shrink-0">
      <UButton label="Cancel" variant="ghost" color="neutral" size="sm" type="button" @click="emit('cancel')" />
      <UButton :label="job ? 'Save' : 'Create'" size="sm" type="submit" />
    </div>
  </form>
</template>

<style scoped>
.bg-overlay { background: var(--surface-raised); }
</style>
