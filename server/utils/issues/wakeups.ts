import { CLOSED_STATUSES, listIssues, newEntryId, readIssue, updateIssue, type Issue, type WakeRepeat } from './store'
import { DEFAULT_SUB_ISSUES_INSTRUCTION, readConfig } from './config'
import { isRunning, startRun } from './runner'

const isClosed = (i: Pick<Issue, 'status'>) => CLOSED_STATUSES.includes(i.status)

/**
 * Rule "when sub-issues finish": a user closed a sub-issue. If that was the last open one, wake the parent's agent.
 * Only user edits call this, never system moves, so a wakeup cannot start a loop.
 * Returns true when a run was started.
 */
export function onStatusChanged(childId: string, before: Issue['status']): boolean {
  const child = readIssue(childId)
  if (!child?.parentId || !isClosed(child) || CLOSED_STATUSES.includes(before)) return false
  const parent = readIssue(child.parentId)
  if (!parent || isClosed(parent) || !parent.assignee || isRunning(parent.id)) return false

  const rule = readConfig(parent.projectDir).wakeups.subIssuesFinish
  const override = parent.wakeups?.subIssuesFinish
  if (override ? override === 'off' : !rule.enabled) return false

  const children = listIssues().filter(i => i.parentId === parent.id).sort((a, b) => a.number - b.number)
  if (children.some(c => !isClosed(c))) return false

  const facts = children.map(c => `- ${c.id} ${c.title} (${c.status})`).join('\n')
  const instruction = `${rule.instruction.trim() || DEFAULT_SUB_ISSUES_INSTRUCTION}\n\nSub-issues:\n${facts}`
  return startRun(parent.id, 'Sub-issues closed', instruction) !== null
}

// ---- Timed wakeups ----

const DEFAULT_WAKE_INSTRUCTION =
  'This is a planned wakeup. Check the issue, continue the work, and finish with a short summary of what changed and what needs review.'
const LATE_AFTER_MS = 2 * 60_000
const MAX_HISTORY = 50

/** The next time after `now` for a repeating wakeup, keeping its time of day. Null for "once". */
export function nextAfter(at: string, repeat: WakeRepeat, now: Date): string | null {
  if (repeat === 'once') return null
  const d = new Date(at)
  if (repeat === 'hourly') {
    // Whole hours past `now`, in one step: a long stop never loops or fires once per missed hour
    const missed = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 3_600_000)) + 1
    return new Date(d.getTime() + missed * 3_600_000).toISOString()
  }
  let guard = 0
  do {
    d.setDate(d.getDate() + (repeat === 'weekly' ? 7 : 1))
    if (repeat === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  } while (d.getTime() <= now.getTime() && ++guard < 4000)
  return d.toISOString()
}

/** Fire one due wakeup. Returns false when it must wait (a run is active), so the next tick tries again. */
function fire(issueId: string, wakeId: string, now: Date): boolean {
  const issue = readIssue(issueId)
  const w = issue?.wakeups?.items?.find(x => x.id === wakeId)
  if (!issue || !w || !w.enabled) return true

  let outcome: 'started' | 'skipped' = 'skipped'
  let note = ''
  if (CLOSED_STATUSES.includes(issue.status)) note = 'Issue is closed'
  else if (isRunning(issue.id)) return false
  else if (!(w.agent || issue.assignee)) note = 'No agent: assign one to the issue or pick one for the wakeup'
  else {
    const late = now.getTime() - Date.parse(w.at) > LATE_AFTER_MS
    const instruction = `${w.instruction.trim() || DEFAULT_WAKE_INSTRUCTION}\n\nPlanned for ${w.at}${late ? ' (late: the app was not running then)' : ''}.`
    if (startRun(issue.id, 'Wakeup', instruction, w.agent) === null) return false
    outcome = 'started'
    note = late ? 'Run started, late: the app was not running at the planned time' : 'Run started'
  }

  updateIssue(issueId, (i) => {
    const item = i.wakeups?.items?.find(x => x.id === wakeId)
    if (!item) return
    const next = nextAfter(item.at, item.repeat, now)
    if (next) item.at = next
    else item.enabled = false // "once" is spent. It stays in the list so the history still points at it.
    i.wakeupHistory = [{ id: newEntryId(), wakeupId: wakeId, at: now.toISOString(), outcome, note }, ...(i.wakeupHistory ?? [])].slice(0, MAX_HISTORY)
  })
  return true
}

export function fireDueWakeups(now = new Date()) {
  for (const issue of listIssues()) {
    for (const w of issue.wakeups?.items ?? []) {
      if (w.enabled && Date.parse(w.at) <= now.getTime()) fire(issue.id, w.id, now)
    }
  }
}
