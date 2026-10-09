import { query } from '@anthropic-ai/claude-agent-sdk'
import { getInstalledClaudePath } from '../../utils/claudeBinary'

interface ImproveRequest {
  name: string
  description: string
  currentInstructions: string
}

interface Suggestion {
  type: string
  description: string
  original: string
  suggested: string
}

interface ImproveResponse {
  suggestions: Suggestion[]
  improvedInstructions: string
}

/** Models sometimes wrap the whole answer in a ``` fence; unwrap it. */
function stripCodeFence(text: string): string {
  const m = text.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
  return (m ? m[1]! : text).trim()
}

export default defineEventHandler(async (event): Promise<ImproveResponse> => {
  const body = await readBody<ImproveRequest>(event)

  if (!body.name) {
    throw createError({ statusCode: 400, message: 'name is required' })
  }

  const isGeneration = !body.currentInstructions?.trim()

  // The editor only uses the full rewritten text, so ask for just that (plain text, no JSON).
  // Asking for per-suggestion JSON too doubled the output and made the call slow and fragile.
  const prompt = isGeneration
    ? `Write the contents of the file "${body.name}"${body.description ? ` (${body.description})` : ''}: clear, specific instructions for an AI coding assistant. Return ONLY the file text, with no commentary and no code fence around it.`
    : `Improve the following file "${body.name}"${body.description ? ` (${body.description})` : ''}, which gives instructions or memory to an AI coding assistant. Make it clearer, more specific and better organized while keeping its meaning, structure, language and any examples. Do not invent new facts. Return ONLY the full improved file text, with no commentary and no code fence around it.\n\n${body.currentInstructions}`

  let resultText = ''

  try {
    for await (const message of query({
      prompt,
      options: {
        maxTurns: 1,
        allowedTools: [],
        // Plain prompt: this is a text rewrite, so skip the large Claude Code tool preset
        systemPrompt: 'You are an expert editor of instructions for AI coding assistants. Be concise and precise.',
        pathToClaudeCodeExecutable: getInstalledClaudePath(),
        // One-off text rewrite: do not leave a chat session behind in the user's history
        persistSession: false,
      },
    })) {
      if ('result' in message) {
        resultText = message.result
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to call Claude'
    throw createError({ statusCode: 500, message: msg })
  }

  if (!resultText) {
    throw createError({ statusCode: 500, message: 'No response from Claude' })
  }

  return { suggestions: [], improvedInstructions: stripCodeFence(resultText) }
})
