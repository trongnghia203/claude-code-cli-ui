import type { Plugin, PluginDetail, SkillFrontmatter, Settings } from '~/types'

export function usePlugins() {
  const plugins = useState<Plugin[]>('plugins', () => [])
  const loading = useState('pluginsLoading', () => false)
  const error = useState<string | null>('pluginsError', () => null)
  const { workingDir } = useWorkingDir()

  // The enabled state is per project: project and local settings override the global enabledPlugins entry
  const projectQuery = () => ({ workingDir: workingDir.value || undefined })

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      plugins.value = await $fetch<Plugin[]>('/api/plugins', { query: projectQuery() })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load plugins'
      error.value = msg
      console.error('[usePlugins] fetchAll:', msg)
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id: string) {
    return await $fetch<PluginDetail>(`/api/plugins/${encodeURIComponent(id)}`, { query: projectQuery() })
  }

  /** Write enabledPlugins[id] to the settings file that currently decides it (project or local), else the global one. */
  async function toggleEnabled(id: string, enabled: boolean, source?: Plugin['enabledSource']) {
    if (source && source !== 'user' && workingDir.value) {
      const scope = source === 'project' ? 'project' : 'local'
      const current = await $fetch<Settings>('/api/projects/settings', { query: { path: workingDir.value, scope } })
      await $fetch('/api/projects/settings', {
        method: 'PUT',
        body: {
          path: workingDir.value,
          scope,
          settings: { ...current, enabledPlugins: { ...(current.enabledPlugins as Record<string, boolean> | undefined), [id]: enabled } },
        },
      })
    } else {
      const { save, settings } = useSettings()
      if (!settings.value) return

      await save({
        ...settings.value,
        enabledPlugins: {
          ...(settings.value.enabledPlugins as Record<string, boolean> | undefined),
          [id]: enabled,
        },
      })
    }

    const idx = plugins.value.findIndex(p => p.id === id)
    if (idx >= 0) {
      plugins.value[idx] = Object.assign({}, plugins.value[idx], { enabled })
    }
  }

  async function uninstall(id: string) {
    await $fetch(`/api/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' })
    plugins.value = plugins.value.filter(p => p.id !== id)
  }

  async function updateSkill(pluginId: string, skill: string, frontmatter: SkillFrontmatter, body: string) {
    return await $fetch('/api/plugins/skills/update', {
      method: 'PUT',
      body: { pluginId, skill, frontmatter, body },
    })
  }

  return { plugins, loading, error, fetchAll, fetchOne, toggleEnabled, uninstall, updateSkill }
}
