import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readIssue, updateIssue, setStatus, newEntryId, type Issue, type IssueRun } from './store'

const TIMEOUT_MS = 30 * 60_000
const BUDGET_USD = 5
const MAX_RESULT_CHARS = 20_000

const active = new Map<string, { child: ChildProcess; runId: string; cancelled: boolean }>()

export const isRunning = (issueId: string) => active.has(issueId)

/** A run record left as "running" by a server that stopped: nothing in memory owns it any more. */
export function reapStaleRuns(issue: Issue): Issue {
  if (active.has(issue.id) || !issue.runs.some(r => r.status === 'running')) return issue
  return updateIssue(issue.id, (i) => {
    for (const r of i.runs) {
      if (r.status === 'running') {
        r.status = 'error'
        r.error = 'Server restarted during the run'
        r.finishedAt = new Date().toISOString()
      }
    }
    if (i.status === 'in_progress') setStatus(i, 'todo', 'system')
  }) ?? issue
}

export function buildPrompt(issue: Issue): string {
  const parts = [
    `You are working on issue ${issue.id}: ${issue.title}`,
    issue.description.trim() ? `\n## Description\n${issue.description.trim()}` : '',
  ]
  const comments = issue.timeline.filter(e => e.type === 'comment')
  if (comments.length) {
    parts.push('\n## Discussion')
    for (const c of comments) if (c.type === 'comment') parts.push(`**${c.author}** (${c.at}):\n${c.body}`)
  }
  parts.push('\nDo the work in the current directory. When done, finish with a short summary of what you changed and anything that needs review.')
  return parts.filter(Boolean).join('\n')
}

/** Start a run for the issue. Returns the run id, or null when one is already active. */
export function startRun(issueId: string): string | null {
  if (active.has(issueId)) return null
  const issue = readIssue(issueId)
  if (!issue) return null

  const runId = newEntryId()
  const startedAt = new Date()
  const run: IssueRun = { id: runId, agent: issue.assignee, status: 'running', startedAt: startedAt.toISOString() }

  const prompt = buildPrompt(issue)
  updateIssue(issueId, (i) => {
    i.runs.push(run)
    i.timeline.push({ id: newEntryId(), at: run.startedAt, type: 'run', runId })
    setStatus(i, 'in_progress', 'system')
  })

  const finish = (patch: Partial<IssueRun>, nextStatus: 'in_review' | 'todo', comment?: string) => {
    const entry = active.get(issueId)
    active.delete(issueId)
    const finishedAt = new Date()
    updateIssue(issueId, (i) => {
      const r = i.runs.find(x => x.id === runId)
      if (r) Object.assign(r, patch, { finishedAt: finishedAt.toISOString(), durationMs: finishedAt.getTime() - startedAt.getTime() })
      // A user who moved the issue elsewhere during the run keeps their choice
      if (i.status === 'in_progress') setStatus(i, entry?.cancelled ? 'todo' : nextStatus, 'system')
      if (comment) i.timeline.push({ id: newEntryId(), at: finishedAt.toISOString(), type: 'comment', author: 'agent', body: comment })
    })
  }

  if (!existsSync(issue.projectDir)) {
    finish({ status: 'error', error: `Project folder not found: ${issue.projectDir}` }, 'todo')
    return runId
  }

  const args = ['-p', '--output-format', 'json', '--permission-mode', issue.permissionMode || 'acceptEdits', '--max-budget-usd', String(BUDGET_USD)]
  if (issue.assignee) args.push('--agent', issue.assignee)

  let stdout = ''
  let stderr = ''
  let timedOut = false
  const child = spawn('claude', args, { cwd: issue.projectDir, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })
  active.set(issueId, { child, runId, cancelled: false })
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, TIMEOUT_MS)
  child.stdout.on('data', d => { stdout += d })
  child.stderr.on('data', d => { stderr += d })
  child.stdin.on('error', () => { /* child exited before reading the prompt */ })
  child.stdin.end(prompt)

  child.on('error', (e) => {
    clearTimeout(timer)
    finish({ status: 'error', error: `Could not start claude: ${e.message}` }, 'todo')
  })
  child.on('close', (code) => {
    clearTimeout(timer)
    if (!active.has(issueId)) return // already finished by the error handler
    const cancelled = active.get(issueId)!.cancelled
    if (cancelled) return finish({ status: 'cancelled', error: 'Cancelled by user' }, 'todo')
    if (timedOut) return finish({ status: 'timeout', error: 'Stopped after 30 minutes' }, 'todo')

    let parsed: any = null
    try { parsed = JSON.parse(stdout) } catch { /* keep raw */ }
    if (parsed) {
      const failed = parsed.is_error || code !== 0
      const result = String(parsed.result ?? '').slice(0, MAX_RESULT_CHARS)
      finish({
        status: failed ? 'error' : 'success',
        sessionId: parsed.session_id,
        costUsd: parsed.total_cost_usd,
        numTurns: parsed.num_turns,
        permissionDenials: (parsed.permission_denials || []).map((d: any) => d.tool_name || String(d)),
        result,
        ...(failed ? { error: parsed.subtype && parsed.subtype !== 'success' ? parsed.subtype : (result || 'claude reported an error') } : {}),
      }, failed ? 'todo' : 'in_review', failed ? undefined : result || undefined)
    } else {
      const ok = code === 0
      finish({
        status: ok ? 'success' : 'error',
        result: stdout.slice(0, MAX_RESULT_CHARS),
        ...(ok ? {} : { error: stderr.trim().slice(-500) || 'claude exited with an error' }),
      }, ok ? 'in_review' : 'todo', ok ? stdout.slice(0, MAX_RESULT_CHARS) || undefined : undefined)
    }
  })
  return runId
}

export function cancelRun(issueId: string): boolean {
  const entry = active.get(issueId)
  if (!entry) return false
  entry.cancelled = true
  entry.child.kill('SIGTERM')
  return true
}
