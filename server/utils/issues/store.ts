import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { resolveClaudePath } from '../claudeDir'

export const ISSUE_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'] as const
export type IssueStatus = typeof ISSUE_STATUSES[number]
export const ISSUE_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const
export type IssuePriority = typeof ISSUE_PRIORITIES[number]
export const PERMISSION_MODES = ['plan', 'default', 'acceptEdits'] as const
export type IssuePermissionMode = typeof PERMISSION_MODES[number]

export type IssueRunStatus = 'running' | 'success' | 'error' | 'timeout' | 'cancelled'

export interface RunUsage { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface RunModelUsage extends RunUsage { model: string; costUsd: number }

export interface IssueRun {
  id: string
  agent: string | null
  status: IssueRunStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  sessionId?: string
  /** What started the run: the comment text, or "Initial run" / "Run agent" */
  trigger?: string
  usage?: RunUsage
  models?: RunModelUsage[]
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
  /**
   * A fold. `/distill` (after a successful run): the description now holds what these comments said.
   * `/clear`: no run, the comments are only hidden from later prompts. A missing `kind` means distill.
   * Comments are kept. Later prompts skip them, and the page folds them. Delete the entry to unfold.
   */
  | { id: string; at: string; type: 'distill'; kind?: 'distill' | 'clear'; note?: string; foldedIds: string[]; descriptionBefore: string }

export const WAKE_REPEATS = ['once', 'hourly', 'daily', 'weekdays', 'weekly'] as const
export type WakeRepeat = typeof WAKE_REPEATS[number]
/** A timed wakeup: at `at`, run the issue's agent (or `agent`) with `instruction`. `at` moves forward after each firing of a repeating one. */
export interface IssueWakeup {
  id: string
  at: string
  agent: string | null
  instruction: string
  repeat: WakeRepeat
  enabled: boolean
  createdAt: string
}
export interface WakeupEvent { id: string; wakeupId: string; at: string; outcome: 'started' | 'skipped'; note: string }

/** An interactive Claude Code session started from the issue (ADR 0008). `id` is the Claude session id. */
interface IssueSession { id: string; cwd: string; label?: string; startedAt: string }

export interface Issue {
  id: string
  number: number
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  assignee: string | null
  /** Label ids from the workspace config */
  labels: string[]
  /** Custom property values keyed by property id */
  properties?: Record<string, string | number | boolean>
  /** Per-issue wakeup override. Missing means follow the workspace default. */
  wakeups?: { subIssuesFinish?: 'on' | 'off'; items?: IssueWakeup[] }
  wakeupHistory?: WakeupEvent[]
  /** Interactive sessions, newest last. Never trimmed. */
  sessions?: IssueSession[]
  parentId: string | null
  projectDir: string
  permissionMode: IssuePermissionMode
  /** True while an agent is reading sources to rewrite the title and description */
  drafting?: boolean
  draftNote?: string
  createdAt: string
  updatedAt: string
  timeline: TimelineEntry[]
  runs: IssueRun[]
}

type CommentEntry = Extract<TimelineEntry, { type: 'comment' }>

/** Ids of comments folded into the description by a distill. */
function foldedCommentIds(issue: Pick<Issue, 'timeline'>): Set<string> {
  const out = new Set<string>()
  for (const e of issue.timeline) if (e.type === 'distill') for (const id of e.foldedIds) out.add(id)
  return out
}

/** Comments no distill has folded yet: what a run still needs to read next to the description. */
export function liveComments(issue: Pick<Issue, 'timeline'>): CommentEntry[] {
  const folded = foldedCommentIds(issue)
  return issue.timeline.filter((e): e is CommentEntry => e.type === 'comment' && !folded.has(e.id))
}

const ISSUE_PREFIX = 'ISS'
const KEY_RE = /^ISS-\d+$/

const issuesDir = () => resolveClaudePath('issues')
const counterFile = () => join(issuesDir(), '_counter.json')
const issueFile = (id: string) => join(issuesDir(), `${id}.json`)

// Read-only run transcripts live next to the issues, not in the project's Claude sessions.
const transcriptDir = (id: string) => join(issuesDir(), '_transcripts', id)
const transcriptFile = (id: string, runId: string) => join(transcriptDir(id), `${runId.replace(/[^\w-]/g, '')}.jsonl`)

export function appendTranscript(id: string, runId: string, record: unknown) {
  try {
    mkdirSync(transcriptDir(id), { recursive: true })
    appendFileSync(transcriptFile(id, runId), JSON.stringify(record) + '\n')
  } catch { /* a transcript failure must never break a run */ }
}

export function readTranscript(id: string, runId: string): unknown[] {
  if (!isValidKey(id)) return []
  try {
    return readFileSync(transcriptFile(id, runId), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  } catch { return [] }
}

const isValidKey = (id: string) => KEY_RE.test(id)
// A function declaration, not an arrow with a comma: Nitro's auto-import scanner mis-splits "(0, 8)" in exported consts
export function newEntryId(): string {
  return randomUUID().slice(0, 8)
}

function ensureDir() {
  mkdirSync(issuesDir(), { recursive: true })
}

function writeAtomic(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

function nextNumber(): number {
  ensureDir()
  let next = 1
  try {
    next = JSON.parse(readFileSync(counterFile(), 'utf8')).next ?? 1
  } catch { /* first issue */ }
  // The counter file can be lost or stale: never reuse a number that exists on disk
  for (const f of readdirSync(issuesDir())) {
    const m = /^ISS-(\d+)\.json$/.exec(f)
    if (m) next = Math.max(next, Number(m[1]) + 1)
  }
  writeAtomic(counterFile(), { next: next + 1 })
  return next
}

export function readIssue(id: string): Issue | null {
  if (!isValidKey(id)) return null
  try {
    return JSON.parse(readFileSync(issueFile(id), 'utf8')) as Issue
  } catch {
    return null
  }
}

export function listIssues(): Issue[] {
  if (!existsSync(issuesDir())) return []
  const out: Issue[] = []
  for (const f of readdirSync(issuesDir())) {
    if (!/^ISS-\d+\.json$/.test(f)) continue
    const issue = readIssue(f.replace(/\.json$/, ''))
    if (issue) out.push(issue)
  }
  return out
}

export const CLOSED_STATUSES: readonly IssueStatus[] = ['done', 'cancelled']

export function createIssue(input: Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'assignee' | 'labels' | 'parentId' | 'projectDir' | 'permissionMode'> & Partial<Pick<Issue, 'properties' | 'wakeups'>>): Issue {
  const number = nextNumber()
  const now = new Date().toISOString()
  const issue: Issue = {
    ...input,
    id: `${ISSUE_PREFIX}-${number}`,
    number,
    createdAt: now,
    updatedAt: now,
    timeline: [
      { id: newEntryId(), at: now, type: 'status', from: null, to: input.status, by: 'user' },
      ...(input.assignee ? [{ id: newEntryId(), at: now, type: 'assign' as const, from: null, to: input.assignee }] : []),
    ],
    runs: [],
  }
  writeAtomic(issueFile(issue.id), issue)
  return issue
}

/** Synchronous read-modify-write. Node runs it without interleaving, so two updates never overwrite each other. */
export function updateIssue(id: string, mutate: (issue: Issue) => void): Issue | null {
  const issue = readIssue(id)
  if (!issue) return null
  mutate(issue)
  issue.updatedAt = new Date().toISOString()
  writeAtomic(issueFile(id), issue)
  return issue
}

export function deleteIssue(id: string): boolean {
  if (!readIssue(id)) return false
  rmSync(issueFile(id), { force: true })
  rmSync(transcriptDir(id), { recursive: true, force: true })
  return true
}

/** Move status and log it on the timeline. No-op when unchanged. */
export function setStatus(issue: Issue, to: IssueStatus, by: 'user' | 'system') {
  if (issue.status === to) return
  issue.timeline.push({ id: newEntryId(), at: new Date().toISOString(), type: 'status', from: issue.status, to, by })
  issue.status = to
}
