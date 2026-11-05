import { mutateConfig, usageCounts } from '../../../utils/issues/config'

/** A label that issues still use cannot be deleted: remove it from them first. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const used = usageCounts().labels[id] ?? 0
  if (used > 0) throw createError({ statusCode: 409, message: `Label is used by ${used} issue(s). Remove it from them first.` })
  const removed = mutateConfig((cfg) => {
    const n = cfg.labels.length
    cfg.labels = cfg.labels.filter(l => l.id !== id)
    return n !== cfg.labels.length
  })
  if (!removed) throw createError({ statusCode: 404, message: 'Label not found' })
  return { ok: true }
})
