<script setup lang="ts">
import type { RegisteredProject } from '~/composables/useProjects'
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

// User-resizable sidebar width, remembered in the browser
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 360
const SIDEBAR_DEFAULT = 200
const sidebarWidth = ref(SIDEBAR_DEFAULT)
const resizingSidebar = ref(false)
const clampWidth = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)))
onMounted(() => {
  try {
    const saved = Number(localStorage.getItem('sidebar-width'))
    if (saved) sidebarWidth.value = clampWidth(saved)
  } catch { /* storage blocked: keep the default */ }
})
function startSidebarResize(e: PointerEvent) {
  if (sidebarCollapsed.value) return
  e.preventDefault()
  resizingSidebar.value = true
  const onMove = (ev: PointerEvent) => { sidebarWidth.value = clampWidth(ev.clientX) }
  const onUp = () => {
    resizingSidebar.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    try { localStorage.setItem('sidebar-width', String(sidebarWidth.value)) } catch { /* ignore */ }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
function resetSidebarWidth() {
  sidebarWidth.value = SIDEBAR_DEFAULT
  try { localStorage.removeItem('sidebar-width') } catch { /* ignore */ }
}
const { isPanelOpen: chatOpen } = useChat()
const { workingDir, setWorkingDir, clearWorkingDir } = useWorkingDir()
const colorMode = useColorMode()

const showWorkingDirPopover = ref(false)
const { projects, fetchProjects, removeProject, projectForDir } = useProjects()
const { fetchProjects: refreshHistoryProjects } = useClaudeCodeHistory()
const currentProject = computed(() => projectForDir(workingDir.value))
// A project the user created shows under its name; a directory without one falls back to the folder name
const workingDirName = computed(() => currentProject.value?.name || workingDir.value.replace(/\/+$/, '').split('/').pop() || workingDir.value)
const projectDialog = ref<{ project?: RegisteredProject } | null>(null)
onMounted(() => { fetchProjects().catch(() => {}) })

function pickProject(path: string) {
  setWorkingDir(path)
  showWorkingDirPopover.value = false
}

function openProjectDialog(project?: RegisteredProject) {
  showWorkingDirPopover.value = false
  projectDialog.value = { project }
}

/** A project just created becomes the active one. Editing the active project keeps its directory in sync. */
function onProjectSaved(saved: RegisteredProject) {
  const editing = projectDialog.value?.project
  if (!editing || editing.path === workingDir.value) setWorkingDir(saved.path)
  refreshHistoryProjects()
}

async function deleteProject(project: RegisteredProject) {
  if (!confirm(`Remove project "${project.name}"?\nChats, schedules and issues of ${project.path} are kept.`)) return
  try { await removeProject(project.id); refreshHistoryProjects() } catch { /* list unchanged */ }
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
  { key: 'cli', label: 'Chat', icon: 'i-lucide-terminal-square', to: '/cli' },
  { key: 'issues', label: 'Issues', icon: 'i-lucide-circle-dot', to: '/issues' },
  { key: 'schedules', label: 'Schedules', icon: 'i-lucide-clock', to: '/schedules' },
  { key: 'artifacts', label: 'Artifacts', icon: 'i-lucide-folder-root', to: '/project-artifacts' },
]

const navBottom = [
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
  { label: 'Explore', icon: 'i-lucide-compass', to: '/explore' },
  { label: 'Graph', icon: 'i-lucide-workflow', to: '/graph' },
  { label: 'Usage', icon: 'i-lucide-bar-chart-2', to: '/usage' },
  { label: 'Logs', icon: 'i-lucide-scroll-text', to: '/logs' },
]

// The saved project only exists in the browser; waiting for mount keeps the server-rendered href in sync with hydration
const mounted = ref(false)
onMounted(() => { mounted.value = true })

/** Where a nav link goes: "Chat" opens the current project's sessions when one is set, else the project list */
function linkTarget(link: { key?: string; to: string }): string {
  if (link.key === 'cli' && mounted.value && workingDir.value) {
    return `/cli/project/${encodeURIComponent(projectSlug(workingDir.value.replace(/\/+$/, '')))}`
  }
  return link.to
}

// Lists that depend on the selected project (project skills, commands, agents, MCP servers, output styles).
// They are shared state fetched once at start, so every page showing them goes stale on a project switch.
function refreshProjectData() {
  Promise.all([fetchAgents(), fetchCommands(), fetchSkills(), fetchServers(), fetchStyles()]).catch(() => {})
}

watch(workingDir, (dir, prev) => {
  if (!mounted.value || dir === prev) return
  refreshProjectData()
  // Switching project while on a Chat page: follow it, otherwise the session list keeps showing the old project
  if (route.path === '/cli' || route.path.startsWith('/cli/')) {
    navigateTo(linkTarget({ key: 'cli', to: '/cli' }))
  }
})

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  // Exact match or sub-route
  return route.path === to || route.path.startsWith(to + '/')
}

// Issues with an agent run in progress, across all projects. Polled, since runs finish without any page event.
const runningIssues = ref(0)
// Runs that stopped to ask for Allow or Deny. They count as running too, so the two badges can show together.
const awaitingIssues = ref(0)
async function refreshRunningIssues() {
  try {
    const res = await $fetch<{ issues: { running: boolean; awaitingApproval?: boolean }[] }>('/api/issues', { query: { all: '1' } })
    runningIssues.value = res.issues.filter(i => i.running).length
    awaitingIssues.value = res.issues.filter(i => i.awaitingApproval).length
  } catch { /* keep the last count */ }
}
let runningTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { refreshRunningIssues(); runningTimer = setInterval(refreshRunningIssues, 5000) })
onUnmounted(() => { if (runningTimer) clearInterval(runningTimer) })
watch(() => route.fullPath, refreshRunningIssues)

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
    <LocalMdPreview />
    <ProjectDialog
      v-if="projectDialog"
      :project="projectDialog.project"
      @close="projectDialog = null"
      @saved="onProjectSaved"
    />
    <div class="flex h-screen overflow-hidden" style="background: var(--surface-base);">
      <!-- Sidebar -->
      <aside
        class="sidebar shrink-0 flex flex-col relative h-full overflow-hidden"
        :class="resizingSidebar ? '' : 'transition-all duration-300'"
        :style="{
          width: sidebarCollapsed ? '56px' : sidebarWidth + 'px',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border-subtle)',
        }"
      >
        <!-- Drag the right edge to resize, double-click to reset -->
        <div
          v-if="!sidebarCollapsed"
          class="absolute top-0 right-0 h-full w-1.5 z-20 cursor-col-resize transition-colors hover:bg-[var(--accent-muted)]"
          :style="resizingSidebar ? { background: 'var(--accent-muted)' } : undefined"
          title="Drag to resize, double-click to reset"
          @pointerdown="startSidebarResize"
          @dblclick="resetSidebarWidth"
        />

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
          <UPopover v-model:open="showWorkingDirPopover" :content="{ align: 'start', sideOffset: 6 }" :ui="{ content: 'w-[max(var(--reka-popper-anchor-width),260px)]' }">
            <button
              class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring cursor-pointer press-scale"
              :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2 text-left'"
              :style="{
                color: 'var(--text-secondary)',
                border: workingDir ? '1px solid var(--border-subtle)' : '1px dashed var(--warning, #d97706)',
              }"
              :title="workingDir || 'Set project directory'"
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
                <div class="text-[13px] font-semibold" style="color: var(--text-primary); font-family: var(--font-sans);">Projects</div>
                <div v-if="projects.length" class="rounded-lg overflow-hidden max-h-[320px] overflow-y-auto" style="border: 1px solid var(--border-subtle); background: var(--surface-raised);">
                  <div
                    v-for="proj in projects"
                    :key="proj.id"
                    class="group/proj flex items-center hover-bg transition-colors"
                  >
                    <button
                      type="button"
                      class="flex-1 min-w-0 flex items-center gap-2 pl-3 py-1.5 text-left outline-none focus:outline-none"
                      :style="{ color: proj.path === workingDir.replace(/\/+$/, '') ? 'var(--text-primary)' : 'var(--text-secondary)' }"
                      :title="proj.path"
                      @click="pickProject(proj.path)"
                    >
                      <UIcon :name="proj.path === workingDir.replace(/\/+$/, '') ? 'i-lucide-check' : 'i-lucide-folder'" class="size-3.5 shrink-0" :style="{ color: proj.path === workingDir.replace(/\/+$/, '') ? 'var(--accent)' : 'var(--text-disabled)' }" />
                      <span class="text-[12px] truncate">{{ proj.name }}</span>
                    </button>
                    <button type="button" class="opacity-0 group-hover/proj:opacity-100 p-1" style="color: var(--text-tertiary);" title="Edit project" @click="openProjectDialog(proj)">
                      <UIcon name="i-lucide-pencil" class="size-3" />
                    </button>
                    <button type="button" class="opacity-0 group-hover/proj:opacity-100 p-1 mr-1" style="color: var(--text-tertiary);" title="Remove project" @click="deleteProject(proj)">
                      <UIcon name="i-lucide-trash-2" class="size-3" />
                    </button>
                  </div>
                </div>
                <p v-else class="text-[11px]" style="color: var(--text-secondary);">No projects yet. Create one to pick a directory for chat, issues and schedules.</p>
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] hover-bg"
                  style="color: var(--text-primary); border: 1px solid var(--border-subtle);"
                  @click="openProjectDialog()"
                >
                  <UIcon name="i-lucide-plus" class="size-3.5" /> Create project
                </button>
                <button
                  v-if="workingDir"
                  class="text-[11px] font-medium px-2 py-1 rounded hover-bg"
                  style="color: var(--error);"
                  @click="clearWorkingDir(); showWorkingDirPopover = false"
                >
                  Clear
                </button>
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

          <!-- Mid Section: Chat, Issues, Schedules, Artifacts -->
          <NuxtLink
            v-for="link in navMid"
            :key="link.key"
            :to="linkTarget(link)"
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
              <span v-if="link.key === 'issues' && awaitingIssues" class="flex items-center gap-1 text-[11px] font-medium px-1.5 rounded-full whitespace-nowrap shrink-0" style="color: #ea580c; background: color-mix(in srgb, #f97316 16%, transparent);" :title="`${awaitingIssues} ${awaitingIssues === 1 ? 'run waits' : 'runs wait'} for your approval`">
                <UIcon name="i-lucide-shield-question" class="size-3" />{{ awaitingIssues }} to approve
              </span>
              <span v-if="link.key === 'issues' && runningIssues" class="flex items-center gap-1 text-[11px] px-1.5 rounded-full whitespace-nowrap shrink-0" style="color: #3b82f6; background: color-mix(in srgb, #3b82f6 12%, transparent);" :title="`${runningIssues} agent ${runningIssues === 1 ? 'run' : 'runs'} in progress`">
                <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />{{ runningIssues }}<template v-if="!awaitingIssues"> running</template>
              </span>
            </template>
            <span v-else-if="link.key === 'issues' && (awaitingIssues || runningIssues)" class="absolute top-1 right-2 size-2 rounded-full animate-pulse" :style="{ background: awaitingIssues ? '#f97316' : '#3b82f6' }" />
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
