import { customizeProject } from '../../utils/issues/config'
import { scopeOf } from '../../utils/issues/configValidate'

/** Give the project its own settings, copied from the default. */
export default defineEventHandler((event) => {
  const dir = scopeOf(event)
  if (!dir) throw createError({ statusCode: 400, message: 'projectDir is required' })
  customizeProject(dir)
  return { ok: true }
})
