/**
 * Convert Claude Code history messages to DisplayChatMessage format
 *
 * Claude Code JSONL format:
 * - Each entry has `type` (user/assistant/summary/file-history-snapshot)
 * - `message.content` is an ARRAY of content blocks:
 *   - { type: 'text', text: '...' }
 *   - { type: 'thinking', thinking: '...' }
 *   - { type: 'tool_use', name: '...', input: {...}, id: '...' }
 *   - { type: 'tool_result', tool_use_id: '...', content: '...' }
 */

import type { DisplayChatMessage } from '~/types'

interface ContentBlock {
  type: string
  text?: string
  thinking?: string
  name?: string
  input?: unknown
  id?: string
  tool_use_id?: string
  content?: string | Array<{ type: string; text?: string }>
  is_error?: boolean
  [key: string]: unknown
}

interface ClaudeCodeMessage {
  uuid?: string
  parentUuid?: string | null
  sessionId: string
  timestamp: string
  type?: string
  message?: {
    role: 'user' | 'assistant'
    content: string | ContentBlock[]
  }
  cwd?: string
  toolName?: string
  toolInput?: unknown
  toolUseResult?: unknown
  [key: string]: unknown
}

/**
 * Check if content appears to be a system message that should be filtered
 */
function isSystemMessage(content: string): boolean {
  if (!content) return false

  const systemPrefixes = [
    '<command-name>',
    '<command-message>',
    '<command-args>',
    '<local-command-stdout>',
    '<system-reminder>',
    'Caveat:',
    'This session is being continued from a previous',
    'Invalid API key',
    '[Request interrupted',
  ]

  return systemPrefixes.some(prefix => content.trim().startsWith(prefix)) ||
    content.includes('{"subtasks":')
}

/** `/name args` for a slash command logged as <command-name>/mcp</command-name> ... <command-args>x</command-args> */
function parseSlashCommand(text: string): string | null {
  const name = text.match(/<command-name>\s*([^<]+?)\s*<\/command-name>/)?.[1]
  if (!name) return null
  const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim()
  return `${name.startsWith('/') ? name : `/${name}`}${args ? ` ${args}` : ''}`
}

/** Text of a local command's output, without its <local-command-stdout> wrapper */
function stripLocalCommandTags(text: string): string {
  return text.replace(/<\/?local-command-(?:stdout|stderr)>/g, '').trim()
}

/**
 * Extract text from tool result content
 */
function extractToolResultContent(content: string | Array<{ type: string; text?: string }> | undefined): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n')
  }
  return ''
}

/**
 * Normalize tool names for deduplication
 */
function normalizeToolName(name: string): string {
  const n = (name || '').toLowerCase()
  if (n === 'read_file' || n === 'read') return 'read'
  if (n === 'write_file' || n === 'write') return 'write'
  if (n === 'glob_search' || n === 'glob') return 'glob'
  if (n === 'tool_search' || n === 'toolsearch') return 'toolsearch'
  if (n === 'grep_search' || n === 'grep') return 'grep'
  return n
}

/**
 * Extract target from tool input (mimicking ChatV2MessageItem.vue toolFileName)
 */
function getToolTarget(toolInput: any): string {
  if (!toolInput) return ''
  let input = toolInput
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input)
    } catch (e) {
      return input.replace(/^\.\//, '')
    }
  }

  if (typeof input === 'object') {
    const val = input.file_path || input.path || input.filePath || input.filename || input.pattern || input.file || input.command || ''
    return typeof val === 'string' ? val.replace(/^\.\//, '') : JSON.stringify(val)
  }
  return ''
}

/**
 * Convert Claude Code messages to DisplayChatMessage format
 */
