import { get, search } from 'node-emoji'

/** Emoji suggestions for `:query` while typing. Exact and prefix matches first. */
export function searchEmoji(query: string, limit = 8): { name: string; emoji: string }[] {
  const q = query.toLowerCase()
  if (!q) return []
  return search(q)
    .map(({ name, emoji }) => ({ name, emoji, rank: name === q ? 0 : name.startsWith(q) ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank || a.name.length - b.name.length)
    .slice(0, limit)
    .map(({ name, emoji }) => ({ name, emoji }))
}

/** Replace `:shortcode:` with the emoji. Code fences and inline code stay untouched. */
export function emojify(text: string): string {
  if (!text.includes(':')) return text
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, i) =>
    i % 2 ? part : part.replace(/:([a-z0-9_+-]+):/gi, (m, name) => get(name) ?? m),
  ).join('')
}
