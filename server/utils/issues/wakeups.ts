import { CLOSED_STATUSES, listIssues, readIssue, type Issue } from './store'
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
