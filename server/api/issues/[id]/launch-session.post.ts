import { existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { findResumeTty, openInIterm, shellQuote } from '../../../utils/iterm'
import { SESSION_ID_RE, transcriptExists } from '../../../utils/issues/sessions'
import { readIssue } from '../../../utils/issues/store'

const LABEL_RE = /^[\w. -]{1,40}$/
/** True when `claude-ui` on PATH is this app's own `scripts/claude-ui`, so the short command runs the same version. */
function claudeUiOnPath(cli: string): boolean {
  try {
    const own = realpathSync(cli)
    return (process.env.PATH ?? '').split(delimiter).some((dir) => {
      try { return !!dir && realpathSync(join(dir, 'claude-ui')) === own } catch { return false }
    })
  } catch { return false }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Open an interactive Claude Code session for the issue in a new iTerm2 tab (ADR 0008).
 * Runs `claude-ui iterm2 ISS-n --cwd DIR [--label L]`. Local only: it starts a process on this Mac.
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
  // Resume: a session this issue lists. Its folder and label are reused, a live tab is focused instead of opening a second one.
  const resume = typeof body.resume === 'string' ? body.resume.toLowerCase() : ''
  const known = resume ? issue.sessions?.find(x => x.id === resume) : undefined
  if (resume && (!SESSION_ID_RE.test(resume) || !known)) throw createError({ statusCode: 404, message: 'Session not listed on this issue' })
  if (resume && !transcriptExists(resume)) throw createError({ statusCode: 410, message: 'Transcript is gone, Claude Code cannot resume it' })
  if (known) { body.cwd = known.cwd; body.label = known.label ?? ''; body.prompt = '' }
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

  // Short `claude-ui iterm2` when PATH has this app's own CLI, else the script by absolute path so the version always matches
  const cli = resolve(process.env.CLAUDE_UI_DIR || process.cwd(), 'scripts', 'claude-ui')
  const script = resolve(process.env.CLAUDE_UI_DIR || process.cwd(), 'scripts', 'claude-ui-iterm2.mjs')
  const short = claudeUiOnPath(cli)
  const runner = short ? 'claude-ui iterm2' : existsSync(script) ? `node ${shellQuote(script)}` : 'claude-ui iterm2'
  // The script defaults to port 3030, so the URL is only needed for another port
  const port = /:(\d+)$/.exec(host)?.[1]
  const cmd = [
    port && port !== '3030' ? `CLAUDE_UI_URL=http://localhost:${port}` : '',
    runner, id, ...(resume ? ['--resume', resume] : []), '--cwd', shellQuote(cwd), ...(label ? ['--label', shellQuote(label)] : []),
    ...(promptFile ? ['--prompt-file', shellQuote(promptFile)] : []),
  ].filter(Boolean).join(' ')

  try {
    const result = await openInIterm(cmd, resume ? await findResumeTty(resume) : '')
    return { success: true, result, cwd }
  } catch (error: any) {
    throw createError({ statusCode: 500, message: error.stderr?.trim() || error.message || 'Failed to launch iTerm2' })
  }
})
