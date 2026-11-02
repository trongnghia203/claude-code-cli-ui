import { answerApproval } from '../../../utils/issues/runner'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { approvalId, decision } = await readBody(event)
  if (!['allow', 'allow_tool', 'deny'].includes(decision)) throw createError({ statusCode: 400, message: 'Bad decision' })
  if (!answerApproval(id, String(approvalId), decision)) throw createError({ statusCode: 404, message: 'Request already answered or run ended' })
  return { ok: true }
})
