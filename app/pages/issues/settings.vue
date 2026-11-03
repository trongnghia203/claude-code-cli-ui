<script setup lang="ts">
import type { IssueLabel, IssueProperty, PropertyType } from '~/composables/useIssueConfig'
import { LABEL_COLORS, MAX_ACTIVE_PROPERTIES, PROPERTY_TYPE_META, propertyColor } from '~/composables/useIssueConfig'
import { formatRelativeTime } from '~/utils/messageFormatting'

const route = useRoute()
const router = useRouter()
const ic = useIssueConfig()
const { workingDir } = useWorkingDir()

// Scope: the default, or one project's own settings (a project without its own file reads the default)
// Starts on 'default' so server and client render the same markup. workingDir only exists on the client
// (localStorage), so switching to the project in onMounted avoids a hydration mismatch that left the DOM stale.
const scope = ref<'default' | 'project'>('default')
const dir = computed(() => (scope.value === 'project' ? workingDir.value : ''))
const projectName = computed(() => workingDir.value.split('/').filter(Boolean).pop() ?? '')
const view = computed(() => ic.entry(dir.value))
const config = computed(() => view.value.config)
const usage = computed(() => view.value.usage)
// Editing is off while a project still follows the default: customize it first
const readOnly = computed(() => scope.value === 'project' && !view.value.custom)
const activeProperties = computed(() => config.value.properties.filter(p => !p.archived))
const load = () => ic.load(dir.value)
watch(dir, load)
const createLabel = (b: { name: string; color: string; description: string }) => ic.createLabel(dir.value, b)
const updateLabel = (id: string, b: Partial<{ name: string; color: string; description: string }>) => ic.updateLabel(dir.value, id, b)
const deleteLabel = (id: string) => ic.deleteLabel(dir.value, id)
const createProperty = (b: { name: string; type: PropertyType; color: string; options: { id?: string; name: string }[] }) => ic.createProperty(dir.value, b)
const updateProperty = (id: string, b: Partial<{ name: string; color: string; options: { id?: string; name: string }[]; archived: boolean }>) => ic.updateProperty(dir.value, id, b)
const saveWakeups = (r: { enabled: boolean; instruction: string }) => ic.saveWakeups(dir.value, r)
const labelUsed = (id: string) => usage.value.labels[id] ?? 0
const propUsed = (id: string) => usage.value.properties[id] ?? 0
// A reset drops labels and properties that only this project has. Blocked while its issues still use them.
const resetBlockers = computed(() => {
  if (scope.value !== 'project' || !view.value.custom) return []
  const base = ic.entry('').config
  return [
    ...config.value.labels.filter(l => !base.labels.some(b => b.id === l.id) && labelUsed(l.id)).map(l => `label "${l.name}"`),
    ...config.value.properties.filter(p => !base.properties.some(b => b.id === p.id) && propUsed(p.id)).map(p => `property "${p.name}"`),
  ]
})
const resetConfirm = ref(false)
async function doReset() { if (await ic.reset(dir.value)) resetConfirm.value = false }

type Tab = 'labels' | 'properties' | 'wakeups'
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'labels', label: 'Labels', icon: 'i-lucide-tag' },
  { key: 'properties', label: 'Properties', icon: 'i-lucide-list-plus' },
  { key: 'wakeups', label: 'Wakeups', icon: 'i-lucide-alarm-clock' },
]
const tab = computed<Tab>({
  get: () => (TABS.some(t => t.key === route.query.tab) ? route.query.tab as Tab : 'labels'),
  set: (v) => { router.replace({ query: { tab: v } }) },
})
onMounted(() => {
  if (workingDir.value) scope.value = 'project'
  ic.load('')
  load()
})
useHead({ title: 'Issue settings | Agent Manager' })

const card = 'background: var(--surface-raised); border: 1px solid var(--border-subtle)'
const field = 'background: var(--surface-base); border: 1px solid var(--border-subtle)'

