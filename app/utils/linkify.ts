const JIRA_BASE = 'https://atajira.atlassian.net/browse/'
const JIRA_KEY = /(?<![\w/\[-])((?:ICU|CSI|ONE)-\d+)(?![\w\]-])/g
const MD_PATH = /(?<![\w/\[(.-])((?:~|\/Users\/[^\s/]+)\/[^\s)`\]<>]*\.md)(?![\w/-])/g

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const pathLink = (p: string, inner = esc(p)) => `<a href="#" class="md-file" data-path="${esc(p)}" title="Preview file">${inner}</a>`

/**
 * Make Jira keys (ICU, CSI, ONE) and local .md paths clickable, whoever wrote the text.
 * Code fences and existing links are left alone. A code span holding only a .md path becomes a link.
 */
export function linkify(text: string): string {
  if (!text) return text
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, i) => {
    if (i % 2) {
      const m = /^`((?:~|\/Users\/[^\s/]+)\/[^\s`]*\.md)`$/.exec(part)
      return m ? pathLink(m[1]!, `<code>${esc(m[1]!)}</code>`) : part
    }
    return part
      .replace(MD_PATH, (_m, p: string) => pathLink(p))
      .replace(JIRA_KEY, (_m, k: string) => `[${k}](${JIRA_BASE}${k})`)
  }).join('')
}
