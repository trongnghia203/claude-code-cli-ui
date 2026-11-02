import { agentGitState, resolveAgentFile } from '../../../utils/agentGit'

export default defineEventHandler(async (event) => {
  const { workingDir } = getQuery(event) as { workingDir?: string }
  return agentGitState(resolveAgentFile(getRouterParam(event, 'slug')!, workingDir))
})
