<script setup lang="ts">
import type { IssueApproval, IssueDetail, IssueRun, IssuePermissionMode, IssuePriority, IssueStatus } from '~/composables/useIssues'
import { WAKE_REPEAT_LABEL, ISSUE_PRIORITIES, ISSUE_PRIORITY_META, ISSUE_RUN_META, ISSUE_STATUS_META, ISSUE_STATUSES } from '~/composables/useIssues'
import type { IssueSessionRow, IssueWakeup, WakeupInput } from '~/composables/useIssues'
import { formatWakeAt } from '~/utils/wakeupFormat'
import { renderMarkdown } from '~/utils/markdown'
import { emojify, searchEmoji } from '~/utils/emoji'
import { linkify } from '~/utils/linkify'
import { projectSlug } from '~/utils/projectSlug'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { fetchOne, update, remove, comment, run, cancel, answerApproval, addWakeup, updateWakeup, deleteWakeup } = useIssues()
const { agents, fetchAll: fetchAgents } = useAgents()
import { propertyColor } from '~/composables/useIssueConfig'
const ic = useIssueConfig()
const issueConfig = computed(() => ic.configFor(issue.value?.projectDir ?? ''))
const activeProperties = computed(() => ic.activePropertiesFor(issue.value?.projectDir ?? ''))

const id = computed(() => String(route.params.id))
// Going back keeps the board's filters and view (they live in its URL). Opened directly, go to the plain list.
function goBack(e: MouseEvent) {
  const prev = (window.history.state as { back?: string } | null)?.back
  if (prev?.startsWith('/issues') && !prev.startsWith('/issues/ISS-')) { e.preventDefault(); router.back() }
}
const issue = ref<IssueDetail | null>(null)
const running = ref(false)
type Entry = IssueDetail['timeline'][number]
/** Comments stay visible. Everything between two comments (assign, run, status moves) folds into one row. */
const blocks = computed(() => {
  const out: { key: string; comment?: Extract<Entry, { type: 'comment' }>; group: Entry[]; run?: IssueRun; fold?: Extract<Entry, { type: 'distill' }>; foldOf?: string; foldKind?: string }[] = []
  // Everything a distill or clear covered folds under one header row, placed at the first covered entry.
  // Comments: the ones in its foldedIds. Runs, status moves and assigns: those between its first folded comment and the entry.
  const timeline = issue.value?.timeline ?? []
  const marks = timeline.flatMap((e, idx) => (e.type === 'distill' ? [{ m: e, end: idx, start: timeline.findIndex(c => c.type === 'comment' && e.foldedIds.includes(c.id)) }] : []))
  const claimOf = (e: Entry, idx: number) => {
    if (e.type === 'comment') return marks.find(x => x.m.foldedIds.includes(e.id))?.m
    return marks.find(x => x.start >= 0 && idx >= x.start && idx <= x.end)?.m
  }
  const headed = new Set<string>()
  for (const [idx, e] of timeline.entries()) {
    const f = claimOf(e, idx)
    if (f && !headed.has(f.id)) { headed.add(f.id); out.push({ key: `fold-${f.id}`, group: [], fold: f }) }
    if (e.type === 'comment') { out.push({ key: e.id, comment: e, group: [], foldOf: f?.id, foldKind: f?.kind }); continue }
    let last = out[out.length - 1]
    if (!last || last.comment || last.fold || last.foldOf !== f?.id) out.push(last = { key: e.id, group: [], foldOf: f?.id, foldKind: f?.kind })
    last.group.push(e)
    if (e.type === 'run') { const r = runById(e.runId); if (r) last.run = r }
  }
  return out
})
// Folded by default, running or not: the summary row already shows the live status
const openGroups = ref<Set<string>>(new Set())
const groupOpen = (b: { key: string }) => openGroups.value.has(b.key)
/** A comment folded by a distill shows only while its header row is open */
const visibleBlock = (b: { foldOf?: string }) => !b.foldOf || openGroups.value.has(`fold-${b.foldOf}`)
// Not counted: the command comment itself, and for a distill the run's summary comment
const foldCount = (f: { foldedIds: string[]; kind?: string }) =>
  Math.max(0, f.foldedIds.filter(id => issue.value?.timeline.some(e => e.id === id && e.type === 'comment')).length - (f.kind === 'clear' ? 1 : 2))
