<script setup lang="ts">
const route = useRoute()
const { claudeDir, exists: claudeDirExists, load: loadConfig } = useClaudeDir()
const { fetchAll: fetchAgents, agents } = useAgents()
const { fetchAll: fetchCommands, commands } = useCommands()
const { fetchAll: fetchPlugins, plugins } = usePlugins()
const { fetchAll: fetchSkills, skills } = useSkills()
const { fetchAll: fetchWorkflows, workflows } = useWorkflows()
const { fetchServers, servers: mcpServers } = useMCP()
const { styles, fetchStyles } = useOutputStyles()

const initialized = ref(false)
const showSearch = ref(false)
const sidebarCollapsed = useState('sidebar-collapsed', () => false)
const { isPanelOpen: chatOpen } = useChat()
const { workingDir, setWorkingDir, clearWorkingDir } = useWorkingDir()
const colorMode = useColorMode()

const showWorkingDirPopover = ref(false)
const workingDirName = computed(() => workingDir.value.replace(/\/+$/, '').split('/').pop() || workingDir.value)
const RECENT_KEY = 'agents-ui:recent-open'
const showRecent = ref(false)
onMounted(() => {
  try { showRecent.value = localStorage.getItem(RECENT_KEY) === '1' } catch {}
})
function toggleRecent() {
  showRecent.value = !showRecent.value
  try { localStorage.setItem(RECENT_KEY, showRecent.value ? '1' : '0') } catch {}
}
const recentProjects = ref<{ name: string; path: string; displayName: string }[]>([])

async function loadRecentProjects() {
  try {
    const all = await $fetch<{ name: string; path: string; displayName: string }[]>('/api/projects')
    recentProjects.value = all.slice(0, 8)
  } catch {
    recentProjects.value = []
  }
}

function pickRecentProject(path: string) {
  setWorkingDir(path)
  showWorkingDirPopover.value = false
  dirSuggestions.value = []
}
const workingDirInput = ref('')
const dirSuggestions = ref<{ name: string; path: string; hasChildren: boolean }[]>([])
const selectedSuggestionIdx = ref(-1)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const parentDirPath = computed(() => {
  const p = workingDirInput.value.replace(/\/+$/, '')
  if (!p || p === '/') return null
  const idx = p.lastIndexOf('/')
  // Trailing slash matters: without it the directory API treats the last segment as a name prefix to filter by
  return idx <= 0 ? '/' : `${p.slice(0, idx)}/`
})

function openWorkingDirPopover() {
  workingDirInput.value = workingDir.value
  dirSuggestions.value = []
  selectedSuggestionIdx.value = -1
  showWorkingDirPopover.value = true
  loadRecentProjects()
  if (workingDirInput.value) fetchDirSuggestions(workingDirInput.value)
}

/** Go to the parent folder. Capture the target first: parentDirPath is computed from the input, so
 *  reading it again after assigning the input would give the grandparent. */
function goToParentDir() {
  const target = parentDirPath.value
  if (!target) return
  workingDirInput.value = target
  fetchDirSuggestions(target)
}

function goToHomeDir() {
  // Trailing slash: without it the API treats "~" as a name prefix to filter by
  workingDirInput.value = '~/'
  fetchDirSuggestions('~/')
}

function saveWorkingDir() {
  setWorkingDir(workingDirInput.value)
  showWorkingDirPopover.value = false
  dirSuggestions.value = []
}

// Responses can arrive out of order (e.g. clicking ".." quickly), so only the latest request may update the list
let dirRequestSeq = 0

async function fetchDirSuggestions(path: string) {
  const seq = ++dirRequestSeq
  if (!path) { dirSuggestions.value = []; return }
  try {
    const data = await $fetch<{ directories: typeof dirSuggestions.value }>('/api/directories', { query: { path } })
    if (seq !== dirRequestSeq) return
    dirSuggestions.value = data.directories
    selectedSuggestionIdx.value = -1
  } catch {
    if (seq === dirRequestSeq) dirSuggestions.value = []
  }
}

function onDirInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchDirSuggestions(workingDirInput.value), 150)
}

