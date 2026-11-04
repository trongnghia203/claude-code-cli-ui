import { listRegisteredProjects } from '../../utils/userProjects'

export default defineEventHandler(() => ({ projects: listRegisteredProjects() }))
