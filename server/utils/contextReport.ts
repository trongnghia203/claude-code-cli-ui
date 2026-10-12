import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { getInstalledClaudePath } from './claudeBinary'
import { cachedJson } from './diskCache'

const execFileAsync = promisify(execFile)

export interface ContextCategory {
  name: string
  tokens: number
  pct: number
}

export interface ContextRow {
  name: string
  /** Source column, or Type for memory files. */
  source: string
  /** Path for memory files. */
  path?: string
  tokens: number
}

export interface ContextReport {
  model: string
  usedTokens: number
  windowTokens: number
  usedPct: number
  categories: ContextCategory[]
  mcpTools: ContextRow[]
  agents: ContextRow[]
  memory: ContextRow[]
  skills: ContextRow[]
  cwd: string
  sessionId?: string
  generatedAt: number
}

/** "3.8k" -> 3800, "1m" -> 1000000, "~90" -> 90, "< 20" -> 20 */
export function parseTokenCount(raw: string): number {
  const m = raw.replace(/[~<,\s]/g, '').match(/^([\d.]+)([km]?)$/i)
  if (!m) return 0
  const n = parseFloat(m[1]!)
  const unit = m[2]!.toLowerCase()
  return Math.round(unit === 'k' ? n * 1_000 : unit === 'm' ? n * 1_000_000 : n)
}

function parseTables(md: string): Map<string, string[][]> {
  const tables = new Map<string, string[][]>()
  let current: string | null = null
  for (const line of md.split('\n')) {
    const h = line.match(/^###\s+(.+?)\s*$/)
    if (h) {
      current = h[1]!
      tables.set(current, [])
      continue
    }
    if (!current || !line.startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (cells.every(c => /^-+$/.test(c))) continue
    tables.get(current)!.push(cells)
  }
  return tables
}

function rows(table: string[][] | undefined, kind: 'source' | 'memory' = 'source'): ContextRow[] {
  if (!table) return []
  return table.slice(1).map(cells => {
    const tokens = parseTokenCount(cells[cells.length - 1] || '')
    if (kind === 'memory') return { name: cells[1] || '', source: cells[0] || '', path: cells[1], tokens }
    return { name: cells[0] || '', source: cells[1] || '', tokens }
  })
}

export function parseContextMarkdown(md: string, cwd: string): ContextReport {
  const model = md.match(/\*\*Model:\*\*\s*(\S+)/)?.[1] ?? 'unknown'
  const tok = md.match(/\*\*Tokens:\*\*\s*([\d.]+[km]?)\s*\/\s*([\d.]+[km]?)\s*\((\d+)%\)/i)
  const tables = parseTables(md)

  const categories: ContextCategory[] = (tables.get('Estimated usage by category') ?? [])
    .slice(1)
    .map(c => ({ name: c[0] || '', tokens: parseTokenCount(c[1] || ''), pct: parseFloat(c[2] || '0') }))

  return {
    model,
    usedTokens: tok ? parseTokenCount(tok[1]!) : 0,
    windowTokens: tok ? parseTokenCount(tok[2]!) : 0,
    usedPct: tok ? Number(tok[3]) : 0,
    categories,
    mcpTools: rows(tables.get('MCP Tools')),
    agents: rows(tables.get('Custom Agents')),
    memory: rows(tables.get('Memory Files'), 'memory'),
    skills: rows(tables.get('Skills')),
    cwd,
    generatedAt: Date.now(),
  }
}

const CACHE_TTL_MS = 60 * 1000
const GLOBAL_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const cache = new Map<string, ContextReport>()
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Runs the installed CLI's `/context` in print mode (local command, no model call)
 * and parses the markdown. ~7s, so results are cached briefly per cwd + session.
 * With `sessionId` the session is resumed, so Messages reflect that conversation.
 * `cwd` must be the session's project directory for `--resume` to find it.
 */
export async function getContextReport(
  cwd: string = homedir(),
  force = false,
  sessionId?: string,
): Promise<ContextReport> {
  if (sessionId && !SESSION_ID_RE.test(sessionId)) throw new Error('Invalid session id')
  // The global listing (skills, agents, memory, MCP) changes rarely: cache it 6h on disk.
  // Session-scoped reports reflect a live conversation, so they keep the short in-memory TTL.
  if (!sessionId && cwd === homedir()) {
    return cachedJson('context-global', GLOBAL_CACHE_TTL_MS, force, () => runContextReport(cwd))
  }
  const key = `${cwd}\0${sessionId ?? ''}`
  const hit = cache.get(key)
  if (hit && !force && Date.now() - hit.generatedAt < CACHE_TTL_MS) return hit

  const report = await runContextReport(cwd, sessionId)
  cache.set(key, report)
  return report
}

async function runContextReport(cwd: string, sessionId?: string): Promise<ContextReport> {

  const bin = getInstalledClaudePath() ?? 'claude'
  // Without a session, don't leave a junk "New Session" file behind for every refresh
  const args = sessionId ? ['-p', '--resume', sessionId, '/context'] : ['-p', '--no-session-persistence', '/context']
  const { stdout } = await execFileAsync(bin, args, {
    cwd,
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  return { ...parseContextMarkdown(stdout, cwd), sessionId }
}
