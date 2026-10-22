<script setup lang="ts">
interface MemoryFile {
  path: string
  name: string
  group: string
  exists: boolean
  suggested: boolean
}

type Scope = 'global' | 'project'

const toast = useToast()
const { workingDir } = useWorkingDir()

const scope = ref<Scope>('project')
const scopeTabs: { value: Scope; label: string; icon: string }[] = [
  { value: 'global', label: 'Global', icon: 'i-lucide-globe' },
  { value: 'project', label: 'Project', icon: 'i-lucide-folder' },
]

const files = ref<MemoryFile[]>([])
// Project folders are listed lazily, one level per expand: folders seen so far and the files loaded from them
const knownDirs = ref<string[]>([])
const extraFiles = ref<MemoryFile[]>([])
const loadedDirs = reactive(new Set<string>())
// Group name of the lazily browsed root: the project folder, or ~/.claude for Global
/** Title shown for a group: the project group is labelled with the project's own path ("~/ataccama") */
function groupLabel(name: string): string {
  if (name !== rootGroup.value || scope.value !== 'project' || !workingDir.value) return name
  return workingDir.value.replace(/^\/(?:Users|home)\/[^/]+/, '~')
}
const rootGroup = computed(() => (scope.value === 'global' ? '~/.claude' : 'Project root'))
const loadingList = ref(false)
const selectedPath = ref('')
const content = ref('')
const original = ref('')
const loadingFile = ref(false)
const saving = ref(false)

// ---- Source control (like the VS Code Source Control view, limited to memory files) ----
interface RepoChange {
  path: string
  name: string
  dir: string
  status: string
}
interface RepoState {
  root: string
  label: string
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  protectedBranch: boolean
  staged: RepoChange[]
  changes: RepoChange[]
  otherChanges: number
}

const repos = ref<RepoState[]>([])
const messages = reactive<Record<string, string>>({})
const gitBusy = ref<string | null>(null)
const menuRepo = ref<string | null>(null)
const collapsed = reactive<Record<string, boolean>>({})

// The whole Source Control section collapses; remembered across visits
const SCM_KEY = 'agents-ui:memory-scm-open'
const scmOpen = ref(true)
onMounted(() => {
  try { scmOpen.value = localStorage.getItem(SCM_KEY) !== '0' } catch {}
})
function toggleScm() {
  scmOpen.value = !scmOpen.value
  try { localStorage.setItem(SCM_KEY, scmOpen.value ? '1' : '0') } catch {}
}
const totalChanges = computed(() =>
  repos.value.reduce((n, r) => n + new Set([...r.staged, ...r.changes].map(c => c.path)).size, 0),
)

const gitQuery = () => ({
  scope: scope.value,
  projectPath: scope.value === 'project' ? workingDir.value : undefined,
})

async function refreshGit() {
  if (needsProject.value) {
    repos.value = []
    return
  }
  try {
    const res = await $fetch<{ repos: RepoState[] }>('/api/memory/git/changes', { query: gitQuery() })
    repos.value = res.repos
    // Committed or discarded: nothing left to diff, go back to the normal view
    if (gitBase.value !== null && !fileStatus.value.has(selectedPath.value)) gitBase.value = null
  } catch {
    repos.value = []
  }
}

/** Status letter per file path, shown next to files in the list */
const fileStatus = computed(() => {
  const map = new Map<string, { letter: string; staged: boolean }>()
  for (const r of repos.value) {
    for (const c of r.changes) map.set(c.path, { letter: c.status, staged: false })
    for (const c of r.staged) map.set(c.path, { letter: c.status, staged: true })
  }
  return map
})

const STATUS_COLORS: Record<string, string> = {
  A: '#22c55e', U: '#22c55e', M: '#d97706', D: '#ef4444', R: '#3b82f6',
}
const statusColor = (letter: string) => STATUS_COLORS[letter] ?? 'var(--text-tertiary)'
const statusTitle = (letter: string) =>
  ({ A: 'Added', U: 'Untracked', M: 'Modified', D: 'Deleted', R: 'Renamed' } as Record<string, string>)[letter] ?? letter

/** Files a commit would include: the staged ones, or all changes when nothing is staged */
function commitTargets(repo: RepoState): RepoChange[] {
  return repo.staged.length ? repo.staged : repo.changes
}

