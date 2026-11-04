import { deleteUserProject } from '../../utils/userProjects'

export default defineEventHandler((event) => {
  deleteUserProject(getRouterParam(event, 'id')!)
  return { ok: true }
})
