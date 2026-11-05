import { mutateConfig } from '../../../utils/issues/config'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const removed = mutateConfig((cfg) => {
    const n = cfg.views.length
    cfg.views = cfg.views.filter(v => v.id !== id)
    return n !== cfg.views.length
  })
  if (!removed) throw createError({ statusCode: 404, message: 'View not found' })
  return { ok: true }
})
