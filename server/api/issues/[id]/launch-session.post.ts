import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { openInIterm, shellQuote } from '../../../utils/iterm'
import { readIssue } from '../../../utils/issues/store'

const LABEL_RE = /^[\w. -]{1,40}$/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Open an interactive Claude Code session for the issue in a new iTerm2 tab (ADR 0008).
 * Runs `claude-ui session ISS-n --cwd DIR [--label L]`. Local only: it starts a process on this Mac.
 * Host must be loopback (blocks LAN access and DNS rebinding) and a browser Origin must match the Host (blocks other sites).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const issue = readIssue(id)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  if (process.platform !== 'darwin') throw createError({ statusCode: 501, message: 'iTerm2 launch is only supported on macOS' })
  const host = getRequestHeader(event, 'host') ?? ''
  const origin = getRequestHeader(event, 'origin')
  if (!LOCAL_HOSTS.has(host.replace(/:\d+$/, '')) || (origin && new URL(origin).host !== host)) {
    throw createError({ statusCode: 403, message: 'Only from this machine' })
  }

  const body = (await readBody(event)) ?? {}
  const cwd = resolve(String(body.cwd || issue.projectDir).replace(/^~(?=\/|$)/, homedir()))
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw createError({ statusCode: 400, message: `Working directory does not exist: ${cwd}` })
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (label && !LABEL_RE.test(label)) throw createError({ statusCode: 400, message: 'Label: letters, digits, space, . _ - only, max 40' })

  // First message: empty = the CLI default. Text goes through a private file, so a newline cannot run a command in the tab.
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : ''
  let promptFile = ''
  if (prompt) {
    const dir = join(tmpdir(), 'claude-ui-sessions')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    promptFile = join(dir, `prompt-${id}-${Date.now()}.txt`)
    writeFileSync(promptFile, prompt, { mode: 0o600 })
  }

  // The CLI next to this app, so it matches the running version; PATH `claude-ui` is the fallback
  const script = resolve(process.env.CLAUDE_UI_DIR || process.cwd(), 'scripts', 'claude-ui-session.mjs')
  const runner = existsSync(script) ? `node ${shellQuote(script)}` : 'claude-ui session'
  const port = /:(\d+)$/.exec(host)?.[1]
  const cmd = [
    port ? `CLAUDE_UI_URL=http://localhost:${port}` : '',
    runner, id, '--cwd', shellQuote(cwd), ...(label ? ['--label', shellQuote(label)] : []),
    ...(promptFile ? ['--prompt-file', shellQuote(promptFile)] : []),
  ].filter(Boolean).join(' ')

  try {
    const result = await openInIterm(cmd)
    return { success: true, result, cwd }
  } catch (error: any) {
    throw createError({ statusCode: 500, message: error.stderr?.trim() || error.message || 'Failed to launch iTerm2' })
  }
})
