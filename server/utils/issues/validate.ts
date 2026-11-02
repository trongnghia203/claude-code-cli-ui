import { ISSUE_PRIORITIES, ISSUE_STATUSES, PERMISSION_MODES, type Issue } from './store'
import { MAX_ISSUE_LABELS, readConfig } from './config'

type Fields = Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'assignee' | 'labels' | 'parentId' | 'projectDir' | 'permissionMode'>
  & Partial<Pick<Issue, 'properties' | 'wakeups'>>

function bad(message: string): never {
  throw createError({ statusCode: 400, message })
}

/** Keep only known property ids with a value that fits the type. Empty values clear the property. */
function parseProperties(input: unknown, projectDir: string): Record<string, string | number | boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Properties must be an object')
  const defs = new Map(readConfig(projectDir).properties.map(p => [p.id, p]))
  const out: Record<string, string | number | boolean> = {}
  for (const [id, raw] of Object.entries(input as Record<string, unknown>)) {
    const def = defs.get(id)
    if (!def || raw === null || raw === '' || raw === undefined) continue
    switch (def.type) {
      case 'number': {
        const n = Number(raw)
        if (!Number.isFinite(n)) bad(`${def.name} must be a number`)
        out[id] = n
        break
      }
      case 'checkbox': out[id] = raw === true || raw === 'true'; break
      case 'select':
        if (!def.options.some(o => o.id === raw)) bad(`Invalid option for ${def.name}`)
        out[id] = String(raw)
        break
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) bad(`${def.name} must be a date (YYYY-MM-DD)`)
        out[id] = String(raw)
        break
      case 'url':
        if (!/^https?:\/\/\S+$/.test(String(raw))) bad(`${def.name} must be an http(s) URL`)
        out[id] = String(raw).slice(0, 500)
        break
      default: out[id] = String(raw).slice(0, 500)
    }
  }
  return out
}

/** Validate only the fields present. Used by create (with defaults applied after) and update. */
export function parseFields(body: any, projectDir: string): Partial<Fields> {
  if (!body || typeof body !== 'object') bad('Body must be an object')
  const out: Partial<Fields> = {}
  if ('title' in body) {
    const t = String(body.title ?? '').trim()
    if (!t) bad('Title is required')
    if (t.length > 200) bad('Title is too long (max 200)')
    out.title = t
  }
  if ('description' in body) out.description = String(body.description ?? '')
  if ('status' in body) {
    if (!(ISSUE_STATUSES as readonly string[]).includes(body.status)) bad(`Invalid status: ${body.status}`)
    out.status = body.status
  }
  if ('priority' in body) {
    if (!(ISSUE_PRIORITIES as readonly string[]).includes(body.priority)) bad(`Invalid priority: ${body.priority}`)
    out.priority = body.priority
  }
  if ('permissionMode' in body) {
    if (!(PERMISSION_MODES as readonly string[]).includes(body.permissionMode)) bad(`Invalid permission mode: ${body.permissionMode}`)
    out.permissionMode = body.permissionMode
  }
  if ('assignee' in body) {
    const a = body.assignee == null || body.assignee === '' ? null : String(body.assignee)
    if (a && !/^[A-Za-z0-9._-]+$/.test(a)) bad('Invalid assignee')
    out.assignee = a
  }
  if ('labels' in body) {
    if (!Array.isArray(body.labels)) bad('Labels must be a list')
    // Only ids that exist in the workspace config: a label deleted in another tab is dropped, not kept dangling
    const known = new Set(readConfig(projectDir).labels.map(l => l.id))
    out.labels = [...new Set(body.labels.map((l: unknown) => String(l).trim()).filter((l: string) => known.has(l)))].slice(0, MAX_ISSUE_LABELS) as string[]
  }
  if ('properties' in body) out.properties = parseProperties(body.properties, projectDir)
  if ('wakeups' in body) {
    const v = body.wakeups?.subIssuesFinish
    if (v !== undefined && v !== 'default' && v !== 'on' && v !== 'off') bad('Invalid wakeup setting')
    out.wakeups = v === 'on' || v === 'off' ? { subIssuesFinish: v } : {}
  }
  if ('parentId' in body) out.parentId = body.parentId ? String(body.parentId) : null
  if ('projectDir' in body) out.projectDir = String(body.projectDir ?? '').replace(/\/+$/, '')
  return out
}

/** A user edit starts a run when an agent is assigned, the status is ready, and assignee or status changed. */
export function shouldAutoRun(before: Pick<Issue, 'assignee' | 'status'> | null, after: Pick<Issue, 'assignee' | 'status'>): boolean {
  if (!after.assignee) return false
  if (after.status !== 'todo' && after.status !== 'in_progress') return false
  return !before || before.assignee !== after.assignee || before.status !== after.status
}
