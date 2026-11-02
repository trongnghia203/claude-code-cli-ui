import { scopeOf } from '../../utils/issues/configValidate'
import { mutateConfig } from '../../utils/issues/config'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const r = body?.subIssuesFinish
  if (!r || typeof r.enabled !== 'boolean') throw createError({ statusCode: 400, message: 'enabled must be true or false' })
  const instruction = String(r.instruction ?? '')
  if (instruction.length > 4000) throw createError({ statusCode: 400, message: 'Instruction is too long (max 4000)' })
  return mutateConfig(scopeOf(event), (cfg) => {
    cfg.wakeups.subIssuesFinish = { enabled: r.enabled, instruction }
    return { wakeups: cfg.wakeups }
  })
})
