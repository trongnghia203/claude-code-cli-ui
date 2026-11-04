<script setup lang="ts">
import type { IssueViewDef } from '~/composables/useIssueConfig'

const props = defineProps<{ views: IssueViewDef[]; activeId: string | null; dirty: boolean; scope: 'project' | 'all'; canProject: boolean }>()
const emit = defineEmits<{
  select: [view: IssueViewDef | null]
  scope: [scope: 'project' | 'all']
  reorder: [ids: string[]]
  new: []
  save: []
  discard: []
  rename: [id: string, name: string]
  duplicate: [view: IssueViewDef]
  remove: [id: string]
}>()

const manage = ref(false)
const renaming = ref<{ id: string; name: string } | null>(null)
const confirmDelete = ref<IssueViewDef | null>(null)
const menuOpen = ref(false)

function submitRename() { if (renaming.value?.name.trim()) emit('rename', renaming.value.id, renaming.value.name.trim()); renaming.value = null }
const tab = (on: boolean) => on ? 'background: var(--accent-muted); color: var(--text-primary); border: 1px solid var(--border-subtle)' : 'color: var(--text-secondary); border: 1px solid var(--border-subtle)'
// One ordered list of tabs: the two scopes and the saved views of the current scope. Order and hidden tabs are kept in cookies.
type Item = { key: string; kind: 'scope' | 'view'; name: string; scope?: 'project' | 'all'; view?: IssueViewDef }
const yearCookie = { default: () => [] as string[], maxAge: 60 * 60 * 24 * 365 }
const orderCookie = useCookie<string[]>('issues-tab-order', yearCookie)
const hiddenCookie = useCookie<string[]>('issues-tab-hidden', yearCookie)
const items = computed<Item[]>(() => {
  const all: Item[] = [
    { key: 'scope:all', kind: 'scope', name: 'All', scope: 'all' },
    { key: 'scope:project', kind: 'scope', name: 'This project', scope: 'project' },
    ...props.views.map(v => ({ key: v.id, kind: 'view' as const, name: v.name, view: v })),
  ]
  const rank = (k: string) => { const i = orderCookie.value.indexOf(k); return i < 0 ? 1e6 : i }
  return all.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x.key) - rank(b.x.key) || a.i - b.i).map(e => e.x)
})
const isActive = (it: Item) => (it.kind === 'view' ? props.activeId === it.key : props.scope === it.scope && !props.activeId)
const hidden = (it: Item) => hiddenCookie.value.includes(it.key)
// A hidden tab still shows while it is the open one
const shown = computed(() => items.value.filter(it => !hidden(it) || isActive(it)))
function toggleHidden(it: Item) { hiddenCookie.value = hidden(it) ? hiddenCookie.value.filter(k => k !== it.key) : [...hiddenCookie.value, it.key] }
function setOrder(keys: string[]) {
  orderCookie.value = [...keys, ...orderCookie.value.filter(k => !keys.includes(k))]
  emit('reorder', keys.filter(k => props.views.some(v => v.id === k)))
}
function pick(it: Item) {
  if (it.kind === 'view') return emit('select', it.view!)
  if (props.scope === it.scope) emit('select', null)
  else emit('scope', it.scope!)
}
function move(key: string, dir: -1 | 1) {
  const keys = items.value.map(i => i.key)
  const i = keys.indexOf(key), j = i + dir
  if (j < 0 || j >= keys.length) return
  ;[keys[i], keys[j]] = [keys[j]!, keys[i]!]
  setOrder(keys)
}
// Drag a tab onto another to reorder
const dragKey = ref<string | null>(null)
function dropOn(target: string) {
  const from = dragKey.value
  dragKey.value = null
  if (!from || from === target) return
  const keys = items.value.map(i => i.key).filter(k => k !== from)
  keys.splice(keys.indexOf(target), 0, from)
  setOrder(keys)
}
const active = computed(() => props.views.find(v => v.id === props.activeId))
</script>

