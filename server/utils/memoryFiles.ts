import { readdir, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { isAbsolute, join, relative, sep } from 'node:path'
import { getClaudeDir } from './claudeDir'
import { resolveHome } from './path'

export type MemoryScope = 'global' | 'project'

export interface MemoryFile {
  /** Absolute path on disk (also the identifier used by the file endpoints) */
  path: string
  /** Name shown in the list, relative to its group root */
  name: string
  group: string
  exists: boolean
  /** Shown even when missing so the user can create it */
  suggested: boolean
}

// Top-level markdown files that are not AI instructions
const IGNORED_TOP_LEVEL = new Set(['README.md', 'CHANGELOG.md', 'LICENSE.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md'])

/** Claude Code stores per-project auto-memory under ~/.claude/projects/<path with non-alphanumerics as "-">/memory */
export function encodeProjectDirName(projectPath: string): string {
  return projectPath.replace(/[^a-zA-Z0-9]/g, '-')
}

async function listMarkdown(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md')).map(e => e.name).sort()
  } catch {
    return []
  }
}

function suggested(path: string, name: string, group: string): MemoryFile {
  return { path, name, group, exists: existsSync(path), suggested: true }
}

async function collect(root: string, group: string, suggestedNames: string[], out: MemoryFile[], opts: { topLevelCapsOnly?: boolean } = {}) {
  const seen = new Set<string>()
  for (const name of suggestedNames) {
    const p = join(root, name)
    out.push(suggested(p, name, group))
    seen.add(p)
  }
  for (const name of await listMarkdown(root)) {
    const p = join(root, name)
    if (seen.has(p) || IGNORED_TOP_LEVEL.has(name)) continue
    // In a project root only pick up ALL-CAPS names (SOUL.md, MEMORY.md...), not every doc
    if (opts.topLevelCapsOnly && name.replace(/\.md$/i, '') !== name.replace(/\.md$/i, '').toUpperCase()) continue
    out.push({ path: p, name, group, exists: true, suggested: false })
  }
}

async function collectDir(dir: string, label: string, group: string, out: MemoryFile[]) {
  for (const name of await listMarkdown(dir)) {
    out.push({ path: join(dir, name), name: `${label}/${name}`, group, exists: true, suggested: false })
  }
}

const KNOWLEDGE_MAX_FILES = 2000
const KNOWLEDGE_MAX_DEPTH = 8

const KNOWLEDGE_EXT = /\.(md|json|jsonl)$/i

/** Recursively collect *.md and *.json(l) (e.g. _indexes.jsonl) under a knowledge folder; `name` is "knowledge/<relative path>" so it nests under the parent group. */
async function collectKnowledge(dir: string, group: string, out: MemoryFile[]) {
  if (!existsSync(dir)) return
  let count = 0
  async function walk(current: string, depth: number) {
    if (depth > KNOWLEDGE_MAX_DEPTH || count >= KNOWLEDGE_MAX_FILES) return
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const p = join(current, e.name)
      if (e.isDirectory()) {
        await walk(p, depth + 1)
      } else if (e.isFile() && KNOWLEDGE_EXT.test(e.name)) {
        if (count >= KNOWLEDGE_MAX_FILES) return
        count++
        out.push({ path: p, name: `knowledge/${relative(dir, p).split(sep).join('/')}`, group, exists: true, suggested: false })
      }
    }
  }
  await walk(dir, 0)
}

// Dependency, build and tooling folders: never hold docs worth listing
const SKIPPED_DIRS = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'coverage', '__pycache__', 'site-packages'])

