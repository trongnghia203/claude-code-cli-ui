export interface ScheduleSpec {
  kind: 'hourly' | 'interval' | 'daily' | 'weekdays' | 'weekly'
  time?: string
  weekday?: number
  everyMinutes?: number
}

export interface ScheduleItem {
  id: string
  name: string
  enabled: boolean
  agent: string | null
  prompt: string
  workingDir: string
  model: string | null
  permissionMode: 'plan' | 'default' | 'acceptEdits'
  allowedTools: string[]
  disallowedTools: string[]
  maxBudgetUsd: number
  timeoutMinutes: number
  schedule: ScheduleSpec
  scheduleText: string
  nextRun: string | null
  registered: boolean
  lastRun: { id: string; status: RunStatus; startedAt: string; durationMs?: number; costUsd?: number } | null
}

export type RunStatus = 'running' | 'success' | 'error' | 'timeout'

export interface ScheduleRunItem {
  id: string
  jobId: string
  trigger: 'schedule' | 'manual'
  status: RunStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  costUsd?: number
  numTurns?: number
  sessionId?: string
  permissionDenials?: string[]
  command?: string
  result?: string
  preview?: string
  error?: string
  stderr?: string
}

export type ScheduleInput = Omit<ScheduleItem, 'id' | 'scheduleText' | 'nextRun' | 'registered' | 'lastRun'>

export function useSchedules() {
  const jobs = ref<ScheduleItem[]>([])
  const supported = ref(true)
  const loading = ref(false)
  const toast = useToast()

  const errorText = (e: any) => e?.data?.message || e?.message || 'Request failed'

  async function load() {
    loading.value = true
    try {
      const res = await $fetch<{ supported: boolean; jobs: ScheduleItem[] }>('/api/schedules')
      jobs.value = res.jobs
      supported.value = res.supported
    } catch (e) {
      toast.add({ title: 'Failed to load schedules', description: errorText(e), color: 'error' })
    } finally {
      loading.value = false
    }
  }

  /** Returns true on success; failures are shown as a toast. */
  async function save(input: ScheduleInput, id?: string): Promise<boolean> {
    try {
      await $fetch(id ? `/api/schedules/${id}` : '/api/schedules', { method: id ? 'PUT' : 'POST', body: input })
      await load()
      return true
    } catch (e) {
      toast.add({ title: 'Could not save schedule', description: errorText(e), color: 'error', duration: 8000 })
      await load()
      return false
    }
  }

  async function setEnabled(job: ScheduleItem, enabled: boolean) {
    try {
      await $fetch(`/api/schedules/${job.id}`, { method: 'PUT', body: { enabled } })
    } catch (e) {
      toast.add({ title: enabled ? 'Could not enable' : 'Could not disable', description: errorText(e), color: 'error', duration: 8000 })
    }
    await load()
  }

  async function remove(job: ScheduleItem) {
    try {
      await $fetch(`/api/schedules/${job.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      toast.add({ title: 'Could not delete', description: errorText(e), color: 'error' })
    }
  }

  async function runNow(job: ScheduleItem): Promise<string | null> {
    try {
      const res = await $fetch<{ runId: string }>(`/api/schedules/${job.id}/run`, { method: 'POST' })
      return res.runId
    } catch (e) {
      toast.add({ title: 'Could not start the run', description: errorText(e), color: 'error' })
      return null
    }
  }

  async function fetchRuns(job: ScheduleItem): Promise<ScheduleRunItem[]> {
    try {
      return (await $fetch<{ runs: ScheduleRunItem[] }>(`/api/schedules/${job.id}/runs`)).runs
    } catch {
      return []
    }
  }

  async function fetchRun(jobId: string, runId: string): Promise<ScheduleRunItem | null> {
    try {
      return (await $fetch<{ run: ScheduleRunItem }>(`/api/schedules/${jobId}/runs/${runId}`)).run
    } catch {
      return null
    }
  }

  return { jobs, supported, loading, load, save, setEnabled, remove, runNow, fetchRuns, fetchRun }
}