function selectSuggestion(suggestion: { name: string; path: string; hasChildren: boolean }) {
  workingDirInput.value = suggestion.path
  selectedSuggestionIdx.value = -1
  if (suggestion.hasChildren) {
    fetchDirSuggestions(suggestion.path)
  } else {
    dirSuggestions.value = []
  }
}

function onDirKeydown(e: KeyboardEvent) {
  if (!dirSuggestions.value.length) {
    if (e.key === 'Enter') { e.preventDefault(); saveWorkingDir() }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedSuggestionIdx.value = Math.min(selectedSuggestionIdx.value + 1, dirSuggestions.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedSuggestionIdx.value = Math.max(selectedSuggestionIdx.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedSuggestionIdx.value >= 0) {
      selectSuggestion(dirSuggestions.value[selectedSuggestionIdx.value]!)
    } else {
      saveWorkingDir()
    }
  } else if (e.key === 'Escape') {
    dirSuggestions.value = []
    selectedSuggestionIdx.value = -1
  }
}

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

// Cmd+J to toggle chat
if (import.meta.client) {
  const chatHandler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
      e.preventDefault()
      chatOpen.value = !chatOpen.value
    }
  }
  onMounted(() => document.addEventListener('keydown', chatHandler))
  onUnmounted(() => document.removeEventListener('keydown', chatHandler))
}

onMounted(async () => {
  await loadConfig()
  await Promise.all([fetchAgents(), fetchCommands(), fetchPlugins(), fetchSkills(), fetchWorkflows(), fetchServers()])
  initialized.value = true
})

const navTop = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Agents', icon: 'i-lucide-cpu', to: '/agents' },
  { label: 'Workflows', icon: 'i-lucide-git-branch', to: '/workflows' },
  { label: 'Commands', icon: 'i-lucide-terminal', to: '/commands' },
  { label: 'Skills', icon: 'i-lucide-sparkles', to: '/skills' },
  { label: 'Plugins', icon: 'i-lucide-puzzle', to: '/plugins' },
  { label: 'MCP Servers', icon: 'i-lucide-server', to: '/mcp' },
  { label: 'Output Styles', icon: 'i-lucide-palette', to: '/output-styles' },
  { label: 'Memory', icon: 'i-lucide-brain', to: '/memory' },
]

const navMid = [
  { key: 'artifacts', label: 'Artifacts', icon: 'i-lucide-folder-root', to: '/project-artifacts' },
  { key: 'cli', label: 'CLI', icon: 'i-lucide-terminal-square', to: '/cli' },
]

const navBottom = [
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
  { label: 'Explore', icon: 'i-lucide-compass', to: '/explore' },
  { label: 'Graph', icon: 'i-lucide-workflow', to: '/graph' },
  { label: 'Usage', icon: 'i-lucide-bar-chart-2', to: '/usage' },
  { label: 'Logs', icon: 'i-lucide-scroll-text', to: '/logs' },
]

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  // Exact match or sub-route
  return route.path === to || route.path.startsWith(to + '/')
}

function badgeFor(to: string) {
  if (to === '/agents') return agents.value.length || null
  if (to === '/commands') return commands.value.length || null
  if (to === '/skills') return skills.value.length || null
  if (to === '/plugins') return plugins.value.length || null
  if (to === '/workflows') return workflows.value.length || null
  if (to === '/mcp') return mcpServers.value.length || null
  return null
}
</script>

