import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getClaudeDir } from './claudeDir'

const run = promisify(execFile)

export type ItermLaunchResult = 'focused' | 'opened-tab' | 'opened-window'

// argv: 1 = tty of an existing session ('' if none), 2 = shell command to run in a new tab/window
const ITERM_SCRIPT = `
on run argv
  set targetTty to item 1 of argv
  set shellCmd to item 2 of argv
  set wasRunning to application id "com.googlecode.iterm2" is running
  tell application id "com.googlecode.iterm2"
    activate
    if targetTty is not "" and wasRunning then
      repeat with w in windows
        repeat with t in tabs of w
          repeat with s in sessions of t
            if tty of s is targetTty then
              select w
              tell w to select t
              select s
              return "focused"
            end if
          end repeat
        end repeat
      end repeat
    end if
    if not wasRunning then delay 1
    if (count of windows) = 0 then
      set newWindow to create window with default profile
      tell current session of newWindow to write text shellCmd
      return "opened-window"
    end if
    tell current window
      set newTab to create tab with default profile
      tell current session of newTab to write text shellCmd
    end tell
    return "opened-tab"
  end tell
end run
`

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

// Live interactive Claude CLI sessions, from ~/.claude/sessions/<pid>.json (args carry no session id)
async function listLiveSessions(): Promise<{ sessionId: string; pid: number }[]> {
  const dir = join(getClaudeDir(), 'sessions')
  let files: string[]
  try {
    files = (await readdir(dir)).filter(f => /^\d+\.json$/.test(f))
  } catch {
    return []
  }
  const live: { sessionId: string; pid: number }[] = []
  for (const file of files) {
    try {
      const info = JSON.parse(await readFile(join(dir, file), 'utf8'))
      if (info.kind !== 'interactive' || typeof info.sessionId !== 'string') continue
      process.kill(info.pid, 0) // throws when the process is gone
      live.push({ sessionId: info.sessionId.toLowerCase(), pid: info.pid })
    } catch {
      // stale or unreadable entry
    }
  }
  return live
}

async function ttyOfPid(pid: number): Promise<string> {
  const { stdout } = await run('ps', ['-o', 'tty=', '-p', String(pid)])
  const tty = stdout.trim()
  return tty && tty !== '??' && tty !== '-' ? `/dev/${tty}` : ''
}

// tty of a running Claude CLI session, e.g. "/dev/ttys003" ('' if none)
export async function findResumeTty(sessionId: string): Promise<string> {
  const match = (await listLiveSessions()).find(s => s.sessionId === sessionId.toLowerCase())
  return match ? ttyOfPid(match.pid) : ''
}

// Session IDs that currently have a Claude CLI attached to a terminal
export async function listResumeSessionIds(): Promise<string[]> {
  const ids: string[] = []
  for (const { sessionId, pid } of await listLiveSessions()) {
    if (await ttyOfPid(pid)) ids.push(sessionId)
  }
  return ids
}

export async function launchInIterm(sessionId: string, cwd: string): Promise<ItermLaunchResult> {
  const tty = await findResumeTty(sessionId)
  const shellCmd = `cd ${shellQuote(cwd)} && claude --resume ${sessionId}`
  const { stdout } = await run('osascript', ['-e', ITERM_SCRIPT, tty, shellCmd])
  return stdout.trim() as ItermLaunchResult
}
