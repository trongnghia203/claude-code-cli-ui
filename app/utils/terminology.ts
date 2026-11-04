import { getModelTagline } from '~/utils/models'
import type { AgentModel } from '~/types'

/**
 * @deprecated Import `getModelTagline` from `~/utils/models` instead.
 * Kept for backwards compat during migration.
 */
export function getFriendlyModelName(model: AgentModel | undefined): string {
  return getModelTagline(model)
}