<template>
  <UApp>
    <div class="flex h-screen overflow-hidden" style="background: var(--surface-base);">
      <!-- Sidebar -->
      <aside
        class="sidebar shrink-0 flex flex-col relative h-full overflow-hidden transition-all duration-300"
        :style="{
          width: sidebarCollapsed ? '56px' : '200px',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border-subtle)',
        }"
      >
        <!-- Ambient glow at top — stronger -->
        <div
          class="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-32 pointer-events-none"
          style="background: radial-gradient(ellipse, rgba(229, 169, 62, 0.1) 0%, transparent 70%);"
        />

        <!-- Brand -->
        <div class="h-[56px] flex items-center gap-2.5 relative" :class="sidebarCollapsed ? 'justify-center px-2' : 'px-4'">
          <NuxtLink to="/" class="flex items-center gap-2.5 flex-1 min-w-0 group/brand" v-if="!sidebarCollapsed">
            <div
              class="size-7 rounded-lg flex items-center justify-center relative shrink-0 transition-transform duration-200 group-hover/brand:scale-105"
              style="background: linear-gradient(135deg, rgba(229, 169, 62, 0.18) 0%, rgba(229, 169, 62, 0.06) 100%); border: 1px solid rgba(229, 169, 62, 0.15);"
            >
              <UIcon name="i-lucide-bot" class="size-3.5" style="color: var(--accent);" />
            </div>
            <div class="flex-1 flex flex-col min-w-0">
              <span class="text-[12px] font-semibold tracking-tight group-hover/brand:text-accent transition-colors" style="color: var(--text-primary);">
                Agent Manager
              </span>
              <span class="text-[9px] tracking-wider uppercase" style="color: var(--text-tertiary);">
                Claude Code
              </span>
            </div>
          </NuxtLink>
          <div v-else class="size-7 rounded-lg flex items-center justify-center relative shrink-0"
            style="background: linear-gradient(135deg, rgba(229, 169, 62, 0.18) 0%, rgba(229, 169, 62, 0.06) 100%); border: 1px solid rgba(229, 169, 62, 0.15);"
          >
            <UIcon name="i-lucide-bot" class="size-3.5" style="color: var(--accent);" />
          </div>
          <!-- Collapse toggle -->
          <button
            class="hidden md:flex size-7 items-center justify-center rounded-lg transition-all duration-150 focus-ring press-scale shrink-0"
            style="color: var(--text-tertiary);"
            :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            @mouseenter="($event.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.background = 'transparent'"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <UIcon :name="sidebarCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" class="size-4" />
          </button>
        </div>

        <!-- Project switcher -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-2' : 'px-2.5 pb-2'">
          <!-- Client-only: the saved project lives in localStorage, so a server-rendered chip would show the
               "no project" styling and Vue does not patch stale classes when hydrating -->
          <ClientOnly>
          <UPopover v-model:open="showWorkingDirPopover" :ui="{ width: 'w-[280px]' }">
            <button
              class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring cursor-pointer press-scale"
              :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2 text-left'"
              :style="{
                color: 'var(--text-secondary)',
                border: workingDir ? '1px solid var(--border-subtle)' : '1px dashed var(--warning, #d97706)',
              }"
              :title="workingDir || 'Set project directory'"
              @click="openWorkingDirPopover"
            >
              <UIcon name="i-lucide-folder" class="size-3.5 shrink-0" :style="{ color: workingDir ? 'var(--accent)' : 'var(--warning, #d97706)' }" />
              <template v-if="!sidebarCollapsed">
                <div class="flex-1 min-w-0">
                  <div class="text-[9px] tracking-wider uppercase leading-none" style="color: var(--text-tertiary);">Project</div>
                  <div v-if="workingDir" class="text-[12px] font-medium leading-snug line-clamp-2 [overflow-wrap:anywhere] mt-0.5" style="color: var(--text-primary);">
                    {{ workingDirName }}
                  </div>
                  <div v-else class="text-[12px] mt-0.5" style="color: var(--warning, #d97706);">
                    No project set
                  </div>
                </div>
                <UIcon name="i-lucide-chevrons-up-down" class="size-3 shrink-0" style="color: var(--text-disabled);" />
              </template>
            </button>
            <template #content>
              <div class="p-3 space-y-3">
                <div class="flex items-center justify-between gap-2">
                  <div class="text-[13px] font-semibold" style="color: var(--text-primary); font-family: var(--font-sans);">Working Directory</div>
                  <button
                    type="button"
                    class="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] hover-bg transition-colors shrink-0"
                    style="color: var(--text-tertiary); border: 1px solid var(--border-subtle);"
                    title="Go to home directory"
                    @click="goToHomeDir"
                  >
                    <UIcon name="i-lucide-home" class="size-3" />
                    Home
                  </button>
                </div>
                <p class="text-[11px] leading-relaxed" style="color: var(--text-secondary);">
                  Active project for chat, terminal, workflows and project settings. Claude operates in this directory.
                </p>
                <div v-if="recentProjects.length" class="space-y-1">
                  <button
                    type="button"
                    class="flex items-center gap-1 text-[10px] uppercase tracking-wider hover:text-[var(--text-secondary)] transition-colors"
                    style="color: var(--text-tertiary);"
                    :aria-expanded="showRecent"
                    @click="toggleRecent"
                  >
                    <UIcon name="i-lucide-chevron-right" class="size-3 transition-transform duration-150" :class="showRecent ? 'rotate-90' : ''" />
                    Recent
                  </button>
                  <div v-if="showRecent" class="rounded-lg overflow-hidden max-h-[180px] overflow-y-auto" style="border: 1px solid var(--border-subtle); background: var(--surface-raised);">
                    <button
                      v-for="proj in recentProjects"
                      :key="proj.path"
                      type="button"
                      class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover-bg transition-colors"
                      :style="{ color: proj.path === workingDir ? 'var(--text-primary)' : 'var(--text-secondary)' }"
                      :title="proj.path"
                      @click="pickRecentProject(proj.path)"
                    >
                      <UIcon :name="proj.path === workingDir ? 'i-lucide-check' : 'i-lucide-folder'" class="size-3.5 shrink-0" :style="{ color: proj.path === workingDir ? 'var(--accent)' : 'var(--text-disabled)' }" />
                      <span class="text-[11px] truncate">{{ proj.displayName }}</span>
                    </button>
                  </div>
                </div>
                <div class="relative">
                  <input
                    v-model="workingDirInput"
                    class="field-input text-[12px] font-mono"
                    placeholder="/path/to/your/project"
                    autocomplete="off"
                    @input="onDirInput"
                    @keydown="onDirKeydown"
                  />
                  <!-- Directory suggestions -->
                  <div
                    v-if="dirSuggestions.length || parentDirPath"
                    class="mt-1 rounded-lg overflow-hidden max-h-[420px] overflow-y-auto"
                    style="border: 1px solid var(--border-subtle); background: var(--surface-raised);"
                  >
                    <!-- Parent (..) entry -->
                    <button
                      v-if="parentDirPath"
                      type="button"
                      class="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors duration-75 border-b hover:bg-[var(--accent-muted)]"
                      style="border-color: var(--border-subtle); color: var(--text-tertiary);"
                      @click="goToParentDir"
                    >
                      <span class="text-[11px] font-mono truncate">..</span>
                    </button>
                    <button
                      v-for="(suggestion, idx) in dirSuggestions"
                      :key="suggestion.path"
                      type="button"
                      class="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors duration-75"
                      :style="{
                        background: idx === selectedSuggestionIdx ? 'var(--accent-muted)' : 'transparent',
                        color: idx === selectedSuggestionIdx ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }"
                      @click="selectSuggestion(suggestion)"
                      @mouseenter="selectedSuggestionIdx = idx"
                    >
                      <UIcon
                        :name="suggestion.hasChildren ? 'i-lucide-folder' : 'i-lucide-folder-dot'"
                        class="size-3.5 shrink-0"
                        :style="{ color: idx === selectedSuggestionIdx ? 'var(--accent)' : 'var(--text-disabled)' }"
                      />
                      <span class="text-[11px] font-mono truncate">{{ suggestion.name }}</span>
                      <UIcon
                        v-if="suggestion.hasChildren"
                        name="i-lucide-chevron-right"
                        class="size-3 shrink-0 ml-auto"
                        style="color: var(--text-disabled);"
                      />
                    </button>
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  <button
                    v-if="workingDir"
                    class="text-[11px] font-medium px-2 py-1 rounded hover-bg"
                    style="color: var(--error);"
                    @click="clearWorkingDir(); showWorkingDirPopover = false"
                  >
                    Clear
                  </button>
                  <div v-else />
                  <UButton label="Save" size="xs" @click="saveWorkingDir" />
                </div>
              </div>
            </template>
          </UPopover>
            <template #fallback>
              <div
                class="w-full rounded-lg"
                :class="sidebarCollapsed ? 'h-9' : 'h-[52px]'"
                style="border: 1px solid var(--border-subtle);"
              />
            </template>
          </ClientOnly>
        </div>

        <!-- Primary Nav -->
        <nav class="flex-1 pt-1 space-y-0.5 overflow-y-auto" :class="sidebarCollapsed ? 'px-1.5' : 'px-2.5'">
          <!-- Top Section -->
          <NuxtLink
            v-for="link in navTop"
            :key="link.to"
            :to="link.to"
            class="nav-item group flex items-center rounded-lg text-[14px] transition-all duration-150 relative focus-ring"
            :class="[
              sidebarCollapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-3 py-[5px]',
              { 'nav-item--active': isActive(link.to) }
            ]"
            :style="{
              color: isActive(link.to) ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: isActive(link.to) ? '500' : '400',
              background: isActive(link.to) ? 'var(--accent-muted)' : undefined,
            }"
            :title="sidebarCollapsed ? link.label : undefined"
          >
            <!-- Active indicator bar -->
            <div
              v-if="isActive(link.to)"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-r-full"
              style="background: var(--accent); box-shadow: 0 0 10px var(--accent-glow);"
            />
            <UIcon :name="link.icon" class="size-[15px] shrink-0 transition-colors duration-150" :style="{ color: isActive(link.to) ? 'var(--accent)' : undefined }" />
            <template v-if="!sidebarCollapsed">
              <span class="flex-1" style="font-family: var(--font-sans);">{{ link.label }}</span>
              <span
                v-if="badgeFor(link.to)"
                class="font-mono text-[10px] tabular-nums transition-colors duration-150"
                :style="{ color: isActive(link.to) ? 'var(--accent)' : 'var(--text-disabled)' }"
              >
                {{ badgeFor(link.to) }}
              </span>
            </template>
          </NuxtLink>

          <!-- Separator 1 -->
          <div class="my-3" :class="sidebarCollapsed ? 'mx-1' : 'mx-2'" style="border-top: 1px solid var(--border-subtle);" />

          <!-- Mid Section: Projects & CLI -->
          <NuxtLink
            v-for="link in navMid"
            :key="link.key"
            :to="link.to"
            class="nav-item group flex items-center rounded-lg text-[14px] transition-all duration-150 relative focus-ring"
            :class="[
              sidebarCollapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-3 py-[5px]',
              { 'nav-item--active': isActive(link.to) }
            ]"
            :style="{
              color: isActive(link.to) ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: isActive(link.to) ? '500' : '400',
              background: isActive(link.to) ? 'var(--accent-muted)' : undefined,
            }"
            :title="sidebarCollapsed ? link.label : undefined"
          >
            <div
              v-if="isActive(link.to)"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-r-full"
              style="background: var(--accent); box-shadow: 0 0 10px var(--accent-glow);"
            />
            <UIcon :name="link.icon" class="size-[15px] shrink-0 transition-colors duration-150" :style="{ color: isActive(link.to) ? 'var(--accent)' : undefined }" />
            <template v-if="!sidebarCollapsed">
              <span class="flex-1" style="font-family: var(--font-sans);">{{ link.label }}</span>
            </template>
          </NuxtLink>

          <!-- Separator 2 -->
          <div class="my-3" :class="sidebarCollapsed ? 'mx-1' : 'mx-2'" style="border-top: 1px solid var(--border-subtle);" />

          <!-- Bottom Section -->
          <NuxtLink
            v-for="link in navBottom"
            :key="link.to"
            :to="link.to"
            class="nav-item group flex items-center rounded-lg text-[14px] transition-all duration-150 relative focus-ring"
            :class="[
              sidebarCollapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-3 py-[5px]',
              { 'nav-item--active': isActive(link.to) }
            ]"
            :style="{
              color: isActive(link.to) ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: isActive(link.to) ? '500' : '400',
              background: isActive(link.to) ? 'var(--accent-muted)' : undefined,
            }"
            :title="sidebarCollapsed ? link.label : undefined"
          >
            <div
              v-if="isActive(link.to)"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-r-full"
              style="background: var(--accent); box-shadow: 0 0 10px var(--accent-glow);"
            />
            <UIcon :name="link.icon" class="size-[15px] shrink-0 transition-colors duration-150" :style="{ color: isActive(link.to) ? 'var(--accent)' : undefined }" />
            <span v-if="!sidebarCollapsed" style="font-family: var(--font-sans);">{{ link.label }}</span>
          </NuxtLink>
        </nav>

        <!-- Search shortcut -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-2.5' : 'px-2.5 pb-2.5'">
          <button
            class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring cursor-pointer press-scale"
            :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2'"
            style="color: var(--text-secondary); background: var(--input-bg); border: 1px solid var(--border-subtle);"
            :title="sidebarCollapsed ? 'Search (⌘K)' : undefined"
            @mouseenter="($event.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; ($event.currentTarget as HTMLElement).style.color = 'var(--text-primary)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; ($event.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'"
            @click="showSearch = true"
          >
            <UIcon name="i-lucide-search" class="size-3.5" />
            <template v-if="!sidebarCollapsed">
              <span class="text-[13px] flex-1 text-left" style="font-family: var(--font-sans);">Search</span>
              <kbd class="text-[9px] font-mono px-1.5 py-0.5 rounded" style="background: var(--badge-subtle-bg); color: var(--text-disabled);">⌘K</kbd>
            </template>
          </button>
        </div>

        <!-- Chat with Claude -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-1' : 'px-2.5 pb-1'">
          <button
            class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring cursor-pointer press-scale"
            :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2'"
            :style="{
              color: chatOpen ? 'var(--accent)' : 'var(--text-secondary)',
              background: chatOpen ? 'var(--accent-muted)' : 'transparent',
            }"
            :title="sidebarCollapsed ? 'Claude (⌘J)' : undefined"
            @click="chatOpen = !chatOpen"
          >
            <div class="size-4 relative flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-zap" class="size-4" />
              <div
                v-if="chatOpen"
                class="absolute -top-0.5 -right-0.5 size-1.5 rounded-full"
                style="background: var(--accent); box-shadow: 0 0 8px var(--accent-glow);"
              />
            </div>
            <template v-if="!sidebarCollapsed">
              <span class="text-[13px] flex-1 text-left" style="font-family: var(--font-sans);">Claude</span>
              <kbd class="text-[9px] font-mono px-1.5 py-0.5 rounded" style="background: var(--badge-subtle-bg); color: var(--text-disabled);">⌘J</kbd>
            </template>
          </button>
        </div>

        <!-- Theme toggle -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-1' : 'px-2.5 pb-1'">
          <ClientOnly>
            <button
              class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring press-scale"
              :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2'"
              style="color: var(--text-secondary);"
              :title="sidebarCollapsed ? (colorMode.value === 'dark' ? 'Light mode' : 'Dark mode') : undefined"
              @click="toggleTheme"
            >
              <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" />
              <span v-if="!sidebarCollapsed" class="text-[13px]" style="font-family: var(--font-sans);">
                {{ colorMode.value === 'dark' ? 'Light mode' : 'Dark mode' }}
              </span>
            </button>
          </ClientOnly>
        </div>

        <!-- Footer: config directory -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-2.5' : 'px-2.5 pb-2.5'" style="border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
          <div v-if="!sidebarCollapsed" class="font-mono text-[10px] truncate tracking-wide px-1" style="color: var(--text-tertiary);">
            {{ claudeDir || 'No config directory' }}
          </div>
        </div>
      </aside>

      <!-- Main content -->
      <main class="flex-1 min-w-0 h-full overflow-y-auto custom-scrollbar" style="background: var(--surface-base); scrollbar-gutter: stable;">
        <!-- Setup wizard when directory doesn't exist -->
        <SetupWizard
          v-if="initialized && !claudeDirExists"
          @complete="async () => { await loadConfig(); await Promise.all([fetchAgents(), fetchCommands(), fetchPlugins(), fetchSkills(), fetchWorkflows(), fetchServers(), fetchStyles()]) }"
        />

        <div v-show="initialized && claudeDirExists" class="h-full">
          <NuxtPage />
        </div>
        <div v-if="!initialized" class="flex items-center justify-center h-full">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-disabled);" />
        </div>
      </main>
    </div>
    <GlobalSearch />
    <ChatPanel v-model:open="chatOpen" />
    <FileEditorSidebar v-if="!route.path.startsWith('/cli')" />
  </UApp>
</template>

<style scoped>
/* Nav item hover with smooth background reveal */
.nav-item {
  transition: background 0.15s, color 0.15s;
}
.nav-item:hover {
  background: var(--surface-hover);
}

/* Fade transition for mobile backdrop */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
