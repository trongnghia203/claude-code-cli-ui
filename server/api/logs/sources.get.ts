import fs from 'node:fs'
import { resolveClaudePath } from '../../utils/claudeDir'

interface LogSource {
  id: string
  name: string
  path: string
  size: number
  mtime: number
  exists: boolean
}

export default defineEventHandler(async () => {
  const candidates: { id: string; name: string; path: string }[] = [
    { id: 'daemon', name: 'Claude Daemon', path: resolveClaudePath('daemon.log') },
    { id: 'ui', name: 'UI Dev Server', path: '/tmp/claude-code-agents-ui.log' },
  ]

  const sources: LogSource[] = candidates.map(c => {
    try {
      const stat = fs.statSync(c.path)
      return { ...c, size: stat.size, mtime: stat.mtimeMs, exists: true }
    } catch {
      return { ...c, size: 0, mtime: 0, exists: false }
    }
  })

  return sources
})
