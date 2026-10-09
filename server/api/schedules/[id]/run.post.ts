import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { scheduleCore } from '../../../utils/schedules/core'

/** Run now: start the same runner launchd uses, detached so it outlives this request. */
export default defineEventHandler(async (event) => {
  const core = await scheduleCore()
  const id = getRouterParam(event, 'id')!
  const job = core.getJob(id)
  if (!job) throw createError({ statusCode: 404, message: 'Schedule not found' })

  const runId = core.createRunId()
  // Show the run straight away; the runner replaces this record as it progresses
  core.writeRun({ id: runId, jobId: id, jobName: job.name, trigger: 'manual', status: 'running', startedAt: new Date().toISOString() })

  const runner = resolve(process.cwd(), 'scripts', 'run-schedule.mjs')
  const child = spawn(process.execPath, [runner, id, '--manual', '--run-id', runId], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()
  return { runId }
})