<template>
  <div class="flex items-center gap-1.5 min-w-0 overflow-x-auto">
    <button v-for="it in shown" :key="it.key" draggable="true" class="shrink-0 px-2.5 py-1 rounded-md text-[12px] font-medium disabled:opacity-40" :disabled="it.scope === 'project' && !canProject"
      :style="tab(isActive(it))" :title="it.scope === 'project' && !canProject ? 'Select a project first' : it.scope === 'all' ? 'Issues of all projects' : it.scope ? 'Issues of the selected project' : 'Drag to reorder'"
      @dragstart="dragKey = it.key" @dragend="dragKey = null" @dragover.prevent @drop.prevent="dropOn(it.key)" @click="pick(it)">{{ it.name }}<span v-if="it.kind === 'view' && activeId === it.key && dirty" class="ml-1" title="Unsaved changes">*</span></button>
    <template v-if="active && dirty">
      <button class="shrink-0 px-2 py-1 rounded-md text-[11px]" style="background: var(--accent); color: white" @click="emit('save')">Save</button>
      <button class="shrink-0 px-2 py-1 rounded-md text-[11px] text-label hover-bg" @click="emit('discard')">Discard</button>
    </template>
    <UPopover v-model:open="menuOpen">
      <button class="shrink-0 p-1.5 rounded-md hover-bg" title="Views"><UIcon name="i-lucide-layers" class="size-4 block text-meta" /></button>
      <template #content>
        <div class="w-[180px] p-1 text-[13px]" style="background: var(--surface-raised)">
          <button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover-bg" @click="() => { emit('new'); menuOpen = false }"><UIcon name="i-lucide-plus" class="size-4" />New view</button>
          <button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover-bg" @click="() => { manage = true; menuOpen = false }"><UIcon name="i-lucide-sliders-horizontal" class="size-4" />Manage views</button>
        </div>
      </template>
    </UPopover>

    <UModal v-model:open="manage">
      <template #content>
        <div class="p-6 space-y-3 w-[480px] max-w-full" style="background: var(--surface-raised)">
          <h3 class="text-page-title">Manage views</h3>
          <div v-for="(it, i) in items" :key="it.key" class="flex items-center gap-2 px-3 py-2 rounded-lg" :style="{ border: '1px solid var(--border-subtle)', opacity: hidden(it) ? 0.55 : 1 }">
            <input v-if="it.kind === 'view' && renaming?.id === it.key" v-model="renaming.name" maxlength="40" autofocus class="flex-1 px-2 py-1 rounded text-[13px]" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" @keydown.enter="submitRename" @keydown.esc="renaming = null" @blur="submitRename" />
            <span v-else class="flex-1 text-[13px] truncate">{{ it.name }} <span class="text-meta text-[11px]">{{ it.view ? it.view.layout : 'built in' }}</span></span>
            <button class="p-1 rounded hover-bg disabled:opacity-30" title="Move up" :disabled="i === 0" @click="move(it.key, -1)"><UIcon name="i-lucide-arrow-up" class="size-3.5 block" /></button>
            <button class="p-1 rounded hover-bg disabled:opacity-30" title="Move down" :disabled="i === items.length - 1" @click="move(it.key, 1)"><UIcon name="i-lucide-arrow-down" class="size-3.5 block" /></button>
            <button class="p-1 rounded hover-bg" :title="hidden(it) ? 'Show tab' : 'Hide tab'" @click="toggleHidden(it)"><UIcon :name="hidden(it) ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-3.5 block" /></button>
            <template v-if="it.view">
              <button class="p-1 rounded hover-bg" title="Rename" @click="renaming = { id: it.key, name: it.name }"><UIcon name="i-lucide-pencil" class="size-3.5 block" /></button>
              <button class="p-1 rounded hover-bg" title="Duplicate" @click="emit('duplicate', it.view)"><UIcon name="i-lucide-copy" class="size-3.5 block" /></button>
              <button class="p-1 rounded hover-bg" title="Delete" @click="confirmDelete = it.view"><UIcon name="i-lucide-trash-2" class="size-3.5 block" /></button>
            </template>
            <!-- Built-in tabs cannot be renamed, copied or deleted: same icons, greyed out so every column lines up -->
            <template v-else>
              <button class="p-1 rounded opacity-30 cursor-not-allowed" title="Built-in tab cannot be renamed" disabled><UIcon name="i-lucide-pencil" class="size-3.5 block" /></button>
              <button class="p-1 rounded opacity-30 cursor-not-allowed" title="Built-in tab cannot be duplicated" disabled><UIcon name="i-lucide-copy" class="size-3.5 block" /></button>
              <button class="p-1 rounded opacity-30 cursor-not-allowed" title="Built-in tab cannot be deleted" disabled><UIcon name="i-lucide-trash-2" class="size-3.5 block" /></button>
            </template>
          </div>
          <div class="flex justify-end"><UButton label="Done" size="sm" @click="() => { manage = false }" /></div>
        </div>
      </template>
    </UModal>

    <UModal :open="!!confirmDelete" @update:open="(o: boolean) => { if (!o) confirmDelete = null }">
      <template #content>
        <div class="p-6 space-y-4 w-[400px] max-w-full" style="background: var(--surface-raised)">
          <h3 class="text-page-title">Delete view "{{ confirmDelete?.name }}"?</h3>
          <p class="text-[13px] text-label">Only the saved setup is removed. No issue changes.</p>
          <div class="flex justify-end gap-2"><UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="() => { confirmDelete = null }" /><UButton label="Delete" color="error" size="sm" @click="() => { if (confirmDelete) emit('remove', confirmDelete.id); confirmDelete = null }" /></div>
        </div>
      </template>
    </UModal>
  </div>
</template>
