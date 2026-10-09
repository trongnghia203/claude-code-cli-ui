import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { scheduleCore, type ScheduleJob } from './core'

const run = promisify(execFile)
const LABEL_PREFIX = 'com.claude-ui.schedule.'
const AGENTS_DIR = join(homedir(), 'Library', 'LaunchAgents')

export const launchdSupported = process.platform === 'darwin'

const labelFor = (id: string) => `${LABEL_PREFIX}${id}`
const plistPathFor = (id: string) => join(AGENTS_DIR, `${labelFor(id)}.plist`)
const domain = () => `gui/${process.getuid?.() ?? 501}`

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function plistValue(v: unknown): string {
  if (typeof v === 'number') return `<integer>${v}</integer>`
  if (typeof v === 'boolean') return v ? '<true/>' : '<false/>'
  if (Array.isArray(v)) return `<array>${v.map(plistValue).join('')}</array>`
  if (v && typeof v === 'object') {
    return `<dict>${Object.entries(v).map(([k, x]) => `<key>${xml(k)}</key>${plistValue(x)}`).join('')}</dict>`
  }
  return `<string>${xml(String(v))}</string>`
}

/** The runner lives in this repo; launchd starts it with the same node that runs the app. */
function runnerPath() {
  return resolve(process.cwd(), 'scripts', 'run-schedule.mjs')
}

export async function buildPlist(job: ScheduleJob): Promise<string> {
  const core = await scheduleCore()
  const calendar = core.calendarEntries(job.schedule)
  const logFile = join(core.LOGS_DIR, `${job.id}.log`)
  const pathEnv = [dirnameOf(job.claudePath), join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
    .filter(Boolean).join(':')

  const dict: Record<string, unknown> = {
    Label: labelFor(job.id),
    ProgramArguments: [process.execPath, runnerPath(), job.id],
    WorkingDirectory: homedir(),
    StandardOutPath: logFile,
    StandardErrorPath: logFile,
    EnvironmentVariables: { PATH: pathEnv, HOME: homedir() },
    RunAtLoad: false,
    ...(calendar ? { StartCalendarInterval: calendar } : { StartInterval: Math.max(60, (job.schedule.everyMinutes || 60) * 60) }),
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${plistValue(dict)}</plist>\n`
}

function dirnameOf(p?: string) {
  return p ? p.replace(/\/[^/]*$/, '') : ''
}

export async function uninstallJob(id: string) {
  if (!launchdSupported) return
  try {
    await run('launchctl', ['bootout', `${domain()}/${labelFor(id)}`])
  } catch {
    // not loaded
  }
  rmSync(plistPathFor(id), { force: true })
}

/** (Re)register the job with launchd. A disabled job is only unregistered. */
export async function installJob(job: ScheduleJob) {
  if (!launchdSupported) throw new Error('Scheduled runs need macOS (launchd)')
  ;(await scheduleCore()).ensureDirs()
  await uninstallJob(job.id)
  if (!job.enabled) return
  mkdirSync(AGENTS_DIR, { recursive: true })
  const path = plistPathFor(job.id)
  writeFileSync(path, await buildPlist(job))
  try {
    await run('launchctl', ['bootstrap', domain(), path])
  } catch (e: any) {
    rmSync(path, { force: true })
    throw new Error(`launchctl could not load the job: ${e.stderr || e.message}`)
  }
}

export async function isLoaded(id: string): Promise<boolean> {
  if (!launchdSupported || !existsSync(plistPathFor(id))) return false
  try {
    await run('launchctl', ['print', `${domain()}/${labelFor(id)}`])
    return true
  } catch {
    return false
  }
}
