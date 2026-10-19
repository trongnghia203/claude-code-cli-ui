import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

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

// tty of a running `claude ... --resume <id>` process, e.g. "/dev/ttys003"
export async function findResumeTty(sessionId: string): Promise<string> {
  const { stdout } = await run('ps', ['-axo', 'tty=,args='])
  for (const line of stdout.split('\n')) {
    const match = line.trim().match(/^(\S+)\s+(.*)$/)
    if (!match) continue
    const [, tty, args] = match
    if (tty === '??' || tty === '-') continue
    if (/(^|[\\/\s])claude(\s|$)/.test(args) && args.includes(sessionId) && /(--resume|-r)\s/.test(args)) {
      return `/dev/${tty}`
    }
  }
  return ''
}

export async function launchInIterm(sessionId: string, cwd: string): Promise<ItermLaunchResult> {
  const tty = await findResumeTty(sessionId)
  const shellCmd = `cd ${shellQuote(cwd)} && claude --resume ${sessionId}`
  const { stdout } = await run('osascript', ['-e', ITERM_SCRIPT, tty, shellCmd])
  return stdout.trim() as ItermLaunchResult
}
