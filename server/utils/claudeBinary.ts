import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

let resolved: string | null | undefined

/**
 * Path to the user's installed `claude` CLI, or undefined to use the SDK's bundled one.
 * The bundled CLI lags behind and reports an outdated model list.
 */
export function getInstalledClaudePath(): string | undefined {
  if (resolved === undefined) {
    try {
      const p = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim()
      resolved = p && existsSync(p) ? p : null
    } catch {
      resolved = null
    }
  }
  return resolved ?? undefined
}
