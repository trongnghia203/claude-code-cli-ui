import { itemProjects } from '../../../../utils/issues/config'

/** Known projects and whether each one has this label. */
export default defineEventHandler(async (event) => ({ projects: await itemProjects('labels', getRouterParam(event, 'id')!) }))
