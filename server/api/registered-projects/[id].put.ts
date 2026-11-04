import { updateUserProject } from '../../utils/userProjects'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; path?: string }>(event)
  return updateUserProject(id, { name: body?.name, path: body?.path })
})
