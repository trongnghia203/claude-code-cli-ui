import { mutateConfig } from '../../../utils/issues/config'
import { parseView, scopeOf } from '../../../utils/issues/configValidate'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseView(await readBody(event), false)
  return mutateConfig(scopeOf(event), (cfg) => {
    const view = cfg.views.find(v => v.id === id)
    if (!view) throw createError({ statusCode: 404, message: 'View not found' })
    if (body.name && cfg.views.some(v => v.id !== id && v.name.toLowerCase() === body.name!.toLowerCase())) throw createError({ statusCode: 400, message: `View "${body.name}" already exists` })
    Object.assign(view, body, { updatedAt: new Date().toISOString() })
    return { view }
  })
})