export function convertClaudeCodeMessages(messages: ClaudeCodeMessage[]): DisplayChatMessage[] {
  // Sort messages by timestamp first to ensure Turn-based deduplication works correctly
  const sortedMessages = [...messages].sort((a, b) =>
    new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
  )

  const displayMessages: DisplayChatMessage[] = []

  // First pass: collect tool results by tool_use_id
  const toolResultsMap = new Map<string, { content: string; isError: boolean; toolUseResult?: any }>()

  for (const msg of sortedMessages) {
    if (msg.message?.content && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const resultContent = extractToolResultContent(block.content)
          toolResultsMap.set(block.tool_use_id, {
            content: resultContent,
            isError: block.is_error || false,
            toolUseResult: msg.toolUseResult
          })
        }
      }
    }
  }

  // Second pass: convert messages
  const seenToolCalls = new Set<string>()

  for (const msg of sortedMessages) {
    // Skip non-message entries
    if (msg.type === 'summary' || msg.type === 'file-history-snapshot') {
      continue
    }

    const content = msg.message?.content

    // Output of a local slash command (/mcp, /cost, ...): no model call, so this is the whole response
    if (msg.type === 'system' && (msg as any).subtype === 'local_command' && typeof (msg as any).content === 'string') {
      const text = stripLocalCommandTags((msg as any).content)
      if (text) {
        displayMessages.push({
          id: msg.uuid || `local-command-${msg.timestamp}`,
          role: 'assistant',
          content: text,
          timestamp: msg.timestamp,
          kind: 'text'
        })
      }
      continue
    }

    // Handle user messages
    if (msg.type === 'user' || msg.message?.role === 'user') {
      let textContent = ''

      if (typeof content === 'string') {
        textContent = content
      } else if (Array.isArray(content)) {
        // Extract text from content blocks
        textContent = content
          .filter(block => block.type === 'text' && block.text)
          .map(block => block.text)
          .join('\n')
      }

      // Show a typed slash command (e.g. /mcp) as the user message it was
      const slashCommand = parseSlashCommand(textContent)
      if (slashCommand) {
        seenToolCalls.clear()
        displayMessages.push({
          id: msg.uuid || `user-${msg.timestamp}`,
          role: 'user',
          content: slashCommand,
          timestamp: msg.timestamp,
          kind: 'text'
        })
        continue
      }

      // Skip system messages and DON'T clear seen tools for them
      if (isSystemMessage(textContent)) {
        continue
      }

      // Real user message: reset seen tools for the new interaction turn
      seenToolCalls.clear()

      if (textContent.trim()) {
        displayMessages.push({
          id: msg.uuid || `user-${msg.timestamp}`,
          role: 'user',
          content: textContent,
          timestamp: msg.timestamp,
          kind: 'text'
        })
      }
    }

    // Handle assistant messages - parse content array
    else if (msg.type === 'assistant' || msg.message?.role === 'assistant') {
      if (Array.isArray(content)) {
        for (const block of content) {
          // Thinking blocks
          if (block.type === 'thinking' && block.thinking) {
            displayMessages.push({
              id: `${msg.uuid}-thinking-${block.thinking.slice(0, 20)}`,
              role: 'assistant',
              content: block.thinking,
              timestamp: msg.timestamp,
              kind: 'thinking',
              thinking: block.thinking
            })
          }

          // Text blocks
          else if (block.type === 'text' && block.text) {
            // Skip internal content
            if (isSystemMessage(block.text)) {
              continue
            }

            displayMessages.push({
              id: `${msg.uuid}-text-${block.text.slice(0, 20)}`,
              role: 'assistant',
              content: block.text,
              timestamp: msg.timestamp,
              kind: 'text'
            })
          }

          // Tool use blocks
          else if (block.type === 'tool_use' && block.name) {
            const toolResult = block.id ? toolResultsMap.get(block.id) : undefined
            
            // Deduplication: skip if this is the same tool and target as a previous one in this turn
            const toolName = normalizeToolName(block.name)
            const target = getToolTarget(block.input)
            
            const toolKey = `${toolName}:${target}`
            if (seenToolCalls.has(toolKey)) {
              continue
            }
            seenToolCalls.add(toolKey)

            // Check if this is an AskUserQuestion
            const isAskUserQuestion = ['askuserquestion', 'ask_user', 'askuser', 'ask_user_question', 'prompt', 'input_request'].includes(block.name.toLowerCase())
            
            if (isAskUserQuestion) {
              // Extract answers if present
              let resolvedAnswer: string | undefined
              if (toolResult?.toolUseResult?.answers) {
                resolvedAnswer = Object.values(toolResult.toolUseResult.answers as Record<string, string>).join(', ')
              }

              displayMessages.push({
                id: block.id || `${msg.uuid}-tool-${block.name}`,
                role: 'assistant',
                timestamp: msg.timestamp,
                kind: 'permission_request',
                toolName: block.name,
                toolInput: block.input,
                content: (block.input as any)?.question,
                resolvedDecision: toolResult ? 'allow' : undefined,
                resolvedAnswer
              })
            } else {
              displayMessages.push({
                id: block.id || `${msg.uuid}-tool-${block.name}`,
                role: 'assistant',
                content: '',
                timestamp: msg.timestamp,
                kind: 'tool_use',
                toolName: block.name,
                toolInput: block.input,
                toolResult: toolResult ? {
                  content: toolResult.content,
                  isError: toolResult.isError
                } : undefined
              })
            }
          }
        }
      } else if (typeof content === 'string' && content.trim()) {
        // Simple string content
        if (!isSystemMessage(content)) {
          displayMessages.push({
            id: msg.uuid || `assistant-${msg.timestamp}`,
            role: 'assistant',
            content: content,
            timestamp: msg.timestamp,
            kind: 'text'
          })
        }
      }
    }

    // Handle standalone tool entries (older format)
    else if (msg.toolName) {
      const toolName = normalizeToolName(msg.toolName)
      const target = getToolTarget(msg.toolInput)
      
      const toolKey = `${toolName}:${target}`
      if (!seenToolCalls.has(toolKey)) {
        seenToolCalls.add(toolKey)
        displayMessages.push({
          id: msg.uuid || `tool-${msg.timestamp}`,
          role: 'assistant',
          content: '',
          timestamp: msg.timestamp,
          kind: 'tool_use',
          toolName: msg.toolName,
          toolInput: msg.toolInput,
          toolResult: msg.toolUseResult
        })
      }
    }
  }

  // Sort by timestamp (final check for display order)
  displayMessages.sort((a, b) =>
    new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
  )

  return displayMessages
}

/**
 * Check if a message array contains any displayable content
 */
export function hasDisplayableContent(messages: ClaudeCodeMessage[]): boolean {
  return messages.some(msg => {
    if (msg.type === 'summary' || msg.type === 'file-history-snapshot') return false

    const content = msg.message?.content

    if (msg.type === 'user' || msg.message?.role === 'user') {
      if (typeof content === 'string') {
        return content.trim() && !isSystemMessage(content)
      }
      if (Array.isArray(content)) {
        const text = content.filter(b => b.type === 'text' && b.text).map(b => b.text).join('')
        return text.trim() && !isSystemMessage(text)
      }
    }

    if (msg.type === 'assistant' || msg.message?.role === 'assistant') {
      if (Array.isArray(content)) {
        return content.some(block =>
          (block.type === 'text' && block.text && !isSystemMessage(block.text)) ||
          block.type === 'thinking' ||
          block.type === 'tool_use'
        )
      }
      if (typeof content === 'string') {
        return content.trim() && !isSystemMessage(content)
      }
    }

    if (msg.toolName) return true

    return false
  })
}
