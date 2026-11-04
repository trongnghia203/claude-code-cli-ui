import { listRegisteredProjects } from '../../utils/registeredProjects'

export default defineEventHandler(() => ({ projects: listRegisteredProjects() }))
