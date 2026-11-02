import { PROPERTY_TYPES, newOptionId, type PropertyOption, type PropertyType } from './config'

function bad(message: string): never {
  throw createError({ statusCode: 400, message })
}

const name = (v: unknown, what: string) => {
  const n = String(v ?? '').trim()
  if (!n) bad(`${what} name is required`)
  if (n.length > 40) bad(`${what} name is too long (max 40)`)
  return n
}

export function parseLabel(body: any, creating: boolean): { name?: string; color?: string; description?: string } {
  if (!body || typeof body !== 'object') bad('Body must be an object')
  const out: { name?: string; color?: string; description?: string } = {}
  if (creating || 'name' in body) out.name = name(body.name, 'Label')
  if ('color' in body) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(body.color))) bad('Color must look like #3b82f6')
    out.color = String(body.color).toLowerCase()
  }
  if ('description' in body) out.description = String(body.description ?? '').slice(0, 200)
  return out
}

function parseOptions(raw: unknown): PropertyOption[] {
  if (!Array.isArray(raw)) bad('Options must be a list')
  const seen = new Set<string>()
  const out: PropertyOption[] = []
  for (const o of raw.slice(0, 50)) {
    const n = String(typeof o === 'string' ? o : o?.name ?? '').trim().slice(0, 40)
    if (!n || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    // An existing option keeps its id so stored values survive a rename
    out.push({ id: typeof o === 'object' && o?.id ? String(o.id) : newOptionId(), name: n })
  }
  return out
}

export function parseProperty(body: any, creating: boolean): { name?: string; type?: PropertyType; options?: PropertyOption[]; archived?: boolean } {
  if (!body || typeof body !== 'object') bad('Body must be an object')
  const out: { name?: string; type?: PropertyType; options?: PropertyOption[]; archived?: boolean } = {}
  if (creating || 'name' in body) out.name = name(body.name, 'Property')
  if (creating) {
    if (!(PROPERTY_TYPES as readonly string[]).includes(body.type)) bad(`Invalid type: ${body.type}`)
    out.type = body.type
  }
  if ('options' in body) out.options = parseOptions(body.options)
  if (creating && out.type === 'select' && !out.options?.length) bad('A select property needs at least one option')
  if ('archived' in body) out.archived = !!body.archived
  return out
}

/** Settings scope of a request: ?projectDir=<path> for one project's file, none for the default. */
export function scopeOf(event: any): string | null {
  const d = getQuery(event).projectDir
  return typeof d === 'string' && d ? d.replace(/\/+$/, '') : null
}
