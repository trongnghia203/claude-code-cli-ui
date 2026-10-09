<script setup lang="ts">
import { onMounted, ref } from 'vue'

const { servers, loading, error, fetchServers, addServer, toggleServer, removeServer } = useMCP()
const { isPanelOpen, pendingInput } = useChat()

const { workingDir } = useWorkingDir()
const { isStrict, setStrict } = useStrictMcp()

// Where servers come from beyond the two scopes listed below (plugins, local) and whether the project has a .mcp.json
interface McpSourceServer { name: string; transport?: string }
interface McpSources {
  project: { path: string; exists: boolean; servers: McpSourceServer[] }
  global: McpSourceServer[]
  local: McpSourceServer[]
  plugins: { plugin: string; servers: McpSourceServer[] }[]
}
const sources = ref<McpSources | null>(null)

async function loadSources() {
  try {
    sources.value = await $fetch<McpSources>('/api/mcp/sources', { query: { workingDir: workingDir.value || undefined } })
  } catch {
    sources.value = null
  }
}

// Per-project switch: launch Claude with --strict-mcp-config --mcp-config <project>/.mcp.json
const strict = computed({
  get: () => isStrict(workingDir.value),
  set: (v: boolean) => setStrict(workingDir.value, v),
})
const projectName = computed(() => workingDir.value.replace(/\/+$/, '').split('/').pop() || '')

const extraGroups = computed(() => {
  const s = sources.value
  if (!s) return []
  return [
    {
      key: 'plugins',
      label: 'From plugins',
      hint: 'read-only, provided by enabled plugins',
      servers: s.plugins.flatMap(p => p.servers.map(x => ({ ...x, tag: p.plugin }))),
    },
    {
      key: 'local',
      label: 'Local',
      hint: 'read-only, private to you in this project',
      servers: s.local.map(x => ({ ...x, tag: '' })),
    },
  ].filter(g => g.servers.length)
})

const isAddModalOpen = ref(false)
const addScope = ref<'global' | 'project'>('global')

function openAdd(scope: 'global' | 'project' = 'global') {
  addScope.value = scope
  isAddModalOpen.value = true
}

// Project first: it is the context you work in, and a project server wins over a global one with the same name
const sections = computed(() => [
  {
    key: 'project',
    label: 'Project MCPs',
    hint: '.mcp.json',
    servers: servers.value.filter(s => s.scope === 'project'),
    emptyHint: !workingDir.value
      ? 'Select a project in the sidebar to see its servers.'
      : sources.value && !sources.value.project.exists
        ? 'No .mcp.json in this project. Use "Add project server" to create one.'
        : 'No servers in this project\'s .mcp.json.',
  },
  {
    key: 'global',
    label: 'Global MCPs',
    hint: '~/.claude.json',
    servers: servers.value.filter(s => s.scope === 'global'),
    emptyHint: 'No global MCP servers configured.',
  },
])
const showImportModal = ref(false)
const adding = ref(false)

onMounted(() => {
  fetchServers()
  loadSources()
})
watch(workingDir, () => {
  fetchServers()
  loadSources()
})

async function onAddServer(payload: any) {
  adding.value = true
  try {
    await addServer(payload)
    isAddModalOpen.value = false
  } finally {
    adding.value = false
  }
}

function testServer(name: string) {
  isPanelOpen.value = true
  pendingInput.value = `Can you show me the tools provided by the ${name} MCP server?`
}
</script>

