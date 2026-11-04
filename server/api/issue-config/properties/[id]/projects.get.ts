import { itemProjects } from '../../../../utils/issues/config'

/** Known projects and whether each one has this property. */
export default defineEventHandler(async (event) => ({ projects: await itemProjects('properties', getRouterParam(event, 'id')!) }))
