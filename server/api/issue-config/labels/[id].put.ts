import { mutateConfig } from '../../../utils/issues/config'
import { parseLabel } from '../../../utils/issues/configValidate'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseLabel(await readBody(event), false)
  return mutateConfig((cfg) => {
    const label = cfg.labels.find(l => l.id === id)
    if (!label) throw createError({ statusCode: 404, message: 'Label not found' })
    if (body.name && cfg.labels.some(l => l.id !== id && l.name.toLowerCase() === body.name!.toLowerCase())) throw createError({ statusCode: 400, message: `Label "${body.name}" already exists` })
    Object.assign(label, body, { updatedAt: new Date().toISOString() })
    return { label }
  })
})
