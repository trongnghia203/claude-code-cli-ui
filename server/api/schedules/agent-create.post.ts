import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getClaudeDir } from '../../utils/claudeDir'
import { scheduleCore } from '../../utils/schedules/core'
import { installJob } from '../../utils/schedules/scheduler'
import { toJob } from '../../utils/schedules/validate'
import { draftSchedule } from '../../utils/schedules/draft'
import type { DraftAgent } from '../../utils/issues/draft'

/** Names of the user's skills (frontmatter `name`, else the folder), so the draft can say "Run the X skill". */
function skillNames(): string[] {
  const dir = join(getClaudeDir(), 'skills')
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory() && !d.isSymbolicLink()) continue
    let name = d.name
    try {
      const m = readFileSync(join(dir, d.name, 'SKILL.md'), 'utf8').match(/^name:\s*["']?([^\n"']+)/m)
      if (m) name = m[1]!.trim()
    } catch { /* no SKILL.md: keep the folder name */ }
    out.push(name)
  }
  return out.slice(0, 200)
}

/**
 * One-line request in, saved schedule out.
 * A small agent drafts name, prompt, timing, permissions and tools. The result goes through the same validation as the form.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const prompt = String(body?.prompt ?? '').trim()
  if (!prompt) throw createError({ statusCode: 400, message: 'Tell the agent what to schedule' })
  if (prompt.length > 4000) throw createError({ statusCode: 400, message: 'Request is too long (max 4000 characters)' })
  const scope: 'global' | 'project' = body?.scope === 'global' ? 'global' : 'project'
  const workingDir = String(body?.workingDir ?? '').replace(/\/+$/, '')
  if (scope === 'project' && (!workingDir || !existsSync(workingDir))) throw createError({ statusCode: 400, message: 'Select a project first' })

  const agents: DraftAgent[] = (Array.isArray(body?.agents) ? body.agents : [])
    .filter((a: any) => a && /^[A-Za-z0-9._-]+$/.test(String(a.slug)))
    .slice(0, 100)
    .map((a: any) => ({ slug: String(a.slug), name: String(a.name ?? a.slug), description: String(a.description ?? '') }))

  let draft
  try {
    draft = await draftSchedule(prompt, agents, skillNames(), workingDir || process.env.HOME || '/')
  } catch (e: any) {
    throw createError({ statusCode: 502, message: `Agent could not draft the schedule: ${e.message}` })
  }

  let job
  try {
    job = toJob({ ...draft, scope, workingDir, enabled: true })
  } catch (e: any) {
    throw createError({ statusCode: 400, message: e.message })
  }
  const core = await scheduleCore()
  core.writeJobs([...core.readJobs(), job])
  try {
    await installJob(job)
  } catch (e: any) {
    core.writeJobs(core.readJobs().map(j => (j.id === job.id ? { ...j, enabled: false } : j)))
    throw createError({ statusCode: 500, message: `${e.message}. The job was saved but disabled.` })
  }
  return { job, scheduleText: core.describeSchedule(job.schedule) }
})
