<script setup lang="ts">
import type { IssueApproval, IssueDetail, IssueRun, IssuePermissionMode, IssuePriority, IssueStatus } from '~/composables/useIssues'
import { ISSUE_PRIORITIES, ISSUE_PRIORITY_META, ISSUE_RUN_META, ISSUE_STATUS_META, ISSUE_STATUSES } from '~/composables/useIssues'
import { renderMarkdown } from '~/utils/markdown'
import { projectSlug } from '~/utils/projectSlug'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { fetchOne, update, remove, comment, run, cancel, answerApproval } = useIssues()
const { agents, fetchAll: fetchAgents } = useAgents()
const ic = useIssueConfig()
const issueConfig = computed(() => ic.configFor(issue.value?.projectDir ?? ''))
const activeProperties = computed(() => ic.activePropertiesFor(issue.value?.projectDir ?? ''))

const id = computed(() => String(route.params.id))
const issue = ref<IssueDetail | null>(null)
const running = ref(false)
type Entry = IssueDetail['timeline'][number]
/** Comments stay visible. Everything between two comments (assign, run, status moves) folds into one row. */
const blocks = computed(() => {
  const out: { key: string; comment?: Extract<Entry, { type: 'comment' }>; group: Entry[]; run?: IssueRun }[] = []
  for (const e of issue.value?.timeline ?? []) {
    if (e.type === 'comment') { out.push({ key: e.id, comment: e, group: [] }); continue }
    let last = out[out.length - 1]
    if (!last || last.comment) out.push(last = { key: e.id, group: [] })
    last.group.push(e)
    if (e.type === 'run') { const r = runById(e.runId); if (r) last.run = r }
  }
  return out
})
// Folded by default, running or not: the summary row already shows the live status
const openGroups = ref<Set<string>>(new Set())
const groupOpen = (b: { key: string }) => openGroups.value.has(b.key)
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
  running.value = res.running || res.issue.runs.some(r => r.status === 'running')
}

let timer: ReturnType<typeof setInterval> | null = null
const drafting = computed(() => !!issue.value?.drafting)
watch(() => running.value || drafting.value, (r) => {
  if (r && !timer) timer = setInterval(load, 2500)
  if (!r && timer) { clearInterval(timer); timer = null }
}, { immediate: true })
onUnmounted(() => { if (timer) clearInterval(timer) })
onMounted(() => { fetchAgents(); load() })
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
async function send(andRun: boolean) {
  const body = newComment.value.trim()
  if (!body) return
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
function updateMention() {
  const el = commentEl.value
  if (!el) return
  const m = /(^|\s)@([\w-]*)$/.exec(newComment.value.slice(0, el.selectionStart))
  mentionQuery.value = m ? (m[2] ?? '').toLowerCase() : null
  mentionIdx.value = 0
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
  const opts = mentionOptions.value
  if (opts.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionIdx.value = (mentionIdx.value + 1) % opts.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); mentionIdx.value = (mentionIdx.value - 1 + opts.length) % opts.length; return }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(opts[mentionIdx.value]!.slug); return }
    if (e.key === 'Escape') { mentionQuery.value = null; return }
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newComment.value.trim() && !busy.value && !running.value && (issue.value?.assignee || mentionedAgent.value)) { e.preventDefault(); send(true) }
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

useHead({ title: computed(() => `${id.value} | Agent Manager`) })
</script>

<template>
  <div class="h-full flex min-h-0">
    <div v-if="notFound" class="p-10 text-[13px] text-label">Issue not found. <NuxtLink to="/issues" class="underline">Back to issues</NuxtLink></div>
    <template v-else-if="issue">
      <!-- Main -->
      <div class="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
        <NuxtLink to="/issues" class="inline-flex items-center gap-1 text-[12px] text-label"><UIcon name="i-lucide-arrow-left" class="size-3.5" /> Issues</NuxtLink>

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
            <div v-if="issue.description.trim()" class="md-prose issue-prose rounded-xl px-4 py-3" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)" v-html="renderMarkdown(issue.description)" />
            <p v-else class="text-[13px] text-meta">No description.</p>
          </template>
        </section>

        <section class="space-y-3">
          <h2 class="text-[13px] font-semibold">Activity</h2>
          <ol class="space-y-3">
            <li v-for="b in blocks" :key="b.key">
              <!-- comment -->
              <div v-if="b.comment" class="rounded-xl p-3" :style="{ background: b.comment.author === 'agent' ? 'var(--issue-reply-bg)' : 'var(--surface-raised)', border: '1px solid ' + (b.comment.author === 'agent' ? 'var(--issue-reply-border)' : 'var(--border-subtle)') }">
                <div class="flex items-center gap-2 text-[11px] text-label mb-1">
                  <UIcon :name="b.comment.author === 'agent' ? 'i-lucide-cpu' : 'i-lucide-user'" class="size-3.5" />
                  {{ b.comment.author === 'agent' ? agentName(issue.assignee) : 'You' }} &middot; {{ when(b.comment.at) }}
                </div>
                <div class="md-prose issue-prose" v-html="renderMarkdown(mentionize(withBreaks(b.comment.body, b.comment.author === 'user')))" />
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
              <textarea ref="commentEl" spellcheck="false" v-model="newComment" rows="3" placeholder="Leave a comment. Type @ to hand the next run to an agent" class="w-full px-2 py-1.5 rounded-lg text-[13px]" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)" @input="updateMention" @click="updateMention" @keydown="onCommentKey" @blur="mentionQuery = null" />
            </div>
            <div class="flex justify-end gap-2">
              <UButton label="Comment" size="sm" variant="soft" color="neutral" :disabled="!newComment.trim() || busy" @click="send(false)" />
              <UButton label="Comment and run" size="sm" icon="i-lucide-play" :disabled="!newComment.trim() || busy || running || (!issue.assignee && !mentionedAgent)" :title="issue.assignee || mentionedAgent ? (mentionedAgent ? `Run @${mentionedAgent}` : '') : 'Assign an agent or @mention one'" @click="send(true)" />
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
          <UButton v-if="running" label="Stop run" icon="i-lucide-square" color="error" variant="soft" size="sm" class="flex-1 justify-center" @click="onCancel" />
          <UButton v-else label="Run agent" icon="i-lucide-play" size="sm" class="flex-1 justify-center" :disabled="!canRun" @click="onRun" />
        </div>
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
          <div v-for="p in activeProperties" :key="p.id" class="prop-row"><span class="prop-label" :title="p.name">{{ p.name }}</span>
            <IssuePropertyField compact :property="p" :model-value="issue.properties?.[p.id]" @update:model-value="setProp(p.id, $event)" /></div>
        </section>

        <section class="space-y-1">
          <h3 class="font-semibold text-[13px] mb-1.5">Wakeups</h3>
          <div class="prop-row"><span class="prop-label" title="Wake the assignee when every sub-issue is closed">Sub-issues</span>
            <select :value="wakeValue" class="prop-select" @change="patch({ wakeups: { subIssuesFinish: ($event.target as HTMLSelectElement).value as 'default' | 'on' | 'off' } })">
              <option value="default">Workspace default ({{ wakeDefault }})</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select></div>
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
