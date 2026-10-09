// The scheduler logic lives in plain JS so the same code runs in this server and in the standalone
// runner that launchd starts (scripts/run-schedule.mjs).
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const CORE_URL = () => pathToFileURL(resolve(process.cwd(), 'scripts', 'schedule-core.mjs')).href

export interface ScheduleSpec {
  kind: 'hourly' | 'interval' | 'daily' | 'weekdays' | 'weekly'
  /** "HH:MM" local time (minute is used for hourly) */
  time?: string
  /** 0 (Sun) to 6 (Sat), for weekly */
  weekday?: number
  everyMinutes?: number
}

export type PermissionModeSetting = 'plan' | 'default' | 'acceptEdits'

export interface ScheduleJob {
  id: string
  name: string
  enabled: boolean
  /** Agent slug passed as --agent, or null for a plain prompt */
  agent: string | null
  prompt: string
  workingDir: string
  model: string | null
  permissionMode: PermissionModeSetting
  allowedTools: string[]
  disallowedTools: string[]
  maxBudgetUsd: number
  timeoutMinutes: number
  schedule: ScheduleSpec
  claudePath?: string
  createdAt: string
}

export interface ScheduleRun {
  id: string
  jobId: string
  jobName?: string
  trigger: 'schedule' | 'manual'
  status: 'running' | 'success' | 'error' | 'timeout'
  startedAt: string
  finishedAt?: string
  durationMs?: number
  exitCode?: number | null
  sessionId?: string
  costUsd?: number
  numTurns?: number
  permissionDenials?: string[]
  command?: string
  result?: string
  error?: string
  stderr?: string
}

export interface ScheduleCore {
  CONFIG_DIR: string
  LOGS_DIR: string
  ensureDirs(): void
  readJobs(): ScheduleJob[]
  writeJobs(jobs: ScheduleJob[]): void
  getJob(id: string): ScheduleJob | undefined
  readRun(jobId: string, runId: string): ScheduleRun | null
  writeRun(run: ScheduleRun): void
  listRuns(jobId: string, limit?: number): ScheduleRun[]
  runDir(jobId: string): string
  createRunId(): string
  describeSchedule(s: ScheduleSpec): string
  nextRun(s: ScheduleSpec, from?: Date): Date | null
  calendarEntries(s: ScheduleSpec): Record<string, number>[] | null
  buildClaudeArgs(job: ScheduleJob): string[]
}

let cached: Promise<ScheduleCore> | undefined

/** Loaded by absolute path at runtime: the bundler would rewrite a relative import to this file, and top-level await is not available in the server target. */
export function scheduleCore(): Promise<ScheduleCore> {
  cached ??= import(/* @vite-ignore */ CORE_URL()) as Promise<ScheduleCore>
  return cached
}
