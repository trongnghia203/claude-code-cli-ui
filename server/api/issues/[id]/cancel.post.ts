import { cancelRun } from '../../../utils/issues/runner'

export default defineEventHandler((event) => {
  if (!cancelRun(getRouterParam(event, 'id')!)) throw createError({ statusCode: 404, message: 'No active run' })
  return { ok: true }
})
