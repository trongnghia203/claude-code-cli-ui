import { listIssues } from '../../utils/issues/store'
import { reapStaleRuns } from '../../utils/issues/runner'

export default defineEventHandler((event) => {
  const { workingDir, all } = getQuery(event)
  const dir = typeof workingDir === 'string' ? workingDir.replace(/\/+$/, '') : ''
  const issues = listIssues()
    .filter(i => all === '1' || !dir || i.projectDir === dir)
    .map(i => reapStaleRuns(i))
    .map(({ timeline, runs, ...rest }) => ({
      ...rest,
      commentCount: timeline.filter(e => e.type === 'comment').length,
      runCount: runs.length,
      running: runs.some(r => r.status === 'running'),
      lastRun: runs.at(-1) ? { status: runs.at(-1)!.status, startedAt: runs.at(-1)!.startedAt } : null,
    }))
    .sort((a, b) => b.number - a.number)
  return { issues }
})
