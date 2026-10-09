import { scheduleCore } from '../../utils/schedules/core'
import { installJob } from '../../utils/schedules/launchd'
import { toJob } from '../../utils/schedules/validate'

export default defineEventHandler(async (event) => {
  const core = await scheduleCore()
  const id = getRouterParam(event, 'id')!
  const existing = core.getJob(id)
  if (!existing) throw createError({ statusCode: 404, message: 'Schedule not found' })

  let job
  try {
    // A partial body (e.g. just { enabled }) keeps the other fields
    job = toJob({ ...existing, ...(await readBody(event)) }, existing)
  } catch (e: any) {
    throw createError({ statusCode: 400, message: e.message })
  }
  core.writeJobs(core.readJobs().map(j => (j.id === id ? job : j)))
  try {
    await installJob(job)
  } catch (e: any) {
    throw createError({ statusCode: 500, message: e.message })
  }
  return { job }
})
