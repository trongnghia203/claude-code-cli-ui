<script setup lang="ts">
import type { IssueWakeup, WakeRepeat, WakeupInput } from '~/composables/useIssues'
import { WAKE_REPEAT_LABEL } from '~/composables/useIssues'
import { ymd } from '~/composables/useIssueView'

/** Add or edit a timed wakeup: when, which agent, how often, what to tell it. */
const props = defineProps<{ wakeup: IssueWakeup | null; assignee: string | null; agents: { slug: string; name: string }[]; busy?: boolean }>()
const emit = defineEmits<{ save: [input: WakeupInput]; remove: []; cancel: [] }>()

const pad = (n: number) => String(n).padStart(2, '0')
const initial = () => {
  if (props.wakeup) { const d = new Date(props.wakeup.at); return { date: ymd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` } }
  const d = new Date(Date.now() + 3_600_000) // next hour
  return { date: ymd(d), time: `${pad(d.getHours())}:00` }
}
const start = initial()
const date = ref<string | null>(start.date)
const time = ref(start.time)
const agent = ref(props.wakeup?.agent ?? '')
const repeat = ref<WakeRepeat>(props.wakeup?.repeat ?? 'once')
const instruction = ref(props.wakeup?.instruction ?? '')

const at = computed(() => (date.value && /^\d{2}:\d{2}$/.test(time.value) ? new Date(`${date.value}T${time.value}:00`) : null))
// A time in the past is fine only while editing a wakeup that keeps its old time
const past = computed(() => !!at.value && at.value.getTime() < Date.now() - 60_000 && !(props.wakeup && at.value.toISOString() === props.wakeup.at))
const assigneeName = computed(() => props.agents.find(a => a.slug === props.assignee)?.name ?? props.assignee)
const noAgent = computed(() => !agent.value && !props.assignee)
const valid = computed(() => !!at.value && !past.value && !props.busy)

function submit() {
  if (!valid.value || !at.value) return
  emit('save', { at: at.value.toISOString(), agent: agent.value || null, repeat: repeat.value, instruction: instruction.value })
}
const field = 'background: var(--surface-base); border: 1px solid var(--border-subtle)'
</script>

<template>
  <form class="p-6 space-y-4 w-[460px] max-w-full" style="background: var(--surface-raised)" @submit.prevent="submit">
    <div>
      <h3 class="text-page-title">{{ wakeup ? 'Edit wakeup' : 'New wakeup' }}</h3>
      <p class="text-[12px] text-label">Runs an agent on this issue at a set time. Only while the app is running.</p>
    </div>
    <div class="grid grid-cols-[90px_1fr] gap-x-4 gap-y-3 items-center text-[13px]">
      <span class="text-label">When</span>
      <div class="flex items-center gap-2"><DatePicker v-model="date" :clearable="false" placeholder="Pick a date" />
        <input v-model="time" type="time" class="px-2 py-1 rounded-md text-[12px]" :style="field" /></div>
      <span class="text-label">Agent</span>
      <select v-model="agent" class="w-full px-2 py-1.5 rounded-lg text-[13px]" :style="field">
        <option value="">{{ assigneeName ? `Assignee (${assigneeName})` : 'Assignee (none yet)' }}</option>
        <option v-for="a in agents" :key="a.slug" :value="a.slug">{{ a.name }}</option>
      </select>
      <span class="text-label">Repeat</span>
      <select v-model="repeat" class="w-full px-2 py-1.5 rounded-lg text-[13px]" :style="field"><option v-for="(label, r) in WAKE_REPEAT_LABEL" :key="r" :value="r">{{ label }}</option></select>
      <span class="text-label self-start pt-1.5">Instruction</span>
      <textarea v-model="instruction" rows="3" maxlength="2000" spellcheck="false" placeholder="Optional. Empty uses: check the issue, continue the work, summarize." class="w-full px-3 py-2 rounded-lg text-[13px]" :style="field" />
    </div>
    <p v-if="past" class="text-[12px]" style="color: #ef4444">Pick a time in the future.</p>
    <p v-else-if="noAgent" class="text-[12px]" style="color: #d97706">No agent yet. Assign one to the issue or pick one here, or the wakeup will be skipped.</p>
    <div class="flex items-center gap-2 pt-1">
      <UButton v-if="wakeup" type="button" label="Delete" color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" @click="emit('remove')" />
      <div class="flex-1" />
      <UButton type="button" label="Cancel" variant="ghost" color="neutral" size="sm" @click="emit('cancel')" />
      <UButton type="submit" :label="wakeup ? 'Save' : 'Add wakeup'" size="sm" :disabled="!valid" :loading="busy" />
    </div>
  </form>
</template>
