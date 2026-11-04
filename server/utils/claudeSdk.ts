import { query } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { normalizeSDKMessage } from './messageNormalizer'
import { resolveClaudePath } from './claudeDir'
import { parseFrontmatter } from './frontmatter'
import type { Peer } from 'crossws'
import type { NormalizedMessage } from '~/types'

interface QueryOptions {
  agentSlug?: string
  agentInstructions?: string
  sessionId?: string
  workingDir?: string
  model?: string
}

// Store active query instances for interruption
interface QueryInstance {
  interrupt(): Promise<void>
  [Symbol.asyncIterator](): AsyncIterator<any>
  peerId: string
}

const activeQueries = new Map<string, QueryInstance>()

/**
 * Send a normalized message via WebSocket
 */
function sendMessage(ws: Peer, message: NormalizedMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch (error) {
    console.error('[Claude SDK] Error sending message:', error)
  }
}

/**
 * Load agent instructions from agent slug
 */
export async function loadAgentInstructions(agentSlug: string): Promise<string | null> {
  try {
    const agentPath = resolveClaudePath('agents', `${agentSlug}.md`)
    const content = await fs.readFile(agentPath, 'utf-8')

    // Parse frontmatter to get body
    const { body } = parseFrontmatter(content)
    return body || null
  } catch (error) {
    console.error(`[Claude SDK] Failed to load agent ${agentSlug}:`, error)
    return null
  }
}
