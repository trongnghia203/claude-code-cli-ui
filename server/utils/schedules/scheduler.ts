import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { scheduleCore, type ScheduleJob } from './core'
import * as launchd from './launchd'

/**
 * Two ways to fire jobs:
 * - in-process (default): the app server checks jobs every few seconds and starts the runner itself.
 *   Nothing is written to ~/Library/LaunchAgents, so managed-laptop EDR does not see persistence.
 *   Jobs only fire while the app server is running.
 * - launchd (CLAUDE_UI_SCHEDULER=launchd): a LaunchAgent per job, runs even when the app is closed.
 */
export const schedulerMode: 'inprocess' | 'launchd' =
  process.env.CLAUDE_UI_SCHEDULER === 'launchd' ? 'launchd' : 'inprocess'

export const schedulerSupported = schedulerMode === 'launchd' ? launchd.launchdSupported : true

export async function installJob(job: ScheduleJob) {
  if (schedulerMode === 'launchd') return launchd.installLaunchdJob(job)
  ;(await scheduleCore()).ensureDirs()
  // Remove a LaunchAgent left over from the launchd mode so a job never fires twice.
  // No plist check: launchd keeps a job loaded after its plist file is deleted.
  if (launchd.launchdSupported) await launchd.uninstallLaunchdJob(job.id)
}

export async function uninstallJob(id: string) {
  if (schedulerMode === 'launchd') return launchd.uninstallLaunchdJob(id)
  if (launchd.launchdSupported) await launchd.uninstallLaunchdJob(id)
}

export async function isLoaded(id: string): Promise<boolean> {
  if (schedulerMode === 'launchd') return launchd.isLaunchdLoaded(id)
  return loopStarted && !!(await scheduleCore()).getJob(id)
}

// ---------- in-process loop ----------

const TICK_MS = 15_000
let loopStarted = false
const lastCheck = new Map<string, number>()
const lastFired = new Map<string, number>()
const running = new Set<string>()

function isDue(core: Awaited<ReturnType<typeof scheduleCore>>, job: ScheduleJob, now: number): boolean {
  const since = lastCheck.get(job.id) ?? now
  if (job.schedule.kind === 'interval') {
    const every = Math.max(1, job.schedule.everyMinutes || 60) * 60_000
    return now - (lastFired.get(job.id) ?? since) >= every
  }
  const next = core.nextRun(job.schedule, new Date(since))
  return !!next && next.getTime() <= now
}

async function fire(core: Awaited<ReturnType<typeof scheduleCore>>, job: ScheduleJob) {
  const runId = core.createRunId()
  core.writeRun({ id: runId, jobId: job.id, jobName: job.name, trigger: 'schedule', status: 'running', startedAt: new Date().toISOString() })
  const runner = resolve(process.cwd(), 'scripts', 'run-schedule.mjs')
  const child = spawn(process.execPath, [runner, job.id, '--run-id', runId], { stdio: 'ignore', env: process.env })
  running.add(job.id)
  child.on('exit', () => running.delete(job.id))
  child.on('error', () => running.delete(job.id))
}

async function tick() {
  const core = await scheduleCore()
  const now = Date.now()
  const jobs = core.readJobs()
  const ids = new Set(jobs.map(j => j.id))
  for (const id of [...lastCheck.keys()]) if (!ids.has(id)) { lastCheck.delete(id); lastFired.delete(id) }

  for (const job of jobs) {
    if (!job.enabled) { lastCheck.delete(job.id); lastFired.delete(job.id); continue }
    if (!lastCheck.has(job.id)) { lastCheck.set(job.id, now); lastFired.set(job.id, now); continue }
    // Never overlap two runs of the same job
    if (!running.has(job.id) && isDue(core, job, now)) {
      lastFired.set(job.id, now)
      await fire(core, job)
    }
    lastCheck.set(job.id, now)
  }
}

export function startInProcessScheduler() {
  const g = globalThis as { __claudeUiScheduler?: NodeJS.Timeout }
  if (schedulerMode !== 'inprocess' || g.__claudeUiScheduler) return
  loopStarted = true
  g.__claudeUiScheduler = setInterval(() => { tick().catch(() => {}) }, TICK_MS)
  g.__claudeUiScheduler.unref?.()
}
