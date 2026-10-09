import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, basename, relative } from 'node:path'
import { getClaudeDir } from './claudeDir'
import { spawnAsync, getCurrentBranchName, type SpawnResult } from './gitUtils'
import { listMemoryFiles, type MemoryFile, type MemoryScope } from './memoryFiles'

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
const PROTECTED_BRANCHES = ['main', 'master']

function git(cwd: string, args: string[], timeout = 30_000): Promise<SpawnResult> {
  return spawnAsync('git', args, { cwd, env: GIT_ENV, timeout })
}

/** Nearest existing directory at or above the file (new files may live in folders that do not exist yet). */
function existingDir(filePath: string): string | null {
  let dir = dirname(filePath)
  while (dir && !existsSync(dir)) {
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return existsSync(dir) ? dir : null
}

async function repoRootOf(filePath: string): Promise<string | null> {
  const dir = existingDir(filePath)
  if (!dir) return null
  try {
    const r = await git(dir, ['rev-parse', '--show-toplevel'])
    return r.code === 0 && r.stdout.trim() ? r.stdout.trim() : null
  } catch {
    return null
  }
}

export interface RepoChange {
  /** Absolute path */
  path: string
  name: string
  /** Folder relative to the repo root ('' at the root) */
  dir: string
  /** A added, M modified, D deleted, R renamed, U untracked */
  status: string
}

export interface RepoState {
  root: string
  label: string
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  protectedBranch: boolean
  staged: RepoChange[]
  changes: RepoChange[]
  /** Changed files in this repo that are not memory files (not listed, never committed from here) */
  otherChanges: number
}

function repoLabel(root: string): string {
  return root === getClaudeDir() ? '~/.claude' : basename(root)
}

/** Parse `git status --porcelain=v1 -z`: "XY path\0", renames add "orig\0". */
function parsePorcelain(out: string): { x: string; y: string; path: string }[] {
  const tokens = out.split('\0').filter(Boolean)
  const entries: { x: string; y: string; path: string }[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    const x = t[0]!
    const y = t[1]!
    entries.push({ x, y, path: t.slice(3) })
    if (x === 'R' || x === 'C') i++
  }
  return entries
}

/** Group the memory files by git repository and report each repo's staged / changed memory files. */
export async function getRepoStates(files: MemoryFile[]): Promise<RepoState[]> {
  const byRoot = new Map<string, MemoryFile[]>()
  for (const f of files) {
    const root = await repoRootOf(f.path)
    if (!root) continue
    if (!byRoot.has(root)) byRoot.set(root, [])
    byRoot.get(root)!.push(f)
  }

  const states: RepoState[] = []
  for (const [root, repoFiles] of byRoot) {
    const rels = repoFiles.map(f => relative(root, f.path))
    const byRel = new Map(repoFiles.map(f => [relative(root, f.path), f]))

    const matched = await git(root, ['status', '--porcelain=v1', '-z', '-uall', '--', ...rels])
    const all = await git(root, ['status', '--porcelain=v1', '-z'])
    const entries = parsePorcelain(matched.stdout)

    const staged: RepoChange[] = []
    const changes: RepoChange[] = []
    for (const e of entries) {
      const file = byRel.get(e.path)
      if (!file) continue
      const base = { path: file.path, name: basename(file.path), dir: dirname(e.path) === '.' ? '' : dirname(e.path) }
      if (e.x === '?' && e.y === '?') {
        changes.push({ ...base, status: 'U' })
        continue
      }
      if (e.x !== ' ' && e.x !== '?') staged.push({ ...base, status: e.x })
      if (e.y !== ' ' && e.y !== '?') changes.push({ ...base, status: e.y })
    }
    const otherChanges = Math.max(0, parsePorcelain(all.stdout).length - new Set(entries.filter(e => byRel.has(e.path)).map(e => e.path)).size)

    const branch = await getCurrentBranchName(root)
    let upstream: string | null = null
    let ahead = 0
    let behind = 0
    const up = await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
    if (up.code === 0 && up.stdout.trim()) {
      upstream = up.stdout.trim()
      const counts = await git(root, ['rev-list', '--left-right', '--count', '@{u}...HEAD'])
      const [b, a] = counts.stdout.trim().split(/\s+/).map(n => parseInt(n, 10))
      behind = b || 0
      ahead = a || 0
    }

    states.push({
      root,
      label: repoLabel(root),
      branch,
      upstream,
      ahead,
      behind,
      protectedBranch: PROTECTED_BRANCHES.includes(branch),
      staged,
      changes,
      otherChanges,
    })
  }
  return states
}

/**
 * Validate a request against the memory file list: the repo must be one of the repos holding memory files,
 * and every path must be a listed memory file inside that repo. Only then may it be staged or committed.
 */
export async function resolveRepoRequest(scope: MemoryScope, projectPath: string | undefined, repoRoot: string, paths: string[] = []) {
  const files = await listMemoryFiles(scope, projectPath)
  const inRepo: MemoryFile[] = []
  for (const f of files) {
    if ((await repoRootOf(f.path)) === repoRoot) inRepo.push(f)
  }
  if (!inRepo.length) throw new Error('Not a repository holding memory files')
  const allowed = new Set(inRepo.map(f => f.path))
  for (const p of paths) {
    if (!allowed.has(p)) throw new Error(`Not a known memory file in this repository: ${p}`)
  }
  return { root: repoRoot, files: inRepo }
}

export async function stagePaths(root: string, paths: string[], action: 'stage' | 'unstage'): Promise<void> {
  if (!paths.length) return
  if (action === 'stage') {
    const r = await git(root, ['add', '--', ...paths])
    if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || 'git add failed')
    return
  }
  let r = await git(root, ['restore', '--staged', '--', ...paths])
  // Repos without any commit yet cannot "restore"; fall back to reset
  if (r.code !== 0) r = await git(root, ['reset', '-q', '--', ...paths])
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || 'git unstage failed')
}

