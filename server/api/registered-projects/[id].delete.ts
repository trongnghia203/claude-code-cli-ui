import { deleteRegisteredProject } from '../../utils/registeredProjects'

export default defineEventHandler((event) => {
  deleteRegisteredProject(getRouterParam(event, 'id')!)
  return { ok: true }
})
