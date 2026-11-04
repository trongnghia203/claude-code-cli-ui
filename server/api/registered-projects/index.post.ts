import { createRegisteredProject } from '../../utils/registeredProjects'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name: string; path: string }>(event)
  return createRegisteredProject({ name: body?.name, path: body?.path })
})
