// Shared by the app server and by scripts/run-schedule.mjs (the process launchd starts).
// Plain Node ESM with no dependencies so the runner works without the dev server.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CONFIG_DIR = join(homedir(), '.config', 'claude-ui')
export const SCHEDULES_FILE = join(CONFIG_DIR, 'schedules.json')
export const RUNS_DIR = join(CONFIG_DIR, 'runs')
export const LOGS_DIR = join(CONFIG_DIR, 'logs')

const MAX_RUNS_KEPT = 50
const MAX_RESULT_CHARS = 100_000

export function ensureDirs() {
  for (const d of [CONFIG_DIR, RUNS_DIR, LOGS_DIR]) mkdirSync(d, { recursive: true })
}

// ---------- storage ----------

export function readJobs() {
  try {
    return JSON.parse(readFileSync(SCHEDULES_FILE, 'utf-8')).jobs ?? []
  } catch {
    return []
  }
}

export function writeJobs(jobs) {
  ensureDirs()
  const tmp = `${SCHEDULES_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify({ jobs }, null, 2))
  renameSync(tmp, SCHEDULES_FILE)
}

export function getJob(id) {
  return readJobs().find(j => j.id === id)
}

export function runDir(jobId) {
  return join(RUNS_DIR, jobId)
}

export function readRun(jobId, runId) {
  try {
    return JSON.parse(readFileSync(join(runDir(jobId), `${runId}.json`), 'utf-8'))
  } catch {
    return null
  }
}

export function writeRun(run) {
  mkdirSync(runDir(run.jobId), { recursive: true })
  const file = join(runDir(run.jobId), `${run.id}.json`)
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(run, null, 2))
  renameSync(tmp, file)
}

export function listRuns(jobId, limit = MAX_RUNS_KEPT) {
  const dir = runDir(jobId)
  if (!existsSync(dir)) return []
  const runs = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      runs.push(JSON.parse(readFileSync(join(dir, f), 'utf-8')))
    } catch {
      // skip a half-written file
    }
  }
  return runs.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || '')).slice(0, limit)
}

function pruneRuns(jobId) {
  const dir = runDir(jobId)
  const files = readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files.slice(MAX_RUNS_KEPT)) rmSync(join(dir, f), { force: true })
}

// ---------- claude command ----------

/** Arguments for `claude`. The prompt is sent on stdin so variadic flags cannot swallow it. */
export function buildClaudeArgs(job) {
  const args = ['-p', '--output-format', 'json', '--permission-mode', job.permissionMode || 'plan']
  if (job.agent) args.push('--agent', job.agent)
  if (job.model) args.push('--model', job.model)
  if (job.allowedTools?.length) args.push('--allowedTools', ...job.allowedTools)
  if (job.disallowedTools?.length) args.push('--disallowedTools', ...job.disallowedTools)
  if (job.maxBudgetUsd) args.push('--max-budget-usd', String(job.maxBudgetUsd))
  return args
}

// ---------- schedule maths ----------

const pad = n => String(n).padStart(2, '0')
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '')
  return m ? { hour: Math.min(23, +m[1]), minute: Math.min(59, +m[2]) } : { hour: 9, minute: 0 }
}

export function describeSchedule(s) {
  const { hour, minute } = parseTime(s.time)
  const t = `${pad(hour)}:${pad(minute)}`
  switch (s.kind) {
    case 'hourly': return `Every hour at :${pad(minute)}`
    case 'interval': return `Every ${s.everyMinutes || 60} minutes`
    case 'weekdays': return `Weekdays at ${t}`
    case 'weekly': return `Every ${DAY_NAMES[s.weekday ?? 1]} at ${t}`
    default: return `Every day at ${t}`
  }
}

/** Next time this schedule fires after `from` (interval schedules count from `from`). */
export function nextRun(s, from = new Date()) {
  if (s.kind === 'interval') return new Date(from.getTime() + (s.everyMinutes || 60) * 60_000)
  const { hour, minute } = parseTime(s.time)
  const allowed = s.kind === 'weekdays' ? [1, 2, 3, 4, 5] : s.kind === 'weekly' ? [s.weekday ?? 1] : null
  for (let add = 0; add < 8; add++) {
    const d = new Date(from)
    d.setDate(d.getDate() + add)
    if (s.kind === 'hourly') {
      d.setMinutes(minute, 0, 0)
      if (add === 0) { while (d <= from) d.setHours(d.getHours() + 1) }
      return d
    }
    d.setHours(hour, minute, 0, 0)
    if (d > from && (!allowed || allowed.includes(d.getDay()))) return d
  }
  return null
}

/** launchd calendar entries for a schedule, or null for interval schedules (they use StartInterval). */
export function calendarEntries(s) {
  const { hour, minute } = parseTime(s.time)
  switch (s.kind) {
    case 'interval': return null
    case 'hourly': return [{ Minute: minute }]
    case 'weekdays': return [1, 2, 3, 4, 5].map(Weekday => ({ Weekday, Hour: hour, Minute: minute }))
    case 'weekly': return [{ Weekday: s.weekday ?? 1, Hour: hour, Minute: minute }]
    default: return [{ Hour: hour, Minute: minute }]
  }
}

// ---------- running a job ----------

function newRunId() {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`
}

