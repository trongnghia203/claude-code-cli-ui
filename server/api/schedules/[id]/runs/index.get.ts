import { scheduleCore } from '../../../../utils/schedules/core'

export default defineEventHandler(async (event) => {
  const core = await scheduleCore()
  const id = getRouterParam(event, 'id')!
  if (!core.getJob(id)) throw createError({ statusCode: 404, message: 'Schedule not found' })
  // The list carries a short preview; the full output comes from the single-run endpoint
  const runs = core.listRuns(id).map(({ result, stderr, ...rest }) => ({
    ...rest,
    preview: result ? result.slice(0, 200) : undefined,
  }))
  return { runs }
})
