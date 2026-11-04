import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { resolveAgentFilePath } from './agentUtils'
import { spawnAsync, getCurrentBranchName } from './gitUtils'
import { commitPaths, pushRepo } from './memoryGit'

const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
const git = (cwd: string, args: string[]) => spawnAsync('git', args, { cwd, env, timeout: 30_000 })

interface AgentGitState {
  available: boolean
  root?: string
  branch?: string
  /** The agent file has uncommitted changes (or is untracked) */
  dirty?: boolean
  hasUpstream?: boolean
}

export async function agentGitState(filePath: string): Promise<AgentGitState> {
  if (!existsSync(filePath)) return { available: false }
  try {
    const top = await git(dirname(filePath), ['rev-parse', '--show-toplevel'])
    if (top.code !== 0 || !top.stdout.trim()) return { available: false }
    const root = top.stdout.trim()
    const rel = relative(root, filePath)
    const status = await git(root, ['status', '--porcelain=v1', '--', rel])
    const up = await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
    return { available: true, root, branch: await getCurrentBranchName(root), dirty: status.stdout.trim().length > 0, hasUpstream: up.code === 0 }
  } catch {
    return { available: false }
  }
}

/** Commit only this agent file. Optionally push the current branch (fast-forward, never forced). */
export async function commitAgentFile(filePath: string, message: string, push: boolean): Promise<{ pushed: boolean; pushError?: string }> {
  const state = await agentGitState(filePath)
  if (!state.available || !state.root) throw new Error('This agent is not in a git repository.')
  await commitPaths(state.root, [relative(state.root, filePath)], message)
  if (!push) return { pushed: false }
  try {
    await pushRepo(state.root)
    return { pushed: true }
  } catch (e: any) {
    return { pushed: false, pushError: e.message }
  }
}

/** Same lookup as GET /api/agents/[slug]: user agents first, then the project's own. */
export function resolveAgentFile(slug: string, workingDir?: string): string {
  const user = resolveAgentFilePath(slug)
  if (existsSync(user) || !workingDir) return user
  return [join(workingDir, '.claude', 'agents', `${slug}.md`), join(workingDir, 'agents', `${slug}.md`)].find(p => existsSync(p)) ?? user
}
