/**
 * Message content formatting utilities for Chat v2.
 * Handles HTML entity decoding, math block protection, and inline code normalization.
 */

/**
 * Decode HTML entities in text.
 * Handles common entities like &amp;, &lt;, &gt;, &quot;, &#x27;, etc.
 */
function decodeHTMLEntities(text: string): string {
  if (!text) return ''

  // Use a temporary element to decode HTML entities
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = text
    return textarea.value
  }

  // Server-side fallback: handle common entities manually
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
}

/**
 * Protect math blocks from markdown processing.
 * Wraps $...$ and $$...$$ in special markers that won't be parsed as markdown.
 */
export function protectMathBlocks(text: string): { text: string; blocks: string[] } {
  if (!text) return { text: '', blocks: [] }

  const blocks: string[] = []
  let result = text

  // Protect display math ($$...$$) first
  result = result.replace(/\$\$([^$]+)\$\$/g, (_, math) => {
    const index = blocks.length
    blocks.push(`$$${math}$$`)
    return `%%MATH_BLOCK_${index}%%`
  })

  // Protect inline math ($...$) but not $$
  result = result.replace(/\$([^$\n]+)\$/g, (match, math) => {
    // Skip if it looks like money (e.g., $100)
    if (/^\d+(?:\.\d{2})?$/.test(math)) {
      return match
    }
    const index = blocks.length
    blocks.push(`$${math}$`)
    return `%%MATH_BLOCK_${index}%%`
  })

  return { text: result, blocks }
}

/**
 * Restore math blocks after markdown processing.
 */
export function restoreMathBlocks(text: string, blocks: string[]): string {
  if (!text || blocks.length === 0) return text

  let result = text
  for (let i = 0; i < blocks.length; i++) {
    result = result.replace(`%%MATH_BLOCK_${i}%%`, blocks[i])
  }
  return result
}

/**
 * Fix malformed code fences (double backticks to triple backticks).
 * Some sources produce ``language instead of ```language
 */
function fixCodeFences(text: string): string {
  if (!text) return ''

  // Fix double backticks at start of line followed by language identifier
  // Convert ``language to ```language
  let result = text.replace(/^``(\w+)\s*$/gm, '```$1')

  // Fix standalone double backticks at start of line (closing fences)
  // Convert `` to ``` only when it looks like a fence (standalone on line)
  result = result.replace(/^``\s*$/gm, '```')

  return result
}

/**
 * Strip Claude Code system XML tags from user message content.
 * - Removes <local-command-caveat> blocks entirely (system injection, not user text)
 * - Unwraps <bash-input> to show just the command
 * - Strips any remaining unknown XML-like tags
 */
export function stripSystemXml(text: string): string {
  if (!text) return text
  return text
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<bash-input>([\s\S]*?)<\/bash-input>/g, '$1')
    .replace(/<[a-z][a-z0-9-]*(?:\s[^>]*)?>[\s\S]*?<\/[a-z][a-z0-9-]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

/**
 * Extract [Image: source: /path] references from text.
 * Returns the cleaned text (placeholders removed) and the image paths.
 */
export function extractImageSources(text: string): { text: string; imagePaths: string[] } {
  const imagePaths: string[] = []
  const cleaned = text.replace(/\[Image(?:\s+#\d+)?:\s*source:\s*([^\]]+)\]/g, (_, p) => {
    imagePaths.push(p.trim())
    return ''
  }).trim()
  return { text: cleaned, imagePaths }
}

type UserMessageKind = 'bash-input' | 'bash-stdout' | 'system' | 'text'

interface ParsedUserMessage {
  kind: UserMessageKind
  content: string
}

/** Claude Code logs loaded skill instructions as a synthetic user message. */
export function getLoadedSkillName(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.trimStart().match(/^Base directory for this skill:\s*([^\r\n]+)\r?\n/)
  if (!match) return null
  const path = match[1].trim().replace(/\/$/, '')
  return path.match(/(?:^|\/)skills\/([^/\s]+)$/)?.[1] || null
}

interface AgentReport {
  from: string
  body: string
}

/**
 * A subagent hand-back is logged as a user message wrapping the report in <agent-message from="...">.
 * Returns the sender and the report with the harness frame, boilerplate and indentation removed.
 */
export function getAgentReport(text: string | null | undefined): AgentReport | null {
  if (!text) return null
  const match = text.match(/<agent-message\s+from="([^"]*)"\s*>([\s\S]*?)<\/agent-message>/)
  if (!match) return null
  const inner = (match[2] ?? '').replace(/^[\s\S]*?The report follows:\s*\r?\n/, '')
  const lines = inner.replace(/\s+$/, '').split(/\r?\n/)
  const indents = lines.filter(l => l.trim()).map(l => (l.match(/^ */)?.[0] ?? '').length)
  const strip = indents.length ? Math.min(...indents) : 0
  return { from: match[1] ?? '', body: lines.map(l => l.slice(strip)).join('\n').trim() }
}

/**
 * Parse a user message into its display kind and inner content.
 */
export function parseUserMessage(text: string | null | undefined): ParsedUserMessage {
  if (!text) return { kind: 'text', content: '' }
  const t = text.trim()
  if (/^<local-command-caveat>[\s\S]*<\/local-command-caveat>\s*$/.test(t))
    return { kind: 'system', content: '' }
  const bashInput = t.match(/^<bash-input>([\s\S]*?)<\/bash-input>\s*$/)
  if (bashInput) return { kind: 'bash-input', content: decodeHTMLEntities(bashInput[1].trim()) }
  // bash-stdout may be followed by <bash-stderr>...</bash-stderr>
  const bashStdout = t.match(/^<bash-stdout>([\s\S]*?)<\/bash-stdout>(?:<bash-stderr>[\s\S]*?<\/bash-stderr>)?\s*$/)
  if (bashStdout) return { kind: 'bash-stdout', content: decodeHTMLEntities(bashStdout[1].trim()) }
  const stripped = stripSystemXml(t)
  if (!stripped) return { kind: 'system', content: '' }
  return { kind: 'text', content: stripped }
}

/**
 * A `!` shell command can be logged as one message holding <bash-input> then <bash-stdout>.
 * Returns the parts so each parses as its own kind, or null when the text is not that shape.
 * A trailing "[Request interrupted ...]" marker is dropped; any other trailing text is kept as its own part.
 */
export function splitBashMessage(text: string | null | undefined): string[] | null {
  if (!text) return null
  const match = text.trim().match(/^(<bash-input>[\s\S]*?<\/bash-input>)\s*(<bash-stdout>[\s\S]*?<\/bash-stdout>(?:\s*<bash-stderr>[\s\S]*?<\/bash-stderr>)?)\s*([\s\S]*)$/)
  if (!match?.[1] || !match[2]) return null
  const rest = (match[3] ?? '').trim()
  return rest && !rest.startsWith('[Request interrupted') ? [match[1], match[2], rest] : [match[1], match[2]]
}

/**
 * Format content for display.
 * Combines all formatting utilities in the correct order.
 */
export function formatContent(text: string): string {
  if (!text) return ''

  // 1. Decode HTML entities
  let result = decodeHTMLEntities(text)

  // 2. Fix malformed code fences (common issue with some markdown sources)
  result = fixCodeFences(result)

  return result
}

/**
 * Format a date string as a relative time (e.g., "5m ago").
 */
export function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return ''

  const date = new Date(dateString)
  // Check for invalid date
  if (isNaN(date.getTime())) return ''
  
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}
