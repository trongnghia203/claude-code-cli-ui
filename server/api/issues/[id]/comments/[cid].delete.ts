import { readIssue, updateIssue } from '../../../../utils/issues/store'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const cid = getRouterParam(event, 'cid')!
  const issue = readIssue(id)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  if (!issue.timeline.some(e => e.type === 'comment' && e.id === cid)) throw createError({ statusCode: 404, message: 'Comment not found' })
  return { issue: updateIssue(id, (i) => { i.timeline = i.timeline.filter(e => !(e.type === 'comment' && e.id === cid)) }) }
})
