import { MAX_ACTIVE_PROPERTIES, mutateConfig, usageCounts } from '../../../utils/issues/config'
import { parseProperty, scopeOf } from '../../../utils/issues/configValidate'

/** Rename, edit options, archive or restore. The type never changes: stored values would stop fitting. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseProperty(await readBody(event), false)
  const scope = scopeOf(event)
  if (body.archived === true) {
    const used = usageCounts(scope).properties[id] ?? 0
    if (used > 0) throw createError({ statusCode: 409, message: `Property is used by ${used} issue(s). Clear it on them first.` })
  }
  return mutateConfig(scope, (cfg) => {
    const p = cfg.properties.find(x => x.id === id)
    if (!p) throw createError({ statusCode: 404, message: 'Property not found' })
    if (body.name && cfg.properties.some(x => x.id !== id && x.name.toLowerCase() === body.name!.toLowerCase())) throw createError({ statusCode: 400, message: `Property "${body.name}" already exists` })
    if (body.archived === false && p.archived && cfg.properties.filter(x => !x.archived).length >= MAX_ACTIVE_PROPERTIES) throw createError({ statusCode: 400, message: `Limit is ${MAX_ACTIVE_PROPERTIES} active properties` })
    if (body.name) p.name = body.name
    if (body.archived !== undefined) p.archived = body.archived
    // Options keep their ids, so values already stored on issues stay valid after a rename
    if (body.options && p.type === 'select') p.options = body.options
    p.updatedAt = new Date().toISOString()
    return { property: p }
  })
})
