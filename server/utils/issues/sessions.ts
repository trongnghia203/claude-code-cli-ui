import { existsSync, readdirSync } from 'node:fs'
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
