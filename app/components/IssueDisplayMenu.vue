<script setup lang="ts">
import type { IssueConfig } from '~/composables/useIssueConfig'
import type { Column, DisplayOptions } from '~/composables/useIssueView'

const display = defineModel<DisplayOptions>({ required: true })
defineProps<{ config: IssueConfig; columns: Column[]; showProject: boolean }>()
</script>

<template>
  <UPopover :content="{ align: 'end' }">
    <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)"><UIcon name="i-lucide-sliders-horizontal" class="size-3.5" /> Display</button>
    <template #content>
      <div class="w-[320px] max-h-[560px] overflow-y-auto custom-scrollbar p-4" style="background: var(--surface-raised)">
        <IssueDisplayForm v-model="display" :config="config" :columns="columns" :show-project="showProject" />
      </div>
    </template>
  </UPopover>
</template>
