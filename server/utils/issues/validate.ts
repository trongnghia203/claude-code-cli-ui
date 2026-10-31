import { ISSUE_PRIORITIES, ISSUE_STATUSES, PERMISSION_MODES, type Issue } from './store'

type Fields = Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'assignee' | 'labels' | 'parentId' | 'projectDir' | 'permissionMode'>

function bad(message: string): never {
  throw createError({ statusCode: 400, message })
}

/** Validate only the fields present. Used by create (with defaults applied after) and update. */
export function parseFields(body: any): Partial<Fields> {
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
    out.labels = [...new Set(body.labels.map((l: unknown) => String(l).trim()).filter(Boolean))].slice(0, 20) as string[]
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
