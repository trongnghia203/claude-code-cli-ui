import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
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

export async function listMemoryFiles(scope: MemoryScope, projectPath?: string): Promise<MemoryFile[]> {
  const out: MemoryFile[] = []
  const claudeDir = getClaudeDir()

  if (scope === 'global') {
    await collect(claudeDir, '~/.claude', ['CLAUDE.md', 'AGENTS.md'], out)
    await collectDir(join(claudeDir, 'rules'), 'rules', '~/.claude/rules', out)
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
  return out
}

/** Only paths produced by listMemoryFiles may be read or written. */
export async function resolveAllowedMemoryFile(scope: MemoryScope, projectPath: string | undefined, path: string): Promise<MemoryFile | undefined> {
  const files = await listMemoryFiles(scope, projectPath)
  return files.find(f => f.path === path)
}