// ---- Labels ----
const labelQuery = ref('')
const labelRows = computed(() => {
  const q = labelQuery.value.trim().toLowerCase()
  return config.value.labels.filter(l => !q || l.name.toLowerCase().includes(q) || l.description.toLowerCase().includes(q))
})
const labelDlg = ref(false)
const labelEditId = ref<string | null>(null)
const labelForm = reactive({ name: '', color: LABEL_COLORS[0]!, description: '' })
const labelBusy = ref(false)
function newLabel() {
  Object.assign(labelForm, { name: '', color: LABEL_COLORS[config.value.labels.length % LABEL_COLORS.length]!, description: '' })
  labelEditId.value = null
  labelDlg.value = true
}
function editLabel(l: IssueLabel) {
  Object.assign(labelForm, { name: l.name, color: l.color, description: l.description })
  labelEditId.value = l.id
  labelDlg.value = true
}
async function submitLabel() {
  if (!labelForm.name.trim()) return
  labelBusy.value = true
  const ok = labelEditId.value ? await updateLabel(labelEditId.value, { ...labelForm }) : await createLabel({ ...labelForm })
  labelBusy.value = false
  if (ok) labelDlg.value = false
}
const labelDelete = ref<IssueLabel | null>(null)
async function confirmLabelDelete() {
  if (labelDelete.value && await deleteLabel(labelDelete.value.id)) labelDelete.value = null
}

// ---- Properties ----
const propQuery = ref('')
const showArchived = ref(false)
const propRows = computed(() => {
  const q = propQuery.value.trim().toLowerCase()
  return config.value.properties.filter(p => (showArchived.value || !p.archived) && (!q || p.name.toLowerCase().includes(q)))
})
const propDlg = ref(false)
const propEditId = ref<string | null>(null)
const propForm = reactive<{ name: string; type: PropertyType; color: string; options: { id?: string; name: string }[] }>({ name: '', type: 'text', color: LABEL_COLORS[0]!, options: [] })
const propBusy = ref(false)
const atLimit = computed(() => activeProperties.value.length >= MAX_ACTIVE_PROPERTIES)
function newProperty() {
  Object.assign(propForm, { name: '', type: 'text' as PropertyType, color: LABEL_COLORS[activeProperties.value.length % LABEL_COLORS.length]!, options: [] })
  propEditId.value = null
  propDlg.value = true
}
function editProperty(p: IssueProperty) {
  Object.assign(propForm, { name: p.name, type: p.type, color: propertyColor(p), options: p.options.map(o => ({ ...o })) })
  propEditId.value = p.id
  propDlg.value = true
}
const propValid = computed(() => !!propForm.name.trim() && (propForm.type !== 'select' || propForm.options.some(o => o.name.trim())))
async function submitProperty() {
  if (!propValid.value) return
  propBusy.value = true
  const options = propForm.options.filter(o => o.name.trim())
  const ok = propEditId.value
    ? await updateProperty(propEditId.value, { name: propForm.name, color: propForm.color, ...(propForm.type === 'select' ? { options } : {}) })
    : await createProperty({ name: propForm.name, type: propForm.type, color: propForm.color, options })
  propBusy.value = false
  if (ok) propDlg.value = false
}
const optionsSummary = (p: IssueProperty) => (p.type === 'select' ? p.options.map(o => o.name).join(', ') : '-')

