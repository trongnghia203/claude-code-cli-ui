<script setup lang="ts">
import type { UserProject } from '~/composables/useProjects'

const props = defineProps<{ project?: UserProject }>()
const emit = defineEmits<{ close: []; saved: [project: UserProject] }>()

const { createProject, updateProject } = useProjects()

const isEdit = !!props.project
const name = ref(props.project?.name ?? '')
const path = ref(props.project?.path ?? '')
// Until the user types a name, follow the folder name
const nameTouched = ref(isEdit)
const saving = ref(false)
const error = ref('')

const suggestions = ref<{ name: string; path: string; hasChildren: boolean }[]>([])
let seq = 0
let timer: ReturnType<typeof setTimeout> | null = null

const parentPath = computed(() => {
  const p = path.value.replace(/\/+$/, '')
  if (!p || p === '/') return null
  const i = p.lastIndexOf('/')
  // Trailing slash matters: without it the directory API filters by the last segment
  return i <= 0 ? '/' : `${p.slice(0, i)}/`
})

async function browse(p: string) {
  const mine = ++seq
  if (!p) { suggestions.value = []; return }
  try {
    const data = await $fetch<{ directories: typeof suggestions.value }>('/api/directories', { query: { path: p } })
    if (mine === seq) suggestions.value = data.directories
  } catch {
    if (mine === seq) suggestions.value = []
  }
}

function onPathInput() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => browse(path.value), 150)
}

function pick(s: { name: string; path: string; hasChildren: boolean }) {
  path.value = s.path
  if (!nameTouched.value) name.value = s.name
  if (s.hasChildren) browse(s.path)
  else suggestions.value = []
}

function goUp() {
  const target = parentPath.value
  if (!target) return
  path.value = target
  browse(target)
}

function goHome() {
  path.value = '~/'
  browse('~/')
}

onMounted(() => browse(path.value || '~/'))

async function save() {
  error.value = ''
  saving.value = true
  try {
    const body = { name: name.value.trim(), path: path.value.trim() }
    const saved = isEdit ? await updateProject(props.project!.id, body) : await createProject(body)
    emit('saved', saved)
    emit('close')
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Could not save the project'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background: rgba(0,0,0,0.45);" @click.self="emit('close')">
    <div class="w-full max-w-md p-5 space-y-4 rounded-2xl" style="background: var(--surface-overlay, var(--surface-raised)); border: 1px solid var(--border-subtle);" @keydown.esc="emit('close')">
      <div>
        <h3 class="text-[15px] font-semibold" style="color: var(--text-primary);">{{ isEdit ? 'Edit project' : 'Create project' }}</h3>
        <p class="text-[12px] mt-1" style="color: var(--text-secondary);">
          A project is a name and a directory. Chats, schedules and issues of that directory belong to it.
        </p>
      </div>

      <label class="block space-y-1">
        <span class="text-[11px] uppercase tracking-wider" style="color: var(--text-tertiary);">Name</span>
        <input v-model="name" class="field-input text-[13px]" placeholder="e.g. suri" autofocus @input="nameTouched = true" @keydown.enter.prevent="save" />
      </label>

      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <span class="text-[11px] uppercase tracking-wider" style="color: var(--text-tertiary);">Directory</span>
          <button type="button" class="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] hover-bg" style="color: var(--text-tertiary); border: 1px solid var(--border-subtle);" @click="goHome">
            <UIcon name="i-lucide-home" class="size-3" /> Home
          </button>
        </div>
        <input v-model="path" class="field-input text-[12px] font-mono" placeholder="/path/to/project" autocomplete="off" @input="onPathInput" @keydown.enter.prevent="save" />
        <div v-if="suggestions.length || parentPath" class="rounded-lg overflow-hidden max-h-[220px] overflow-y-auto" style="border: 1px solid var(--border-subtle); background: var(--surface-raised);">
          <button v-if="parentPath" type="button" class="w-full flex items-center px-3 py-1.5 text-left border-b hover:bg-[var(--accent-muted)]" style="border-color: var(--border-subtle); color: var(--text-tertiary);" @click="goUp">
            <span class="text-[11px] font-mono">..</span>
          </button>
          <button
            v-for="s in suggestions"
            :key="s.path"
            type="button"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--accent-muted)]"
            style="color: var(--text-secondary);"
            @click="pick(s)"
          >
            <UIcon :name="s.hasChildren ? 'i-lucide-folder' : 'i-lucide-folder-dot'" class="size-3.5 shrink-0" style="color: var(--text-disabled);" />
            <span class="text-[11px] font-mono truncate">{{ s.name }}</span>
            <UIcon v-if="s.hasChildren" name="i-lucide-chevron-right" class="size-3 shrink-0 ml-auto" style="color: var(--text-disabled);" />
          </button>
        </div>
      </div>

      <p v-if="error" class="text-[12px]" style="color: var(--error);">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="emit('close')" />
        <UButton :label="isEdit ? 'Save' : 'Create'" size="sm" :loading="saving" :disabled="!name.trim() || !path.trim()" @click="save" />
      </div>
    </div>
  </div>
</template>
