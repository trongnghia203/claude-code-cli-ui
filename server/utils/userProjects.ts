import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getClaudeDir } from './claudeDir'

/**
 * Projects the user created: a name plus a directory.
 * Chats, schedules and issues are keyed by the directory, never by this record,
 * so creating, renaming or removing a project cannot lose any of them.
 */
export interface UserProject {
  id: string
  name: string
  path: string
  createdAt: string
}

/** Own config dir, not `~/.claude`: this is the UI's data, not Claude Code's. `CLAUDE_UI_CONFIG_DIR` overrides it. */
const FILE = join(process.env.CLAUDE_UI_CONFIG_DIR || join(homedir(), '.config', 'claude-ui'), 'projects.json')
/** Earlier location. Read once if the new file is missing, so existing projects keep their ids. */
const LEGACY_FILE = () => join(getClaudeDir(), 'registered-projects.json')

/** Projects created on first run so the existing work shows up under a name. Only existing directories are added. */
const SEED: { name: string; path: string }[] = [
  { name: 'ataccama', path: '~/ataccama' },
  { name: 'trongnghia203', path: '~/trongnghia203' },
  { name: 'suri', path: '~/ataccama/ai/suri' },
  { name: 'inhouse', path: '~/ataccama/paas/inhouse' },
  { name: 'olda', path: '~/ataccama/paas/olda' },
  { name: 'olda-utils', path: '~/ataccama/paas/olda-utils' },
]

function normalizeProjectPath(p: string): string {
  const expanded = p.trim().replace(/^~(?=$|\/)/, homedir())
  return expanded.length > 1 ? expanded.replace(/\/+$/, '') : expanded
}

function readFrom(file: string): UserProject[] | null {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(data?.projects) ? data.projects : []
  } catch {
    return null
  }
}

function read(): UserProject[] | null {
  const current = readFrom(FILE)
  if (current) return current
  const legacy = readFrom(LEGACY_FILE())
  if (legacy) write(legacy)
  return legacy
}

function write(projects: UserProject[]) {
  mkdirSync(dirname(FILE), { recursive: true })
  writeFileSync(FILE, JSON.stringify({ projects }, null, 2), 'utf8')
}

export function listUserProjects(): UserProject[] {
  const existing = read()
  if (existing) return existing
  const now = new Date().toISOString()
  const seeded = SEED
    .map(s => ({ name: s.name, path: normalizeProjectPath(s.path) }))
    .filter(s => existsSync(s.path))
    .map(s => ({ id: randomUUID(), ...s, createdAt: now }))
  write(seeded)
  return seeded
}

function assertValid(name: string, path: string, projects: UserProject[], selfId?: string) {
  if (!name) throw createError({ statusCode: 400, message: 'Name is required' })
  if (!path) throw createError({ statusCode: 400, message: 'Directory is required' })
  if (!existsSync(path)) throw createError({ statusCode: 400, message: `Directory not found: ${path}` })
  const others = projects.filter(p => p.id !== selfId)
  if (others.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    throw createError({ statusCode: 409, message: `A project named "${name}" already exists` })
  }
  if (others.some(p => p.path === path)) {
    throw createError({ statusCode: 409, message: `Directory is already project "${others.find(p => p.path === path)!.name}"` })
  }
}

export function createUserProject(input: { name: string; path: string }): UserProject {
  const projects = listUserProjects()
  const name = (input.name ?? '').trim()
  const path = normalizeProjectPath(input.path ?? '')
  assertValid(name, path, projects)
  const project = { id: randomUUID(), name, path, createdAt: new Date().toISOString() }
  write([...projects, project])
  return project
}

export function updateUserProject(id: string, input: { name?: string; path?: string }): UserProject {
  const projects = listUserProjects()
  const current = projects.find(p => p.id === id)
  if (!current) throw createError({ statusCode: 404, message: 'Project not found' })
  const name = (input.name ?? current.name).trim()
  const path = input.path === undefined ? current.path : normalizeProjectPath(input.path)
  assertValid(name, path, projects, id)
  const next = { ...current, name, path }
  write(projects.map(p => (p.id === id ? next : p)))
  return next
}

/** Removes the record only. Files, sessions, schedules and issues in the directory stay. */
export function deleteUserProject(id: string) {
  const projects = listUserProjects()
  if (!projects.some(p => p.id === id)) throw createError({ statusCode: 404, message: 'Project not found' })
  write(projects.filter(p => p.id !== id))
}

/**
 * The created projects in the shape the Chat and Artifacts pages list: the project name,
 * plus session count and last activity of the Claude Code history in the same directory.
 */
export async function getUserProjectsAsHistory() {
  const { getClaudeCodeProjects } = await import('./claudeCodeHistory')
  const history = await getClaudeCodeProjects().catch(() => [])
  const byPath = new Map(history.map(h => [h.path.replace(/\/+$/, ''), h]))
  return listUserProjects().map((p) => {
    const h = byPath.get(p.path)
    return {
      name: h?.name ?? p.path.replace(/[^a-zA-Z0-9]/g, '-'),
      path: p.path,
      displayName: p.name,
      lastActivity: h?.lastActivity,
      sessionCount: h?.sessionCount ?? 0,
    }
  })
}