export function createRunId() {
  return newRunId()
}

/**
 * Run one job to completion and record the outcome. Used by launchd and by "Run now".
 * Never throws: failures are recorded on the run.
 */
export async function runJob(jobId, { trigger = 'schedule', runId = newRunId() } = {}) {
  ensureDirs()
  const job = getJob(jobId)
  const startedAt = new Date()
  const base = { id: runId, jobId, trigger, startedAt: startedAt.toISOString() }

  if (!job) {
    writeRun({ ...base, status: 'error', error: `Job ${jobId} not found`, finishedAt: new Date().toISOString() })
    return
  }
  if (!existsSync(job.workingDir)) {
    writeRun({ ...base, status: 'error', error: `Project folder not found: ${job.workingDir}`, finishedAt: new Date().toISOString() })
    return
  }

  const args = buildClaudeArgs(job)
  writeRun({ ...base, status: 'running', jobName: job.name, command: `claude ${args.join(' ')}` })

  const claudePath = job.claudePath || 'claude'
  const timeoutMs = (job.timeoutMinutes || 30) * 60_000

  const outcome = await new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(claudePath, args, { cwd: job.workingDir, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeoutMs)
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', e => { clearTimeout(timer); resolve({ spawnError: e.message, stdout, stderr }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }) })
    child.stdin.end(job.prompt)
  })

  const finishedAt = new Date()
  const record = {
    ...base,
    jobName: job.name,
    command: `claude ${args.join(' ')}`,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    exitCode: outcome.code ?? null,
  }

  if (outcome.spawnError) {
    Object.assign(record, { status: 'error', error: `Could not start claude: ${outcome.spawnError}` })
  } else if (outcome.timedOut) {
    Object.assign(record, { status: 'timeout', error: `Stopped after ${job.timeoutMinutes || 30} minutes` })
  } else {
    let parsed = null
    try { parsed = JSON.parse(outcome.stdout) } catch { /* not JSON: keep raw output below */ }
    if (parsed) {
      const failed = parsed.is_error || outcome.code !== 0
      Object.assign(record, {
        status: failed ? 'error' : 'success',
        sessionId: parsed.session_id,
        costUsd: parsed.total_cost_usd,
        numTurns: parsed.num_turns,
        permissionDenials: (parsed.permission_denials || []).map(d => d.tool_name || String(d)),
        result: String(parsed.result ?? '').slice(0, MAX_RESULT_CHARS),
        ...(failed ? { error: parsed.subtype && parsed.subtype !== 'success' ? parsed.subtype : (parsed.result || 'claude reported an error') } : {}),
      })
    } else {
      Object.assign(record, {
        status: outcome.code === 0 ? 'success' : 'error',
        result: outcome.stdout.slice(0, MAX_RESULT_CHARS),
        ...(outcome.code === 0 ? {} : { error: 'claude exited with an error' }),
      })
    }
    if (outcome.stderr.trim()) record.stderr = outcome.stderr.slice(-4000)
  }

  writeRun(record)
  try { pruneRuns(jobId) } catch { /* best effort */ }
}
