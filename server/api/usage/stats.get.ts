import { promises as fs, createReadStream } from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'
import { homedir } from 'os'
import {
  createAccumulator, appendEntry, finalizeStats, getTimeBounds,
  type Granularity, type TimeRange, type StatsFilter,
} from '../../utils/usageStats'

function getProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
}

function projectDisplayName(dirName: string): string {
  // "-Users-nghia-le-ataccama-claude" -> "claude" (last segment after split on -)
  // This is a quick heuristic; exact path resolution not needed for display
  const parts = dirName.split('-').filter(Boolean)
  return parts[parts.length - 1] || dirName
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const range  = (query.range  as TimeRange)    || '30d'
  const gran   = (query.granularity as Granularity) || 'daily'
  const projId = query.projectId as string | undefined
  const fromMs = query.from ? Number(query.from) : undefined
  const toMs   = query.to   ? Number(query.to)   : undefined

  const bounds = getTimeBounds(range, fromMs, toMs)
  const filter: StatsFilter = { from: bounds.from, to: bounds.to, granularity: gran, projectId: projId }

  const projectsDir = getProjectsDir()
  let projectDirs: string[] = []
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })
    projectDirs = entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCacheCreationTokens: 0, totalCacheReadTokens: 0, byModel: [], byDay: [], byProject: [] }
  }

  // Load custom project display names
  let customNames: Record<string, { displayName: string }> = {}
  try {
    const namesPath = join(homedir(), '.claude', 'custom-project-names.json')
    const raw = await fs.readFile(namesPath, 'utf8')
    customNames = JSON.parse(raw)
  } catch {}

  const acc = createAccumulator()

  // If filtering by specific project, only scan that dir
  const dirsToScan = projId ? projectDirs.filter(d => d === projId) : projectDirs

  for (const dirName of dirsToScan) {
    const displayName = customNames[dirName]?.displayName || projectDisplayName(dirName)
    const projectDir = join(projectsDir, dirName)

    let files: string[] = []
    try {
      const all = await fs.readdir(projectDir)
      files = all.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
    } catch { continue }

    for (const file of files) {
      // Quick stat-based time filter: skip file if mtime is way before range start
      const filePath = join(projectDir, file)
      try {
        const stat = await fs.stat(filePath)
        if (stat.mtimeMs < bounds.from - 24 * 60 * 60 * 1000) continue // 1-day grace
      } catch { continue }

      const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
      for await (const line of rl) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          appendEntry(acc, entry, filter, dirName, displayName)
        } catch {}
      }
    }
  }

  return finalizeStats(acc)
})
