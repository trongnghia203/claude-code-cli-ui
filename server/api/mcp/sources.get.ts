import { getMcpSources } from '../../utils/mcpSources'

export default defineEventHandler(async (event) => {
  const { workingDir } = getQuery(event) as { workingDir?: string }
  return getMcpSources(workingDir)
})
