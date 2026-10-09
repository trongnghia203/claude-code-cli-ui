<script setup lang="ts">
const { skills, loading, error, fetchAll: fetchSkills } = useSkills()
const router = useRouter()
const { workingDir } = useWorkingDir()

const showCreateModal = ref(false)
const showImportModal = ref(false)
const searchQuery = ref('')

// Source filter: toggle chips, multi-select. Nothing selected = show all.
type SkillCategory = 'global' | 'plugin' | 'project' | 'github' | 'mcp'
const categoryMeta: Record<SkillCategory, { label: string; icon: string }> = {
  global: { label: 'Global', icon: 'i-lucide-globe' },
  plugin: { label: 'Plugin', icon: 'i-lucide-puzzle' },
  project: { label: 'Project', icon: 'i-lucide-folder' },
  github: { label: 'GitHub', icon: 'i-lucide-github' },
  mcp: { label: 'MCP', icon: 'i-lucide-server' },
}
function skillCategory(s: { source?: string; mcpServer?: unknown }): SkillCategory {
  if (s.mcpServer) return 'mcp'
  if (s.source === 'plugin') return 'plugin'
  if (s.source === 'project') return 'project'
  if (s.source === 'github') return 'github'
  return 'global'
}
const activeCategories = ref<SkillCategory[]>([])
function toggleCategory(c: SkillCategory) {
  const i = activeCategories.value.indexOf(c)
  if (i >= 0) activeCategories.value.splice(i, 1)
  else activeCategories.value.push(c)
}
// Global, Plugin, Project always shown; GitHub / MCP only when such skills exist
const categoryCounts = computed(() => {
  const counts: Record<SkillCategory, number> = { global: 0, plugin: 0, project: 0, github: 0, mcp: 0 }
  for (const s of skills.value) counts[skillCategory(s)]++
  return counts
})
const categoryChips = computed(() =>
  (Object.keys(categoryMeta) as SkillCategory[]).filter(c =>
    ['global', 'plugin', 'project'].includes(c) || categoryCounts.value[c] > 0,
  ),
)

const filteredSkills = computed(() => {
  const q = searchQuery.value.toLowerCase()
  return skills.value.filter(s => {
    if (activeCategories.value.length && !activeCategories.value.includes(skillCategory(s))) return false
    if (!q) return true
    return (
      s.frontmatter.name.toLowerCase().includes(q) ||
      s.frontmatter.description?.toLowerCase().includes(q) ||
      s.frontmatter.agent?.toLowerCase().includes(q)
    )
  })
})

onMounted(() => {
  fetchSkills({ workingDir: workingDir.value })
})
</script>

