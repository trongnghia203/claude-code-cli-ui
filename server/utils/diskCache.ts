import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface Entry<T> { at: number; value: T }

const CACHE_FILE = join(homedir(), '.claude', '.agents-ui-usage-cache.json')
const memory = new Map<string, Entry<unknown>>()
let loaded = false

async function load(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const parsed = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')) as Record<string, Entry<unknown>>
    for (const [k, v] of Object.entries(parsed)) memory.set(k, v)
  } catch {}
}

async function persist(): Promise<void> {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(memory)))
  } catch {}
}

/**
 * Memory + disk cache so expensive computations survive page switches and dev restarts.
 * `force` bypasses the TTL; if recompute fails, a stale entry is served instead of an error.
 */
export async function cachedJson<T>(key: string, ttlMs: number, force: boolean, compute: () => Promise<T>): Promise<T> {
  await load()
  const hit = memory.get(key) as Entry<T> | undefined
  if (hit && !force && Date.now() - hit.at < ttlMs) return hit.value
  try {
    const value = await compute()
    memory.set(key, { at: Date.now(), value })
    await persist()
    return value
  } catch (e) {
    if (hit) return hit.value
    throw e
  }
}
