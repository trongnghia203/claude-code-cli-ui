import { MAX_ACTIVE_PROPERTIES, mutateConfig, newPropertyId } from '../../../utils/issues/config'
import { parseProperty, scopeOf } from '../../../utils/issues/configValidate'

export default defineEventHandler(async (event) => {
  const body = parseProperty(await readBody(event), true)
  return mutateConfig(scopeOf(event), (cfg) => {
    if (cfg.properties.filter(p => !p.archived).length >= MAX_ACTIVE_PROPERTIES) throw createError({ statusCode: 400, message: `Limit is ${MAX_ACTIVE_PROPERTIES} active properties. Archive one first.` })
    if (cfg.properties.some(p => p.name.toLowerCase() === body.name!.toLowerCase())) throw createError({ statusCode: 400, message: `Property "${body.name}" already exists` })
    const property = { id: newPropertyId(), name: body.name!, type: body.type!, options: body.options ?? [], archived: false, updatedAt: new Date().toISOString() }
    cfg.properties.push(property)
    return { property }
  })
})
