import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { computeUsageCost } from './models'

export interface SessionUsage {
  title: string
  requests: number
  tokens: number
  cost: number
  lastActive: number
}

/** Sums assistant usage in one session .jsonl, counting only entries at or after `from` (ms). */
export async function sumSessionUsage(filePath: string, from = 0): Promise<SessionUsage> {
  const s: SessionUsage = { title: '', requests: 0, tokens: 0, cost: 0, lastActive: 0 }
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry.type === 'ai-title' && entry.aiTitle) { s.title = entry.aiTitle; continue }
      if (entry.type !== 'assistant') continue
      const usage = entry.message?.usage
      if (!usage) continue
      const t = new Date(entry.timestamp).getTime()
      if (isNaN(t) || t < from) continue
      s.requests++
      s.cost += computeUsageCost(usage, entry.message?.model || 'unknown')
      s.tokens += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
        + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
      s.lastActive = Math.max(s.lastActive, t)
    } catch {}
  }
  return s
}
