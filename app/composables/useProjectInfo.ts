interface ProjectInfo {
  claudeMd: string | null
  agentsMd: string | null
  settings: Record<string, unknown> | null
  settingsLocal: Record<string, unknown> | null
}

export function useProjectInfo() {
  const { workingDir } = useWorkingDir()
  const info = ref<ProjectInfo | null>(null)
  const loading = ref(false)

  async function fetchInfo() {
    if (!workingDir.value) { info.value = null; return }
    loading.value = true
    try {
      info.value = await $fetch<ProjectInfo>('/api/project/info', {
        query: { workingDir: workingDir.value },
      })
    } catch {
      info.value = null
    } finally {
      loading.value = false
    }
  }

  watch(workingDir, fetchInfo, { immediate: true })

  return { info, loading, fetchInfo }
}
