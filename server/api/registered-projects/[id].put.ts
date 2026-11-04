import { updateRegisteredProject } from '../../utils/registeredProjects'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; path?: string }>(event)
  return updateRegisteredProject(id, { name: body?.name, path: body?.path })
})
