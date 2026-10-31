import { existsSync } from 'node:fs'
import { createIssue, readIssue } from '../../utils/issues/store'
import { startRun } from '../../utils/issues/runner'
import { draftIssue, type DraftAgent } from '../../utils/issues/draft'
import { shouldAutoRun } from '../../utils/issues/validate'

/** One-line request in, filed issue out. The agent drafts title, description, priority and assignee. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const prompt = String(body?.prompt ?? '').trim()
  const projectDir = String(body?.projectDir ?? '').replace(/\/+$/, '')
  if (!prompt) throw createError({ statusCode: 400, message: 'Tell the agent what to do' })
  if (prompt.length > 4000) throw createError({ statusCode: 400, message: 'Request is too long (max 4000 characters)' })
  if (!projectDir || !existsSync(projectDir)) throw createError({ statusCode: 400, message: 'Select a project first' })

  const agents: DraftAgent[] = (Array.isArray(body?.agents) ? body.agents : [])
    .filter((a: any) => a && /^[A-Za-z0-9._-]+$/.test(String(a.slug)))
    .slice(0, 100)
    .map((a: any) => ({ slug: String(a.slug), name: String(a.name ?? a.slug), description: String(a.description ?? '') }))

  let draft
  try {
    draft = await draftIssue(prompt, agents, projectDir)
  } catch (e: any) {
    throw createError({ statusCode: 502, message: `Agent could not file the issue: ${e.message}` })
  }

  const issue = createIssue({
    ...draft,
    status: 'todo',
    parentId: null,
    projectDir,
    permissionMode: 'acceptEdits',
  })
  // Same rule as manual create: an assigned agent starts working right after creation
  if (shouldAutoRun(null, issue)) startRun(issue.id)
  return { issue: readIssue(issue.id) }
})