function suggestMessage(repo: RepoState): string {
  const targets = commitTargets(repo)
  if (!targets.length) return ''
  const verb = targets.every(t => t.status === 'U' || t.status === 'A') ? 'add' : 'update'
  return `docs: ${verb} ${targets.length === 1 ? targets[0]!.name : `${targets.length} memory files`}`
}

function onMessageFocus(repo: RepoState) {
  if (!messages[repo.root]?.trim()) messages[repo.root] = suggestMessage(repo)
}

async function stage(repo: RepoState, paths: string[], action: 'stage' | 'unstage') {
  if (gitBusy.value) return
  gitBusy.value = repo.root
  try {
    await $fetch('/api/memory/git/stage', { method: 'POST', body: { ...gitQuery(), repoRoot: repo.root, paths, action } })
  } catch (e: any) {
    toast.add({ title: `Could not ${action}`, description: e.data?.message || e.message, color: 'error', duration: 6000 })
  } finally {
    gitBusy.value = null
    await refreshGit()
  }
}

async function discard(repo: RepoState, change: RepoChange) {
  if (gitBusy.value) return
  const isNew = change.status === 'U'
  const question = isNew
    ? `Delete "${change.name}"? It is a new file and this cannot be undone.`
    : `Discard changes to "${change.name}"? This cannot be undone.`
  if (!window.confirm(question)) return
  gitBusy.value = repo.root
  try {
    await $fetch('/api/memory/git/discard', { method: 'POST', body: { ...gitQuery(), repoRoot: repo.root, paths: [change.path] } })
    toast.add({ title: isNew ? 'File deleted' : 'Changes discarded', description: change.name, color: 'success', duration: 2500 })
    await refreshFiles()
    // The open file may have changed on disk: reload it (also drops any unsaved edits to it)
    if (change.path === selectedPath.value) {
      const next = files.value.find(f => f.path === change.path) ?? files.value.find(f => f.exists) ?? files.value[0]
      if (next) await selectFile(next.path, true)
    }
  } catch (e: any) {
    toast.add({ title: 'Discard failed', description: e.data?.message || e.message, color: 'error', duration: 6000 })
  } finally {
    gitBusy.value = null
    await refreshGit()
  }
}

async function commit(repo: RepoState, push: boolean) {
  menuRepo.value = null
  const message = messages[repo.root]?.trim()
  const targets = commitTargets(repo)
  if (gitBusy.value || !message || !targets.length) return
  if (push && repo.protectedBranch && !window.confirm(`Push directly to "${repo.branch}"?`)) return
  gitBusy.value = repo.root
  try {
    const res = await $fetch<{ committed: boolean; pushed: boolean; pushError?: string }>('/api/memory/git/commit', {
      method: 'POST',
      body: { ...gitQuery(), repoRoot: repo.root, paths: targets.map(t => t.path), message, push },
    })
    messages[repo.root] = ''
    if (res.pushError) {
      toast.add({ title: 'Committed, push failed', description: res.pushError, color: 'warning', duration: 8000 })
    } else {
      toast.add({ title: res.pushed ? 'Committed and pushed' : 'Committed', color: 'success', duration: 2500 })
    }
  } catch (e: any) {
    toast.add({ title: 'Commit failed', description: e.data?.message || e.message, color: 'error', duration: 8000 })
  } finally {
    gitBusy.value = null
    await refreshGit()
  }
}

async function pushRepo(repo: RepoState) {
  if (gitBusy.value) return
  if (repo.protectedBranch && !window.confirm(`Push directly to "${repo.branch}"?`)) return
  gitBusy.value = repo.root
  try {
    await $fetch('/api/memory/git/push', { method: 'POST', body: { ...gitQuery(), repoRoot: repo.root } })
    toast.add({ title: 'Pushed', color: 'success', duration: 2500 })
  } catch (e: any) {
    toast.add({ title: 'Push failed', description: e.data?.message || e.message, color: 'error', duration: 8000 })
  } finally {
    gitBusy.value = null
    await refreshGit()
  }
}

/** HEAD version of the file opened from Source Control; the editor diffs against it. Null for normal opens. */
const gitBase = ref<string | null>(null)

