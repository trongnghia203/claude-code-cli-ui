import { mutateConfig, cleanStatusAssignees } from '../../utils/issues/config'
import { ISSUE_STATUSES } from '../../utils/issues/store'

/** Body: { rules: { <status>: "<agent slug>" | null } }. A status that is missing keeps the assignee as it is. */
export default defineEventHandler(async (event) => {
  const rules = (await readBody(event))?.rules
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw createError({ statusCode: 400, message: 'rules must be an object' })
  for (const [status, v] of Object.entries(rules)) {
    if (!(ISSUE_STATUSES as readonly string[]).includes(status)) throw createError({ statusCode: 400, message: `Unknown status: ${status}` })
    if (v !== null && !(typeof v === 'string' && /^[\w-]{1,80}$/.test(v))) throw createError({ statusCode: 400, message: `Invalid assignee for ${status}` })
  }
  return mutateConfig((cfg) => {
    cfg.statusAssignees = cleanStatusAssignees(rules)
    return { statusAssignees: cfg.statusAssignees }
  })
})
