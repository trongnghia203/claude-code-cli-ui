import { resetProject } from '../../utils/issues/config'
import { scopeOf } from '../../utils/issues/configValidate'

/** Remove the project's own settings: it follows the default again. */
export default defineEventHandler((event) => {
  const dir = scopeOf(event)
  if (!dir) throw createError({ statusCode: 400, message: 'projectDir is required' })
  resetProject(dir)
  return { ok: true }
})
