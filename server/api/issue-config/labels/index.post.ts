import { LABEL_COLORS, mutateConfig, newLabelId } from '../../../utils/issues/config'
import { parseLabel } from '../../../utils/issues/configValidate'

export default defineEventHandler(async (event) => {
  const body = parseLabel(await readBody(event), true)
  return mutateConfig((cfg) => {
    if (cfg.labels.some(l => l.name.toLowerCase() === body.name!.toLowerCase())) throw createError({ statusCode: 400, message: `Label "${body.name}" already exists` })
    const label = {
      id: newLabelId(), name: body.name!, description: body.description ?? '',
      color: body.color ?? LABEL_COLORS[cfg.labels.length % LABEL_COLORS.length]!, updatedAt: new Date().toISOString(),
    }
    cfg.labels.push(label)
    return { label }
  })
})
