import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { sumSessionUsage } from '../../utils/sessionUsage'

interface SessionCost { cost: number; tokens: number; requests: number }
interface CacheEntry extends SessionCost { mtimeMs: number }

// Per-session results keyed by file mtime: unchanged sessions are never rescanned.
const cache = new Map<string, CacheEntry>()
const SAFE = /^[A-Za-z0-9._-]+$/
const MAX_KEYS = 30

/**
 * Cost/tokens per session for the dashboard's recent chats.
 * Query: keys = comma-separated "<projectDir>/<sessionId>". Returns { costs: { [key]: SessionCost } }.
 */
export default defineEventHandler(async (event) => {
  const raw = String(getQuery(event).keys ?? '')
  const keys = raw.split(',').filter(Boolean).slice(0, MAX_KEYS)
  const projectsDir = join(homedir(), '.claude', 'projects')
  const costs: Record<string, SessionCost> = {}

  await Promise.all(keys.map(async (key) => {
    const [project, id] = key.split('/')
    if (!project || !id || !SAFE.test(project) || !SAFE.test(id)) return
    const filePath = join(projectsDir, project, `${id}.jsonl`)
    try {
      const { mtimeMs } = await fs.stat(filePath)
      const hit = cache.get(key)
      if (hit && hit.mtimeMs === mtimeMs) {
        costs[key] = { cost: hit.cost, tokens: hit.tokens, requests: hit.requests }
        return
      }
      const u = await sumSessionUsage(filePath)
      const entry = { mtimeMs, cost: u.cost, tokens: u.tokens, requests: u.requests }
      cache.set(key, entry)
      costs[key] = { cost: entry.cost, tokens: entry.tokens, requests: entry.requests }
    } catch {}
  }))

  return { costs }
})
