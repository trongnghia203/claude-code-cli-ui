import type { NormalizedMessage, ChatSession, ChatSessionSummary } from '~/types'

/**
 * GUTTED: saveMessageToSession is no longer used.
 * The SDK handles its own storage natively.
 */
export async function saveMessageToSession(
  _sessionId: string,
  _message: NormalizedMessage
): Promise<void> {
  // NOOP: We don't write custom chat-sessions anymore
}

/**
 * GUTTED: Load messages from a session (legacy).
 * Redirects to returning empty. New logic reads from SDK project storage.
 */
export async function loadSessionMessages(
  _sessionId: string,
  _options: {
    limit?: number
    offset?: number
  } = {}
): Promise<{ messages: NormalizedMessage[]; total: number; hasMore: boolean }> {
  return { messages: [], total: 0, hasMore: false }
}

/**
 * GUTTED: List all chat sessions.
 * Returns empty. Use SDK's native session listing.
 */
export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  return []
}