async function openChange(change: RepoChange, repo: RepoState) {
  if (![...files.value, ...extraFiles.value].some(f => f.path === change.path)) return
  if (dirty.value && selectedPath.value !== change.path && !window.confirm('Discard unsaved changes?')) return
  let base = ''
  if (change.status !== 'U') {
    try {
      const res = await $fetch<{ content: string }>('/api/memory/git/base', {
        query: { ...gitQuery(), repoRoot: repo.root, path: change.path },
      })
      base = res.content
    } catch (e: any) {
      toast.add({ title: 'Could not load git diff', description: e.data?.message || e.message, color: 'error' })
    }
  }
  await selectFile(change.path, true)
  gitBase.value = base
}

// ---- List / tree view (like the VS Code Source Control "View as List / Tree") ----
type ViewMode = 'list' | 'tree'
const VIEW_KEY = 'agents-ui:memory-view'
const viewMode = ref<ViewMode>('tree')
const openDirs = reactive<Record<string, boolean>>({})
onMounted(() => {
  try { if (localStorage.getItem(VIEW_KEY) === 'list') viewMode.value = 'list' } catch {}
})
function setView(mode: ViewMode) {
  viewMode.value = mode
  try { localStorage.setItem(VIEW_KEY, mode) } catch {}
}

interface TreeNode { label: string; key: string; dirs: Map<string, TreeNode>; files: MemoryFile[] }
type Row =
  | { kind: 'dir'; key: string; label: string; depth: number; open: boolean }
  | { kind: 'file'; file: MemoryFile; label: string; depth: number }
  | { kind: 'empty'; key: string; depth: number }

/** Flatten a group into visible rows. Folders holding a single folder are merged ("a/b/c") like VS Code. */
function treeRows(group: { name: string; items: MemoryFile[] }): Row[] {
  const root: TreeNode = { label: '', key: group.name, dirs: new Map(), files: [] }
  for (const f of group.items) {
    const parts = f.name.split('/')
    let node = root
    for (const part of parts.slice(0, -1)) {
      let next = node.dirs.get(part)
      if (!next) {
        next = { label: part, key: `${node.key}/${part}`, dirs: new Map(), files: [] }
        node.dirs.set(part, next)
      }
      node = next
    }
    node.files.push(f)
  }
  if (group.name === rootGroup.value) {
    for (const rel of knownDirs.value) {
      let node = root
      for (const part of rel.split('/')) {
        let next = node.dirs.get(part)
        if (!next) {
          next = { label: part, key: `${node.key}/${part}`, dirs: new Map(), files: [] }
          node.dirs.set(part, next)
        }
        node = next
      }
    }
  }
  const rows: Row[] = []
  const walk = (node: TreeNode, depth: number) => {
    // Alphabetical like a file explorer; insertion order would move a folder once its files load
    for (const d of [...node.dirs.values()].sort((a, b) => a.label.localeCompare(b.label))) {
      let cur = d
      let label = d.label
      while (cur.files.length === 0 && cur.dirs.size === 1) {
        cur = [...cur.dirs.values()][0]!
        label += `/${cur.label}`
      }
      const open = !!openDirs[cur.key]
      rows.push({ kind: 'dir', key: cur.key, label, depth, open })
      if (open) {
        walk(cur, depth + 1)
        // Folder loaded and nothing to show: say so instead of leaving a bare chevron
        const loaded = group.name === rootGroup.value && loadedDirs.has(cur.key.slice(group.name.length + 1))
        if (loaded && cur.dirs.size === 0 && cur.files.length === 0) rows.push({ kind: 'empty', key: cur.key, depth: depth + 1 })
      }
    }
    for (const f of node.files) rows.push({ kind: 'file', file: f, label: f.name.split('/').pop()!, depth })
  }
  walk(root, 0)
  return rows
}

function groupRows(group: { name: string; items: MemoryFile[] }): Row[] {
  if (viewMode.value === 'list') return group.items.map(f => ({ kind: 'file', file: f, label: f.name, depth: 0 }))
  return treeRows(group)
}

/** Fetch one project folder's sub-folders and markdown files, once */
async function loadDir(rel: string) {
  if (needsProject.value || loadedDirs.has(rel)) return
  loadedDirs.add(rel)
  try {
    const res = await $fetch<{ dirs: string[]; files: MemoryFile[] }>('/api/memory/dir', {
      query: { scope: scope.value, projectPath: scope.value === 'project' ? workingDir.value : undefined, dir: rel },
    })
    knownDirs.value = [...new Set([...knownDirs.value, ...res.dirs])]
    mergeFiles(res.files)
  } catch {
    loadedDirs.delete(rel)
  }
}

