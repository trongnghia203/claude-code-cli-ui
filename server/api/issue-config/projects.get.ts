import { knownProjects } from '../../utils/issues/config'

/** Projects a label or property can be shared with. */
export default defineEventHandler(async () => ({ projects: await knownProjects() }))
