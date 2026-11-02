import { mutateConfig } from '../../../utils/issues/config'
import { scopeOf } from '../../../utils/issues/configValidate'

/** Body { ids: string[] }: the new tab order. Ids not listed keep their place at the end. */
export default defineEventHandler(async (event) => {
  const ids = (await readBody(event))?.ids
  if (!Array.isArray(ids)) throw createError({ statusCode: 400, message: 'ids must be a list' })
  return mutateConfig(scopeOf(event), (cfg) => {
    const rank = (id: string) => { const i = ids.indexOf(id); return i < 0 ? ids.length : i }
    cfg.views.sort((a, b) => rank(a.id) - rank(b.id))
    return { ok: true }
  })
})
