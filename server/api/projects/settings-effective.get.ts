import { getEffectiveSettings } from '../../utils/effectiveSettings'

// Read-only merged view of user, project and local settings (project is optional: without it, only user settings)
export default defineEventHandler(async (event) => {
  const { path } = getQuery(event) as { path?: string }
  return getEffectiveSettings(path || undefined)
})
