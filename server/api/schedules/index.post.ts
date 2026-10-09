import { scheduleCore } from '../../utils/schedules/core'
import { installJob } from '../../utils/schedules/launchd'
import { toJob } from '../../utils/schedules/validate'

export default defineEventHandler(async (event) => {
  const core = await scheduleCore()
  const body = await readBody(event)
  let job
  try {
    job = toJob(body)
  } catch (e: any) {
    throw createError({ statusCode: 400, message: e.message })
  }
  core.writeJobs([...core.readJobs(), job])
  try {
    await installJob(job)
  } catch (e: any) {
    // Keep the job but make clear it is not scheduled
    core.writeJobs(core.readJobs().map(j => (j.id === job.id ? { ...j, enabled: false } : j)))
    throw createError({ statusCode: 500, message: `${e.message}. The job was saved but disabled.` })
  }
  return { job }
})
