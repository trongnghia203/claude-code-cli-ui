/**
 * Persist per-project pin/hide preferences in localStorage.
 * Keyed by the project's `name` (stable encoded path string from the API).
 */

const STORAGE_KEY = 'claude-ui:project-prefs'

export type ProjectSortKey = 'recent' | 'name' | 'name-desc' | 'sessions'
export type ProjectViewMode = 'default' | 'compact'

interface ProjectPrefs {
  pinned: string[]
  hidden: string[]
  sort: ProjectSortKey
  view: ProjectViewMode
}

const VALID_SORTS: ProjectSortKey[] = ['recent', 'name', 'name-desc', 'sessions']

function loadPrefs(): ProjectPrefs {
  try {
    if (typeof localStorage === 'undefined') return { pinned: [], hidden: [], sort: 'recent', view: 'default' }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
        hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
        sort: VALID_SORTS.includes(parsed.sort) ? parsed.sort : 'recent',
        view: parsed.view === 'compact' ? 'compact' : 'default',
      }
    }
  } catch {}
  return { pinned: [], hidden: [], sort: 'recent', view: 'default' }
}

function savePrefs(prefs: ProjectPrefs) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    }
  } catch {}
}

export function useProjectPreferences() {
  const prefs = ref<ProjectPrefs>(loadPrefs())

  function isPinned(name: string): boolean {
    return prefs.value.pinned.includes(name)
  }

  function isHidden(name: string): boolean {
    return prefs.value.hidden.includes(name)
  }

  function togglePin(name: string) {
    const idx = prefs.value.pinned.indexOf(name)
    if (idx >= 0) {
      prefs.value.pinned.splice(idx, 1)
    } else {
      prefs.value.pinned.push(name)
      // unpinned => not hidden; pinning a hidden item reveals it
      const hi = prefs.value.hidden.indexOf(name)
      if (hi >= 0) prefs.value.hidden.splice(hi, 1)
    }
    savePrefs(prefs.value)
  }

  function toggleHide(name: string) {
    const idx = prefs.value.hidden.indexOf(name)
    if (idx >= 0) {
      prefs.value.hidden.splice(idx, 1)
    } else {
      prefs.value.hidden.push(name)
      // hiding a pinned item removes the pin
      const pi = prefs.value.pinned.indexOf(name)
      if (pi >= 0) prefs.value.pinned.splice(pi, 1)
    }
    savePrefs(prefs.value)
  }

  const sortBy = computed({
    get: () => prefs.value.sort,
    set: (v: ProjectSortKey) => {
      prefs.value.sort = v
      savePrefs(prefs.value)
    },
  })

  function sortProjects<T extends { displayName: string; lastActivity?: string; sessionCount: number }>(list: T[]): T[] {
    return [...list].sort((a, b) => {
      switch (prefs.value.sort) {
        case 'name':
          return a.displayName.localeCompare(b.displayName)
        case 'name-desc':
          return b.displayName.localeCompare(a.displayName)
        case 'sessions':
          return b.sessionCount - a.sessionCount
        case 'recent':
        default:
          return new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime()
      }
    })
  }

  const viewMode = computed({
    get: () => prefs.value.view,
    set: (v: ProjectViewMode) => {
      prefs.value.view = v
      savePrefs(prefs.value)
    },
  })

  function toggleViewMode() {
    viewMode.value = viewMode.value === 'default' ? 'compact' : 'default'
  }

  const hiddenCount = computed(() => prefs.value.hidden.length)

  return { prefs, isPinned, isHidden, togglePin, toggleHide, hiddenCount, sortBy, sortProjects, viewMode, toggleViewMode }
}
