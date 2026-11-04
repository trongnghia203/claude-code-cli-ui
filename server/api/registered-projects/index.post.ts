import { createRegisteredProject } from '../../utils/userProjects'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name: string; path: string }>(event)
  return createRegisteredProject({ name: body?.name, path: body?.path })
})