<template>
  <div>
    <PageHeader title="Skills">
      <template #trailing>
        <span class="font-mono text-[12px] text-meta">
          {{ filteredSkills.length === skills.length ? skills.length : `${filteredSkills.length} / ${skills.length}` }}
        </span>
      </template>
      <template #right>
        <UButton label="Import" icon="i-lucide-upload" size="sm" variant="soft" @click="showImportModal = true" />
        <UButton label="New Skill" icon="i-lucide-plus" size="sm" @click="showCreateModal = true" />
      </template>
    </PageHeader>

    <div class="px-6 py-4">
      <p class="text-[13px] mb-4 leading-relaxed text-label">
        Specific capabilities that can be added to agents and invoked as slash commands.
      </p>

      <!-- Search + source filter -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <input
          v-model="searchQuery"
          placeholder="Search skills..."
          class="field-search max-w-xs"
        />
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="c in categoryChips"
            :key="c"
            type="button"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium transition-all focus-ring"
            :style="activeCategories.includes(c)
              ? 'background: var(--accent-muted); color: var(--accent); border: 1px solid var(--accent);'
              : 'background: var(--surface-raised); color: var(--text-secondary); border: 1px solid var(--border-subtle);'"
            :aria-pressed="activeCategories.includes(c)"
            @click="toggleCategory(c)"
          >
            <UIcon :name="categoryMeta[c].icon" class="size-3" />
            {{ categoryMeta[c].label }}
            <span class="font-mono text-[10px] opacity-70">{{ categoryCounts[c] }}</span>
          </button>
          <button
            v-if="activeCategories.length"
            type="button"
            class="px-2 py-1 rounded-full text-[11px] hover-bg"
            style="color: var(--text-tertiary);"
            @click="activeCategories = []"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        v-if="error"
        class="rounded-xl px-4 py-3 mb-4 flex items-start gap-3"
        style="background: rgba(248, 113, 113, 0.06); border: 1px solid rgba(248, 113, 113, 0.12);"
      >
        <UIcon name="i-lucide-alert-circle" class="size-4 shrink-0 mt-0.5" style="color: var(--error);" />
        <span class="text-[12px]" style="color: var(--error);">{{ error }}</span>
      </div>

      <div v-if="loading" class="space-y-1">
        <SkeletonRow v-for="i in 5" :key="i" />
      </div>

      <!-- Skill list -->
      <div v-else-if="filteredSkills.length" class="space-y-1">
        <NuxtLink
          v-for="skill in filteredSkills"
          :key="skill.slug"
          :to="`/skills/${skill.slug}`"
          class="flex items-center gap-3 px-3 py-1.5 rounded-lg group focus-ring hover-row"
        >
          <!-- Icon -->
          <UIcon name="i-lucide-sparkles" class="size-3.5 shrink-0" style="color: var(--accent);" />

          <!-- Name -->
          <span class="text-[14px] font-medium w-44 shrink-0 truncate">
            {{ skill.frontmatter.name }}
          </span>

          <!-- Context badge -->
          <span
            v-if="skill.frontmatter.context"
            class="text-[10px] font-mono px-1.5 py-px rounded-full shrink-0 badge badge-subtle"
          >
            {{ skill.frontmatter.context }}
          </span>

          <!-- Project badge -->
          <span
            v-if="skill.source === 'project'"
            class="text-[10px] font-mono px-1.5 py-px rounded-full shrink-0 badge"
            style="background: rgba(34,197,94,0.1); color: #4ade80; border: 1px solid rgba(34,197,94,0.2);"
          >
            project
          </span>

          <!-- Plugin badge -->
          <span
            v-if="skill.source === 'plugin' && skill.pluginName"
            class="text-[10px] font-mono px-1.5 py-px rounded-full shrink-0 badge badge-accent"
          >
            plugin: {{ skill.pluginName }}
          </span>

          <!-- MCP badge -->
          <span
            v-if="skill.mcpServer"
            class="text-[10px] font-mono px-1.5 py-px rounded-full shrink-0 badge"
            style="background: rgba(99, 102, 241, 0.1); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.2);"
          >
            mcp: {{ skill.mcpServer.name }}
          </span>

          <!-- Agent badge -->
          <span
            v-else-if="skill.frontmatter.agent"
            class="text-[10px] font-mono px-1.5 py-px rounded-full shrink-0 badge badge-agent"
          >
            agent: {{ skill.frontmatter.agent }}
          </span>

          <!-- Preloaded by badge -->
          <div
            v-if="skill.agents?.length"
            class="flex items-center gap-1 shrink-0"
            :title="`Preloaded by: ${skill.agents.map(a => a.name).join(', ')}`"
          >
            <span
              class="text-[10px] font-mono px-1.5 py-px rounded-full badge badge-subtle flex items-center gap-1"
            >
              <UIcon name="i-lucide-user" class="size-2.5" />
              <span v-if="skill.agents.length > 1">({{ skill.agents.length }})</span>
            </span>
          </div>

          <!-- GitHub badge -->
          <ImportBadge
            v-if="skill.source === 'github' && skill.githubRepo"
            :repo="skill.githubRepo"
          />

          <!-- Description -->
          <span class="flex-1 text-[13px] truncate text-label">
            {{ skill.frontmatter.description }}
          </span>

          <!-- Metadata -->
          <div class="flex items-center gap-3 shrink-0">
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-meta"
            />
          </div>
        </NuxtLink>
      </div>

      <!-- Empty state: search miss -->
      <div v-else-if="searchQuery || activeCategories.length" class="flex flex-col items-center justify-center py-16">
        <p class="text-[13px] text-label">No skills match your search or filters.</p>
      </div>

      <!-- Empty state: no skills -->
      <div v-else class="flex flex-col items-center justify-center py-12 space-y-5">
        <div class="rounded-lg p-4 bg-card max-w-sm w-full text-[12px] text-label leading-relaxed space-y-1">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-cpu" class="size-3.5" style="color: var(--accent);" />
            <span>code-reviewer</span>
            <span class="text-meta">agent</span>
          </div>
          <div class="flex items-center gap-2 ml-5">
            <UIcon name="i-lucide-sparkles" class="size-3" style="color: var(--accent);" />
            <span>security-audit</span>
            <span class="text-meta">skill</span>
          </div>
          <div class="flex items-center gap-2 ml-5">
            <UIcon name="i-lucide-sparkles" class="size-3" style="color: var(--accent);" />
            <span>performance-check</span>
            <span class="text-meta">skill</span>
          </div>
        </div>
        <p class="text-[13px] text-label">Skills teach agents specific capabilities. Link a skill to an agent to extend what it can do.</p>
        <div class="flex items-center gap-2">
          <UButton label="Create a skill" size="sm" @click="showCreateModal = true" />
          <UButton label="Import from GitHub" size="sm" variant="outline" to="/explore?tab=imported" />
        </div>
      </div>
    </div>

    <UModal v-model:open="showCreateModal">
      <template #content>
        <SkillForm
          mode="create"
          @saved="(s) => { showCreateModal = false; router.push(`/skills/${s.slug}`) }"
          @cancel="showCreateModal = false"
        />
      </template>
    </UModal>

    <UModal v-model:open="showImportModal">
      <template #content>
        <div class="p-6 space-y-4 bg-overlay">
          <h3 class="text-page-title">Import Skill</h3>
          <FileImport
            type="skills"
            @imported="(s) => { showImportModal = false; fetchSkills(); router.push(`/skills/${s.slug}`) }"
          />
          <div class="flex justify-end">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="showImportModal = false" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
