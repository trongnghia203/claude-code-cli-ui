import { marked } from 'marked'
import { protectMathBlocks, restoreMathBlocks } from './messageFormatting'

// ── Shiki syntax highlighting ──────────────────────────────────────────────

const SUPPORTED_LANGS = new Set([
  'javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx',
  'python', 'py', 'ruby', 'rb', 'go', 'rust', 'rs',
  'java', 'kotlin', 'swift', 'c', 'cpp', 'c++', 'csharp', 'cs',
  'html', 'css', 'scss', 'sass', 'less',
  'json', 'yaml', 'yml', 'toml', 'xml',
  'bash', 'sh', 'zsh', 'shell', 'fish',
  'sql', 'graphql', 'markdown', 'md',
  'vue', 'svelte', 'astro',
  'diff',
  'dockerfile', 'docker',
  'php', 'perl', 'scala', 'haskell', 'elixir', 'erlang',
  'lua', 'dart', 'r', 'matlab', 'tex', 'latex',
])

const highlightedCache = new Map<string, string>()

/**
 * Highlight a code block using Shiki.
 * Falls back to plain <code> on failure / unsupported language.
 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const language = (lang || 'text').toLowerCase()
  const cacheKey = `${language}:${code}`
  if (highlightedCache.has(cacheKey)) {
    return highlightedCache.get(cacheKey)!
  }

  const resolvedLang = SUPPORTED_LANGS.has(language) ? language : 'text'

  if (import.meta.server) {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<div class="shiki-wrapper" data-lang="${lang || ''}"><pre><code>${escaped}</code></pre></div>`
  }

  try {
    const { codeToHtml: c2h } = await import('shiki').catch(() => ({ codeToHtml: null }))
    if (!c2h) throw new Error('Shiki not loaded')
    
    const html = await c2h(code, {
      lang: resolvedLang,
      theme: 'tokyo-night',
    })

    // Add language label and copy wrapper
    const withLabel = `<div class="shiki-wrapper" data-lang="${lang || ''}">${html}</div>`
    highlightedCache.set(cacheKey, withLabel)
    return withLabel
  } catch {
    // Fallback: plain fenced block
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const fallback = `<div class="shiki-wrapper" data-lang="${lang || ''}"><pre style="background:#1e1e2e;border-radius:0.5rem;padding:1rem;overflow-x:auto;"><code>${escaped}</code></pre></div>`
    highlightedCache.set(cacheKey, fallback)
    return fallback
  }
}

// ── Synchronous fallback renderer ──────────────────────────────────────────

marked.use({
  breaks: true,
  gfm: true,
  async: false,
})

/**
 * Render markdown to HTML (synchronous, no syntax highlighting).
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  return marked.parse(text) as string
}

/**
 * Render markdown with math AND Shiki syntax highlighting.
 * Async — returns a Promise<string>.
 */
export async function renderMarkdownWithHighlighting(
  text: string,
  options: { collapseLines?: number } = {}
): Promise<string> {
  if (!text) return ''
  const { collapseLines } = options

  const { text: protectedText, blocks } = protectMathBlocks(text)

  // Use a custom renderer to intercept code blocks
  const renderer = new marked.Renderer()

  // Collect code blocks to highlight — defer to shiki
  const codeBlocks: Array<{ placeholder: string; lang: string; code: string }> = []

  renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push({ placeholder, lang: lang || '', code: text })
    return placeholder
  }

  let html = marked.parse(protectedText, { renderer }) as string

  // Now resolve all code blocks in parallel
  await Promise.all(
    codeBlocks.map(async ({ placeholder, lang, code }) => {
      let highlighted = await highlightCode(code, lang)
      // Opt-in: long plain-text blocks (terminal output such as /context) start clamped, toggled by CSS only
      const lineCount = code.split('\n').length
      if (collapseLines && (lang || 'text') === 'text' && lineCount > collapseLines) {
        highlighted = `<div class="code-collapse">${highlighted}<label class="cc-btn"><input type="checkbox" class="cc-toggle"><span class="cc-more">Show full (${lineCount} lines)</span><span class="cc-less">Show less</span></label></div>`
      }
      html = html.replace(placeholder, () => highlighted)
    })
  )

  html = restoreMathBlocks(html, blocks)
  return html
}

