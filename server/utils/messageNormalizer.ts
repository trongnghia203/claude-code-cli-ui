import { randomUUID } from 'node:crypto'
import type { NormalizedMessage } from '~/types'

/** Unwrap <local-command-stdout>/<local-command-stderr> tags from slash command output. */
export function stripLocalCommandTags(content: unknown): string {
  if (typeof content !== 'string') return ''
  return content
    .replace(/<\/?local-command-(?:stdout|stderr)>/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    .trim()
}

/** Wrap terminal-style output in a code fence so markdown keeps its line breaks and spacing. */
function fenceTerminalOutput(text: string): string {
  return '```text\n' + text + '\n```'
}

/**
 * Normalize Claude SDK messages into our unified format
 * Following the pattern from claudecodeui's adapter
 */
export function normalizeSDKMessage(
  sdkMessage: any,
  sessionId: string
): NormalizedMessage[] {
  const timestamp = new Date().toISOString()
  const messages: NormalizedMessage[] = []

  // Handle stream events (real-time streaming)
  if (sdkMessage.type === 'stream_event' && sdkMessage.event) {
    const evt = sdkMessage.event

    // Text delta
    if (evt.type === 'content_block_delta') {
      if (evt.delta?.type === 'text_delta' && evt.delta.text) {
        messages.push({
          kind: 'stream_delta',
          id: randomUUID(),
          sessionId,
          timestamp,
          role: 'assistant',
          content: evt.delta.text,
        })
      } else if (evt.delta?.type === 'thinking_delta' && evt.delta.thinking) {
        messages.push({
          kind: 'thinking',
          id: randomUUID(),
          sessionId,
          timestamp,
          content: evt.delta.thinking,
        })
      } else if (evt.delta?.type === 'input_json_delta' && evt.delta.partial_json) {
        // Tool input being accumulated - send as separate message for buffering
        messages.push({
          kind: 'tool_input_delta',
          id: randomUUID(),
          sessionId,
          timestamp,
          content: evt.delta.partial_json,
        } as any) // Cast because tool_input_delta is not in standard types
      }
    }

    // Content block start (for thinking and tool_use)
    if (evt.type === 'content_block_start') {
      if (evt.content_block?.type === 'thinking') {
        messages.push({
          kind: 'thinking',
          id: randomUUID(),
          sessionId,
          timestamp,
          content: '',
        })
      } else if (evt.content_block?.type === 'tool_use') {
        // Start of tool use block - capture tool name and ID
        messages.push({
          kind: 'tool_use',
          id: randomUUID(),
          sessionId,
          timestamp,
          toolName: evt.content_block.name || 'tool',
          toolId: evt.content_block.id,
          toolInput: {},
          metadata: {
            toolUseId: evt.content_block.id,
          },
        })
      }
    }

    // Stream end
    if (evt.type === 'content_block_stop') {
      messages.push({
        kind: 'stream_end',
        id: randomUUID(),
        sessionId,
        timestamp,
      })
    }
  }

  // Local slash commands (/mcp, /cost, ...) never call the model. The CLI returns their output as a
  // synthetic assistant message whose text lives in `local_command_source`, with no stream events.
  if (sdkMessage.type === 'assistant' && typeof sdkMessage.local_command_source === 'string') {
    const text = stripLocalCommandTags(sdkMessage.local_command_source)
    if (text) {
      messages.push({
        kind: 'text',
        id: sdkMessage.uuid || randomUUID(),
        sessionId,
        timestamp,
        role: 'assistant',
        content: fenceTerminalOutput(text),
      })
    }
  }

  // Handle system messages (local command output from slash commands such as /mcp)
  if (sdkMessage.type === 'system') {
    // Older CLIs emit `local_command_output`; current ones emit `local_command` with the text
    // wrapped in <local-command-stdout> tags. Local commands never call the model, so this
    // output is the only "response" the user gets.
    if (sdkMessage.subtype === 'local_command_output' || sdkMessage.subtype === 'local_command') {
      // Echo of the typed command (<command-name>...), not output: the client already shows the user's input
      const isCommandEcho = typeof sdkMessage.content === 'string' && sdkMessage.content.includes('<command-name>')
      const text = isCommandEcho ? '' : stripLocalCommandTags(sdkMessage.content)
      if (text) {
        messages.push({
          kind: 'text',
          id: sdkMessage.uuid || randomUUID(),
          sessionId,
          timestamp,
          role: 'assistant',
          content: fenceTerminalOutput(text),
        })
      }
    }
    // Other system subtypes (init, etc.) are silently ignored
  }

  // Handle tool use (Anthropic SDK tool execution)
  if (sdkMessage.type === 'tool_use' || sdkMessage.type === 'tool_progress') {
    const isPermissionRequest = sdkMessage.is_permission_request || false

    messages.push({
      kind: isPermissionRequest ? 'permission_request' : 'tool_use',
      id: sdkMessage.uuid || randomUUID(),
      sessionId,
      timestamp,
      toolName: sdkMessage.tool_name,
      toolId: sdkMessage.tool_use_id,
      toolInput: sdkMessage.tool_input,
      requestId: sdkMessage.tool_use_id, // For pairing with response
      content: isPermissionRequest ? `Allow ${sdkMessage.tool_name}?` : '',
      metadata: {
        elapsed: sdkMessage.elapsed_time_seconds,
        status: sdkMessage.type === 'tool_progress' ? 'running' : 'complete',
        toolUseId: sdkMessage.tool_use_id,
      },
    })
  }

  // Handle tool result (Anthropic SDK tool results)
  if (sdkMessage.type === 'tool_result') {
    messages.push({
      kind: 'tool_result',
      id: randomUUID(),
      sessionId,
      timestamp,
      toolId: sdkMessage.tool_use_id,
      content: sdkMessage.content || '',
      isError: sdkMessage.is_error || false,
    })
  }

  // Handle result (final result with full content)
  // Only check for explicit result type - don't use 'result' in sdkMessage as it's too broad
  if (sdkMessage.type === 'result') {
    const resultText = sdkMessage.result || ''
    // Don't create text message here - the streaming flow handles text display
    // This result is used by claudeProvider for save logic only
    // Mark that we received a result for tracking purposes
    if (resultText && !isInternalContent(resultText)) {
      // Result text is available but we don't create a duplicate text message
      // The accumulated stream_delta content will be finalized to text by the frontend
    }

    // Add complete message with full usage data
    {
      // Aggregate modelUsage across all models (Record<string, ModelUsage>)
      let totalInput = 0
      let totalOutput = 0
      let totalCacheRead = 0
      let totalCacheCreation = 0
      let totalCost = sdkMessage.total_cost_usd || 0
      let contextWindow = 200_000

      if (sdkMessage.modelUsage && typeof sdkMessage.modelUsage === 'object') {
        for (const modelUsage of Object.values(sdkMessage.modelUsage) as any[]) {
          totalInput += modelUsage.inputTokens || 0
          totalOutput += modelUsage.outputTokens || 0
          totalCacheRead += modelUsage.cacheReadInputTokens || 0
          totalCacheCreation += modelUsage.cacheCreationInputTokens || 0
          if (modelUsage.contextWindow && modelUsage.contextWindow > contextWindow) {
            contextWindow = modelUsage.contextWindow
          }
        }
      }

      // Also check top-level usage as fallback
      if (totalInput === 0 && sdkMessage.usage) {
        totalInput = sdkMessage.usage.input_tokens || 0
        totalOutput = sdkMessage.usage.output_tokens || 0
        totalCacheRead = sdkMessage.usage.cache_read_input_tokens || 0
        totalCacheCreation = sdkMessage.usage.cache_creation_input_tokens || 0
      }

      messages.push({
        kind: 'complete',
        id: randomUUID(),
        sessionId,
        timestamp,
        content: '',
        metadata: {
          stopReason: sdkMessage.stop_reason,
          modelUsage: sdkMessage.modelUsage,
          aggregatedUsage: {
            input: totalInput,
            output: totalOutput,
            cacheRead: totalCacheRead,
            cacheCreation: totalCacheCreation,
            contextWindow,
            totalCost,
          },
        },
      })
    }
  }

  return messages
}

/**
 * Check if content should be filtered out (internal system messages)
 */
function isInternalContent(content: string): boolean {
  if (!content) return false

  const internalPatterns = [
    /<system-reminder>/i,
    /<\/system-reminder>/i,
    /<claude_background_info>/i,
    /<\/claude_background_info>/i,
  ]

  return internalPatterns.some((pattern) => pattern.test(content))
}

