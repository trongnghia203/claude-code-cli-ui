import { mutateConfig, newViewId } from '../../../utils/issues/config'
import { parseView, scopeOf } from '../../../utils/issues/configValidate'

const MAX_VIEWS = 30

export default defineEventHandler(async (event) => {
  const body = parseView(await readBody(event), true)
  return mutateConfig(scopeOf(event), (cfg) => {
    if (cfg.views.length >= MAX_VIEWS) throw createError({ statusCode: 400, message: `Limit is ${MAX_VIEWS} views` })
    if (cfg.views.some(v => v.name.toLowerCase() === body.name!.toLowerCase())) throw createError({ statusCode: 400, message: `View "${body.name}" already exists` })
    const view = { id: newViewId(), name: body.name!, layout: body.layout!, filters: body.filters!, display: body.display!, updatedAt: new Date().toISOString() }
    cfg.views.push(view)
    return { view }
  })
})
