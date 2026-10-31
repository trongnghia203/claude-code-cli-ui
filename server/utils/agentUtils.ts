import { resolveClaudePath } from './claudeDir'

/**
 * Decode an agent slug into its directory and base name.
 *
 * 'code-reviewer'              → { directory: '',            name: 'code-reviewer' }
 * 'engineering--code-reviewer' → { directory: 'engineering', name: 'code-reviewer' }
 *
 * Rule: split on the LAST occurrence of '--'. Agent names and directory names
 * may contain single '-' but not '--'.
 */
export function decodeAgentSlug(slug: string): { directory: string; name: string } {
  const idx = slug.lastIndexOf('--')
  if (idx === -1) return { directory: '', name: slug }
  return {
    directory: slug.slice(0, idx).replace(/--/g, '/'),
    name: slug.slice(idx + 2),
  }
}

/**
 * Encode a directory + agent name into a slug.
 *
 * ('', 'code-reviewer')            → 'code-reviewer'
 * ('engineering', 'code-reviewer') → 'engineering--code-reviewer'
 */
export function encodeAgentSlug(directory: string, name: string): string {
  if (!directory) return name
  return `${directory.replace(/\//g, '--')}--${name}`
}

/**
 * Resolve the absolute file path for an agent given its slug.
 */
export function resolveAgentFilePath(slug: string): string {
  const { directory, name } = decodeAgentSlug(slug)
  if (directory) {
    return resolveClaudePath('agents', ...directory.split('/'), `${name}.md`)
  }
  return resolveClaudePath('agents', `${name}.md`)
}

/**
 * Drop an empty `tools` list before writing an agent file. Claude Code reads `tools: []` on the main thread
 * (`claude --agent x`) as "no tools at all", while a missing `tools` means "all tools". The editor defaults to
 * `[]` when no tool is ticked, so without this every untouched agent became toolless.
 */
export function cleanAgentFrontmatter<T extends object>(frontmatter: T): T {
  const fm = { ...frontmatter } as Record<string, unknown>
  for (const key of ['tools', 'disallowedTools']) {
    if (Array.isArray(fm[key]) && (fm[key] as unknown[]).length === 0) delete fm[key]
  }
  return fm as T
}
