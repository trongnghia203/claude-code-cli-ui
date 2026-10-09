import { scheduleCore } from '../../utils/schedules/core'
import { isLoaded, launchdSupported } from '../../utils/schedules/launchd'

export default defineEventHandler(async () => {
  const core = await scheduleCore()
  const jobs = core.readJobs()
  const items = await Promise.all(jobs.map(async (job) => {
    const [lastRun] = core.listRuns(job.id, 1)
    return {
      ...job,
      scheduleText: core.describeSchedule(job.schedule),
      nextRun: job.enabled ? core.nextRun(job.schedule)?.toISOString() ?? null : null,
      registered: await isLoaded(job.id),
      lastRun: lastRun
        ? { id: lastRun.id, status: lastRun.status, startedAt: lastRun.startedAt, durationMs: lastRun.durationMs, costUsd: lastRun.costUsd }
        : null,
    }
  }))
  return { supported: launchdSupported, jobs: items }
})
