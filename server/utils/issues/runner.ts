import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendTranscript, readIssue, updateIssue, setStatus, newEntryId, type Issue, type IssueRun, type RunUsage } from './store'

const TIMEOUT_MS = 30 * 60_000
const BUDGET_USD = 5
const MAX_RESULT_CHARS = 20_000
const MCP_WAIT_MS = 60_000
const MCP_POLL_MS = 2_000

export interface PendingApproval { id: string; tool: string; input: unknown; at: string }
interface ActiveRun {
  child: ChildProcess; runId: string; cancelled: boolean
  pending: Map<string, PendingApproval & { respond: (allow: boolean, message?: string) => void; timer?: ReturnType<typeof setTimeout> }>
  allowedTools: Set<string>
}
const APPROVAL_TIMEOUT_MS = 10 * 60_000

const active = new Map<string, ActiveRun>()

export function getPendingApprovals(issueId: string): PendingApproval[] {
  const entry = active.get(issueId)
  return entry ? [...entry.pending.values()].map(({ id, tool, input, at }) => ({ id, tool, input, at })) : []
}

/** decision: allow once, allow this tool for the rest of the run, or deny. */
export function answerApproval(issueId: string, approvalId: string, decision: 'allow' | 'allow_tool' | 'deny'): boolean {
  const entry = active.get(issueId)
  const p = entry?.pending.get(approvalId)
  if (!entry || !p) return false
  if (decision === 'allow_tool') entry.allowedTools.add(p.tool)
  p.respond(decision !== 'deny', decision === 'deny' ? 'Denied by the user' : undefined)
  // Same tool may have queued more requests
  if (decision === 'allow_tool') for (const q of [...entry.pending.values()]) if (q.tool === p.tool) q.respond(true)
  return true
}

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

const toUsage = (u: any): RunUsage => ({
  input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0,
  cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0,
})

/** Keep transcripts small: tool output can be huge, and the page only needs the start of it. */
function shrinkForTranscript(m: any) {
  const MAX = 8_000
  const cut = (v: unknown) => (typeof v === 'string' && v.length > MAX ? `${v.slice(0, MAX)}\n... (${v.length - MAX} more characters)` : v)
  const content = m.message?.content
  if (!Array.isArray(content)) return m
  return {
    type: m.type, parent_tool_use_id: m.parent_tool_use_id,
    message: { content: content.map((b: any) => b.type === 'tool_result'
      ? { ...b, content: Array.isArray(b.content) ? b.content.map((c: any) => ({ ...c, text: cut(c.text) })) : cut(b.content) }
      : b.type === 'thinking' ? { type: 'thinking' } : b) },
  }
}

// The description is the relay between runs: a run keeps no session, so the next run sees only the description and comments.
// Detail that does not fit belongs in the project's own notes (for a Jira ticket: its impl-notes file).
const RELAY_INSTRUCTION = `
## Before you finish: hand over to the next run

The next run starts fresh with no memory. The issue description is its main context, so write what it needs there.

1. Read the latest text: \`claude-ui issue get {ID}\`
2. Rewrite it: \`claude-ui issue update {ID} --body-file - <<'EOF'\` ... \`EOF\`

Keep the original request at the top, unchanged. Below it keep these sections. Rewrite stale parts, do not append a log:
- **Context**: 2-5 sentences. Current state, constraints.
- **Steps**: short list with the files touched.
- **Checklist**: tick-boxes only. \`- [x]\` done, \`- [ ]\` open. No code or nested detail inside items.
- **Findings**: non-obvious facts, dead approaches and why.
- **Next**: what the next run should pick up first.

Put long detail (command output, diffs, step observations) in the project's notes file if there is one, and link it from Steps.
If the description names a Jira key (CSI-, ICU-, ONE-), that ticket's impl-notes file is the notes file. Keep it current too.

Last, finish with a 2-3 line summary: what changed, what needs review. That summary is posted as the comment. Do not post comments with the CLI.`

