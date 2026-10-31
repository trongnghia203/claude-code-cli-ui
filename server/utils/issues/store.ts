import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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

export interface Issue {
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
  timeline: TimelineEntry[]
  runs: IssueRun[]
}

export const ISSUE_PREFIX = 'ISS'
const KEY_RE = /^ISS-\d+$/

const issuesDir = () => resolveClaudePath('issues')
const counterFile = () => join(issuesDir(), '_counter.json')
const issueFile = (id: string) => join(issuesDir(), `${id}.json`)

export const isValidKey = (id: string) => KEY_RE.test(id)
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

export function createIssue(input: Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'assignee' | 'labels' | 'parentId' | 'projectDir' | 'permissionMode'>): Issue {
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
  return true
}

/** Move status and log it on the timeline. No-op when unchanged. */
export function setStatus(issue: Issue, to: IssueStatus, by: 'user' | 'system') {
  if (issue.status === to) return
  issue.timeline.push({ id: newEntryId(), at: new Date().toISOString(), type: 'status', from: issue.status, to, by })
  issue.status = to
}