// ---- Wakeups ----
const wake = reactive({ enabled: true, instruction: '' })
const wakeDirty = computed(() => wake.enabled !== config.value.wakeups.subIssuesFinish.enabled || wake.instruction !== config.value.wakeups.subIssuesFinish.instruction)
watch(() => config.value.wakeups.subIssuesFinish, (r) => { wake.enabled = r.enabled; wake.instruction = r.instruction }, { immediate: true })
const BUILT_IN = 'Every sub-issue of this issue is closed. Review what each one delivered, bring the results together on this issue, and finish with a short summary of what is done and what still needs review.'
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div class="shrink-0 flex items-center gap-3 px-6 py-3" style="border-bottom: 1px solid var(--border-subtle)">
      <NuxtLink to="/issues" class="p-1.5 rounded-lg hover-bg" title="Back to issues" style="color: var(--text-tertiary)"><UIcon name="i-lucide-arrow-left" class="size-4 block" /></NuxtLink>
      <h1 class="text-page-title">Issue settings</h1>
      <div class="flex gap-1 p-1 rounded-lg" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
        <button v-for="s in (['project', 'default'] as const)" :key="s" class="px-2.5 py-1 rounded-md text-[12px] font-medium" :disabled="s === 'project' && !workingDir"
          :style="scope === s ? 'background: var(--accent-muted); color: var(--text-primary)' : 'color: var(--text-secondary)'" @click="scope = s">
          {{ s === 'project' ? (projectName || 'This project') : 'Default' }}
        </button>
      </div>
      <div class="flex-1" />
      <UButton v-if="scope === 'project' && view.custom" label="Reset to default" icon="i-lucide-rotate-ccw" size="xs" variant="soft" color="neutral" :disabled="resetBlockers.length > 0" :title="resetBlockers.length ? `Still used by issues: ${resetBlockers.join(', ')}` : ''" @click="() => { resetConfirm = true }" />
    </div>
    <div v-if="readOnly" class="shrink-0 flex items-center gap-3 px-6 py-2 text-[12px]" style="background: var(--surface-raised); border-bottom: 1px solid var(--border-subtle)">
      <UIcon name="i-lucide-info" class="size-4 shrink-0 text-meta" />
      <span class="text-label flex-1">{{ projectName }} uses the default settings. Customize it to give this project its own labels, properties and wakeups. They start as a copy of the default.</span>
      <UButton label="Customize for this project" size="xs" @click="() => { ic.customize(dir) }" />
    </div>
    <p v-else-if="scope === 'project'" class="shrink-0 px-6 py-2 text-[12px] text-meta" style="border-bottom: 1px solid var(--border-subtle)">
      Own settings for {{ projectName }}, stored in ~/.config/claude-ui/issues/. Changes to the default no longer apply here.
    </p>
    <p v-else class="shrink-0 px-6 py-2 text-[12px] text-meta" style="border-bottom: 1px solid var(--border-subtle)">
      Default settings, used by every project that has none of its own. Stored in ~/.claude/issues/_config.json.
    </p>

    <div class="flex-1 min-h-0 flex">
      <nav class="shrink-0 w-48 p-3 space-y-1" style="border-right: 1px solid var(--border-subtle)">
        <button v-for="t in TABS" :key="t.key" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] text-left"
          :style="tab === t.key ? 'background: var(--accent-muted); color: var(--text-primary)' : 'color: var(--text-secondary)'" @click="tab = t.key">
          <UIcon :name="t.icon" class="size-4" />{{ t.label }}
        </button>
      </nav>

      <div class="flex-1 min-w-0 overflow-y-auto custom-scrollbar px-8 py-6">
        <div class="max-w-4xl mx-auto space-y-4">
          <!-- Labels -->
          <template v-if="tab === 'labels'">
            <div><h2 class="text-section-title">Labels</h2><p class="text-[13px] text-label">Tag issues. A label shows its color on the board and the issue page.</p></div>
            <div class="flex items-center gap-3">
              <input v-model="labelQuery" placeholder="Filter by name or description" class="px-3 py-1.5 rounded-lg text-[13px] w-72" :style="card" />
              <div class="flex-1" />
              <UButton label="New label" icon="i-lucide-plus" size="sm" :disabled="readOnly" @click="newLabel" />
            </div>
            <div class="rounded-xl overflow-hidden" :style="card">
              <div class="grid grid-cols-[1.2fr_1.6fr_80px_90px_36px] gap-3 px-4 py-2 text-[11px] text-meta" style="border-bottom: 1px solid var(--border-subtle)">
                <span>Name</span><span>Description</span><span>Used by</span><span>Updated</span><span />
              </div>
              <p v-if="!labelRows.length" class="px-4 py-8 text-center text-[13px] text-meta">{{ config.labels.length ? 'No match.' : 'No labels yet. For example Bug or Needs details.' }}</p>
              <div v-for="l in labelRows" :key="l.id" class="grid grid-cols-[1.2fr_1.6fr_80px_90px_36px] gap-3 px-4 py-2.5 items-center text-[13px]" style="border-bottom: 1px solid var(--border-subtle)">
                <button class="flex items-center gap-2 text-left min-w-0" :disabled="readOnly" @click="editLabel(l)"><span class="size-2.5 rounded-full shrink-0" :style="{ background: l.color }" /><span class="truncate font-medium">{{ l.name }}</span></button>
                <span class="truncate text-label">{{ l.description || '-' }}</span>
                <span class="text-label">{{ usage.labels[l.id] ?? 0 }} used</span>
                <span class="text-meta text-[12px]">{{ formatRelativeTime(l.updatedAt) }}</span>
                <span class="flex gap-0.5">
                  <button class="p-1 rounded hover-bg disabled:opacity-30" title="Edit" :disabled="readOnly" @click="editLabel(l)"><UIcon name="i-lucide-pencil" class="size-3.5 block text-meta" /></button>
                  <button class="p-1 rounded hover-bg disabled:opacity-30" :disabled="readOnly || labelUsed(l.id) > 0" :title="labelUsed(l.id) ? `Used by ${labelUsed(l.id)} issue(s). Remove it from them first.` : 'Delete'" @click="labelDelete = l"><UIcon name="i-lucide-trash-2" class="size-3.5 block text-meta" /></button>
                </span>
              </div>
            </div>
          </template>

          <!-- Properties -->
          <template v-else-if="tab === 'properties'">
            <div><h2 class="text-section-title">Properties</h2><p class="text-[13px] text-label">Custom fields on every issue, for example Severity or Environment.</p></div>
            <div class="flex items-center gap-3">
              <input v-model="propQuery" placeholder="Filter by name" class="px-3 py-1.5 rounded-lg text-[13px] w-72" :style="card" />
              <div class="flex-1" />
              <label class="flex items-center gap-2 text-[12px] text-label"><USwitch v-model="showArchived" size="sm" /> Show archived</label>
              <span class="text-[12px] text-meta">{{ activeProperties.length }}/{{ MAX_ACTIVE_PROPERTIES }} active</span>
              <UButton label="New property" icon="i-lucide-plus" size="sm" :disabled="atLimit || readOnly" :title="atLimit ? 'Archive a property first' : ''" @click="newProperty" />
            </div>
            <div class="rounded-xl overflow-hidden" :style="card">
              <div class="grid grid-cols-[1.2fr_90px_1.6fr_80px_90px_64px] gap-3 px-4 py-2 text-[11px] text-meta" style="border-bottom: 1px solid var(--border-subtle)">
                <span>Name</span><span>Type</span><span>Options</span><span>Used by</span><span>Updated</span><span />
              </div>
              <p v-if="!propRows.length" class="px-4 py-8 text-center text-[13px] text-meta">{{ config.properties.length ? 'No match.' : 'No properties yet. For example Severity or Environment.' }}</p>
              <div v-for="p in propRows" :key="p.id" class="grid grid-cols-[1.2fr_90px_1.6fr_80px_90px_64px] gap-3 px-4 py-2.5 items-center text-[13px]" :class="{ 'opacity-60': p.archived }" style="border-bottom: 1px solid var(--border-subtle)">
                <button class="flex items-center gap-2 text-left min-w-0" :disabled="readOnly" @click="editProperty(p)"><span class="size-2.5 rounded-full shrink-0" :style="{ background: propertyColor(p) }" /><span class="truncate font-medium">{{ p.name }}</span><span v-if="p.archived" class="text-[10px] text-meta">archived</span></button>
                <span class="flex items-center gap-1.5 text-label"><UIcon :name="PROPERTY_TYPE_META[p.type].icon" class="size-3.5" />{{ PROPERTY_TYPE_META[p.type].label }}</span>
                <span class="truncate text-label">{{ optionsSummary(p) }}</span>
                <span class="text-label">{{ usage.properties[p.id] ?? 0 }} used</span>
                <span class="text-meta text-[12px]">{{ formatRelativeTime(p.updatedAt) }}</span>
                <span class="flex gap-0.5">
                  <button class="p-1 rounded hover-bg disabled:opacity-30" title="Edit" :disabled="readOnly" @click="editProperty(p)"><UIcon name="i-lucide-pencil" class="size-3.5 block text-meta" /></button>
                  <button class="p-1 rounded hover-bg disabled:opacity-30" :title="!p.archived && propUsed(p.id) ? `Used by ${propUsed(p.id)} issue(s). Clear it on them first.` : p.archived ? 'Restore' : 'Archive'" :disabled="readOnly || (p.archived && atLimit) || (!p.archived && propUsed(p.id) > 0)" @click="updateProperty(p.id, { archived: !p.archived })"><UIcon :name="p.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive'" class="size-3.5 block text-meta" /></button>
                </span>
              </div>
            </div>
          </template>

          <!-- Wakeups -->
          <template v-else>
            <div><h2 class="text-section-title">Wakeups</h2><p class="text-[13px] text-label">Rules for every issue. Each issue can change them in its own Wakeups row.</p></div>
            <div>
              <h3 class="text-[14px] font-semibold">When sub-issues finish</h3>
              <p class="text-[12px] text-label mb-2">Starts a run of the parent's agent once every sub-issue is done or cancelled. Needs an agent assignee on the parent.</p>
              <div class="rounded-xl" :style="card">
                <div class="flex items-center justify-between px-4 py-3" style="border-bottom: 1px solid var(--border-subtle)"><span class="text-[13px] font-medium">On by default</span><USwitch v-model="wake.enabled" :disabled="readOnly" /></div>
                <div class="p-4 space-y-3">
                  <div>
                    <h4 class="text-[13px] font-semibold">Default instruction</h4>
                    <p class="text-[12px] text-label">Sent to the woken agent. Leave empty to use the built-in instruction below.</p>
                  </div>
                  <textarea v-model="wake.instruction" rows="3" spellcheck="false" placeholder="Leave empty to use the built-in instruction" :disabled="readOnly" class="w-full px-3 py-2 rounded-lg text-[13px]" :style="field" />
                  <div class="rounded-lg p-3" style="background: var(--surface-base)">
                    <div class="text-[12px] font-semibold mb-1">Built-in instruction</div>
                    <p class="text-[12px] text-label">{{ BUILT_IN }}</p>
                    <p class="text-[12px] text-meta mt-1">The list of sub-issues and their statuses is added after the instruction.</p>
                  </div>
                  <div class="flex justify-end"><UButton label="Save" size="sm" :disabled="!wakeDirty || readOnly" @click="() => { saveWakeups({ enabled: wake.enabled, instruction: wake.instruction }) }" /></div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <UModal v-model:open="resetConfirm">
      <template #content>
        <div class="p-6 space-y-4 w-[440px] max-w-full" style="background: var(--surface-raised)">
          <h3 class="text-page-title">Reset {{ projectName }} to the default?</h3>
          <p class="text-[13px] text-label">Deletes this project's own labels, properties and wakeup rules. The project then follows the default. Nothing in use is lost: a reset is blocked while issues use a label or property that only this project has.</p>
          <div class="flex justify-end gap-2"><UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="() => { resetConfirm = false }" /><UButton label="Reset" color="error" size="sm" @click="doReset" /></div>
        </div>
      </template>
    </UModal>

    <!-- Label dialog -->
    <UModal v-model:open="labelDlg">
      <template #content>
        <form class="p-6 space-y-4 w-[440px] max-w-full" style="background: var(--surface-raised)" @submit.prevent="submitLabel">
          <h3 class="text-page-title">{{ labelEditId ? 'Edit label' : 'New label' }}</h3>
          <label class="block space-y-1"><span class="text-[12px] text-label">Name</span>
            <input v-model="labelForm.name" maxlength="40" autofocus class="w-full px-3 py-2 rounded-lg text-[13px]" :style="field" /></label>
          <div class="space-y-1"><span class="text-[12px] text-label">Color</span>
            <div class="flex gap-2">
              <button v-for="c in LABEL_COLORS" :key="c" type="button" class="size-6 rounded-full" :style="{ background: c, outline: labelForm.color === c ? '2px solid var(--text-primary)' : 'none', outlineOffset: '2px' }" :title="c" @click="labelForm.color = c" />
            </div></div>
          <label class="block space-y-1"><span class="text-[12px] text-label">Description</span>
            <input v-model="labelForm.description" maxlength="200" class="w-full px-3 py-2 rounded-lg text-[13px]" :style="field" /></label>
          <div class="flex justify-end gap-2"><UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="() => { labelDlg = false }" /><UButton type="submit" :label="labelEditId ? 'Save' : 'Create'" size="sm" :disabled="!labelForm.name.trim() || labelBusy" /></div>
        </form>
      </template>
    </UModal>

    <UModal :open="!!labelDelete" @update:open="(v: boolean) => { if (!v) labelDelete = null }">
      <template #content>
        <div class="p-6 space-y-4 w-[420px] max-w-full" style="background: var(--surface-raised)">
          <h3 class="text-page-title">Delete label "{{ labelDelete?.name }}"?</h3>
          <p class="text-[13px] text-label">No issue uses it. This cannot be undone.</p>
          <div class="flex justify-end gap-2"><UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="() => { labelDelete = null }" /><UButton label="Delete" color="error" size="sm" @click="confirmLabelDelete" /></div>
        </div>
      </template>
    </UModal>

    <!-- Property dialog -->
    <UModal v-model:open="propDlg">
      <template #content>
        <form class="p-6 space-y-4 w-[480px] max-w-full" style="background: var(--surface-raised)" @submit.prevent="submitProperty">
          <h3 class="text-page-title">{{ propEditId ? 'Edit property' : 'New property' }}</h3>
          <label class="block space-y-1"><span class="text-[12px] text-label">Name</span>
            <input v-model="propForm.name" maxlength="40" autofocus class="w-full px-3 py-2 rounded-lg text-[13px]" :style="field" /></label>
          <div class="space-y-1"><span class="text-[12px] text-label">Color</span>
            <div class="flex gap-2">
              <button v-for="c in LABEL_COLORS" :key="c" type="button" class="size-6 rounded-full" :style="{ background: c, outline: propForm.color === c ? '2px solid var(--text-primary)' : 'none', outlineOffset: '2px' }" :title="c" @click="propForm.color = c" />
            </div></div>
          <label class="block space-y-1"><span class="text-[12px] text-label">Type {{ propEditId ? '(cannot change)' : '' }}</span>
            <select v-model="propForm.type" :disabled="!!propEditId" class="w-full px-3 py-2 rounded-lg text-[13px]" :style="field">
              <option v-for="(m, t) in PROPERTY_TYPE_META" :key="t" :value="t">{{ m.label }}</option>
            </select></label>
          <div v-if="propForm.type === 'select'" class="space-y-2"><span class="text-[12px] text-label">Options</span>
            <div v-for="(o, i) in propForm.options" :key="i" class="flex gap-2">
              <input v-model="o.name" maxlength="40" class="flex-1 px-3 py-1.5 rounded-lg text-[13px]" :style="field" placeholder="Option name" />
              <button type="button" class="p-1.5 rounded hover-bg" title="Remove" @click="propForm.options.splice(i, 1)"><UIcon name="i-lucide-x" class="size-3.5 block text-meta" /></button>
            </div>
            <UButton label="Add option" icon="i-lucide-plus" size="xs" variant="soft" color="neutral" type="button" @click="() => { propForm.options.push({ name: '' }) }" />
          </div>
          <div class="flex justify-end gap-2"><UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="() => { propDlg = false }" /><UButton type="submit" :label="propEditId ? 'Save' : 'Create'" size="sm" :disabled="!propValid || propBusy" /></div>
        </form>
      </template>
    </UModal>
  </div>
</template>