// Adhoc hand-over: a side question must not rewrite the main description, so the run only appends a short note.
const ADHOC_RELAY_INSTRUCTION = `
## Before you finish

This is an adhoc run. Do not rewrite the description and do not touch the original request.
If you found a fact the next run needs, add 1-3 bullets under **Findings** in the description:
1. Read it: \`claude-ui issue get {ID}\`
2. Rewrite it with only that edit: \`claude-ui issue update {ID} --body-file - <<'EOF'\` ... \`EOF\`
Skip the edit if nothing is worth keeping.

Last, finish with a 2-3 line summary of the answer. That summary is posted as the comment. Do not post comments with the CLI.`

/** An adhoc run sees only the issue id, title and the new comment. The agent can fetch more with `claude-ui issue get`. */
export function buildAdhocPrompt(issue: Issue, question: string, previous?: { author: string; at: string; body: string }): string {
  return [
    `You are working on issue ${issue.id}: ${issue.title}`,
    previous
      ? '\nThis is an adhoc run. You get no description or older comments on purpose, only the last comment before this one.'
      : '\nThis is an adhoc question. You get no description or earlier comments on purpose.',
    `If you need more context, run \`claude-ui issue get ${issue.id}\`.`,
    previous ? `\n## Last comment\n**${previous.author}** (${previous.at}):\n${previous.body}` : '',
    `\n## ${previous ? 'New comment' : 'Question'}\n${question.trim()}`,
    '\nDo the work in the current directory.',
    ADHOC_RELAY_INSTRUCTION.replaceAll('{ID}', issue.id),
  ].filter(Boolean).join('\n')
}

export function buildPrompt(issue: Issue, extra?: string): string {
  const parts = [
    `You are working on issue ${issue.id}: ${issue.title}`,
    issue.description.trim() ? `\n## Description\n${issue.description.trim()}` : '',
  ]
  const comments = issue.timeline.filter(e => e.type === 'comment')
  if (comments.length) {
    parts.push('\n## Discussion')
    for (const c of comments) if (c.type === 'comment') parts.push(`**${c.author}** (${c.at}):\n${c.body}`)
  }
  if (extra?.trim()) parts.push(`\n## Wakeup\n${extra.trim()}`)
  parts.push('\nDo the work in the current directory.')
  parts.push(RELAY_INSTRUCTION.replaceAll('{ID}', issue.id))
  return parts.filter(Boolean).join('\n')
}

