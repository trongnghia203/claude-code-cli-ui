import { setItemProjects } from '../../../../utils/issues/config'
import { scopeOf } from '../../../../utils/issues/configValidate'

/** Body { dirs: string[] }: the projects that should have this label. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!Array.isArray(body?.dirs) || body.dirs.some((d: unknown) => typeof d !== 'string')) throw createError({ statusCode: 400, message: 'dirs must be a list of paths' })
  await setItemProjects('labels', getRouterParam(event, 'id')!, scopeOf(event), body.dirs)
  return { ok: true }
})
