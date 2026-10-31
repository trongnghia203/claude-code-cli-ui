export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'cancelled'
export type IssuePriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'
export type IssuePermissionMode = 'plan' | 'default' | 'acceptEdits'
export type IssueRunStatus = 'running' | 'success' | 'error' | 'timeout' | 'cancelled'

export interface IssueRun {
  id: string
  agent: string | null
  status: IssueRunStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  sessionId?: string
  costUsd?: number
  numTurns?: number
  permissionDenials?: string[]
  result?: string
  error?: string
}

export type TimelineEntry =
  | { id: string; at: string; type: 'comment'; author: 'user' | 'agent'; body: string }
  | { id: string; at: string; type: 'status'; from: IssueStatus | null; to: IssueStatus; by: 'user' | 'system' }
  | { id: string; at: string; type: 'assign'; from: string | null; to: string | null }
  | { id: string; at: string; type: 'run'; runId: string }

export interface IssueSummary {
  id: string
  number: number
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  assignee: string | null
  labels: string[]
  parentId: string | null
  projectDir: string
  permissionMode: IssuePermissionMode
  createdAt: string
  updatedAt: string
  commentCount: number
  runCount: number
  running: boolean
  lastRun: { status: IssueRunStatus; startedAt: string } | null
}

export interface IssueDetail extends Omit<IssueSummary, 'commentCount' | 'runCount' | 'running' | 'lastRun'> {
  timeline: TimelineEntry[]
  runs: IssueRun[]
}

export type IssueInput = Partial<Pick<IssueDetail, 'title' | 'description' | 'status' | 'priority' | 'assignee' | 'labels' | 'parentId' | 'projectDir' | 'permissionMode'>>

export const ISSUE_STATUS_META: Record<IssueStatus, { label: string; color: string; icon: string }> = {
  backlog: { label: 'Backlog', color: '#71717a', icon: 'i-lucide-circle-dashed' },
  todo: { label: 'Todo', color: '#a1a1aa', icon: 'i-lucide-circle' },
  in_progress: { label: 'In progress', color: '#3b82f6', icon: 'i-lucide-loader-circle' },
  in_review: { label: 'In review', color: '#a855f7', icon: 'i-lucide-eye' },
  blocked: { label: 'Blocked', color: '#ef4444', icon: 'i-lucide-octagon-alert' },
  done: { label: 'Done', color: '#22c55e', icon: 'i-lucide-circle-check' },
  cancelled: { label: 'Cancelled', color: '#52525b', icon: 'i-lucide-circle-x' },
}
export const ISSUE_STATUSES = Object.keys(ISSUE_STATUS_META) as IssueStatus[]

export const ISSUE_PRIORITY_META: Record<IssuePriority, { label: string; color: string; rank: number }> = {
  urgent: { label: 'Urgent', color: '#ef4444', rank: 0 },
  high: { label: 'High', color: '#f97316', rank: 1 },
  medium: { label: 'Medium', color: '#eab308', rank: 2 },
  low: { label: 'Low', color: '#3b82f6', rank: 3 },
  none: { label: 'No priority', color: '#71717a', rank: 4 },
}
export const ISSUE_PRIORITIES = Object.keys(ISSUE_PRIORITY_META) as IssuePriority[]

export const ISSUE_RUN_META: Record<IssueRunStatus, { label: string; color: string; icon: string }> = {
  running: { label: 'Running', color: '#3b82f6', icon: 'i-lucide-loader-2' },
  success: { label: 'Success', color: '#22c55e', icon: 'i-lucide-check-circle-2' },
  error: { label: 'Failed', color: '#ef4444', icon: 'i-lucide-x-circle' },
  timeout: { label: 'Timed out', color: '#d97706', icon: 'i-lucide-timer-off' },
  cancelled: { label: 'Cancelled', color: '#71717a', icon: 'i-lucide-ban' },
}

export function useIssues() {
  const issues = ref<IssueSummary[]>([])
  const loading = ref(false)
  const toast = useToast()
  const errorText = (e: any) => e?.data?.message || e?.message || 'Request failed'
  const fail = (e: any) => { toast.add({ title: errorText(e), color: 'error', duration: 4000 }); return null }

  async function load(opts: { workingDir?: string; all?: boolean } = {}) {
    loading.value = true
    try {
      const res = await $fetch<{ issues: IssueSummary[] }>('/api/issues', {
        query: { workingDir: opts.workingDir || undefined, all: opts.all ? '1' : undefined },
      })
      issues.value = res.issues
    } catch (e) { fail(e) } finally { loading.value = false }
  }

  async function create(input: IssueInput): Promise<IssueDetail | null> {
    try { return (await $fetch<{ issue: IssueDetail }>('/api/issues', { method: 'POST', body: input })).issue } catch (e) { return fail(e) }
  }
  async function fetchOne(id: string): Promise<{ issue: IssueDetail; running: boolean } | null> {
    try { return await $fetch(`/api/issues/${id}`) } catch (e) { return fail(e) }
  }
  async function update(id: string, input: IssueInput): Promise<IssueDetail | null> {
    try { return (await $fetch<{ issue: IssueDetail }>(`/api/issues/${id}`, { method: 'PUT', body: input })).issue } catch (e) { return fail(e) }
  }
  async function remove(id: string): Promise<boolean> {
    try { await $fetch(`/api/issues/${id}`, { method: 'DELETE' }); return true } catch (e) { fail(e); return false }
  }
  async function comment(id: string, body: string, run = false): Promise<IssueDetail | null> {
    try { return (await $fetch<{ issue: IssueDetail }>(`/api/issues/${id}/comments`, { method: 'POST', body: { body, run } })).issue } catch (e) { return fail(e) }
  }
  async function run(id: string): Promise<boolean> {
    try { await $fetch(`/api/issues/${id}/run`, { method: 'POST' }); return true } catch (e) { fail(e); return false }
  }
  async function cancel(id: string): Promise<boolean> {
    try { await $fetch(`/api/issues/${id}/cancel`, { method: 'POST' }); return true } catch (e) { fail(e); return false }
  }

  return { issues, loading, load, create, fetchOne, update, remove, comment, run, cancel }
}