function mergeFiles(list: MemoryFile[]) {
  const have = new Set([...files.value, ...extraFiles.value].map(f => f.path))
  const fresh = list.filter(f => !have.has(f.path))
  if (fresh.length) extraFiles.value = [...extraFiles.value, ...fresh]
}

function toggleDir(row: { key: string; open: boolean }, groupName: string) {
  openDirs[row.key] = !row.open
  if (!row.open && groupName === rootGroup.value) loadDir(row.key.slice(groupName.length + 1))
}

/** Expand every folder above the file so it is visible in the tree */
function revealInTree(path: string) {
  const f = [...files.value, ...extraFiles.value].find(x => x.path === path)
  if (!f) return
  const parts = f.name.split('/').slice(0, -1)
  let key = f.group
  for (const part of parts) {
    key += `/${part}`
    openDirs[key] = true
  }
}

/** Expand the folders above a file and scroll it into view in the file list */
async function revealFile(path: string) {
  revealInTree(path)
  await nextTick()
  const el = Array.from(document.querySelectorAll<HTMLElement>('[data-memory-path]')).find(e => e.dataset.memoryPath === path)
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

const needsProject = computed(() => scope.value === 'project' && !workingDir.value)
const selected = computed(() => [...files.value, ...extraFiles.value].find(f => f.path === selectedPath.value))
const dirty = computed(() => content.value !== original.value)

const groups = computed(() => {
  const map = new Map<string, MemoryFile[]>()
  for (const f of [...files.value, ...extraFiles.value]) {
    if (!map.has(f.group)) map.set(f.group, [])
    map.get(f.group)!.push(f)
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }))
})

/** Re-read the file list without touching the selection or the editor */
async function refreshFiles() {
  try {
    const res = await $fetch<{ files: MemoryFile[] }>('/api/memory/files', {
      query: { scope: scope.value, path: scope.value === 'project' ? workingDir.value : undefined },
    })
    files.value = res.files
  } catch {
    // keep the current list
  }
}

async function loadList() {
  selectedPath.value = ''
  content.value = ''
  original.value = ''
  extraFiles.value = []
  knownDirs.value = []
  loadedDirs.clear()
  if (needsProject.value) {
    files.value = []
    return
  }
  loadingList.value = true
  try {
    const res = await $fetch<{ files: MemoryFile[] }>('/api/memory/files', {
      query: { scope: scope.value, path: scope.value === 'project' ? workingDir.value : undefined },
    })
    files.value = res.files
    await loadDir('')
    // Open the first file that exists
    const first = files.value.find(f => f.exists) ?? files.value[0]
    if (first) await selectFile(first.path, true)
  } catch (e: any) {
    files.value = []
    toast.add({ title: 'Failed to list files', description: e.data?.message || e.message, color: 'error' })
  } finally {
    loadingList.value = false
  }
}

async function selectFile(path: string, force = false) {
  if (!force && dirty.value && !window.confirm('Discard unsaved changes?')) return
  gitBase.value = null
  selectedPath.value = path
  revealInTree(path)
  loadingFile.value = true
  try {
    const res = await $fetch<{ exists: boolean; content: string }>('/api/memory/file', {
      query: { scope: scope.value, projectPath: scope.value === 'project' ? workingDir.value : undefined, path },
    })
    content.value = res.content
    original.value = res.content
  } catch (e: any) {
    content.value = ''
    original.value = ''
    toast.add({ title: 'Failed to open file', description: e.data?.message || e.message, color: 'error' })
  } finally {
    loadingFile.value = false
  }
}