export async function listMemoryFiles(scope: MemoryScope, projectPath?: string): Promise<MemoryFile[]> {
  const out: MemoryFile[] = []
  const claudeDir = getClaudeDir()

  if (scope === 'global') {
    await collect(claudeDir, '~/.claude', ['CLAUDE.md', 'AGENTS.md'], out)
    await collectDir(join(claudeDir, 'rules'), 'rules', '~/.claude/rules', out)
    await collectKnowledge(join(claudeDir, 'knowledge'), '~/.claude', out)
    return out
  }

  if (!projectPath) return out
  const root = resolveHome(projectPath)
  await collect(root, 'Project root', ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'], out, { topLevelCapsOnly: true })
  const dotClaude = join(root, '.claude')
  if (existsSync(join(dotClaude, 'CLAUDE.md'))) {
    out.push({ path: join(dotClaude, 'CLAUDE.md'), name: '.claude/CLAUDE.md', group: '.claude', exists: true, suggested: false })
  }
  await collectDir(join(dotClaude, 'rules'), '.claude/rules', '.claude/rules', out)
  await collectDir(join(claudeDir, 'projects', encodeProjectDirName(root), 'memory'), 'memory', 'Auto memory', out)
  await collectKnowledge(join(root, 'knowledge'), 'Project root', out)
  return out
}

function scopeRoot(scope: MemoryScope, projectPath?: string): string | undefined {
  if (scope === 'global') return getClaudeDir()
  return projectPath ? resolveHome(projectPath) : undefined
}

function scopeGroup(scope: MemoryScope): string {
  return scope === 'global' ? '~/.claude' : 'Project root'
}

// Local notes are usually gitignored on purpose but are exactly what this page edits
const ALWAYS_SHOWN = /\.local\.md$/i

/** Names (dirs get a trailing "/") that git ignores in `dir`: .gitignore files, .git/info/exclude and the global excludes file. Empty when `dir` is not in a git repo. */
function gitIgnored(dir: string, names: string[]): Promise<Set<string>> {
  return new Promise((resolve) => {
    if (!names.length) return resolve(new Set())
    const child = spawn('git', ['check-ignore', '--stdin', '-z'], { cwd: dir, stdio: ['pipe', 'pipe', 'ignore'] })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.on('error', () => resolve(new Set()))
    // Exit 1 = nothing ignored, 128 = not a repo: both leave `out` empty
    child.on('close', () => resolve(new Set(out.split('\0').filter(Boolean))))
    child.stdin.on('error', () => {})
    child.stdin.end(names.join('\0'))
  })
}

export interface MemoryDirListing {
  /** Sub-folders, relative to the project root with "/" separators */
  dirs: string[]
  /** Markdown files directly in the folder (none for the root itself: those come from listMemoryFiles) */
  files: MemoryFile[]
}

/** List one folder of a scope (project root or ~/.claude): its sub-folders and *.md files. `dir` is relative to that root ("" = root). */
export async function listMemoryDir(scope: MemoryScope, projectPath: string | undefined, dir: string): Promise<MemoryDirListing | undefined> {
  const root = scopeRoot(scope, projectPath)
  if (!root) return undefined
  const group = scopeGroup(scope)
  const abs = join(root, dir)
  const rel = relative(root, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) return undefined
  const parts = rel ? rel.split(sep) : []
  if (parts.some(p => p.startsWith('.') || SKIPPED_DIRS.has(p))) return undefined
  try {
    const [realRoot, realAbs] = await Promise.all([realpath(root), realpath(abs)])
    if (relative(realRoot, realAbs).startsWith('..')) return undefined
  } catch {
    return undefined
  }
  let entries
  try {
    entries = await readdir(abs, { withFileTypes: true })
  } catch {
    return undefined
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  const candidates = entries.filter(e => !e.name.startsWith('.') && !SKIPPED_DIRS.has(e.name) && !ALWAYS_SHOWN.test(e.name))
  const ignored = await gitIgnored(abs, candidates.map(e => (e.isDirectory() ? `${e.name}/` : e.name)))
  const dirs: string[] = []
  const files: MemoryFile[] = []
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIPPED_DIRS.has(e.name)) continue
    if (ignored.has(e.isDirectory() ? `${e.name}/` : e.name)) continue
    const p = join(abs, e.name)
    if (e.isDirectory()) {
      dirs.push([...parts, e.name].join('/'))
    } else if (rel && e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      files.push({ path: p, name: [...parts, e.name].join('/'), group, exists: true, suggested: false })
    }
  }
  return { dirs, files }
}

/** True when `path` is a *.md inside `root` that the folder listing would show (no hidden or skipped folder, real path stays in root). */
async function isNestedMarkdown(root: string, path: string): Promise<boolean> {
  const rel = relative(root, path)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || !path.toLowerCase().endsWith('.md')) return false
  const parts = rel.split(sep)
  if (parts.length < 2 || parts.some(p => p.startsWith('.') || SKIPPED_DIRS.has(p))) return false
  try {
    const real = await realpath(path)
    const realRoot = await realpath(root)
    return !relative(realRoot, real).startsWith('..')
  } catch {
    return false
  }
}

/** Only paths produced by listMemoryFiles may be read or written. */
export async function resolveAllowedMemoryFile(scope: MemoryScope, projectPath: string | undefined, path: string): Promise<MemoryFile | undefined> {
  // Fast path: nested docs, avoids re-walking the whole tree on every open/save
  const root = scopeRoot(scope, projectPath)
  if (root && await isNestedMarkdown(root, path)) {
    return { path, name: relative(root, path).split(sep).join('/'), group: scopeGroup(scope), exists: true, suggested: false }
  }
  const files = await listMemoryFiles(scope, projectPath)
  return files.find(f => f.path === path)
}
