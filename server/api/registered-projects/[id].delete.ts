import { deleteRegisteredProject } from '../../utils/userProjects'

export default defineEventHandler((event) => {
  deleteRegisteredProject(getRouterParam(event, 'id')!)
  return { ok: true }
})
