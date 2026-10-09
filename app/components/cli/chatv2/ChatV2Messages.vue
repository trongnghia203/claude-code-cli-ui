<script setup lang="ts">
import type { DisplayChatMessage } from '~/types'
import { parseUserMessage, extractImageSources } from '~/utils/messageFormatting'

const props = defineProps<{
  messages: DisplayChatMessage[]
  isStreaming?: boolean
}>()

const emit = defineEmits<{
  (e: 'permissionRespond', permissionId: string, decision: 'allow' | 'deny', remember?: boolean, updatedInput?: any): void
  (e: 'openFile', filePath: string): void
}>()

// Track which user message is showing "copied" state
const copiedMessageId = ref<string | null>(null)

// Track expanded bash-stdout messages
const expandedStdout = ref<Set<string>>(new Set())
function toggleStdout(id: string) {
  const s = new Set(expandedStdout.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedStdout.value = s
}

// Lightbox
const lightboxSrc = ref<string | null>(null)
function openLightbox(src: string) { lightboxSrc.value = src }
function closeLightbox() { lightboxSrc.value = null }
onMounted(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox() }
  window.addEventListener('keydown', onKey)
  onUnmounted(() => window.removeEventListener('keydown', onKey))
})

async function copyUserMessage(messageId: string, content: string) {
  try {
    await navigator.clipboard.writeText(content)
    copiedMessageId.value = messageId
    setTimeout(() => { copiedMessageId.value = null }, 2000)
  } catch (e) {
    console.error('Failed to copy:', e)
  }
}

interface MessageGroup {
  id: string
  role: 'user' | 'assistant' | 'shell'
  timestamp: string
  messages: DisplayChatMessage[]
}

const messageGroups = computed<MessageGroup[]>(() => {
  const groups: MessageGroup[] = []
  let currentGroup: MessageGroup | null = null

  for (const message of props.messages) {
    const parsed = parseUserMessage(message.content)
    if (parsed.kind === 'system') continue

    const messageRole: 'user' | 'assistant' | 'shell' =
      parsed.kind === 'bash-input' || parsed.kind === 'bash-stdout'
        ? 'shell'
        : message.role === 'user'
          ? 'user'
          : 'assistant'

    if (currentGroup && currentGroup.role === messageRole) {
      currentGroup.messages.push(message)
    } else {
      if (currentGroup) groups.push(currentGroup)
      currentGroup = { id: message.id, role: messageRole, timestamp: message.timestamp, messages: [message] }
    }
  }

  if (currentGroup) groups.push(currentGroup)
  return groups
})

function handlePermissionRespond(permissionId: string, decision: 'allow' | 'deny', remember = false, updatedInput?: any) {
  emit('permissionRespond', permissionId, decision, remember, updatedInput)
}