/**
 * Discard unstaged changes: tracked files are restored from the index, untracked (new) files are deleted.
 * Staged changes are left alone (unstage first to discard those).
 */
export async function discardPaths(root: string, paths: string[]): Promise<{ restored: number; deleted: number }> {
  const rels = paths.map(p => relative(root, p))
  const status = await git(root, ['status', '--porcelain=v1', '-z', '-uall', '--', ...rels])
  const entries = parsePorcelain(status.stdout)

  const untracked: string[] = []
  const tracked: string[] = []
  for (const e of entries) {
    const abs = paths.find(p => relative(root, p) === e.path)
    if (!abs) continue
    if (e.x === '?' && e.y === '?') untracked.push(abs)
    else if (e.y !== ' ') tracked.push(abs)
  }

  if (tracked.length) {
    const r = await git(root, ['restore', '--worktree', '--', ...tracked])
    if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || 'git restore failed')
  }
  for (const p of untracked) await rm(p, { force: true })
  return { restored: tracked.length, deleted: untracked.length }
}

/** Commit exactly these files (other staged or modified files are left alone). */
export async function commitPaths(root: string, paths: string[], message: string): Promise<void> {
  if (!paths.length) throw new Error('Nothing selected to commit.')
  const add = await git(root, ['add', '--', ...paths])
  if (add.code !== 0) throw new Error((add.stderr || add.stdout).trim() || 'git add failed')

  const diff = await git(root, ['diff', '--cached', '--quiet', '--', ...paths])
  if (diff.code === 0) throw new Error('Nothing to commit for the selected files.')

  // Pathspec form commits only these paths, even if other files are already staged
  const commit = await git(root, ['commit', '-m', message, '--', ...paths], 120_000)
  if (commit.code !== 0) throw new Error((commit.stderr || commit.stdout).trim() || 'git commit failed')
}

/** Plain fast-forward push of the current branch. Never forces. */
export async function pushRepo(root: string): Promise<void> {
  const branch = await getCurrentBranchName(root)
  const up = await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (up.code !== 0 || !up.stdout.trim()) {
    throw new Error(`Branch "${branch}" has no upstream. Run "git push -u origin ${branch}" once in a terminal.`)
  }
  const push = await git(root, ['push'], 120_000)
  if (push.code !== 0) throw new Error((push.stderr || push.stdout).trim() || 'git push failed')
}

