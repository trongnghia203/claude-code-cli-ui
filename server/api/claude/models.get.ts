import { query } from '@anthropic-ai/claude-agent-sdk'
import { getInstalledClaudePath } from '../../utils/claudeBinary'
import { resolveModelMeta, MODEL_ALIAS_KEY } from '../../utils/models'

interface ModelOption {
  value: string
  label: string
  description: string
  /** Context window in tokens, when known */
  contextWindow?: number
}

const CACHE_TTL_MS = 10 * 60 * 1000
let cache: { at: number; models: ModelOption[] } | null = null

/**
 * Ask the Claude Agent SDK which models the logged-in account can actually use.
 * The query is opened only for its init handshake and closed immediately.
 */
async function fetchSupportedModels(): Promise<ModelOption[]> {
  const q = query({
    // Never yields: no user turn is sent, so no tokens are spent.
    prompt: (async function* () {
      await new Promise(() => {})
    })(),
    options: { cwd: process.cwd(), pathToClaudeCodeExecutable: getInstalledClaudePath() },
  })
  try {
    const models = await q.supportedModels()
    return models.map((m) => ({
      value: m.value,
      label: m.displayName,
      description: m.description,
      // 'default' is whatever the CLI picks (Sonnet tier); everything else resolves by alias or full id
      contextWindow: resolveModelMeta(m.value === 'default' ? MODEL_ALIAS_KEY.SONNET : m.value)?.contextWindow,
    }))
  } finally {
    q.close()
  }
}

export default defineEventHandler(async () => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { models: cache.models }
  }
  try {
    const models = await fetchSupportedModels()
    if (models.length) cache = { at: Date.now(), models }
    return { models }
  } catch (error) {
    console.error('[models] Failed to fetch supported models:', error)
    return { models: [] }
  }
})
