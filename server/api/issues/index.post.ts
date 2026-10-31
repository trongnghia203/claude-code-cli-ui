import { existsSync } from 'node:fs'
import { createIssue, readIssue } from '../../utils/issues/store'
import { startRun } from '../../utils/issues/runner'
import { parseFields, shouldAutoRun } from '../../utils/issues/validate'

export default defineEventHandler(async (event) => {
  const f = parseFields(await readBody(event))
  if (!f.title) throw createError({ statusCode: 400, message: 'Title is required' })
  if (!f.projectDir) throw createError({ statusCode: 400, message: 'Select a project first' })
  if (!existsSync(f.projectDir)) throw createError({ statusCode: 400, message: `Project folder not found: ${f.projectDir}` })
  if (f.parentId && !readIssue(f.parentId)) throw createError({ statusCode: 400, message: `Parent ${f.parentId} not found` })

  const issue = createIssue({
    title: f.title,
    description: f.description ?? '',
    status: f.status ?? 'todo',
    priority: f.priority ?? 'none',
    assignee: f.assignee ?? null,
    labels: f.labels ?? [],
    parentId: f.parentId ?? null,
    projectDir: f.projectDir,
    permissionMode: f.permissionMode ?? 'acceptEdits',
  })
  if (shouldAutoRun(null, issue)) startRun(issue.id)
  return { issue: readIssue(issue.id) }
})
