import { existsSync } from 'node:fs'
import { createIssue, readIssue, updateIssue } from '../../utils/issues/store'
import { startRun } from '../../utils/issues/runner'
import { detectSources, draftIssue, type DraftAgent } from '../../utils/issues/draft'
import { shouldAutoRun } from '../../utils/issues/validate'
import { readConfig } from '../../utils/issues/config'

/**
 * One-line request in, filed issue out.
 * No links or ticket keys: a fast no-tool draft, finished before the response.
 * With sources: the issue is filed at once with a placeholder, and the chosen agent reads the sources in the background.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const prompt = String(body?.prompt ?? '').trim()
  const projectDir = String(body?.projectDir ?? '').replace(/\/+$/, '')
  const draftAgent = /^[\w.-]+$/.test(String(body?.draftAgent ?? '')) ? String(body.draftAgent) : undefined
  if (!prompt) throw createError({ statusCode: 400, message: 'Tell the agent what to do' })
  if (prompt.length > 4000) throw createError({ statusCode: 400, message: 'Request is too long (max 4000 characters)' })
  if (!projectDir || !existsSync(projectDir)) throw createError({ statusCode: 400, message: 'Select a project first' })

  const agents: DraftAgent[] = (Array.isArray(body?.agents) ? body.agents : [])
    .filter((a: any) => a && /^[A-Za-z0-9._-]+$/.test(String(a.slug)))
    .slice(0, 100)
    .map((a: any) => ({ slug: String(a.slug), name: String(a.name ?? a.slug), description: String(a.description ?? '') }))

  const sources = detectSources(prompt)

  if (!sources.length) {
    let draft
    try {
      draft = await draftIssue(prompt, agents, projectDir)
    } catch (e: any) {
      throw createError({ statusCode: 502, message: `Agent could not file the issue: ${e.message}` })
    }
    const issue = createIssue({ ...draft, status: 'todo', parentId: null, projectDir, permissionMode: 'acceptEdits' })
    // Same rule as manual create: an assigned agent starts working right after creation
    if (shouldAutoRun(null, issue)) startRun(issue.id)
    return { issue: readIssue(issue.id) }
  }

  const placeholder = prompt.split('\n')[0]!.slice(0, 80)
  const created = createIssue({
    title: placeholder, description: prompt, status: 'todo', priority: 'none', assignee: null, labels: [],
    parentId: null, projectDir, permissionMode: 'acceptEdits',
  })
  updateIssue(created.id, (i) => { i.drafting = true })

  // Background: do not await. The board and issue page poll while `drafting` is set.
  draftIssue(prompt, agents, projectDir, { agent: draftAgent, sources })
    .then((draft) => {
      const done = updateIssue(created.id, (i) => {
        i.title = draft.title
        i.description = draft.description
        i.priority = draft.priority
        // The draft names labels. Keep only names that exist in the workspace labels, as ids.
        const byName = new Map(readConfig(projectDir).labels.map(l => [l.name.toLowerCase(), l.id]))
        i.labels = [...new Set(draft.labels.map(n => byName.get(n.toLowerCase())).filter((x): x is string => !!x))]
        if (draft.assignee && !i.assignee) {
          i.assignee = draft.assignee
          i.timeline.push({ id: crypto.randomUUID().slice(0, 8), at: new Date().toISOString(), type: 'assign', from: null, to: draft.assignee })
        }
        delete i.drafting
        delete i.draftNote
      })
      if (done && shouldAutoRun(null, done)) startRun(done.id)
    })
    .catch((e: any) => {
      updateIssue(created.id, (i) => {
        delete i.drafting
        i.draftNote = `Agent could not read the sources: ${e.message}. Title and description are your original text.`
      })
    })

  return { issue: readIssue(created.id) }
})
