import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { getInstalledClaudePath } from './claudeBinary'

const execFileAsync = promisify(execFile)

export interface LimitBar {
  label: string
  pct: number
  resets: string
}

export interface TopItem {
  name: string
  /** "1%" or "<1%" as printed by the CLI */
  pct: string
}

export interface UsagePeriod {
  label: string
  requests: number
  sessions: number
  /** e.g. "37% of your usage was at >150k context" */
  insights: { pct: string; text: string }[]
  tops: { kind: string; items: TopItem[] }[]
}

export interface UsageLimits {
  plan: string
  limits: LimitBar[]
  note: string
  periods: UsagePeriod[]
  raw: string
  generatedAt: number
}

export function parseUsageOutput(raw: string): UsageLimits {
  const lines = raw.split('\n').map(l => l.replace(/\s+$/, ''))
  const limits: LimitBar[] = []
  const periods: UsagePeriod[] = []
  let plan = ''
  let note = ''
  let current: UsagePeriod | null = null

  for (const line of lines) {
    if (!line.trim() || line.startsWith('Shell cwd')) continue

    const bar = line.match(/^(Current .+?):\s*(\d+)% used\s*·\s*resets\s*(.+)$/i)
    if (bar) {
      limits.push({ label: bar[1]!, pct: Number(bar[2]), resets: bar[3]! })
      continue
    }

    const period = line.match(/^Last (\S+)\s*·\s*(\d+) requests?\s*·\s*(\d+) sessions?/i)
    if (period) {
      current = { label: `Last ${period[1]}`, requests: Number(period[2]), sessions: Number(period[3]), insights: [], tops: [] }
      periods.push(current)
      continue
    }

    if (current && /^\s+/.test(line)) {
      const top = line.trim().match(/^Top ([^:]+):\s*(.+)$/i)
      if (top) {
        const items = top[2]!.split(/,\s*/).map((part): TopItem | null => {
          const m = part.trim().match(/^(.+?)\s+(<?\d+%)$/)
          return m ? { name: m[1]!, pct: m[2]! } : null
        }).filter((i): i is TopItem => !!i)
        current.tops.push({ kind: top[1]!, items })
        continue
      }
      const insight = line.trim().match(/^(<?\d+%)\s+(.+)$/)
      if (insight) current.insights.push({ pct: insight[1]!, text: insight[2]! })
      continue
    }

    if (/^What's contributing/i.test(line)) continue
    if (/^Approximate/i.test(line)) { note = line.trim(); continue }
    if (!plan && !limits.length) plan = line.trim()
  }

  return { plan, limits, note, periods, raw, generatedAt: Date.now() }
}

const CACHE_TTL_MS = 60 * 1000
let cached: UsageLimits | null = null

/** Runs the installed CLI's `/usage` in print mode (~2s) and parses the text. */
export async function getUsageLimits(force = false): Promise<UsageLimits> {
  if (cached && !force && Date.now() - cached.generatedAt < CACHE_TTL_MS) return cached
  const bin = getInstalledClaudePath() ?? 'claude'
  const { stdout } = await execFileAsync(bin, ['-p', '/usage'], {
    cwd: homedir(),
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  cached = parseUsageOutput(stdout)
  return cached
}
