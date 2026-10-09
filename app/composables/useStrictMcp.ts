const STORAGE_KEY = 'agents-ui:strict-mcp'

/**
 * Per-project switch: launch Claude with `--strict-mcp-config --mcp-config <project>/.mcp.json`,
 * so only the servers in that project's .mcp.json are used. Stored in localStorage by project path.
 */
export function useStrictMcp() {
  const map = useState<Record<string, boolean>>('strict-mcp', () => ({}))

  if (import.meta.client && !Object.keys(map.value).length) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) map.value = JSON.parse(raw)
    } catch {
      // ignore unreadable storage
    }
  }

  const key = (path?: string) => (path ?? '').replace(/\/+$/, '')

  function isStrict(path?: string): boolean {
    return !!path && map.value[key(path)] === true
  }

  function setStrict(path: string, value: boolean) {
    const next = { ...map.value }
    if (value) next[key(path)] = true
    else delete next[key(path)]
    map.value = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable: the switch still works for this page load
    }
  }

  return { isStrict, setStrict }
}
