const KEY = 'claude-ui-issues-seen'
const MAX_ENTRIES = 500

// Module level on purpose: the board and the issue page share one view of "seen". Browser only, never read on the server.
const seen = ref<Record<string, number>>({})
let loaded = false

function ensureLoaded() {
  if (loaded || !import.meta.client) return
  loaded = true
  try { seen.value = JSON.parse(localStorage.getItem(KEY) || '{}') } catch { /* storage blocked or corrupt: start empty */ }
}

/** When the user last opened each issue, kept in this browser. The board tints a card that changed after that. */
export function useIssueSeen() {
  ensureLoaded()
  function markSeen(id: string) {
    ensureLoaded()
    const next = { ...seen.value, [id]: Date.now() }
    const keys = Object.keys(next)
    if (keys.length > MAX_ENTRIES) for (const k of keys.sort((a, b) => next[a]! - next[b]!).slice(0, keys.length - MAX_ENTRIES)) delete next[k]
    seen.value = next
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* the tint then comes back after a reload, nothing breaks */ }
  }
  /** True when the issue changed after the user last opened it */
  const isUnseen = (id: string, updatedAt: string) => Date.parse(updatedAt) > (seen.value[id] ?? 0)
  return { markSeen, isUnseen }
}
