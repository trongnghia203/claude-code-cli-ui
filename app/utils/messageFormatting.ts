/**
 * Message content formatting utilities for Chat v2.
 * Handles HTML entity decoding, math block protection, and inline code normalization.
 */

/**
 * Decode HTML entities in text.
 * Handles common entities like &amp;, &lt;, &gt;, &quot;, &#x27;, etc.
 */
export function decodeHTMLEntities(text: string): string {
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
 * Normalize inline code fences.
 * Fixes issues like double backticks or unclosed backticks.
 */
export function normalizeInlineCode(text: string): string {
  if (!text) return ''

  // Fix double backticks that should be single
  let result = text.replace(/``([^`]+)``/g, '`$1`')

  // Don't try to close unclosed backticks as it might break intentional formatting

  return result
}

/**
 * Escape special markdown characters in plain text sections.
 * Use this when you need to display literal characters.
 */
export function escapeMarkdown(text: string): string {
  if (!text) return ''

  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!')
}

/**
 * Fix malformed code fences (double backticks to triple backticks).
 * Some sources produce ``language instead of ```language
 */
export function fixCodeFences(text: string): string {
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
 * Returns true if the message content is purely a system XML injection
 * (e.g. only <local-command-caveat>) with no user-authored text.
 */
export function isSystemXmlMessage(text: string | null | undefined): boolean {
  if (!text) return false
  return stripSystemXml(text).length === 0
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

export type UserMessageKind = 'bash-input' | 'bash-stdout' | 'system' | 'text'

export interface ParsedUserMessage {
  kind: UserMessageKind
  content: string
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
 * Truncate text to a maximum length with ellipsis.
 */
export function truncateText(text: string, maxLength: number, ellipsis = '...'): string {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength - ellipsis.length) + ellipsis
}

/**
 * Extract first line of text (for previews).
 */
export function getFirstLine(text: string, maxLength = 100): string {
  if (!text) return ''

  const firstLine = text.split('\n')[0].trim()
  return truncateText(firstLine, maxLength)
}

/**
 * Check if text appears to contain markdown.
 */
export function hasMarkdown(text: string): boolean {
  if (!text) return false

  const markdownPatterns = [
    /^#+\s/m,           // Headers
    /\*\*[^*]+\*\*/,    // Bold
    /\*[^*]+\*/,        // Italic
    /`[^`]+`/,          // Inline code
    /```/,              // Code blocks
    /^\s*[-*+]\s/m,     // Lists
    /^\s*\d+\.\s/m,     // Numbered lists
    /\[.+\]\(.+\)/,     // Links
  ]

  return markdownPatterns.some(pattern => pattern.test(text))
}

/**
 * Check if text contains code blocks.
 */
export function hasCodeBlocks(text: string): boolean {
  if (!text) return false
  return /```[\s\S]*?```/.test(text)
}

/**
 * Extract code blocks from text.
 */
export function extractCodeBlocks(text: string): Array<{ language: string; code: string }> {
  if (!text) return []

  const blocks: Array<{ language: string; code: string }> = []
  const regex = /```(\w*)\n([\s\S]*?)```/g
  let match

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2].trim(),
    })
  }

  return blocks
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
