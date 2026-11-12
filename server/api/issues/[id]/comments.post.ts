import { ATTACH_MAX_BYTES, ATTACH_MAX_FILES, attachmentMime, commentText, liveComments, newEntryId, readIssue, saveAttachments, updateIssue } from '../../../utils/issues/store'
import { buildDistillPrompt, startRun, isRunning, lastRunAgent } from '../../../utils/issues/runner'
import { applyDraft } from '../../../utils/issues/applyDraft'
import { detectSources, draftIssue } from '../../../utils/issues/draft'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const issue = readIssue(id)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  // JSON for a text-only comment. multipart/form-data when files are attached: fields body, run, agent, plus file parts.
  let body: unknown, run: unknown, agent: unknown
  const files: { name: string; mime: string; data: Buffer }[] = []
  if ((getHeader(event, 'content-type') || '').includes('multipart/form-data')) {
    const parts = (await readMultipartFormData(event)) || []
    const field = (n: string) => parts.find(p => p.name === n && !p.filename)?.data.toString('utf8')
    body = field('body')
    run = field('run') === 'true'
    agent = field('agent')
    for (const p of parts) {
      if (!p.filename) continue
      const mime = attachmentMime(p.filename, p.type)
      if (!mime) throw createError({ statusCode: 400, message: `${p.filename}: only images, PDFs and text files (logs, configs) can be attached` })
      if (p.data.length > ATTACH_MAX_BYTES) throw createError({ statusCode: 413, message: `${p.filename} is over ${ATTACH_MAX_BYTES / 1024 / 1024} MB` })
      files.push({ name: p.filename, mime, data: p.data })
    }
    if (files.length > ATTACH_MAX_FILES) throw createError({ statusCode: 400, message: `At most ${ATTACH_MAX_FILES} files per comment` })
  } else ({ body, run, agent } = await readBody(event))
  const mention = typeof agent === 'string' && /^[\w-]+$/.test(agent) ? agent : null
  const text = String(body ?? '').trim()
  if (!text && !files.length) throw createError({ statusCode: 400, message: 'Comment is empty' })
  // `/clear` (or `/reset`) as first word: hide the old comments from later runs. No run, no agent needed.
  const clear = /^\s*(?:@[\w-]+\s+)*\/(?:clear|reset)(?:\s|$)/i.test(text)
  if (run && !clear && !issue.assignee && !mention && !lastRunAgent(issue)) throw createError({ statusCode: 400, message: 'Assign an agent to run it' })
  if (run && !clear && isRunning(id)) throw createError({ statusCode: 409, message: 'A run is already active' })

  // `/distill` as first word (after optional @mentions): fold the comments into the description
  const distill = !!run && !clear && /^\s*(?:@[\w-]+\s+)*\/distill(?:\s|$)/i.test(text)
  // Earlier comments, for `/last [N]` and `/distill`. Read before the new comment is added.
  // Comments a distill already folded are left out: the description holds them.
  const earlier = liveComments(issue)
  if (distill && !earlier.length) throw createError({ statusCode: 400, message: 'Nothing to distill: no new comments since the last distill' })
  if (clear && !earlier.length) throw createError({ statusCode: 400, message: 'Nothing to clear: no new comments since the last distill or clear' })
  // `/redraft` as first word (after optional @mentions): read the issue's sources again and rewrite title and description.
  // An @mention picks the agent that reads them. No run starts; the page shows "Agent is reading sources" meanwhile.
  const redraft = !clear && /^\s*(?:@[\w-]+\s+)*\/redraft(?:\s|$)/i.test(text)
  if (redraft && issue.drafting) throw createError({ statusCode: 409, message: 'A draft is already running' })
  const hint = redraft ? text.replace(/^\s*(?:@[\w-]+\s+)*/, '').replace(/^\/redraft/i, '').trim() : ''
  // Re-evaluate the whole issue: title, description and comments, not just the links in them. Links only, no bare ticket keys.
  const redraftText = redraft
    ? [
        'This issue was filed earlier and is being redrafted. Below is its current content.',
        'An earlier draft may have failed to open a source: re-open every link and ignore any "could not open" note.',
        `Title: ${issue.title}`,
        `Description:\n${issue.description}`,
        ...earlier.flatMap(c => (c.type === 'comment' ? [`Comment by ${c.author}:\n${commentText(id, c)}`] : [])),
        ...(hint ? [`Hint from the user: ${hint}`] : []),
      ].join('\n\n').slice(0, 6000)
    : ''
  const draftSources = redraft ? detectSources(redraftText, { keys: false }) : []
  const commentId = newEntryId()
  const attachments = saveAttachments(id, commentId, files)
  updateIssue(id, (i) => {
    const at = new Date().toISOString()
    i.timeline.push({ id: commentId, at, type: 'comment', author: 'user', body: text, ...(attachments.length ? { attachments } : {}) })
    // An @mention on a run hands the issue to that agent, so the run and the board agree on who owns it
    if (run && mention && mention !== i.assignee) {
      i.timeline.push({ id: newEntryId(), at, type: 'assign', from: i.assignee, to: mention })
      i.assignee = mention
    }
  })
  // `/adhoc` or `/last` as first word (after optional @mentions): the run gets only this comment, not the description or history.
  // `/last N` gets N+1 comments before this one (default N=1, max 10): your own reply, like "go", is not counted against N.
  const m = /^\s*(?:@[\w-]+\s+)*\/(adhoc|last)(?:\s+(\d{1,2})(?=\s|$))?(?:\s+|$)/i.exec(text)
  const cmd = m?.[1]?.toLowerCase()
  const count = Math.min(Math.max(Number(m?.[2] ?? 1), 1), 10)
  const question = m ? commentText(id, { id: commentId, body: text.replace(/\/(adhoc|last)(\s+\d{1,2}(?=\s|$))?/i, '').trim(), attachments }) : ''
  const previous = cmd === 'last'
    ? earlier.slice(-(count + 1)).flatMap(c => (c.type === 'comment' ? [{ author: c.author, at: c.at, body: commentText(id, c) }] : []))
    : undefined
  if (redraft) {
    updateIssue(id, (i) => { i.drafting = true; delete i.draftNote })
    // Background: the issue page polls while `drafting` is set. Failure keeps the current text.
    draftIssue(redraftText, [], issue.projectDir, { agent: mention ?? /^\s*@([\w-]+)/.exec(text)?.[1], sources: draftSources })
      .then(draft => { applyDraft(id, draft) })
      .catch((e: any) => {
        updateIssue(id, (i) => {
          delete i.drafting
          i.draftNote = `Redraft failed: ${e.message}. Title and description are unchanged.`
        })
      })
  } else if (clear) {
    const note = text.replace(/^\s*(?:@[\w-]+\s+)*/, '').replace(/^\/(?:clear|reset)/i, '').trim().slice(0, 200)
    updateIssue(id, (i) => {
      i.timeline.push({ id: newEntryId(), at: new Date().toISOString(), type: 'distill', kind: 'clear', ...(note ? { note } : {}), foldedIds: [...earlier.map(c => c.id), commentId], descriptionBefore: i.description })
    })
  } else if (distill) {
    // What the prompt holds is what gets folded, plus the command and the run's own summary.
    // A comment added while the run works is not folded: the next run still sees it.
    const foldedIds = [...earlier.map(c => c.id), commentId]
    const descriptionBefore = issue.description
    const hint = text.replace(/^\s*(?:@[\w-]+\s+)*/, '').replace(/^\/distill/i, '').trim()
    const prompt = buildDistillPrompt(issue, earlier.map(c => ({ author: c.author, at: c.at, body: commentText(id, c) })), hint)
    startRun(id, text, undefined, null, undefined, {
      prompt,
      keepStatus: true,
      after: ({ ok, commentId: summaryId }) => {
        if (!ok) return
        updateIssue(id, (i) => {
          i.timeline.push({ id: newEntryId(), at: new Date().toISOString(), type: 'distill', foldedIds: summaryId ? [...foldedIds, summaryId] : foldedIds, descriptionBefore })
        })
      },
    })
  } else if (run) startRun(id, text || `(${attachments.length} attached ${attachments.length === 1 ? 'file' : 'files'})`, undefined, null, cmd ? { question, previous } : undefined)
  return { issue: readIssue(id) }
})
