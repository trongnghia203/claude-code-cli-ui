import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { sumSessionUsage } from '../../utils/sessionUsage'
import { cachedJson } from '../../utils/diskCache'
import { USAGE_CACHE_TTL_MS } from '../../utils/usageLimits'

export interface TopSession {
  sessionId: string
  title: string
  project: string
  /** ~/.claude/projects dir name, used in /cli/project/<name>/session/<id> */
  projectName: string
  requests: number
  tokens: number
  cost: number
  /** share of total cost in the window, 0-100 */
  sharePct: number
  lastActive: number
}

const HOUR_MS = 60 * 60 * 1000

function projectDisplayName(dirName: string): string {
  const parts = dirName.split('-').filter(Boolean)
  return parts[parts.length - 1] || dirName
}

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const hours = Math.min(Math.max(Number(query.hours) || 24, 1), 24 * 30)
  const projectId = typeof query.projectId === 'string' && query.projectId ? query.projectId : undefined
  return cachedJson(`top-sessions-${hours}-${projectId ?? 'all'}`, USAGE_CACHE_TTL_MS, query.refresh === '1', () => computeTopSessions(hours, projectId))
})

async function computeTopSessions(hours: number, projectId?: string) {
  const from = Date.now() - hours * HOUR_MS
  const projectsDir = join(homedir(), '.claude', 'projects')

  let customNames: Record<string, { displayName: string }> = {}
  try {
    customNames = JSON.parse(await fs.readFile(join(homedir(), '.claude', 'custom-project-names.json'), 'utf8'))
  } catch {}

  let dirs: string[] = []
  try {
    dirs = (await fs.readdir(projectsDir, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).filter(d => !projectId || d === projectId)
  } catch {
    return { hours, totalCost: 0, sessions: [] as TopSession[] }
  }

  const sessions: Omit<TopSession, 'sharePct'>[] = []
  let totalCost = 0

  for (const dirName of dirs) {
    const dir = join(projectsDir, dirName)
    let files: string[] = []
    try {
      files = (await fs.readdir(dir)).filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
    } catch { continue }

    for (const file of files) {
      const filePath = join(dir, file)
      try {
        if ((await fs.stat(filePath)).mtimeMs < from) continue
      } catch { continue }

      const u = await sumSessionUsage(filePath, from)
      const s = {
        sessionId: file.replace(/\.jsonl$/, ''),
        projectName: dirName,
        project: customNames[dirName]?.displayName || projectDisplayName(dirName),
        ...u,
      }

      if (!s.requests) continue
      totalCost += s.cost
      sessions.push({ ...s, title: s.title || s.sessionId.slice(0, 8) })
    }
  }

  const top = sessions
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 15)
    .map(s => ({ ...s, sharePct: totalCost ? (s.cost / totalCost) * 100 : 0 }))

  return { hours, totalCost, sessions: top }
}