function handleOpenFile(filePath: string) {
  emit('openFile', filePath)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Message Groups -->
    <div
      v-for="group in messageGroups"
      :key="group.id"
      class="message-group min-w-0"
    >
      <!-- Shell Group (bash-input / bash-stdout) - centered, full-width -->
      <div v-if="group.role === 'shell'" class="flex justify-end min-w-0">
        <div class="flex items-start gap-2 md:gap-3 w-full max-w-[95%] md:max-w-[85%] min-w-0">
          <div class="flex flex-col items-end gap-1.5 min-w-0 flex-1">
            <template v-for="msg in group.messages" :key="msg.id">
              <!-- bash-input: command in dark terminal block -->
              <div
                v-if="parseUserMessage(msg.content).kind === 'bash-input'"
                class="flex items-start gap-2 px-4 py-3 rounded-lg font-mono text-[11px] md:text-[12px] min-w-0 w-full"
                style="background: #1a1b26; color: #9ece6a;"
              >
                <span class="shrink-0" style="color: #7aa2f7;">$</span>
                <span class="whitespace-pre-wrap break-all">{{ parseUserMessage(msg.content).content }}</span>
              </div>

              <!-- bash-stdout: collapsible output -->
              <div
                v-else-if="parseUserMessage(msg.content).kind === 'bash-stdout'"
                class="flex flex-col items-start min-w-0 w-full"
              >
                <button
                  class="flex items-center gap-1.5 px-1 py-0.5 text-[11px]"
                  style="color: var(--text-tertiary);"
                  @click="toggleStdout(msg.id)"
                >
                  <UIcon name="i-lucide-chevron-right" class="size-3 shrink-0 transition-transform" :class="{ 'rotate-90': expandedStdout.has(msg.id) }" />
                  <span>{{ expandedStdout.has(msg.id) ? 'Hide output' : 'Show output' }}</span>
                  <span v-if="parseUserMessage(msg.content).content" class="font-mono text-[10px]" style="color: var(--text-disabled);">{{ parseUserMessage(msg.content).content.split('\n').length }} lines</span>
                  <span v-else class="font-mono text-[10px]" style="color: var(--text-disabled);">empty</span>
                </button>
                <pre
                  v-if="expandedStdout.has(msg.id)"
                  class="mt-1 px-4 py-3 rounded-lg whitespace-pre-wrap break-all font-mono text-[11px] md:text-[12px] w-full"
                  style="background: #1a1b26; color: #9ece6a; max-height: 300px; overflow-y: auto;"
                >{{ parseUserMessage(msg.content).content || '(no output)' }}</pre>
              </div>
            </template>
            <ClientOnly>
              <div class="text-[9px] md:text-[10px] px-1" style="color: var(--text-tertiary);">
                {{ new Date(group.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </div>
            </ClientOnly>
          </div>
          <div
            class="size-7 md:size-8 rounded-full shrink-0 flex items-center justify-center text-[11px] md:text-[12px] font-semibold"
            style="background: var(--accent); color: white;"
          >
            U
          </div>
        </div>
      </div>

      <!-- User Message Group -->
      <div v-else-if="group.role === 'user'" class="flex justify-end min-w-0">
        <div class="flex items-start gap-2 md:gap-3 max-w-[95%] md:max-w-[85%] min-w-0">
          <div class="flex flex-col items-end gap-1.5 min-w-0">
            <!-- All user messages in this group -->
            <template v-for="(msg, idx) in group.messages" :key="msg.id">
              <div
                class="group relative px-3 md:px-4 py-2 md:py-2.5 min-w-0"
                :class="idx === 0 ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-r-md'"
                style="background: var(--accent); color: white;"
              >
                <!-- images from [Image: source: /path] notation -->
                <div
                  v-if="extractImageSources(msg.content || '').imagePaths.length"
                  class="flex flex-wrap gap-2 mb-2"
                >
                  <img
                    v-for="(p, i) in extractImageSources(msg.content || '').imagePaths"
                    :key="i"
                    :src="`/api/local-image?path=${encodeURIComponent(p)}`"
                    class="max-w-[160px] md:max-w-[200px] max-h-[160px] md:max-h-[200px] rounded-lg object-contain bg-white/10 cursor-zoom-in"
                    @click="openLightbox(`/api/local-image?path=${encodeURIComponent(p)}`)"
                  />
                </div>
                <!-- sdk images -->
                <div v-if="msg.images && msg.images.length > 0" class="flex flex-wrap gap-2 mb-2">
                  <img
                    v-for="(img, i) in msg.images"
                    :key="i"
                    :src="img"
                    class="max-w-[160px] md:max-w-[200px] max-h-[160px] md:max-h-[200px] rounded-lg object-contain bg-white/10 cursor-zoom-in"
                    @click="openLightbox(img)"
                  />
                </div>
                <div
                  v-if="extractImageSources(msg.content || '').text"
                  class="text-[12px] md:text-[13px] whitespace-pre-wrap break-words overflow-wrap-anywhere max-w-full"
                  :class="{ 'pb-5': msg.content }"
                >{{ extractImageSources(msg.content || '').text }}</div>

                <!-- Copy button -->
                <button
                  v-if="msg.content"
                  class="absolute bottom-1.5 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  style="background: rgba(255, 255, 255, 0.15);"
                  title="Copy to clipboard"
                  @click="copyUserMessage(msg.id, msg.content!)"
                >
                  <UIcon
                    :name="copiedMessageId === msg.id ? 'i-lucide-check' : 'i-lucide-copy'"
                    class="size-3"
                    :style="{ color: copiedMessageId === msg.id ? '#86efac' : 'rgba(255,255,255,0.7)' }"
                  />
                </button>
              </div>
            </template>
            <!-- Single timestamp for the group -->
            <ClientOnly>
              <div class="text-[9px] md:text-[10px] px-1" style="color: var(--text-tertiary);">
                {{ new Date(group.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </div>
            </ClientOnly>
          </div>
          <!-- User Avatar -->
          <div
            class="size-7 md:size-8 rounded-full shrink-0 flex items-center justify-center text-[11px] md:text-[12px] font-semibold"
            style="background: var(--accent); color: white;"
          >
            U
          </div>
        </div>
      </div>

      <!-- Assistant Message Group -->
      <div v-else class="flex items-start gap-2 md:gap-3 min-w-0">
        <!-- Claude Avatar -->
        <div
          class="size-7 md:size-8 rounded-full shrink-0 flex items-center justify-center"
          style="background: linear-gradient(135deg, #d97706 0%, #ea580c 100%);"
        >
          <svg class="size-3.5 md:size-4" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>
          </svg>
        </div>

        <div class="flex-1 min-w-0 overflow-wrap-anywhere">
          <!-- Claude Header -->
          <div class="flex items-center gap-2 mb-1.5 md:mb-2">
            <span class="text-[12px] md:text-[13px] font-semibold" style="color: var(--text-primary);">Claude</span>
            <ClientOnly>
              <span class="text-[9px] md:text-[10px]" style="color: var(--text-tertiary);">
                {{ new Date(group.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </span>
            </ClientOnly>
          </div>

          <!-- Messages in this group -->
          <div class="space-y-2">
            <ChatV2MessageItem
              v-for="message in group.messages"
              :key="message.id"
              :message="message"
              :show-timestamp="false"
              @permission-respond="handlePermissionRespond"
              @open-file="handleOpenFile"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Streaming indicator when streaming but no text yet -->
    <div
      v-if="isStreaming && messageGroups.length > 0 && !messageGroups[messageGroups.length - 1]?.messages.some(m => m.isStreaming)"
      class="flex items-start gap-3"
    >
      <!-- Claude Avatar -->
      <div
        class="size-8 rounded-full shrink-0 flex items-center justify-center"
        style="background: linear-gradient(135deg, #d97706 0%, #ea580c 100%);"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="white">
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>
        </svg>
      </div>

      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[13px] font-semibold" style="color: var(--text-primary);">Claude</span>
        </div>
        <div class="flex items-center gap-2 text-[13px]" style="color: var(--text-secondary);">
          <span class="thinking-dots">
            <span>●</span><span>●</span><span>●</span>
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Lightbox overlay -->
  <Teleport to="body">
    <div
      v-if="lightboxSrc"
      class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style="background: rgba(0,0,0,0.85);"
      @click.self="closeLightbox"
    >
      <button
        class="absolute top-4 right-4 size-9 flex items-center justify-center rounded-full"
        style="background: rgba(255,255,255,0.2); color: white;"
        @click="closeLightbox"
      >
        <UIcon name="i-lucide-x" class="size-4" />
      </button>
      <img
        :src="lightboxSrc"
        class="max-w-full max-h-full rounded-lg object-contain"
        style="box-shadow: 0 25px 60px rgba(0,0,0,0.5);"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.overflow-wrap-anywhere {
  overflow-wrap: anywhere;
  word-wrap: break-word;
  word-break: break-word;
}

/* Force content to respect container width */
.max-w-full {
  max-width: 100%;
}

.thinking-dots {
  display: inline-flex;
  gap: 3px;
}

.thinking-dots span {
  animation: thinking-bounce 1.4s infinite ease-in-out both;
  font-size: 8px;
}

.thinking-dots span:nth-child(1) {
  animation-delay: -0.32s;
}

.thinking-dots span:nth-child(2) {
  animation-delay: -0.16s;
}

.thinking-dots span:nth-child(3) {
  animation-delay: 0s;
}

@keyframes thinking-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