async function save() {
  if (!selected.value || saving.value) return
  saving.value = true
  try {
    await $fetch('/api/memory/file', {
      method: 'PUT',
      body: { scope: scope.value, projectPath: scope.value === 'project' ? workingDir.value : undefined, path: selected.value.path, content: content.value },
    })
    original.value = content.value
    selected.value.exists = true
    refreshGit()
    toast.add({ title: `${selected.value.name} saved`, color: 'success', duration: 2000 })
  } catch (e: any) {
    toast.add({ title: 'Failed to save', description: e.data?.message || e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

function switchScope(s: Scope) {
  if (s === scope.value) return
  if (dirty.value && !window.confirm('Discard unsaved changes?')) return
  scope.value = s
}

watch([scope, workingDir], async () => {
  await loadList()
  refreshGit()
})
onMounted(async () => {
  // Opens on Project; with no project set there is nothing to show, so start on Global instead
  if (!workingDir.value) scope.value = 'global'
  await loadList()
  refreshGit()
  window.addEventListener('focus', refreshGit)
  document.addEventListener('click', closeMenu)
})
onUnmounted(() => {
  window.removeEventListener('focus', refreshGit)
  document.removeEventListener('click', closeMenu)
})
function closeMenu() {
  menuRepo.value = null
}

// Cmd/Ctrl+S
if (import.meta.client) {
  const onKeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (dirty.value) save()
    }
  }
  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => document.removeEventListener('keydown', onKeydown))
}

useHead({ title: 'Memory | Agent Manager' })
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <PageHeader title="Memory" hide-title>
    </PageHeader>

    <div class="flex-1 min-h-0 flex">
      <!-- File list -->
      <aside class="w-64 shrink-0 flex flex-col min-h-0" style="border-right: 1px solid var(--border-subtle);">
        <!-- Scope toggle -->
        <div class="shrink-0 p-3 pb-2">
          <div class="grid grid-cols-2 gap-1 p-1 rounded-lg" style="background: var(--surface-raised); border: 1px solid var(--border-subtle);">
            <button
              v-for="tab in scopeTabs"
              :key="tab.value"
              class="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] font-medium transition-colors focus-ring"
              :style="scope === tab.value ? 'background: var(--accent-muted); color: var(--text-primary);' : 'color: var(--text-secondary);'"
              @click="switchScope(tab.value)"
            >
              <UIcon :name="tab.icon" class="size-3.5" />
              {{ tab.label }}
            </button>
          </div>
          <div class="flex items-center justify-between gap-1 mt-2">
            <!-- First group's title shares the row with the view toggle -->
            <div
              v-if="!loadingList && groups[0]"
              class="px-2 text-[11px] font-semibold tracking-wider truncate"
              :class="groupLabel(groups[0].name).startsWith('~') ? '' : 'uppercase'"
              style="color: var(--text-secondary);"
              :title="groupLabel(groups[0].name)"
            >
              {{ groupLabel(groups[0].name) }}
            </div>
            <span v-else />
            <div class="flex items-center gap-1 shrink-0">
            <button
              v-for="m in ([{ v: 'list', icon: 'i-lucide-list', t: 'View as List' }, { v: 'tree', icon: 'i-lucide-list-tree', t: 'View as Tree' }] as const)"
              :key="m.v"
              class="p-1 rounded hover-bg focus-ring"
              :style="viewMode === m.v ? 'background: var(--accent-muted); color: var(--text-primary);' : 'color: var(--text-secondary);'"
              :title="m.t"
              :aria-pressed="viewMode === m.v"
              @click="setView(m.v)"
            >
              <UIcon :name="m.icon" class="size-3.5" />
            </button>
            </div>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-4">
        <div v-if="loadingList" class="flex justify-center py-8">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-meta" />
        </div>
        <template v-else>
          <div v-for="(group, gi) in groups" :key="group.name" class="space-y-1">
            <div v-if="gi > 0" class="px-2 text-[11px] font-semibold tracking-wider truncate" :class="groupLabel(group.name).startsWith('~') ? '' : 'uppercase'" style="color: var(--text-secondary);" :title="groupLabel(group.name)">
              {{ groupLabel(group.name) }}
            </div>
            <template v-for="row in groupRows(group)" :key="row.kind === 'file' ? row.file.path : `${row.kind}:${row.key}`">
              <button
                v-if="row.kind === 'dir'"
                class="w-full flex items-center gap-1.5 py-1.5 pr-2 rounded-lg text-left transition-colors hover-bg focus-ring"
                :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
                :title="row.key"
                @click="toggleDir(row, group.name)"
              >
                <UIcon name="i-lucide-chevron-right" class="size-3 shrink-0 transition-transform duration-150" :class="row.open ? 'rotate-90' : ''" style="color: var(--text-secondary);" />
                <span class="text-[12px] truncate" style="color: var(--text-primary);">{{ row.label }}</span>
              </button>
              <div
                v-else-if="row.kind === 'empty'"
                class="py-1 pr-2 text-[11px] italic"
                :style="{ paddingLeft: `${8 + row.depth * 16 + 16}px`, color: 'var(--text-disabled)' }"
              >
                No markdown files
              </div>
              <button
                v-else
                :data-memory-path="row.file.path"
                class="w-full flex items-center gap-2 py-1.5 pr-2 rounded-lg text-left transition-colors hover-bg focus-ring"
                :style="{ paddingLeft: `${8 + row.depth * 16}px`, background: row.file.path === selectedPath ? 'var(--accent-muted)' : '' }"
                :title="row.file.path"
                @click="selectFile(row.file.path)"
              >
                <UIcon
                  :name="row.file.exists ? 'i-lucide-file-text' : 'i-lucide-file-plus'"
                  class="size-3.5 shrink-0"
                  :style="{ color: row.file.exists ? 'var(--accent)' : 'var(--text-disabled)' }"
                />
                <span class="text-[12px] truncate" :style="{ color: row.file.exists ? 'var(--text-primary)' : 'var(--text-tertiary)' }">{{ row.label }}</span>
                <span
                  v-if="fileStatus.get(row.file.path)"
                  class="ml-auto text-[11px] font-semibold font-mono"
                  :style="{ color: statusColor(fileStatus.get(row.file.path)!.letter) }"
                  :title="statusTitle(fileStatus.get(row.file.path)!.letter) + (fileStatus.get(row.file.path)!.staged ? ' (staged)' : '')"
                >{{ fileStatus.get(row.file.path)!.letter }}</span>
                <span v-else-if="!row.file.exists" class="ml-auto text-[9px] uppercase tracking-wide" style="color: var(--text-disabled);">new</span>
              </button>
            </template>
          </div>
          <p v-if="!groups.length && !needsProject" class="text-[12px] text-muted-ui px-2">No files found.</p>
        </template>
        <!-- Source control -->
        <div v-if="repos.length" class="pt-4 space-y-2" style="border-top: 1px solid var(--border-subtle);">
          <!-- Fixed height so the title does not shift when the refresh button appears -->
          <div class="flex items-center justify-between h-6">
            <button
              class="flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider"
              style="color: var(--text-secondary);"
              :aria-expanded="scmOpen"
              @click="toggleScm"
            >
              <UIcon name="i-lucide-chevron-right" class="size-3 transition-transform duration-150" :class="scmOpen ? 'rotate-90' : ''" />
              Source Control
              <span v-if="totalChanges" class="ml-1 min-w-[16px] text-center text-[10px] font-semibold px-1 rounded-full" style="background: var(--accent); color: white;">{{ totalChanges }}</span>
            </button>
            <button v-if="scmOpen" class="p-1 rounded hover-bg" title="Refresh" style="color: var(--text-secondary);" @click="refreshGit">
              <UIcon name="i-lucide-refresh-cw" class="size-3" />
            </button>
          </div>

          <div v-if="scmOpen" class="space-y-4">
            <div v-for="repo in repos" :key="repo.root" class="space-y-2">
              <!-- Repo header -->
              <div class="flex items-center gap-1.5 min-w-0 px-2">
                <span class="text-[11px] font-medium truncate" style="color: var(--text-primary);" :title="repo.root">{{ repo.label }}</span>
                <span class="shrink-0 flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full" style="background: var(--accent-muted); color: var(--accent);">
                  <UIcon name="i-lucide-git-branch" class="size-2.5" />{{ repo.branch }}
                </span>
                <span v-if="repo.ahead || repo.behind" class="shrink-0 text-[10px] font-mono text-muted-ui" :title="repo.upstream ?? ''">
                  <span v-if="repo.ahead">&uarr;{{ repo.ahead }}</span>
                  <span v-if="repo.behind"> &darr;{{ repo.behind }}</span>
                </span>
                <button
                  v-if="repo.ahead && repo.upstream"
                  class="ml-auto shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium hover-bg disabled:opacity-50"
                  style="color: var(--text-secondary); border: 1px solid var(--border-subtle);"
                  :disabled="gitBusy === repo.root"
                  :title="`Push ${repo.ahead} commit${repo.ahead > 1 ? 's' : ''} to ${repo.upstream}`"
                  @click="pushRepo(repo)"
                >
                  <UIcon :name="gitBusy === repo.root ? 'i-lucide-loader-2' : 'i-lucide-arrow-up-from-line'" class="size-3" :class="{ 'animate-spin': gitBusy === repo.root }" />
                  Push
                </button>
              </div>

              <template v-if="repo.staged.length || repo.changes.length">
                <!-- Message + split commit button -->
                <div class="px-2">
                  <input
                    v-model="messages[repo.root]"
                    class="field-input w-full text-[12px]"
                    :placeholder="`Message (Enter to commit on &quot;${repo.branch}&quot;)`"
                    @focus="onMessageFocus(repo)"
                    @keydown.enter.prevent="commit(repo, false)"
                  />
                </div>
                <div class="relative flex mx-2" @click.stop>
                  <button
                    class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-l-lg text-[12px] font-semibold disabled:opacity-50"
                    style="background: var(--accent); color: white;"
                    :disabled="!messages[repo.root]?.trim() || gitBusy === repo.root"
                    :title="repo.staged.length ? 'Commit staged changes' : 'Commit all changes'"
                    @click="commit(repo, false)"
                  >
                    <UIcon :name="gitBusy === repo.root ? 'i-lucide-loader-2' : 'i-lucide-check'" class="size-3.5" :class="{ 'animate-spin': gitBusy === repo.root }" />
                    Commit
                  </button>
                  <button
                    class="px-2 rounded-r-lg disabled:opacity-50 flex items-center"
                    style="background: var(--accent); color: white; border-left: 1px solid rgba(255,255,255,0.35);"
                    :disabled="!messages[repo.root]?.trim() || gitBusy === repo.root"
                    title="More commit actions"
                    @click="menuRepo = menuRepo === repo.root ? null : repo.root"
                  >
                    <UIcon name="i-lucide-chevron-down" class="size-3.5" />
                  </button>
                  <div
                    v-if="menuRepo === repo.root"
                    class="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg overflow-hidden py-1"
                    style="background: var(--surface-overlay, var(--surface-base)); border: 1px solid var(--border-default); box-shadow: 0 4px 20px rgba(0,0,0,0.15);"
                  >
                    <button class="w-full text-left px-3 py-1.5 text-[12px] hover-bg" style="color: var(--text-primary);" @click="commit(repo, false)">Commit</button>
                    <button
                      class="w-full text-left px-3 py-1.5 text-[12px] hover-bg disabled:opacity-40"
                      style="color: var(--text-primary);"
                      :disabled="!repo.upstream"
                      :title="repo.upstream ? `Commit and push to ${repo.upstream}` : 'No upstream branch to push to'"
                      @click="commit(repo, true)"
                    >Commit &amp; push</button>
                  </div>
                </div>

                <!-- Staged / Changes sections -->
                <div v-for="section in [
                  { key: 'staged', title: 'Staged Changes', items: repo.staged, action: 'unstage' as const },
                  { key: 'changes', title: 'Changes', items: repo.changes, action: 'stage' as const },
                ]" :key="section.key">
                  <template v-if="section.items.length">
                    <div class="flex items-center gap-1 py-1 px-2">
                      <button
                        class="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider flex-1 text-left"
                        style="color: var(--text-secondary);"
                        @click="collapsed[repo.root + section.key] = !collapsed[repo.root + section.key]"
                      >
                        <UIcon :name="collapsed[repo.root + section.key] ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-3" />
                        {{ section.title }}
                      </button>
                      <button
                        class="p-0.5 rounded hover-bg"
                        style="color: var(--text-secondary);"
                        :title="section.action === 'stage' ? 'Stage all' : 'Unstage all'"
                        @click="stage(repo, section.items.map(c => c.path), section.action)"
                      >
                        <UIcon :name="section.action === 'stage' ? 'i-lucide-plus' : 'i-lucide-minus'" class="size-3.5" />
                      </button>
                      <span class="min-w-[18px] text-center text-[10px] font-semibold px-1 rounded-full" style="background: var(--accent); color: white;">{{ section.items.length }}</span>
                    </div>
                    <div v-if="!collapsed[repo.root + section.key]" class="space-y-0.5">
                      <div
                        v-for="c in section.items"
                        :key="section.key + c.path"
                        class="group flex items-center gap-2 px-2 py-1 rounded-md hover-bg cursor-pointer"
                        :title="c.path"
                        @click="openChange(c, repo)"
                      >
                        <UIcon name="i-lucide-file-text" class="size-3.5 shrink-0" style="color: var(--accent);" />
                        <span class="text-[12px] truncate" style="color: var(--text-primary);">{{ c.name }}</span>
                        <span v-if="c.dir" class="text-[10px] truncate min-w-0 text-muted-ui">{{ c.dir }}</span>
                        <button
                          v-if="c.status !== 'D'"
                          class="ml-auto shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover-bg"
                          style="color: var(--text-secondary);"
                          title="Reveal in file list"
                          @click.stop="revealFile(c.path)"
                        >
                          <UIcon name="i-lucide-locate-fixed" class="size-3.5" />
                        </button>
                        <button
                          v-if="section.key === 'changes'"
                          class="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover-bg"
                          style="color: var(--text-secondary);"
                          :title="c.status === 'U' ? 'Delete file' : 'Discard Changes'"
                          @click.stop="discard(repo, c)"
                        >
                          <UIcon :name="c.status === 'U' ? 'i-lucide-trash-2' : 'i-lucide-undo-2'" class="size-3.5" />
                        </button>
                        <button
                          class="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover-bg"
                          style="color: var(--text-secondary);"
                          :title="section.action === 'stage' ? 'Stage' : 'Unstage'"
                          @click.stop="stage(repo, [c.path], section.action)"
                        >
                          <UIcon :name="section.action === 'stage' ? 'i-lucide-plus' : 'i-lucide-minus'" class="size-3.5" />
                        </button>
                        <span class="shrink-0 w-3 text-center text-[11px] font-semibold font-mono" :style="{ color: statusColor(c.status) }" :title="statusTitle(c.status)">{{ c.status }}</span>
                      </div>
                    </div>
                  </template>
                </div>
              </template>
              <p v-else class="text-[11px] text-muted-ui px-2">No changes to memory files.</p>
              <p v-if="repo.otherChanges" class="text-[10px] text-muted-ui px-2" title="Not listed here and never committed from this page">
                +{{ repo.otherChanges }} other changed file{{ repo.otherChanges > 1 ? 's' : '' }} in this repo
              </p>
            </div>
          </div>
        </div>
        </div>
      </aside>

      <!-- Editor -->
      <section class="flex-1 min-w-0 flex flex-col">
      <div v-if="needsProject" class="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2">
        <UIcon name="i-lucide-folder-x" class="size-8 text-meta" />
        <p class="text-[14px] font-medium" style="color: var(--text-primary);">No project selected</p>
        <p class="text-[12px] text-meta max-w-sm">Pick a project in the sidebar to see its CLAUDE.md, AGENTS.md and auto-memory files.</p>
      </div>
        <template v-else-if="selected">
          <div class="shrink-0 flex items-center justify-between gap-3 px-4 py-2" style="border-bottom: 1px solid var(--border-subtle);">
            <div class="min-w-0">
              <div class="text-[13px] font-medium truncate" style="color: var(--text-primary);">
                {{ selected.name }}
                <span v-if="dirty" class="ml-1 text-[11px]" style="color: var(--accent);">unsaved</span>
                <span v-else-if="!selected.exists" class="ml-1 text-[11px] text-muted-ui">will be created on save</span>
              </div>
              <div class="text-[10px] font-mono truncate text-muted-ui" :title="selected.path">{{ selected.path }}</div>
            </div>
            <button
              class="px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all flex items-center gap-2 disabled:opacity-50"
              style="background: var(--accent); color: white;"
              :disabled="!dirty || saving"
              @click="save"
            >
              <UIcon :name="saving ? 'i-lucide-loader-2' : 'i-lucide-save'" class="size-3.5" :class="{ 'animate-spin': saving }" />
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
          <div v-if="loadingFile" class="flex-1 flex items-center justify-center">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-meta" />
          </div>
          <InstructionEditor
            v-else
            :key="selected.path + (gitBase !== null ? ':git' : '')"
            v-model="content"
            :default-mode="gitBase !== null ? 'diff' : 'preview'"
            :original="gitBase ?? (selected.exists ? original : '')"
            class="flex-1 min-h-0"
            :agent-name="selected.name"
            :placeholder="`# ${selected.name}\n\nWrite here...`"
          />
        </template>
        <div v-else-if="!loadingList" class="flex-1 flex items-center justify-center text-[13px] text-meta">
          Select a file to preview or edit.
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* .text-meta (--text-disabled) is too faint for small labels here */
.text-muted-ui { color: var(--text-tertiary); }
</style>
