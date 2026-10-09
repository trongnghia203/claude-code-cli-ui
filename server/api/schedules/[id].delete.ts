import { rmSync } from 'node:fs'
import { scheduleCore } from '../../utils/schedules/core'
import { uninstallJob } from '../../utils/schedules/launchd'

export default defineEventHandler(async (event) => {
  const core = await scheduleCore()
  const id = getRouterParam(event, 'id')!
  if (!core.getJob(id)) throw createError({ statusCode: 404, message: 'Schedule not found' })
  await uninstallJob(id)
  core.writeJobs(core.readJobs().filter(j => j.id !== id))
  // The run history goes with the job
  rmSync(core.runDir(id), { recursive: true, force: true })
  rmSync(`${core.LOGS_DIR}/${id}.log`, { force: true })
  return { success: true }
})
