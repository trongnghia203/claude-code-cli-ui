<script setup lang="ts">
import type { IssueViewDef } from '~/composables/useIssueConfig'

const props = defineProps<{ views: IssueViewDef[]; activeId: string | null; dirty: boolean }>()
const emit = defineEmits<{
  select: [view: IssueViewDef | null]
  new: []
  save: []
  discard: []
  rename: [id: string, name: string]
  duplicate: [view: IssueViewDef]
  remove: [id: string]
  move: [id: string, dir: -1 | 1]
}>()

const manage = ref(false)
const renaming = ref<{ id: string; name: string } | null>(null)
const confirmDelete = ref<IssueViewDef | null>(null)
const menuOpen = ref(false)

function submitRename() { if (renaming.value?.name.trim()) emit('rename', renaming.value.id, renaming.value.name.trim()); renaming.value = null }
const tab = (on: boolean) => on ? 'background: var(--accent-muted); color: var(--text-primary); border: 1px solid var(--border-subtle)' : 'color: var(--text-secondary); border: 1px solid var(--border-subtle)'
const active = computed(() => props.views.find(v => v.id === props.activeId))
</script>

<template>
  <div class="flex items-center gap-1.5 min-w-0 overflow-x-auto">
    <button class="shrink-0 px-2.5 py-1 rounded-md text-[12px] font-medium" :style="tab(!activeId)" @click="emit('select', null)">All</button>
    <button v-for="v in views" :key="v.id" class="shrink-0 px-2.5 py-1 rounded-md text-[12px] font-medium" :style="tab(activeId === v.id)" @click="emit('select', v)">{{ v.name }}<span v-if="activeId === v.id && dirty" class="ml-1" title="Unsaved changes">*</span></button>
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
          <p v-if="!views.length" class="text-[13px] text-meta py-4 text-center">No saved views yet.</p>
          <div v-for="(v, i) in views" :key="v.id" class="flex items-center gap-2 px-3 py-2 rounded-lg" style="border: 1px solid var(--border-subtle)">
            <input v-if="renaming?.id === v.id" v-model="renaming.name" maxlength="40" autofocus class="flex-1 px-2 py-1 rounded text-[13px]" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" @keydown.enter="submitRename" @keydown.esc="renaming = null" @blur="submitRename" />
            <span v-else class="flex-1 text-[13px] truncate">{{ v.name }} <span class="text-meta text-[11px]">{{ v.layout }}</span></span>
            <button class="p-1 rounded hover-bg disabled:opacity-30" title="Move up" :disabled="i === 0" @click="emit('move', v.id, -1)"><UIcon name="i-lucide-arrow-up" class="size-3.5 block" /></button>
            <button class="p-1 rounded hover-bg disabled:opacity-30" title="Move down" :disabled="i === views.length - 1" @click="emit('move', v.id, 1)"><UIcon name="i-lucide-arrow-down" class="size-3.5 block" /></button>
            <button class="p-1 rounded hover-bg" title="Rename" @click="renaming = { id: v.id, name: v.name }"><UIcon name="i-lucide-pencil" class="size-3.5 block" /></button>
            <button class="p-1 rounded hover-bg" title="Duplicate" @click="emit('duplicate', v)"><UIcon name="i-lucide-copy" class="size-3.5 block" /></button>
            <button class="p-1 rounded hover-bg" title="Delete" @click="confirmDelete = v"><UIcon name="i-lucide-trash-2" class="size-3.5 block" /></button>
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
