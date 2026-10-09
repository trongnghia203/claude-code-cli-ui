import { existsSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolveHome } from '../path'
import { getInstalledClaudePath } from '../claudeBinary'
import type { PermissionModeSetting, ScheduleJob, ScheduleSpec } from './core'

// bypassPermissions is deliberately not offered: a job runs unattended
const MODES: PermissionModeSetting[] = ['plan', 'default', 'acceptEdits']
const KINDS: ScheduleSpec['kind'][] = ['hourly', 'interval', 'daily', 'weekdays', 'weekly']

const cleanList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : []

/** Turn a request body into a valid job. Throws a readable error. */
export function toJob(body: any, existing?: ScheduleJob): ScheduleJob {
  const name = String(body.name ?? '').trim()
  if (!name) throw new Error('Name is required')
  const prompt = String(body.prompt ?? '').trim()
  if (!prompt) throw new Error('Prompt is required')

  const workingDir = resolveHome(String(body.workingDir ?? '').trim())
  if (!workingDir || !existsSync(workingDir) || !statSync(workingDir).isDirectory()) {
    throw new Error(`Project folder not found: ${workingDir || '(empty)'}`)
  }

  const s = body.schedule ?? {}
  if (!KINDS.includes(s.kind)) throw new Error('Pick a schedule type')
  if (s.kind === 'interval') {
    const m = Number(s.everyMinutes)
    if (!Number.isFinite(m) || m < 1 || m > 7 * 24 * 60) throw new Error('Interval must be between 1 minute and 7 days')
  } else if (!/^\d{1,2}:\d{2}$/.test(String(s.time ?? ''))) {
    throw new Error('Time must look like 09:00')
  }
  if (s.kind === 'weekly' && !(Number(s.weekday) >= 0 && Number(s.weekday) <= 6)) throw new Error('Pick a weekday')

  const permissionMode: PermissionModeSetting = MODES.includes(body.permissionMode) ? body.permissionMode : 'plan'
  const budget = Number(body.maxBudgetUsd ?? 1)
  const timeout = Number(body.timeoutMinutes ?? 30)

  return {
    id: existing?.id ?? randomUUID().slice(0, 8),
    name,
    enabled: body.enabled !== false,
    agent: body.agent ? String(body.agent).trim() : null,
    prompt,
    workingDir,
    model: body.model ? String(body.model).trim() : null,
    permissionMode,
    allowedTools: cleanList(body.allowedTools),
    disallowedTools: cleanList(body.disallowedTools),
    maxBudgetUsd: Number.isFinite(budget) && budget > 0 ? Math.min(budget, 50) : 1,
    timeoutMinutes: Number.isFinite(timeout) && timeout >= 1 ? Math.min(timeout, 240) : 30,
    schedule: {
      kind: s.kind,
      ...(s.kind === 'interval' ? { everyMinutes: Math.round(Number(s.everyMinutes)) } : { time: String(s.time) }),
      ...(s.kind === 'weekly' ? { weekday: Math.round(Number(s.weekday)) } : {}),
    },
    claudePath: getInstalledClaudePath(),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
}
