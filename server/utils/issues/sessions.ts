import { closeSync, existsSync, fstatSync, openSync, readdirSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { getClaudeDir } from '../claudeDir'

export const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True while Claude Code still has the transcript: `projects/<project>/<session id>.jsonl`. Without it `--resume` fails. */
export function transcriptExists(sessionId: string): boolean {
  const root = join(getClaudeDir(), 'projects')
  try {
    return readdirSync(root).some(d => existsSync(join(root, d, `${sessionId}.jsonl`)))
  } catch {
    return false
  }
}

const TAIL_BYTES = 256 * 1024

/** Title set by `/rename` inside Claude Code: the last `custom-title` record near the end of the transcript. Empty if none. */
export function transcriptTitle(sessionId: string): string {
  const root = join(getClaudeDir(), 'projects')
  try {
    const dir = readdirSync(root).find(d => existsSync(join(root, d, `${sessionId}.jsonl`)))
    if (!dir) return ''
    const fd = openSync(join(root, dir, `${sessionId}.jsonl`), 'r')
    try {
      const size = fstatSync(fd).size
      const len = Math.min(size, TAIL_BYTES)
      const buf = Buffer.alloc(len)
      readSync(fd, buf, 0, len, size - len)
      const lines = buf.toString('utf8').split('\n')
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i]!.includes('"custom-title"')) continue
        try {
          const e = JSON.parse(lines[i]!)
          if (e.type === 'custom-title' && typeof e.customTitle === 'string' && e.customTitle.trim()) return e.customTitle.trim()
        } catch { /* partial first line of the tail */ }
      }
      return ''
    } finally { closeSync(fd) }
  } catch {
    return ''
  }
}
