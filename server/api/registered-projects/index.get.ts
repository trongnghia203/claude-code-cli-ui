import { listUserProjects } from '../../utils/userProjects'

export default defineEventHandler(() => ({ projects: listUserProjects() }))