/** Start a run for the issue. Returns the run id, or null when one is already active. */
export function startRun(issueId: string, trigger?: string, extraInstruction?: string, agentOverride?: string | null, adhoc?: { question: string; previous?: { author: string; at: string; body: string } }): string | null {
  if (active.has(issueId)) return null
  const issue = readIssue(issueId)
  if (!issue) return null

  const agentSlug = agentOverride || issue.assignee
  const runId = newEntryId()
  const startedAt = new Date()
  const run: IssueRun = {
    id: runId, agent: agentSlug, status: 'running', startedAt: startedAt.toISOString(),
    trigger: (trigger?.trim().replace(/\s+/g, ' ').slice(0, 160)) || (issue.runs.length ? 'Run agent' : 'Initial run'),
  }

  const prompt = adhoc ? buildAdhocPrompt(issue, adhoc.question, adhoc.previous) : buildPrompt(issue, extraInstruction)
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

  // Stream-json input instead of a one-shot prompt: connector MCP servers (claude.ai Slack, Atlassian, ...) connect in the
  // background, and a one-shot run starts before they are up, so the agent reports "no Slack tool". Streaming lets us
  // wait until every server has left "pending" and only then send the prompt.
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', issue.permissionMode || 'acceptEdits', '--max-budget-usd', String(BUDGET_USD),
    // Tools that need approval come to us as can_use_tool requests (answered from the issue page)
    '--permission-prompt-tool', 'stdio',
    // No saved session: the issue description and comments are the only context a run gets, so every run starts fresh
    '--no-session-persistence']
  if (agentSlug) args.push('--agent', agentSlug)

  let buf = ''
  let stderr = ''
  let resultMsg: any = null
  let timedOut = false
  let promptSent = false
  let badAgent: string | null = null
  let statusSeq = 0
  const waitStart = Date.now()
  const child = spawn('claude', args, { cwd: issue.projectDir, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })
  active.set(issueId, { child, runId, cancelled: false, pending: new Map(), allowedTools: new Set() })
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, TIMEOUT_MS)
  child.stdin.on('error', () => { /* child exited before reading */ })

  const write = (o: unknown) => { if (!child.stdin.destroyed) child.stdin.write(JSON.stringify(o) + '\n') }
  const askStatus = () => write({ type: 'control_request', request_id: `mcp-${statusSeq++}`, request: { subtype: 'mcp_status' } })
  // The CLI asks the host before a tool that is not pre-approved. Show it on the issue page and wait for the user.
  const askApproval = (m: any) => {
    const entry = active.get(issueId)
    const req = m.request
    if (!entry) return
    let answered = false
    const reply = (allow: boolean, message?: string) => {
      if (answered) return
      answered = true
      clearTimeout(entry.pending.get(m.request_id)?.timer)
      entry.pending.delete(m.request_id)
      write({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id,
        response: allow ? { behavior: 'allow', updatedInput: req.input ?? {} } : { behavior: 'deny', message: message || 'Denied' } } })
    }
    if (entry.allowedTools.has(req.tool_name)) return reply(true)
    const timer = setTimeout(() => reply(false, 'No answer in 10 minutes'), APPROVAL_TIMEOUT_MS)
    entry.pending.set(m.request_id, { id: m.request_id, tool: req.tool_name, input: req.input, at: new Date().toISOString(), respond: reply, timer } as any)
  }
  const sendPrompt = () => {
    if (promptSent) return
    promptSent = true
    appendTranscript(issueId, runId, { type: 'prompt', text: prompt })
    write({ type: 'user', message: { role: 'user', content: prompt } })
  }

  child.stdout.on('data', (d) => {
    buf += d
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      let m: any
      try { m = JSON.parse(line) } catch { continue }
      if (m.type === 'assistant' || m.type === 'user' || m.type === 'result') appendTranscript(issueId, runId, shrinkForTranscript(m))
      if (m.type === 'control_response' && !promptSent) {
        const servers: { status: string }[] = m.response?.response?.mcpServers ?? []
        const settled = servers.length > 0 && servers.every(sv => sv.status !== 'pending')
        if (settled || Date.now() - waitStart > MCP_WAIT_MS) sendPrompt()
        else setTimeout(askStatus, MCP_POLL_MS)
      } else if (m.type === 'control_request' && m.request?.subtype === 'can_use_tool') {
        askApproval(m)
      } else if (m.type === 'system' && m.subtype === 'init' && agentSlug && Array.isArray(m.agents) && !m.agents.includes(agentSlug)) {
        // Stream mode silently falls back to the default agent for an unknown --agent. Stop instead of running the wrong one.
        badAgent = `Agent "${agentSlug}" not found. Available: ${m.agents.slice(0, 15).join(', ')}`
        child.kill('SIGTERM')
      } else if (m.type === 'result') {
        resultMsg = m
        child.stdin.end() // done: let claude exit
      }
    }
  })
  child.stderr.on('data', (d) => { stderr += d })
  askStatus()

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
    if (badAgent) return finish({ status: 'error', error: badAgent }, 'todo')

    if (resultMsg) {
      const failed = !!resultMsg.is_error
      const result = String(resultMsg.result ?? '').slice(0, MAX_RESULT_CHARS)
      finish({
        status: failed ? 'error' : 'success',
        usage: toUsage(resultMsg.usage),
        models: Object.entries(resultMsg.modelUsage ?? {}).map(([model, u]: [string, any]) => ({
          model, costUsd: u.costUSD ?? 0, input: u.inputTokens ?? 0, output: u.outputTokens ?? 0,
          cacheRead: u.cacheReadInputTokens ?? 0, cacheWrite: u.cacheCreationInputTokens ?? 0,
        })),
        costUsd: resultMsg.total_cost_usd,
        numTurns: resultMsg.num_turns,
        permissionDenials: (resultMsg.permission_denials || []).map((d: any) => d.tool_name || String(d)),
        result,
        ...(failed ? { error: resultMsg.subtype && resultMsg.subtype !== 'success' ? resultMsg.subtype : (result || 'claude reported an error') } : {}),
      }, failed ? 'todo' : 'in_review', failed ? undefined : result || undefined)
    } else {
      finish({ status: 'error', error: stderr.trim().slice(-500) || `claude exited (${code}) without a result` }, 'todo')
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