<template>
  <div class="flex flex-col">
    <PageHeader title="MCP Servers">
      <template #trailing>
        <span class="font-mono text-[12px] text-meta mr-4">{{ servers.length }}</span>
      </template>
      <template #right>
        <UButton label="Import" icon="i-lucide-upload" size="sm" variant="soft" @click="showImportModal = true" />
        <UButton label="New MCP Server" icon="i-lucide-plus" size="sm" @click="openAdd('global')" />
      </template>
    </PageHeader>

    <div class="px-6 py-4 flex-1">
      <p class="text-[13px] mb-6 leading-relaxed text-label max-w-2xl">
        Manage Model Context Protocol (MCP) servers. Global servers are available across all your projects, while project servers are scoped to your current working directory.
      </p>

      <!-- Strict switch (client-only: depends on the project saved in this browser) -->
      <ClientOnly>
      <div class="bg-card rounded-xl p-4 mb-6 flex items-center justify-between gap-4 max-w-3xl">
        <div class="min-w-0">
          <div class="text-[13px] font-medium text-primary">
            Only use this project's .mcp.json
            <span v-if="projectName" class="font-mono text-[11px] text-meta">({{ projectName }})</span>
          </div>
          <div class="text-[12px] mt-0.5 text-secondary opacity-80">
            Launches Claude with <code class="font-mono text-[11px]">--strict-mcp-config --mcp-config .mcp.json</code>,
            so global, local and plugin servers are ignored. Applies to Chat and CLI sessions started from this app.
          </div>
          <div v-if="!workingDir" class="text-[11px] mt-1" style="color: var(--warning, #d97706);">Select a project in the sidebar first.</div>
          <div v-else-if="sources && !sources.project.exists" class="text-[11px] mt-1" style="color: var(--warning, #d97706);">
            No .mcp.json in this project, so the switch has no effect.
          </div>
        </div>
        <label class="field-toggle shrink-0" :class="{ 'opacity-50': !workingDir }">
          <input v-model="strict" type="checkbox" :disabled="!workingDir" />
          <span class="field-toggle__track">
            <span class="field-toggle__thumb" />
          </span>
        </label>
      </div>
      </ClientOnly>

      <div v-if="error" class="rounded-xl px-4 py-3 mb-6 flex items-start gap-3 border-error bg-error-subtle">
        <UIcon name="i-lucide-alert-circle" class="size-4 shrink-0 mt-0.5 text-error" />
        <span class="text-[12px] text-error">{{ error }}</span>
      </div>

      <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="i in 4" :key="i" class="p-4 rounded-xl border border-subtle bg-card opacity-60">
          <SkeletonRow />
        </div>
      </div>
      <div v-else class="space-y-8">
        <section
          v-for="section in sections"
          :key="section.key"
          :class="{ 'opacity-50': strict && section.key === 'global' }"
        >
          <div class="flex items-baseline gap-2 mb-3">
            <h2 class="text-[12px] font-semibold uppercase tracking-wider text-meta">{{ section.label }}</h2>
            <span class="font-mono text-[11px] text-meta">{{ section.servers.length }}</span>
            <span class="text-[10px] font-mono text-meta">{{ section.hint }}</span>
            <span v-if="strict && section.key === 'global'" class="text-[10px] text-meta">ignored while strict</span>
            <button
              v-if="section.key === 'project' && workingDir"
              class="ml-auto flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg hover-bg"
              style="color: var(--accent);"
              @click="openAdd('project')"
            >
              <UIcon name="i-lucide-plus" class="size-3.5" />
              Add project server
            </button>
          </div>

          <div v-if="section.servers.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NuxtLink
              v-for="server in section.servers"
              :key="server.name"
              :to="`/mcp/${encodeURIComponent(server.name)}?scope=${server.scope}`"
              class="bg-card group relative p-4 rounded-xl flex flex-col gap-3 hover-lift focus-ring cursor-pointer"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="text-[14px] font-semibold text-primary truncate" :class="{ 'opacity-50': server.disabled }">{{ server.name }}</h3>
                    <span v-if="server.transport" class="text-[10px] px-1.5 py-0.5 rounded font-medium tracking-wide uppercase bg-surface-raised text-meta border border-subtle">
                      {{ server.transport }}
                    </span>
                    <span v-if="server.transport === 'sse'" class="text-[9px] font-mono px-1 py-0.5 rounded bg-error/10 text-error uppercase leading-none border border-error/20">
                      Deprecated
                    </span>
                    <span v-if="server.disabled" class="text-[10px] px-1.5 py-0.5 rounded font-medium tracking-wide uppercase bg-error/10 text-error border border-error/20">
                      Disabled
                    </span>
                  </div>
                  <div v-if="server.transport === 'stdio'" class="text-[12px] font-mono text-meta truncate" :title="server.command + ' ' + (server.args?.join(' ') || '')" :class="{ 'opacity-50': server.disabled }">
                    {{ server.command }} <span v-if="server.args?.length">{{ server.args.join(' ') }}</span>
                  </div>
                  <div v-else class="text-[12px] font-mono text-meta truncate" :title="server.url" :class="{ 'opacity-50': server.disabled }">
                    {{ server.url }}
                  </div>
                </div>
            
                <div class="flex items-center gap-2" @click.prevent>
                  <label class="field-toggle scale-90" @click.stop>
                    <input
                      type="checkbox"
                      :checked="!server.disabled"
                      @change="toggleServer(server)"
                    />
                    <span class="field-toggle__track">
                      <span class="field-toggle__thumb" />
                    </span>
                  </label>
                </div>
              </div>

              <div v-if="(server.env && Object.keys(server.env).length) || (server.headers && Object.keys(server.headers).length)" class="mt-auto pt-3 border-t border-subtle flex items-center gap-2" :class="{ 'opacity-50': server.disabled }">
                <UIcon :name="server.transport === 'stdio' ? 'i-lucide-key' : 'i-lucide-shield-check'" class="size-3 text-meta" />
                <span class="text-[11px] text-meta">
                  {{ server.transport === 'stdio' ? `Has ${Object.keys(server.env || {}).length} env variable(s)` : `Has ${Object.keys(server.headers || {}).length} header(s)` }}
                </span>
              </div>
            </NuxtLink>
          </div>
          <div v-else class="rounded-xl border border-dashed px-4 py-5 text-[12px] text-meta border-subtle">
            {{ section.emptyHint }}
          </div>
        </section>
      </div>
    </div>

    <!-- Servers from other sources (read-only) -->
    <div v-if="extraGroups.length" class="px-6 pb-6 space-y-4">
      <div v-for="group in extraGroups" :key="group.key" :class="{ 'opacity-50': strict }">
        <div class="flex items-baseline gap-2 mb-2">
          <h4 class="text-[11px] font-semibold uppercase tracking-wider text-meta">{{ group.label }}</h4>
          <span class="text-[10px] text-meta">{{ group.hint }}</span>
          <span v-if="strict" class="text-[10px] text-meta">ignored while strict</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="s in group.servers"
            :key="group.key + s.tag + s.name"
            class="text-[12px] font-mono px-2.5 py-1 rounded-lg bg-surface-raised border border-subtle text-secondary"
          >
            {{ s.name }}<span v-if="s.transport" class="text-meta"> · {{ s.transport }}</span><span v-if="s.tag" class="text-meta"> ({{ s.tag }})</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Add Server Modal -->
    <UModal v-model:open="isAddModalOpen">
      <template #content>
        <AddMcpModal :default-scope="addScope" @close="isAddModalOpen = false" @add="onAddServer" />
      </template>
    </UModal>

    <!-- Import Modal -->
    <UModal v-model:open="showImportModal">
      <template #content>
        <div class="p-6 space-y-4 bg-overlay rounded-2xl border border-subtle">
          <h3 class="text-page-title">Import MCP Config</h3>
          <p class="text-[12px] text-secondary opacity-80 leading-relaxed">
            Upload a <code class="font-mono text-[11px] px-1 py-px rounded bg-surface-raised">.json</code> file (e.g., your <code class="font-mono text-[11px] px-1 py-px rounded bg-surface-raised">~/.claude.json</code> or <code class="font-mono text-[11px] px-1 py-px rounded bg-surface-raised">claude_desktop_config.json</code>). Servers will be merged into your global configuration.
          </p>
          <FileImport
            type="mcp"
            @imported="() => { showImportModal = false; fetchServers() }"
          />
          <div class="flex justify-end pt-2">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="showImportModal = false" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.bg-overlay { background: var(--surface-raised); }
.border-subtle { border-color: var(--border-subtle); }
.bg-surface-raised { background: var(--surface-raised); }
.text-primary { color: var(--text-primary); }
.text-secondary { color: var(--text-secondary); }
.text-meta { color: var(--text-meta); }
.text-accent { color: var(--accent); }
.hover\:text-accent:hover { color: var(--accent); }
.hover\:text-error:hover { color: var(--error); }
.bg-accent-subtle { background: rgba(229, 169, 62, 0.1); border-color: rgba(229, 169, 62, 0.2); }
.border-error { border-color: rgba(248, 113, 113, 0.2); }
.bg-error-subtle { background: rgba(248, 113, 113, 0.05); }
.text-error { color: var(--error); }
.font-display { font-family: var(--font-display); }

.btn-primary {
  background: var(--accent);
  color: var(--bg-primary);
  border-radius: 0.5rem;
  font-weight: 500;
}
</style>