/** Violet for a distill, gray for a clear: blue is taken by agent replies */
const foldColor = (kind?: string) => (kind === 'clear' ? '#6b7280' : '#8b5cf6')
/** What is folded sits indented under its header, with a line in the same color */
const foldLine = (kind?: string) => ({ borderLeft: `2px solid color-mix(in srgb, ${foldColor(kind)} 35%, var(--border-subtle))` })
const foldTint = (f: { kind?: string }) => {
  const c = foldColor(f.kind)
  return { background: `color-mix(in srgb, ${c} 10%, var(--surface-raised))`, border: `1px solid color-mix(in srgb, ${c} 25%, var(--border-subtle))` }
}
const pad = (n: number) => String(n).padStart(2, '0')
/** Local time, like every other time on the page */
const foldStamp = (f: { at: string; kind?: string }) => {
  const d = new Date(f.at)
  return `${f.kind === 'clear' ? 'clear' : 'distill'}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const foldText = (f: { kind?: string; note?: string }) => (f.kind === 'clear'
  ? `folded, description unchanged${f.note ? `: ${f.note.length > 80 ? `${f.note.slice(0, 80)}...` : f.note}` : ''}`
  : 'folded into the description')
// Typing /clear: say what it hides before it is sent
const liveCount = computed(() => {
  const tl = issue.value?.timeline ?? []
  const folded = new Set(tl.flatMap(e => (e.type === 'distill' ? e.foldedIds : [])))
  return tl.filter(e => e.type === 'comment' && !folded.has(e.id)).length
})
const clearing = computed(() => /^\s*(?:@[\w-]+\s+)*\/(?:clear|reset)(?:\s|$)/i.test(newComment.value))
const toggleGroup = (key: string) => {
  const o = new Set(openGroups.value)
  o.has(key) ? o.delete(key) : o.add(key)
  openGroups.value = o
}
const openTranscripts = ref<Set<string>>(new Set())
const toggleTranscript = (runId: string) => {
  const next = new Set(openTranscripts.value)
  next.has(runId) ? next.delete(runId) : next.add(runId)
  openTranscripts.value = next
}
const approvals = ref<IssueApproval[]>([])
const subIssues = ref<{ id: string; title: string; status: IssueStatus }[]>([])
const notFound = ref(false)

const editing = ref(false)
const draftTitle = ref('')
const draftDesc = ref('')
const newComment = ref('')
// Right column width: drag the left edge, double-click to reset. Remembered per browser.
const SIDE_DEFAULT = 310
const SIDE_MIN = 260
const SIDE_MAX = 560
const clampSide = (n: number) => Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(n)))
const sideWidth = ref(SIDE_DEFAULT)
const resizingSide = ref(false)
onMounted(() => {
  try { const v = Number(localStorage.getItem('issue-side-width')); if (v) sideWidth.value = clampSide(v) } catch { /* storage blocked */ }
})
function startSideResize(e: PointerEvent) {
  e.preventDefault()
  resizingSide.value = true
  const onMove = (ev: PointerEvent) => { sideWidth.value = clampSide(window.innerWidth - ev.clientX) }
  const onUp = () => {
    resizingSide.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    try { localStorage.setItem('issue-side-width', String(sideWidth.value)) } catch { /* ignore */ }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
function resetSideWidth() {
  sideWidth.value = SIDE_DEFAULT
  try { localStorage.removeItem('issue-side-width') } catch { /* ignore */ }
}
const confirmDelete = ref(false)
const busy = ref(false)

async function load() {
  const res = await fetchOne(id.value)
  if (!res) { if (!issue.value) notFound.value = true; return }
  issue.value = res.issue
  approvals.value = res.approvals ?? []
  subIssues.value = res.subIssues ?? []
  running.value = res.running || res.issue.runs.some(r => r.status === 'running')
}

let timer: ReturnType<typeof setInterval> | null = null
const drafting = computed(() => !!issue.value?.drafting)
watch(() => running.value || drafting.value, (r) => {
  if (r && !timer) timer = setInterval(load, 2500)
  if (!r && timer) { clearInterval(timer); timer = null }
}, { immediate: true })
// Opening an issue clears its tint on the board. Leaving counts too: a run may have finished while the page was open.
const { markSeen } = useIssueSeen()
onUnmounted(() => { if (timer) clearInterval(timer); markSeen(id.value) })
onMounted(() => { markSeen(id.value); fetchAgents(); load() })
watch(() => issue.value?.projectDir, (d) => { if (d) ic.load(d) })
const toggleLabel = (labelId: string) => {
  if (!issue.value) return
  const cur = issue.value.labels
  patch({ labels: cur.includes(labelId) ? cur.filter(x => x !== labelId) : [...cur, labelId] })
}
const setProp = (propId: string, v: string | number | boolean | null) => {
  const next = { ...(issue.value?.properties ?? {}) }
  if (v === null) delete next[propId]
  else next[propId] = v
  patch({ properties: next })
}
// Timed wakeups
const wakeups = computed(() => [...(issue.value?.wakeups?.items ?? [])].sort((a, b) => a.at.localeCompare(b.at)))
const wakeDlg = ref(false)
const wakeEdit = ref<IssueWakeup | null>(null)
const wakeBusy = ref(false)
const wakeKey = ref(0)
const showWakeHistory = ref(false)
const history = computed(() => issue.value?.wakeupHistory ?? [])
const wakeAgentName = (w: IssueWakeup) => agentName(w.agent ?? issue.value?.assignee ?? null)
function openWake(w: IssueWakeup | null) { wakeEdit.value = w; wakeKey.value++; wakeDlg.value = true }
async function saveWake(input: WakeupInput) {
  wakeBusy.value = true
  const res = wakeEdit.value ? await updateWakeup(id.value, wakeEdit.value.id, input) : await addWakeup(id.value, input)
  wakeBusy.value = false
  if (res) { issue.value = res; wakeDlg.value = false }
}
async function removeWake() {
  if (!wakeEdit.value) return
  const res = await deleteWakeup(id.value, wakeEdit.value.id)
  if (res) { issue.value = res; wakeDlg.value = false }
}
async function toggleWake(w: IssueWakeup, enabled: boolean) {
  const res = await updateWakeup(id.value, w.id, { enabled })
  if (res) issue.value = res
}
// A wakeup can fire while the page is open: look again every 30 seconds when one is set
let wakeTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { wakeTimer = setInterval(() => { if (wakeups.value.some(w => w.enabled)) load() }, 30_000) })
onUnmounted(() => { if (wakeTimer) clearInterval(wakeTimer) })
const wakeValue = computed(() => issue.value?.wakeups?.subIssuesFinish ?? 'default')
const wakeDefault = computed(() => (issueConfig.value.wakeups.subIssuesFinish.enabled ? 'on' : 'off'))

async function patch(input: Parameters<typeof update>[1]) {
  const res = await update(id.value, input)
  if (res) { issue.value = res; running.value = res.runs.some(r => r.status === 'running') }
}
function startEdit() {
  if (!issue.value) return
  draftTitle.value = issue.value.title
  draftDesc.value = issue.value.description
  editing.value = true
}
async function saveEdit() {
  if (!draftTitle.value.trim()) return
  await patch({ title: draftTitle.value, description: draftDesc.value })
  editing.value = false
}
// /redraft and /clear never start a run, so they post as a plain comment whichever way they are sent
const noRunCommand = computed(() => /^\s*(?:@[\w-]+\s+)*\/(?:redraft|clear|reset)(?:\s|$)/i.test(newComment.value))
async function send(andRun: boolean) {
  const body = newComment.value.trim()
  if (!body) return
  if (noRunCommand.value) andRun = false
  busy.value = true
  const res = await comment(id.value, body, andRun, andRun ? mentionedAgent.value ?? undefined : undefined)
  busy.value = false
  if (res) { issue.value = res; newComment.value = ''; running.value = res.runs.some(r => r.status === 'running') }
}
// @agent mentions in the comment box
const commentEl = ref<HTMLTextAreaElement | null>(null)
const mentionQuery = ref<string | null>(null)
const mentionIdx = ref(0)
const mentionOptions = computed(() => {
  const q = mentionQuery.value
  if (q === null) return []
  return agents.value.filter(a => a.slug.toLowerCase().includes(q) || (a.frontmatter.name || '').toLowerCase().includes(q)).slice(0, 6)
})
const mentionedAgent = computed(() => {
  for (const m of newComment.value.matchAll(/(^|\s)@([\w-]+)/g)) {
    if (agents.value.some(a => a.slug === m[2])) return m[2]
  }
  return null
})
// :emoji shortcodes in the comment box (needs 2+ letters so times like 10:30 stay quiet)
const emojiQuery = ref<string | null>(null)
const emojiIdx = ref(0)
const emojiOptions = computed(() => (emojiQuery.value === null ? [] : searchEmoji(emojiQuery.value)))
// /slash commands in the comment box: only as the first word, after optional @mentions
const SLASH_COMMANDS = [
  { name: 'adhoc', hint: 'Run with only this comment, no description or history' },
  { name: 'clear', hint: 'Hide the old comments from later runs. No run, nothing deleted' },
  { name: 'distill', hint: 'Fold the new comments into the description. Later runs skip them' },
  { name: 'redraft', hint: 'Re-read the links, rewrite title and description. Press Comment, no run. @agent picks reader' },
  { name: 'last', hint: 'This comment plus the 2 before it. /last N sends N+1. No description' },
]
const slashQuery = ref<string | null>(null)
const slashIdx = ref(0)
const slashOptions = computed(() => (slashQuery.value === null ? [] : SLASH_COMMANDS.filter(c => c.name.startsWith(slashQuery.value!))))
function pickSlash(name: string) {
  const el = commentEl.value
  if (!el) return
  const pos = el.selectionStart
  const before = newComment.value.slice(0, pos).replace(/\/[a-z]*$/i, `/${name} `)
  newComment.value = before + newComment.value.slice(pos)
  slashQuery.value = null
  nextTick(() => { el.focus(); el.setSelectionRange(before.length, before.length) })
}
function updateMention() {
  const el = commentEl.value
  if (!el) return
  const upto = newComment.value.slice(0, el.selectionStart)
  const m = /(^|\s)@([\w-]*)$/.exec(upto)
  mentionQuery.value = m ? (m[2] ?? '').toLowerCase() : null
  mentionIdx.value = 0
  const sl = /^\s*(?:@[\w-]+\s+)*\/([a-z]*)$/i.exec(upto)
  slashQuery.value = sl ? sl[1]!.toLowerCase() : null
  slashIdx.value = 0
  const e = /(^|\s):([a-z0-9_+-]{2,})$/i.exec(upto)
  emojiQuery.value = e ? e[2]!.toLowerCase() : null
  emojiIdx.value = 0
}
function pickEmoji(name: string, emoji: string) {
  const el = commentEl.value
  if (!el) return
  const pos = el.selectionStart
  const before = newComment.value.slice(0, pos).replace(/:[a-z0-9_+-]*$/i, emoji + ' ')
  newComment.value = before + newComment.value.slice(pos)
  emojiQuery.value = null
  nextTick(() => { el.focus(); el.setSelectionRange(before.length, before.length) })
}
function pickMention(slug: string) {
  const el = commentEl.value
  if (!el) return
  const pos = el.selectionStart
  const before = newComment.value.slice(0, pos).replace(/@[\w-]*$/, `@${slug} `)
  newComment.value = before + newComment.value.slice(pos)
  mentionQuery.value = null
  nextTick(() => { el.focus(); el.setSelectionRange(before.length, before.length) })
}
function onCommentKey(e: KeyboardEvent) {
  const sc = slashOptions.value
  if (sc.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); slashIdx.value = (slashIdx.value + 1) % sc.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); slashIdx.value = (slashIdx.value - 1 + sc.length) % sc.length; return }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSlash(sc[slashIdx.value]!.name); return }
    if (e.key === 'Escape') { slashQuery.value = null; return }
  }
  const em = emojiOptions.value
  if (em.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); emojiIdx.value = (emojiIdx.value + 1) % em.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); emojiIdx.value = (emojiIdx.value - 1 + em.length) % em.length; return }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickEmoji(em[emojiIdx.value]!.name, em[emojiIdx.value]!.emoji); return }
    if (e.key === 'Escape') { emojiQuery.value = null; return }
  }
  const opts = mentionOptions.value
  if (opts.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionIdx.value = (mentionIdx.value + 1) % opts.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); mentionIdx.value = (mentionIdx.value - 1 + opts.length) % opts.length; return }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(opts[mentionIdx.value]!.slug); return }
    if (e.key === 'Escape') { mentionQuery.value = null; return }
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newComment.value.trim() && !busy.value) {
    if (noRunCommand.value) { e.preventDefault(); send(false) }
    else if (!running.value && (issue.value?.assignee || mentionedAgent.value)) { e.preventDefault(); send(true) }
  }
}

async function onRun() {
  if (await run(id.value)) { toast.add({ title: 'Run started', color: 'success', duration: 2000 }); await load() }
}
async function decide(a: IssueApproval, decision: 'allow' | 'allow_tool' | 'deny') {
  approvals.value = approvals.value.filter(x => x.id !== a.id)
  await answerApproval(id.value, a.id, decision)
  await load()
}
const approvalDetail = (a: IssueApproval) => {
  const i = a.input || {}
  return String(i.command ?? i.file_path ?? i.path ?? i.url ?? i.pattern ?? JSON.stringify(i)).slice(0, 600)
}
async function onCancel() {
  if (await cancel(id.value)) await load()
}
async function doDelete() {
  confirmDelete.value = false
  if (await remove(id.value)) router.push('/issues')
}

/** Agents write line-per-line replies. Markdown folds single newlines, so keep them as hard breaks (not inside code fences). */
// Agents write one sentence per line. Make each line its own paragraph (list items stay a tight list).
const withBreaks = (t: string, tight = false) => {
  if (t.includes('```')) return t
  const isItem = (l: string) => /^\s*([-*+]|\d+[.)])\s/.test(l)
  const lines = t.split('\n')
  return lines.map((l, i) => {
    const next = lines[i + 1]
    if (next === undefined || !l.trim() || !next.trim()) return l
    if (isItem(l) && isItem(next)) return l
    // Your own notes are short lines: keep them close together instead of one paragraph each
    return tight ? l + '  ' : l + '\n'
  }).join('\n')
}
/** Turn @agent into a pill (only for agents that exist, so emails and handles are left alone). */
const mentionize = (t: string) => t.replace(/(^|[\s(])@([\w-]+)/g, (m, pre, slug) =>
  agents.value.some(a => a.slug === slug) ? `${pre}<span class="agent-mention">@${slug}</span>` : m)
const agentName = (slug: string | null) => (slug ? agents.value.find(a => a.slug === slug)?.frontmatter.name ?? slug : 'Me')
const runById = (runId: string) => issue.value?.runs.find(r => r.id === runId)
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const duration = (ms?: number) => (ms == null ? '' : Math.round(ms / 1000) < 60 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round(ms / 1000) % 60}s`)
const sessionLink = (sid?: string) => (sid && issue.value ? `/cli/project/${encodeURIComponent(projectSlug(issue.value.projectDir))}/session/${encodeURIComponent(sid)}` : null)
const canRun = computed(() => !!issue.value?.assignee && !running.value && issue.value.status !== 'done' && issue.value.status !== 'cancelled')

// Interactive Claude Code session in iTerm2 (ADR 0008). Folder defaults to the issue's project, the label names the session.
const sessOpen = ref(false)
const sessCwd = ref('')
const sessLabel = ref('')
const SESS_PROMPT = 'Start with a short summary of what is open (3-5 bullets)'
const sessPrompt = ref('')
const sessBusy = ref(false)
const sessProjects = ref<{ path: string; name: string }[]>([])
const baseName = (p: string) => p.split('/').filter(Boolean).pop() ?? p
const sessChoices = computed(() => {
  const list = [...sessProjects.value]
  for (const d of [sessCwd.value, issue.value?.projectDir]) if (d && !list.some(p => p.path === d)) list.unshift({ path: d, name: baseName(d) })
  return list
})
async function toggleSession() {
  sessOpen.value = !sessOpen.value
  if (!sessOpen.value) return
  sessCwd.value ||= issue.value?.projectDir ?? ''
  try { sessProjects.value = (await $fetch<{ path: string; displayName: string }[]>('/api/projects')).map(p => ({ path: p.path, name: p.displayName })) } catch { /* the issue's folder still works */ }
}
async function browseSession() {
  try {
    const res = await $fetch<{ path: string | null }>('/api/utils/pick-folder', { method: 'POST' })
    if (res.path) sessCwd.value = res.path
  } catch (e: any) { toast.add({ title: 'Folder picker failed', description: e?.data?.message || e?.message, color: 'error' }) }
}
async function startSession() {
  sessBusy.value = true
  try {
    await $fetch(`/api/issues/${id.value}/launch-session`, { method: 'POST', body: { cwd: sessCwd.value, label: sessLabel.value.trim(), prompt: sessPrompt.value.trim() } })
    toast.add({ title: 'Session opened in iTerm2', description: 'Run /claude-ui:issue-wrap there when done.', color: 'success', duration: 3000 })
    sessLabel.value = ''
    setTimeout(loadSessions, 2500)
  } catch (e: any) {
    toast.add({ title: 'Could not start the session', description: e?.data?.message || e?.message, color: 'error' })
  } finally { sessBusy.value = false }
}

// Sessions started from this issue: listed forever, newest first. Resume focuses the live tab or reopens the Claude session.
const sessions = ref<IssueSessionRow[]>([])
const resumingId = ref('')
async function loadSessions() {
  try { sessions.value = (await $fetch<{ sessions: IssueSessionRow[] }>(`/api/issues/${id.value}/sessions`)).sessions } catch { /* keep the old list */ }
}
onMounted(() => { loadSessions() })
// Live state changes outside the page (a tab is closed), so look again now and then
let sessTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { sessTimer = setInterval(() => { if (document.visibilityState === 'visible') loadSessions() }, 15_000) })
onUnmounted(() => { if (sessTimer) clearInterval(sessTimer) })
const sessWhen = (at: string) => new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
async function resumeSession(row: IssueSessionRow) {
  resumingId.value = row.id
  try {
    const res = await $fetch<{ result: string }>(`/api/issues/${id.value}/launch-session`, { method: 'POST', body: { resume: row.id } })
    toast.add({ title: res.result === 'focused' ? 'Switched to the open tab' : 'Session resumed in iTerm2', color: 'success', duration: 2500 })
    setTimeout(loadSessions, 2500)
  } catch (e: any) {
    toast.add({ title: 'Could not resume', description: e?.data?.message || e?.message, color: 'error' })
    loadSessions()
  } finally { resumingId.value = '' }
}
async function forgetSession(row: IssueSessionRow) {
  try { await $fetch(`/api/issues/${id.value}/sessions/${row.id}`, { method: 'DELETE' }) } catch { /* list refresh shows the truth */ }
  await loadSessions()
}

useHead({ title: computed(() => `${id.value} | Agent Manager`) })
</script>

<template>
  <div class="h-full flex min-h-0">
    <div v-if="notFound" class="p-10 text-[13px] text-label">Issue not found. <NuxtLink to="/issues" class="underline">Back to issues</NuxtLink></div>
    <template v-else-if="issue">
      <!-- Main -->
      <div class="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
        <NuxtLink to="/issues" class="group inline-flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-lg text-[12px] font-medium hover-bg focus-ring" style="color: var(--text-secondary); border: 1px solid var(--border-subtle); background: var(--surface-raised)" title="Back to issues" @click="goBack">
          <UIcon name="i-lucide-arrow-left" class="size-3.5 transition-transform group-hover:-translate-x-0.5" /> Issues
        </NuxtLink>

        <section class="space-y-3">
          <div class="text-[11px] font-mono text-meta">{{ issue.id }}<template v-if="issue.parentId"> &middot; sub-issue of <NuxtLink :to="`/issues/${issue.parentId}`" class="underline">{{ issue.parentId }}</NuxtLink></template></div>
          <template v-if="editing">
            <input v-model="draftTitle" class="w-full px-3 py-2 rounded-lg text-[18px] font-semibold" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)" />
            <textarea v-model="draftDesc" rows="10" class="w-full px-3 py-2 rounded-lg text-[13px] font-mono" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)" />
            <div class="flex gap-2"><UButton label="Save" size="sm" @click="saveEdit" /><UButton label="Cancel" size="sm" variant="ghost" color="neutral" @click="() => { editing = false }" /></div>
          </template>
          <template v-else>
            <div class="flex items-start gap-3">
              <h1 class="text-[20px] font-semibold flex-1">{{ issue.title }}</h1>
              <span v-if="drafting" class="flex items-center gap-1.5 text-[12px] shrink-0 whitespace-nowrap" style="color: #3b82f6"><UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />Agent is reading sources</span>
              <button class="p-1.5 rounded-lg hover-bg" title="Edit" style="color: var(--text-tertiary)" @click="startEdit"><UIcon name="i-lucide-pencil" class="size-4 block" /></button>
            </div>
            <p v-if="issue.draftNote" class="text-[12px] mb-2" style="color: #d97706">{{ issue.draftNote }}</p>
            <div v-if="issue.description.trim()" class="md-prose issue-prose rounded-xl px-4 py-3" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)" v-html="renderMarkdown(linkify(emojify(issue.description)))" />
            <p v-else class="text-[13px] text-meta">No description.</p>
          </template>
        </section>

        <section class="space-y-3">
          <h2 class="text-[13px] font-semibold">Activity</h2>
          <ol class="space-y-3">
            <li v-for="b in blocks" v-show="visibleBlock(b)" :key="b.key" :class="b.foldOf ? '!mb-0 pb-3 ml-4 pl-3' : ''" :style="b.foldOf ? foldLine(b.foldKind) : undefined">
              <!-- distill header: the comments below it are folded into the description -->
              <button v-if="b.fold" class="w-full flex items-center gap-2 text-[12px] text-label rounded-xl px-3 py-2 text-left" :style="foldTint(b.fold)" @click="toggleGroup(b.key)">
                <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 transition-transform" :class="{ 'rotate-90': groupOpen(b) }" />
                <UIcon :name="b.fold.kind === 'clear' ? 'i-lucide-eraser' : 'i-lucide-flask-conical'" class="size-3.5 shrink-0" />
                <b style="color: var(--text-primary)">{{ foldStamp(b.fold) }}</b>
                <span class="truncate">{{ foldCount(b.fold) }} {{ foldCount(b.fold) === 1 ? 'comment' : 'comments' }} {{ foldText(b.fold) }}</span>
              </button>
              <!-- comment -->
              <div v-else-if="b.comment" class="rounded-xl p-3" :style="{ background: b.comment.author === 'agent' ? 'var(--issue-reply-bg)' : 'var(--surface-raised)', border: '1px solid ' + (b.comment.author === 'agent' ? 'var(--issue-reply-border)' : 'var(--border-subtle)') }">
                <div class="flex items-center gap-2 text-[11px] text-label mb-1">
                  <UIcon :name="b.comment.author === 'agent' ? 'i-lucide-cpu' : 'i-lucide-user'" class="size-3.5" />
                  {{ b.comment.author === 'agent' ? agentName(issue.assignee) : 'You' }} &middot; {{ when(b.comment.at) }}
                </div>
                <div class="md-prose issue-prose" v-html="renderMarkdown(mentionize(withBreaks(linkify(emojify(b.comment.body)), b.comment.author === 'user')))" />
              </div>
              <!-- run and status activity, folded into one line -->
              <div v-else>
                <button class="w-full flex items-center gap-2 text-[12px] text-label rounded-lg px-0 py-1.5 text-left" @click="toggleGroup(b.key)">
                  <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 transition-transform" :class="{ 'rotate-90': groupOpen(b) }" />
                  <template v-if="b.run">
                    <UIcon :name="ISSUE_RUN_META[b.run.status].icon" class="size-3.5 shrink-0" :class="{ 'animate-spin': b.run.status === 'running' }" :style="{ color: ISSUE_RUN_META[b.run.status].color }" />
                    <b style="color: var(--text-primary)">Run {{ ISSUE_RUN_META[b.run.status].label.toLowerCase() }}</b>
                    <span class="truncate">{{ agentName(b.run.agent) }} &middot; {{ when(b.run.startedAt) }}</span>
                    <span class="ml-auto text-meta shrink-0">{{ duration(b.run.durationMs) }}<template v-if="b.run.costUsd != null"> &middot; ${{ b.run.costUsd.toFixed(2) }}</template></span>
                  </template>
                  <span v-else class="truncate">{{ b.group.length }} {{ b.group.length === 1 ? 'update' : 'updates' }} &middot; {{ when(b.group[0]!.at) }}</span>
                  <span v-if="b.run" class="text-meta shrink-0">&middot; {{ b.group.length - 1 }} {{ b.group.length - 1 === 1 ? 'update' : 'updates' }}</span>
                </button>
                <ol v-if="groupOpen(b)" class="space-y-3 mt-2 ml-3 pl-3" style="border-left: 1px solid var(--border-subtle)">
                  <li v-for="e in b.group" :key="e.id">
                  <!-- status -->
                  <div v-if="e.type === 'status'" class="flex items-center gap-2 text-[12px] text-label">
                    <UIcon :name="ISSUE_STATUS_META[e.to].icon" class="size-3.5" :style="{ color: ISSUE_STATUS_META[e.to].color }" />
                    <span>{{ e.by === 'system' ? 'System' : 'You' }} {{ e.from ? 'moved' : 'set' }} status<template v-if="e.from"> from {{ ISSUE_STATUS_META[e.from].label }}</template> to <b>{{ ISSUE_STATUS_META[e.to].label }}</b></span>
                    <span class="text-meta">{{ when(e.at) }}</span>
                  </div>
                  <!-- assign -->
                  <div v-else-if="e.type === 'assign'" class="flex items-center gap-2 text-[12px] text-label">
                    <UIcon name="i-lucide-user-round-check" class="size-3.5" />
                    <span>Assigned to <b>{{ agentName(e.to) }}</b></span><span class="text-meta">{{ when(e.at) }}</span>
                  </div>
                  <!-- distill -->
                  <div v-else-if="e.type === 'distill'" class="flex items-center gap-2 text-[12px] text-label">
                    <UIcon :name="e.kind === 'clear' ? 'i-lucide-eraser' : 'i-lucide-flask-conical'" class="size-3.5" />
                    <span>{{ e.kind === 'clear' ? 'Cleared' : 'Distilled' }} {{ foldCount(e) }} {{ foldCount(e) === 1 ? 'comment' : 'comments' }}<template v-if="e.kind !== 'clear'"> into the description</template></span><span class="text-meta">{{ when(e.at) }}</span>
                  </div>
                  <!-- run -->
                  <div v-else-if="e.type === 'run' && runById(e.runId)" class="rounded-xl p-3 text-[12px]" style="border: 1px dashed var(--border-subtle)">
                    <div class="flex items-center gap-2">
                      <UIcon :name="ISSUE_RUN_META[runById(e.runId)!.status].icon" class="size-4" :class="{ 'animate-spin': runById(e.runId)!.status === 'running' }" :style="{ color: ISSUE_RUN_META[runById(e.runId)!.status].color }" />
                      <b>Run {{ ISSUE_RUN_META[runById(e.runId)!.status].label.toLowerCase() }}</b>
                      <span class="text-label">{{ agentName(runById(e.runId)!.agent) }} &middot; {{ when(e.at) }}</span>
                      <span class="ml-auto text-meta">
                        {{ duration(runById(e.runId)!.durationMs) }}<template v-if="runById(e.runId)!.costUsd != null"> &middot; ${{ runById(e.runId)!.costUsd!.toFixed(2) }}</template><template v-if="runById(e.runId)!.numTurns"> &middot; {{ runById(e.runId)!.numTurns }} {{ runById(e.runId)!.numTurns === 1 ? 'turn' : 'turns' }}</template>
                      </span>
                    </div>
                    <p v-if="runById(e.runId)!.error" class="mt-1.5" style="color: #ef4444">{{ runById(e.runId)!.error }}</p>
                    <p v-if="runById(e.runId)!.permissionDenials?.length" class="mt-1.5" style="color: #d97706">Denied tools: {{ [...new Set(runById(e.runId)!.permissionDenials)].join(', ') }}</p>
                    <NuxtLink v-if="sessionLink(runById(e.runId)!.sessionId)" :to="sessionLink(runById(e.runId)!.sessionId)!" class="inline-block mt-1.5 underline text-label">Open chat session</NuxtLink>
                    <button class="block mt-1.5 underline text-label" @click="toggleTranscript(e.runId)">{{ openTranscripts.has(e.runId) ? 'Hide context' : 'View context' }}</button>
                    <IssueTranscript v-if="openTranscripts.has(e.runId)" :issue-id="issue.id" :run-id="e.runId" :live="runById(e.runId)!.status === 'running'" />
                  </div>

                  </li>
                </ol>
              </div>
            </li>
          </ol>

          <div v-for="a in approvals" :key="a.id" class="rounded-xl p-3 space-y-2 text-[12px]" style="border: 1px solid #d97706; background: var(--surface-raised)">
            <div class="flex items-center gap-2"><UIcon name="i-lucide-shield-question" class="size-4" style="color: #d97706" /><b>Agent asks to use {{ a.tool }}</b></div>
            <pre class="whitespace-pre-wrap break-all p-2 rounded-lg text-[12px]" style="background: var(--surface-base)">{{ approvalDetail(a) }}</pre>
            <div class="flex gap-2 justify-end">
              <UButton label="Deny" size="xs" color="neutral" variant="soft" @click="decide(a, 'deny')" />
              <UButton :label="`Allow ${a.tool} for this run`" size="xs" color="neutral" variant="soft" @click="decide(a, 'allow_tool')" />
              <UButton label="Allow once" size="xs" @click="decide(a, 'allow')" />
            </div>
          </div>

          <div class="rounded-xl p-3 space-y-2" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
            <div class="relative">
              <div v-if="mentionOptions.length" class="absolute bottom-full mb-1 left-0 z-20 w-[420px] max-w-full rounded-lg overflow-hidden shadow-lg" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
                <button v-for="(a, i) in mentionOptions" :key="a.slug" type="button" class="w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2" :style="{ background: i === mentionIdx ? 'var(--surface-base)' : 'transparent' }" @mousedown.prevent="pickMention(a.slug)">
                  <UIcon name="i-lucide-cpu" class="size-3.5 shrink-0" />
                  <b class="shrink-0" style="color: var(--text-primary)">@{{ a.slug }}</b>
                  <span class="text-meta truncate min-w-0 flex-1">{{ a.frontmatter.description }}</span>
                </button>
              </div>
              <div v-if="slashOptions.length" class="absolute bottom-full mb-1 left-0 z-20 w-[420px] max-w-full rounded-lg overflow-hidden shadow-lg" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
                <button v-for="(c, i) in slashOptions" :key="c.name" type="button" class="w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2" :style="{ background: i === slashIdx ? 'var(--surface-base)' : 'transparent' }" @mousedown.prevent="pickSlash(c.name)">
                  <UIcon name="i-lucide-zap" class="size-3.5 shrink-0" />
                  <b class="shrink-0" style="color: var(--text-primary)">/{{ c.name }}</b>
                  <span class="text-meta truncate min-w-0 flex-1">{{ c.hint }}</span>
                </button>
              </div>
              <div v-if="emojiOptions.length" class="absolute bottom-full mb-1 left-0 z-20 w-[260px] max-w-full rounded-lg overflow-hidden shadow-lg" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
                <button v-for="(o, i) in emojiOptions" :key="o.name" type="button" class="w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2" :style="{ background: i === emojiIdx ? 'var(--surface-base)' : 'transparent' }" @mousedown.prevent="pickEmoji(o.name, o.emoji)">
                  <span class="text-[15px] shrink-0">{{ o.emoji }}</span>
                  <span class="text-meta truncate">:{{ o.name }}:</span>
                </button>
              </div>
              <textarea ref="commentEl" spellcheck="false" v-model="newComment" rows="3" placeholder="Leave a comment. Type @ to hand the next run to an agent, / for commands" class="w-full px-2 py-1.5 rounded-lg text-[13px]" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)" @input="updateMention" @click="updateMention" @keydown="onCommentKey" @blur="mentionQuery = null; emojiQuery = null; slashQuery = null" />
            </div>
            <p v-if="clearing" class="text-[12px]" style="color: #d97706">Hides {{ liveCount }} {{ liveCount === 1 ? 'comment' : 'comments' }} from later runs. Nothing is deleted. Use /distill to keep what they say in the description.</p>
            <div class="flex justify-end gap-2">
              <UButton v-if="running" label="Stop run" icon="i-lucide-square" color="error" variant="soft" size="sm" title="Stop the agent that is running now" @click="onCancel" />
              <UButton label="Comment" size="sm" variant="soft" color="neutral" :disabled="!newComment.trim() || busy" @click="send(false)" />
              <UButton label="Comment and run" size="sm" icon="i-lucide-play" :disabled="!newComment.trim() || busy || (!noRunCommand && (running || (!issue.assignee && !mentionedAgent)))" :title="issue.assignee || mentionedAgent ? (mentionedAgent ? `Run @${mentionedAgent}` : '') : 'Assign an agent or @mention one'" @click="send(true)" />
            </div>
          </div>
        </section>
      </div>

      <!-- Sidebar -->
      <div class="relative shrink-0 min-h-0 flex" :style="{ width: sideWidth + 'px' }">
      <div class="absolute top-0 left-0 h-full w-1.5 -translate-x-1/2 z-20 cursor-col-resize transition-colors hover:bg-[var(--accent-muted)]" :style="resizingSide ? { background: 'var(--accent-muted)' } : undefined"
        title="Drag to resize, double-click to reset" @pointerdown="startSideResize" @dblclick="resetSideWidth" />
      <aside class="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4 space-y-5 text-[12px]" style="border-left: 1px solid var(--border-subtle)">
        <div class="flex gap-2">
          <UButton v-if="running" label="Stop run" icon="i-lucide-square" color="error" variant="soft" size="sm" @click="onCancel" />
          <UButton v-else label="Run agent" icon="i-lucide-play" size="sm" :disabled="!canRun" @click="onRun" />
          <UButton label="Start iTerm2" icon="i-lucide-terminal" size="sm" variant="soft" color="neutral" style="background: color-mix(in srgb, currentColor 12%, transparent)" title="Open an interactive Claude Code session with this issue's context" @click="toggleSession" />
        </div>
        <section v-if="sessOpen" class="space-y-2 rounded-lg p-2.5" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
          <label class="block space-y-1"><span class="prop-label">Folder</span>
            <span class="flex gap-1.5">
              <select v-model="sessCwd" class="prop-select flex-1 min-w-0" :title="sessCwd">
                <option v-for="p in sessChoices" :key="p.path" :value="p.path">{{ p.name }}</option>
              </select>
              <UButton icon="i-lucide-folder-open" size="xs" variant="soft" color="neutral" title="Pick another folder" @click="browseSession" />
            </span>
            <span class="block font-mono text-meta truncate" :title="sessCwd">{{ sessCwd }}</span></label>
          <label class="block space-y-1"><span class="prop-label">Label (optional)</span>
            <input v-model="sessLabel" maxlength="40" placeholder="e.g. inhouse, olda-utils" class="w-full px-2 py-1 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" @keydown.enter.prevent="startSession" /></label>
          <label class="block space-y-1"><span class="prop-label">First message (optional)</span>
            <textarea v-model="sessPrompt" rows="3" maxlength="2000" spellcheck="false" :placeholder="SESS_PROMPT" class="w-full px-2 py-1.5 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" /></label>
          <p class="text-meta">Opens Claude Code in iTerm2 with the description and live comments. Run <span class="font-mono">/claude-ui:issue-wrap</span> there to save the work back.</p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" size="xs" variant="soft" color="neutral" @click="() => { sessOpen = false }" />
            <UButton label="Start" icon="i-lucide-terminal" size="xs" :loading="sessBusy" :disabled="!sessCwd" style="background: #b45309; color: #fff" @click="startSession" />
          </div>
        </section>
        <section v-if="sessions.length" class="space-y-1.5">
          <h3 class="font-semibold text-[13px]">Sessions</h3>
          <div v-for="row in sessions" :key="row.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
            <span class="size-2 rounded-full shrink-0" :style="{ background: row.live ? '#16a34a' : 'var(--text-meta, #9ca3af)' }" :title="row.live ? 'Open in iTerm2' : 'Not open'" />
            <span class="flex-1 min-w-0">
              <span class="block truncate font-medium" :title="row.cwd">{{ row.label || row.cwd.split('/').filter(Boolean).pop() }}</span>
              <span class="block truncate text-meta" :title="row.cwd">{{ row.label ? row.cwd.split('/').filter(Boolean).pop() + ' - ' : '' }}{{ sessWhen(row.startedAt) }}</span>
            </span>
            <UButton :label="row.live ? 'Open' : 'Resume'" size="xs" variant="soft" color="neutral" :loading="resumingId === row.id" :disabled="!row.transcript" :title="row.transcript ? '' : 'Transcript is gone, Claude Code cannot resume it'" @click="resumeSession(row)" />
            <UButton icon="i-lucide-x" size="xs" variant="ghost" color="neutral" title="Remove from this list" @click="forgetSession(row)" />
          </div>
        </section>
        <section class="space-y-1">
          <h3 class="font-semibold text-[13px] mb-1.5">Properties</h3>
          <div class="prop-row"><span class="prop-label">Status</span>
            <span class="flex items-center gap-1.5 flex-1 min-w-0"><UIcon :name="ISSUE_STATUS_META[issue.status].icon" class="size-3.5 shrink-0" :style="{ color: ISSUE_STATUS_META[issue.status].color }" />
              <select :value="issue.status" class="prop-select" @change="patch({ status: ($event.target as HTMLSelectElement).value as IssueStatus })">
                <option v-for="s in ISSUE_STATUSES" :key="s" :value="s">{{ ISSUE_STATUS_META[s].label }}</option>
              </select></span></div>
          <div class="prop-row"><span class="prop-label">Assignee</span>
            <span class="flex items-center gap-1.5 flex-1 min-w-0"><span class="issue-agent-dot"><UIcon :name="issue.assignee ? 'i-lucide-cpu' : 'i-lucide-user'" class="size-3" /></span>
              <select :value="issue.assignee ?? ''" class="prop-select" @change="patch({ assignee: ($event.target as HTMLSelectElement).value || null })">
                <option value="">Me (no agent run)</option>
                <option v-for="a in agents" :key="a.slug" :value="a.slug">{{ a.frontmatter.name || a.slug }}</option>
              </select></span></div>
          <div class="prop-row"><span class="prop-label">Priority</span>
            <select :value="issue.priority" class="prop-select" @change="patch({ priority: ($event.target as HTMLSelectElement).value as IssuePriority })">
              <option v-for="p in ISSUE_PRIORITIES" :key="p" :value="p">{{ ISSUE_PRIORITY_META[p].label }}</option>
            </select></div>
          <div class="prop-row"><span class="prop-label">Permissions</span>
            <select :value="issue.permissionMode" class="prop-select" @change="patch({ permissionMode: ($event.target as HTMLSelectElement).value as IssuePermissionMode })">
              <option value="plan">Plan only (no edits)</option>
              <option value="default">Default</option>
              <option value="acceptEdits">Accept edits</option>
            </select></div>
          <div class="prop-row"><span class="prop-label">Project</span>
            <span class="flex items-center gap-1.5 min-w-0" :title="issue.projectDir"><UIcon name="i-lucide-folder" class="size-3.5 shrink-0 text-meta" /><span class="truncate">{{ issue.projectDir.split('/').filter(Boolean).pop() }}</span></span></div>
          <div class="prop-row items-start"><span class="prop-label pt-1">Labels</span>
            <span class="flex flex-wrap gap-1">
              <button v-for="l in issueConfig.labels" :key="l.id" type="button" class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]"
                :style="{ background: issue.labels.includes(l.id) ? 'var(--accent-muted)' : 'transparent', border: '1px solid ' + (issue.labels.includes(l.id) ? l.color : 'var(--border-subtle)'), opacity: issue.labels.includes(l.id) ? 1 : 0.6 }" @click="toggleLabel(l.id)">
                <span class="size-1.5 rounded-full" :style="{ background: l.color }" />{{ l.name }}
              </button>
              <NuxtLink v-if="!issueConfig.labels.length" to="/issues/settings?tab=labels" class="text-meta underline pt-0.5">Create labels</NuxtLink>
            </span></div>
          <div v-for="p in activeProperties" :key="p.id" class="prop-row"><span class="prop-label truncate font-medium" :title="p.name" :style="{ color: propertyColor(p) }">{{ p.name }}</span>
            <IssuePropertyField compact :property="p" :model-value="issue.properties?.[p.id]" @update:model-value="setProp(p.id, $event)" /></div>
        </section>

        <section class="space-y-1">
          <div class="flex items-center gap-2 mb-1.5">
            <h3 class="font-semibold text-[13px]">Wakeups</h3>
            <span v-if="wakeups.length" class="text-meta text-[11px]">{{ wakeups.length }}</span>
            <button class="ml-auto p-1 rounded hover-bg" title="Add wakeup" @click="openWake(null)"><UIcon name="i-lucide-plus" class="size-3.5 block" /></button>
          </div>
          <div v-for="w in wakeups" :key="w.id" class="flex items-center gap-2 py-1.5">
            <UIcon name="i-lucide-clock" class="size-4 shrink-0 text-meta" />
            <button class="flex-1 min-w-0 text-left" :class="{ 'opacity-50': !w.enabled }" @click="openWake(w)">
              <div class="text-[13px] font-medium truncate">Wake at {{ formatWakeAt(w.at) }}</div>
              <div class="text-[11px] text-meta truncate">Wake {{ wakeAgentName(w) }} · {{ WAKE_REPEAT_LABEL[w.repeat] }}</div>
            </button>
            <USwitch :model-value="w.enabled" size="sm" :title="w.enabled ? 'On' : 'Off'" @update:model-value="toggleWake(w, $event)" />
          </div>
          <div v-if="history.length">
            <button class="flex items-center gap-1 py-1 text-[12px] text-label" @click="showWakeHistory = !showWakeHistory">
              <UIcon :name="showWakeHistory ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />Wakeup history <span class="text-meta">{{ history.length }}</span>
            </button>
            <div v-if="showWakeHistory" class="pl-1 space-y-1.5 pb-1">
              <div v-for="h in history" :key="h.id" class="flex items-start gap-2 text-[11px]">
                <UIcon :name="h.outcome === 'started' ? 'i-lucide-play' : 'i-lucide-skip-forward'" class="size-3 mt-0.5 shrink-0" :style="{ color: h.outcome === 'started' ? '#22c55e' : '#d97706' }" />
                <span class="min-w-0"><span class="text-label">{{ formatWakeAt(h.at) }}</span> <span class="text-meta">{{ h.note }}</span></span>
              </div>
            </div>
          </div>
          <!-- Only where it can apply: a parent with sub-issues, or one that already has an override to reset -->
          <div v-if="subIssues.length || wakeValue !== 'default'" class="pt-1.5 space-y-0.5">
            <div class="text-[11px] text-meta" :title="`Run the agent again when all ${subIssues.length || ''} sub-issues are done or cancelled`">When sub-issues close</div>
            <select :value="wakeValue" class="prop-select" @change="patch({ wakeups: { subIssuesFinish: ($event.target as HTMLSelectElement).value as 'default' | 'on' | 'off' } })">
              <option value="default">Use default ({{ wakeDefault }})</option>
              <option value="on">Wake the agent</option>
              <option value="off">Don't wake</option>
            </select>
            <p v-if="!issue.assignee && wakeValue !== 'off'" class="text-[11px] text-meta">Needs an agent assignee to run.</p>
          </div>
        </section>

        <IssueExecutionLog :issue-id="issue.id" :title="issue.title" :runs="issue.runs" :agent-name="agentName" />

        <section class="space-y-1">
          <h3 class="font-semibold text-[13px] mb-1.5">Details</h3>
          <div class="prop-row"><span class="prop-label">Created</span><span>{{ when(issue.createdAt) }}</span></div>
          <div class="prop-row"><span class="prop-label">Updated</span><span>{{ when(issue.updatedAt) }}</span></div>
        </section>
        <button class="flex items-center gap-1.5 text-[12px]" style="color: #ef4444" @click="confirmDelete = true"><UIcon name="i-lucide-trash-2" class="size-3.5" /> Delete issue</button>
      </aside>
      </div>
    </template>

    <UModal v-model:open="wakeDlg" :dismissible="!wakeBusy">
      <template #content>
        <IssueWakeupDialog v-if="issue" :key="wakeKey" :wakeup="wakeEdit" :assignee="issue.assignee" :agents="agents.map(a => ({ slug: a.slug, name: a.frontmatter.name || a.slug }))" :busy="wakeBusy"
          @save="saveWake" @remove="removeWake" @cancel="wakeDlg = false" />
      </template>
    </UModal>

    <UModal v-model:open="confirmDelete">
      <template #content>
        <div class="p-6 space-y-4 w-[420px] max-w-full" style="background: var(--surface-raised)">
          <h3 class="text-page-title">Delete {{ id }}?</h3>
          <p class="text-[13px] text-label">This removes the issue and its history for good and stops an active run. To keep the record, set the status to Cancelled instead.</p>
          <div class="flex justify-end gap-2"><UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="() => { confirmDelete = false }" /><UButton label="Delete" color="error" size="sm" @click="doDelete" /></div>
        </div>
      </template>
    </UModal>
  </div>
</template>
